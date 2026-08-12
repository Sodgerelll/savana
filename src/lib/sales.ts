import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildReversalEntry, buildSaleEntry } from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  JOURNAL_ENTRIES_COLLECTION,
} from "./accounting/postEntryClient";
import type {
  OrderAddressPayload,
  OrderItemPayload,
  OrderPaymentMethod,
  OrderStatus,
  OrderTotalsPayload,
} from "./orders";

export const SALES_COLLECTION = "sales";
export const SALE_SCHEMA_VERSION = 1;

/**
 * Sales reuse the order item/address/totals shapes so a single item editor and a single
 * set of money formatters drive both modules. What a sale adds on top is the channel it
 * was made through and whether the buyer is a person or an organization.
 */
export type SaleItemPayload = OrderItemPayload;
export type SaleAddressPayload = OrderAddressPayload;
export type SaleTotalsPayload = OrderTotalsPayload;
export type SalePaymentMethod = OrderPaymentMethod;
export type SaleStatus = OrderStatus;
export type SalePaymentStatus = "pending" | "paid";

/** Channel the sale was made through. Storefront checkouts never land here — those stay orders. */
export type SaleChannel =
  | "store"
  | "messenger"
  | "facebook"
  | "instagram"
  | "phone"
  | "email"
  | "fair"
  | "own_use"
  | "gift"
  | "other";
export const SALE_CHANNEL_VALUES = [
  "store",
  "messenger",
  "facebook",
  "instagram",
  "phone",
  "email",
  "fair",
  "own_use",
  "gift",
  "other",
] as const;

export type SaleCustomerType = "individual" | "organization";
export const SALE_CUSTOMER_TYPE_VALUES = ["individual", "organization"] as const;

/**
 * Channels where the goods change hands on the spot, so there is nothing to deliver —
 * own-use write-offs and gifts included.
 */
const OVER_THE_COUNTER_CHANNELS: readonly SaleChannel[] = ["store", "fair", "own_use", "gift"];

export function saleChannelRequiresAddress(channel: SaleChannel): boolean {
  return !OVER_THE_COUNTER_CHANNELS.includes(channel);
}

export interface SaleCustomerPayload {
  type: SaleCustomerType;
  /** Contact person for an organization, the buyer's own name for an individual. */
  fullName: string;
  /** Organization sales only — empty for individuals. */
  organizationName: string;
  /** Organization register number — empty for individuals. */
  registrationNumber: string;
  phoneNumber: string;
  email: string | null;
  note: string;
}

export interface SaleRecord {
  id: string;
  saleNumber: string;
  status: SaleStatus;
  channel: SaleChannel;
  currency: string;
  customer: SaleCustomerPayload;
  address: SaleAddressPayload;
  items: SaleItemPayload[];
  totals: SaleTotalsPayload;
  paymentMethod: SalePaymentMethod;
  paidAt: string | null;
  createdByUid: string;
  createdByName: string;
  journalEntryId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SaleDraftInput {
  status: SaleStatus;
  channel: SaleChannel;
  paymentMethod: SalePaymentMethod;
  customer: SaleCustomerPayload;
  address: SaleAddressPayload;
  items: SaleItemPayload[];
  totals: SaleTotalsPayload;
  createdByUid: string;
  createdByName?: string;
}

export interface CreatedSale {
  id: string;
  saleNumber: string;
}

/** A sale is settled — and therefore posted to the ledger — as soon as it leaves "new". */
export function isSaleSettled(status: SaleStatus): boolean {
  return status !== "new";
}

export function getSalePaymentStatus(sale: Pick<SaleRecord, "status">): SalePaymentStatus {
  return isSaleSettled(sale.status) ? "paid" : "pending";
}

function createSaleNumber(): string {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ulaanbaatar",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = dateParts.find((part) => part.type === "year")?.value ?? "00";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "00";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "00";

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomLetter = chars[Math.floor(Math.random() * chars.length)];
  const randomDigits = String(Math.floor(Math.random() * 100)).padStart(2, "0");

  return `SL-${year}${month}${day}${randomLetter}${randomDigits}`;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return null;
}

function normalizeChannel(value: unknown): SaleChannel {
  if (typeof value === "string" && (SALE_CHANNEL_VALUES as readonly string[]).includes(value)) {
    return value as SaleChannel;
  }

  // "walk_in" is the order-module spelling of the same channel — migrated sales carry it.
  if (value === "walk_in") {
    return "store";
  }

  return "other";
}

function normalizeCustomerType(value: unknown): SaleCustomerType {
  return value === "organization" ? "organization" : "individual";
}

function normalizeStatus(value: unknown): SaleStatus {
  if (value === "paid" || value === "delivering" || value === "delivered") {
    return value;
  }

  return "new";
}

function normalizePaymentMethod(value: unknown): SalePaymentMethod {
  if (value === "bank_transfer" || value === "bonum") {
    return value;
  }

  return "cash";
}

function deserializeSale(snapshot: QueryDocumentSnapshot<DocumentData>): SaleRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const customerData =
    typeof data.customer === "object" && data.customer !== null ? (data.customer as Record<string, unknown>) : {};
  const addressData =
    typeof data.address === "object" && data.address !== null ? (data.address as Record<string, unknown>) : {};
  const totalsData =
    typeof data.totals === "object" && data.totals !== null ? (data.totals as Record<string, unknown>) : {};

  return {
    id: snapshot.id,
    saleNumber: String(data.saleNumber ?? snapshot.id),
    status: normalizeStatus(data.status),
    channel: normalizeChannel(data.channel),
    currency: String(data.currency ?? "MNT"),
    customer: {
      type: normalizeCustomerType(customerData.type),
      fullName: String(customerData.fullName ?? ""),
      organizationName: String(customerData.organizationName ?? ""),
      registrationNumber: String(customerData.registrationNumber ?? ""),
      phoneNumber: String(customerData.phoneNumber ?? ""),
      email: typeof customerData.email === "string" ? customerData.email : null,
      note: String(customerData.note ?? ""),
    },
    address: {
      region: String(addressData.region ?? ""),
      districtOrSoum: String(addressData.districtOrSoum ?? ""),
      khorooOrBag: String(addressData.khorooOrBag ?? ""),
      streetAddress: String(addressData.streetAddress ?? ""),
      additionalAddress: String(addressData.additionalAddress ?? ""),
    },
    items: Array.isArray(data.items)
      ? data.items
          .map((item): SaleItemPayload | null => {
            if (typeof item !== "object" || item === null) {
              return null;
            }

            const itemData = item as Record<string, unknown>;
            return {
              productId: Number(itemData.productId ?? 0),
              name: String(itemData.name ?? ""),
              category: String(itemData.category ?? ""),
              image: typeof itemData.image === "string" ? itemData.image : null,
              variant: typeof itemData.variant === "string" ? itemData.variant : null,
              quantity: Number(itemData.quantity ?? 0),
              unitPrice: Number(itemData.unitPrice ?? 0),
              originalUnitPrice: Number(itemData.originalUnitPrice ?? itemData.unitPrice ?? 0),
              lineTotal: Number(itemData.lineTotal ?? 0),
            } satisfies SaleItemPayload;
          })
          .filter((item): item is SaleItemPayload => item !== null)
      : [],
    totals: {
      subtotal: Number(totalsData.subtotal ?? 0),
      shippingFee: Number(totalsData.shippingFee ?? 0),
      grandTotal: Number(totalsData.grandTotal ?? 0),
      discountTotal: Number(totalsData.discountTotal ?? 0),
    },
    paymentMethod: normalizePaymentMethod(data.paymentMethod),
    paidAt: parseTimestamp(data.paidAt),
    createdByUid: String(data.createdByUid ?? ""),
    createdByName: String(data.createdByName ?? ""),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

/** Best-effort COGS for a sale: sums costPrice × quantity for the products that carry one. */
async function sumSaleCogs(items: SaleItemPayload[]): Promise<number> {
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter((id) => id > 0)));
  const costByProductId = new Map<number, number>();

  await Promise.all(
    productIds.map(async (productId) => {
      const snapshot = await getDoc(doc(db, "products", String(productId)));
      if (!snapshot.exists()) {
        return;
      }

      const costPrice = Number((snapshot.data() as Record<string, unknown>).costPrice ?? 0);
      if (costPrice > 0) {
        costByProductId.set(productId, costPrice);
      }
    }),
  );

  return items.reduce((sum, item) => sum + (costByProductId.get(item.productId) ?? 0) * item.quantity, 0);
}

/** Queues a mirror-image reversal of an already posted entry so the ledger nets to zero. */
async function queueReversal(
  batch: ReturnType<typeof writeBatch>,
  journalEntryId: string,
  saleId: string,
  saleNumber: string,
  description: string,
): Promise<void> {
  const snapshot = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, journalEntryId));
  if (!snapshot.exists()) {
    return;
  }

  const lines = (snapshot.data() as { lines?: Parameters<typeof buildReversalEntry>[0] }).lines ?? [];
  const entryNumber = await generateJournalEntryNumber();
  postJournalEntry(batch, entryNumber, buildReversalEntry(lines), {
    sourceType: "sale",
    sourceId: saleId,
    sourceNumber: saleNumber,
    description,
    reversalOf: journalEntryId,
    createdBy: "system",
  });
}

/**
 * Registers a sale made outside the storefront. When it is saved as settled
 * (paid/delivering/delivered) the revenue journal entry is posted in the same batch, so
 * offline sales reach Finance the same way Bonum-paid web orders do.
 */
export async function createSale(input: SaleDraftInput): Promise<CreatedSale> {
  const saleRef = doc(collection(db, SALES_COLLECTION));
  const saleNumber = createSaleNumber();
  const settled = isSaleSettled(input.status);

  // Both the product reads (costPrice) and the entry-number transaction must complete
  // before the batch is assembled — writeBatch itself cannot read.
  const cogsAmount = settled ? await sumSaleCogs(input.items) : 0;
  const entryNumber = settled ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);
  let journalEntryId: string | null = null;

  if (entryNumber) {
    const entryRef = postJournalEntry(
      batch,
      entryNumber,
      buildSaleEntry({
        grandTotal: input.totals.grandTotal,
        cogsAmount,
        paymentMethod: input.paymentMethod,
      }),
      {
        sourceType: "sale",
        sourceId: saleRef.id,
        sourceNumber: saleNumber,
        description: `Борлуулалт: ${saleNumber}`,
        createdBy: input.createdByUid,
        createdByName: input.createdByName ?? "",
      },
    );
    journalEntryId = entryRef.id;
  }

  batch.set(saleRef, {
    saleNumber,
    schemaVersion: SALE_SCHEMA_VERSION,
    status: input.status,
    channel: input.channel,
    currency: "MNT",
    customer: input.customer,
    address: input.address,
    items: input.items,
    totals: input.totals,
    paymentMethod: input.paymentMethod,
    paidAt: settled ? new Date().toISOString() : null,
    createdByUid: input.createdByUid,
    createdByName: input.createdByName ?? "",
    journalEntryId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();

  return { id: saleRef.id, saleNumber };
}

/**
 * Saves an edited sale. Any previously posted entry is reversed and a fresh one posted for
 * the new amounts, so the ledger always nets to what the sale currently says.
 */
export async function updateSale(
  id: string,
  previous: Pick<SaleRecord, "saleNumber" | "journalEntryId" | "paidAt">,
  input: SaleDraftInput,
): Promise<void> {
  const settled = isSaleSettled(input.status);
  const cogsAmount = settled ? await sumSaleCogs(input.items) : 0;

  const batch = writeBatch(db);

  if (previous.journalEntryId) {
    await queueReversal(
      batch,
      previous.journalEntryId,
      id,
      previous.saleNumber,
      "Борлуулалт засварласан — хуучин бичилтийг цуцаллаа",
    );
  }

  let journalEntryId: string | null = null;

  if (settled) {
    const entryNumber = await generateJournalEntryNumber();
    const entryRef = postJournalEntry(
      batch,
      entryNumber,
      buildSaleEntry({
        grandTotal: input.totals.grandTotal,
        cogsAmount,
        paymentMethod: input.paymentMethod,
      }),
      {
        sourceType: "sale",
        sourceId: id,
        sourceNumber: previous.saleNumber,
        description: `Борлуулалт засварласан: ${previous.saleNumber}`,
        createdBy: input.createdByUid,
        createdByName: input.createdByName ?? "",
      },
    );
    journalEntryId = entryRef.id;
  }

  batch.update(doc(db, SALES_COLLECTION, id), {
    status: input.status,
    channel: input.channel,
    customer: input.customer,
    address: input.address,
    items: input.items,
    totals: input.totals,
    paymentMethod: input.paymentMethod,
    paidAt: settled ? (previous.paidAt ?? new Date().toISOString()) : null,
    journalEntryId,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function deleteSale(
  id: string,
  sale: Pick<SaleRecord, "saleNumber" | "journalEntryId">,
): Promise<void> {
  const batch = writeBatch(db);

  if (sale.journalEntryId) {
    await queueReversal(
      batch,
      sale.journalEntryId,
      id,
      sale.saleNumber,
      "Борлуулалт устгасан — бичилтийг цуцаллаа",
    );
  }

  batch.delete(doc(db, SALES_COLLECTION, id));

  await batch.commit();
}

export function subscribeToSales({
  onData,
  onError,
}: {
  onData: (sales: SaleRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, SALES_COLLECTION), orderBy("createdAt", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((documentSnapshot) => deserializeSale(documentSnapshot)));
    },
    onError,
  );
}
