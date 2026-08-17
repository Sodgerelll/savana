import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  buildGoodsWriteOffEntry,
  buildReversalEntry,
  buildSaleEntry,
  buildSaleReturnEntry,
  isEmptyEntry,
  type BuiltEntry,
} from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  JOURNAL_ENTRIES_COLLECTION,
} from "./accounting/postEntryClient";
import { reserveDocumentNumber } from "./documentNumbers";
import {
  applyStockMovement,
  cogsForMovements,
  productRef,
  readProductStockState,
  writeProductStock,
  type ProductStockState,
  type StockMovementRequest,
} from "./inventory";
import { calculateVat, vatCarriedBy, VAT_MODE_VALUES, VAT_RATE, type VatMode } from "./vat";
import {
  deserializeReturns,
  returnLineKey,
  returnedQuantities,
  type RetailReturnItem,
  type RetailReturnRecord,
} from "./returns";
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

// НӨАТ now lives in src/lib/vat.ts so every channel shares one definition. These aliases
// keep the Sales module's original names working for existing callers and tests.
export const SALE_VAT_RATE = VAT_RATE;
export type SaleVatMode = VatMode;
export const SALE_VAT_MODE_VALUES = VAT_MODE_VALUES;
export const calculateSaleVat = calculateVat;

/** How a manually entered, whole-sale discount was specified at checkout. */
export type SaleDiscountType = "amount" | "percent";
export const SALE_DISCOUNT_TYPE_VALUES = ["amount", "percent"] as const;

export interface SaleTotalsPayload extends OrderTotalsPayload {
  vatMode?: SaleVatMode;
  /** НӨАТ in tugriks — carved out of `grandTotal` when included, part of it when added. */
  vatAmount?: number;
  /** How the checkout-time discount below was entered — a flat ₮ amount or a percent. */
  discountType?: SaleDiscountType;
  /** Raw value the admin typed — 0-100 for percent, ₮ for amount. `discountTotal` is the resulting money figure. */
  discountValue?: number;
}

/**
 * Channels where the goods change hands on the spot, so there is nothing to deliver —
 * own-use write-offs and gifts included.
 */
const OVER_THE_COUNTER_CHANNELS: readonly SaleChannel[] = ["store", "fair", "own_use", "gift"];

export function saleChannelRequiresAddress(channel: SaleChannel): boolean {
  return !OVER_THE_COUNTER_CHANNELS.includes(channel);
}

/**
 * Channels where no money changes hands and nothing is earned — the goods simply leave.
 * They still move stock, but they are booked as a write-off at cost instead of as revenue,
 * so a giveaway can never inflate cash or sales.
 */
const NON_REVENUE_CHANNELS: readonly SaleChannel[] = ["own_use", "gift"];

export function saleChannelEarnsRevenue(channel: SaleChannel): boolean {
  return !NON_REVENUE_CHANNELS.includes(channel);
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
  /**
   * `crmContacts` document the sale was booked against, when the admin picked a
   * registered customer. Null for walk-ins typed in by hand — picking one is optional.
   */
  contactId?: string | null;
}

/** Fills the optional link field so no `undefined` ever reaches Firestore. */
function normalizeSaleCustomer(customer: SaleCustomerPayload): SaleCustomerPayload {
  return { ...customer, contactId: customer.contactId ?? null };
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
  returns: RetailReturnRecord[];
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

function createSaleNumber(): Promise<string> {
  return reserveDocumentNumber("sale");
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

function normalizeVatMode(value: unknown): SaleVatMode {
  // Sales registered before НӨАТ was tracked carry no mode — they stay VAT-free.
  return value === "included" || value === "added" ? value : "none";
}

function normalizePaymentMethod(value: unknown): SalePaymentMethod {
  if (value === "bank_transfer" || value === "bonum") {
    return value;
  }

  return "cash";
}

/** Item list of a raw sale document, tolerant of anything malformed stored alongside it. */
function deserializeSaleItems(value: unknown): SaleItemPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
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
    .filter((item): item is SaleItemPayload => item !== null);
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
      contactId: typeof customerData.contactId === "string" ? customerData.contactId : null,
    },
    address: {
      region: String(addressData.region ?? ""),
      districtOrSoum: String(addressData.districtOrSoum ?? ""),
      khorooOrBag: String(addressData.khorooOrBag ?? ""),
      streetAddress: String(addressData.streetAddress ?? ""),
      additionalAddress: String(addressData.additionalAddress ?? ""),
    },
    items: deserializeSaleItems(data.items),
    totals: {
      subtotal: Number(totalsData.subtotal ?? 0),
      shippingFee: Number(totalsData.shippingFee ?? 0),
      grandTotal: Number(totalsData.grandTotal ?? 0),
      discountTotal: Number(totalsData.discountTotal ?? 0),
      vatMode: normalizeVatMode(totalsData.vatMode),
      vatAmount: Number(totalsData.vatAmount ?? 0),
      discountType: totalsData.discountType === "percent" ? "percent" : "amount",
      discountValue: Number(totalsData.discountValue ?? 0),
    },
    paymentMethod: normalizePaymentMethod(data.paymentMethod),
    paidAt: parseTimestamp(data.paidAt),
    createdByUid: String(data.createdByUid ?? ""),
    createdByName: String(data.createdByName ?? ""),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
    returns: deserializeReturns(data.returns),
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

/** The stock movements a set of sale items represents — positive quantity leaves stock. */
function movementsForItems(items: SaleItemPayload[]): StockMovementRequest[] {
  return items
    .filter((item) => item.productId > 0 && item.quantity !== 0)
    .map((item) => ({ productId: item.productId, variant: item.variant, quantity: item.quantity }));
}

/**
 * Loads the current stock position of every product touched by the given item lists. Reads
 * happen up front because a WriteBatch cannot read, so the caller must have the whole
 * picture before it starts assembling writes.
 */
async function loadStockStates(
  itemLists: (SaleItemPayload[] | undefined)[],
): Promise<Map<number | string, ProductStockState>> {
  const productIds = Array.from(
    new Set(
      itemLists
        .flatMap((items) => items ?? [])
        .map((item) => item.productId)
        .filter((id) => id > 0),
    ),
  );
  const states = new Map<number | string, ProductStockState>();

  await Promise.all(
    productIds.map(async (productId) => {
      const snapshot = await getDoc(productRef(productId));
      states.set(
        productId,
        readProductStockState(productId, snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null),
      );
    }),
  );

  return states;
}

/** Names an item's product for the "not enough stock" message. */
function itemLabel(items: SaleItemPayload[], productId: number | string): string {
  return items.find((item) => item.productId === productId)?.name ?? String(productId);
}

/**
 * Moves stock for the given items. `direction` is +1 when the goods leave (the sale became
 * settled) and -1 when they come back (it was un-settled, edited or deleted). Only the
 * outgoing direction is validated — returning stock is always allowed.
 */
function applyItemMovements(
  states: Map<number | string, ProductStockState>,
  items: SaleItemPayload[] | undefined,
  direction: 1 | -1,
): void {
  if (!items) return;

  for (const movement of movementsForItems(items)) {
    const state = states.get(movement.productId);
    if (!state) continue;
    applyStockMovement(
      state,
      { variant: movement.variant, quantity: movement.quantity * direction },
      { productName: itemLabel(items, movement.productId) },
    );
  }
}

/**
 * The ledger entry a settled sale produces: revenue for a normal channel, a write-off at
 * cost for a gift or own use. Returns an empty entry when there is nothing to post (a
 * giveaway of goods whose cost is unknown).
 */
function buildEntryForSale(
  input: Pick<SaleDraftInput, "channel" | "paymentMethod" | "totals">,
  cogsAmount: number,
): BuiltEntry {
  if (!saleChannelEarnsRevenue(input.channel)) {
    return buildGoodsWriteOffEntry({ cogsAmount });
  }

  return buildSaleEntry({
    grandTotal: input.totals.grandTotal,
    vatAmount: input.totals.vatAmount ?? 0,
    cogsAmount,
    paymentMethod: input.paymentMethod,
  });
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
 * (paid/delivering/delivered) the journal entry AND the stock movement are written in the
 * same batch, so offline sales reach Finance the same way Bonum-paid web orders do and the
 * ledger can never disagree with what is on the shelf.
 *
 * Throws InsufficientStockError before writing anything when the items exceed what is in
 * stock, so a settled sale can never oversell.
 */
export async function createSale(input: SaleDraftInput): Promise<CreatedSale> {
  const saleRef = doc(collection(db, SALES_COLLECTION));
  const settled = isSaleSettled(input.status);

  // Every read — product stock, entry number, sale number — must complete before the batch
  // is assembled, since writeBatch itself cannot read.
  const states = settled ? await loadStockStates([input.items]) : new Map<number | string, ProductStockState>();
  const cogsAmount = settled ? cogsForMovements(states, movementsForItems(input.items)) : 0;

  if (settled) {
    // Raises InsufficientStockError before any number is reserved or written.
    applyItemMovements(states, input.items, 1);
  }

  const saleNumber = await createSaleNumber();
  const builtEntry = settled ? buildEntryForSale(input, cogsAmount) : null;
  const entryNumber = builtEntry && !isEmptyEntry(builtEntry) ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);
  let journalEntryId: string | null = null;

  if (builtEntry && entryNumber) {
    const entryRef = postJournalEntry(batch, entryNumber, builtEntry, {
      sourceType: "sale",
      sourceId: saleRef.id,
      sourceNumber: saleNumber,
      description: saleChannelEarnsRevenue(input.channel)
        ? `Борлуулалт: ${saleNumber}`
        : `Бэлэг/дотоод хэрэглээ: ${saleNumber}`,
      createdBy: input.createdByUid,
      createdByName: input.createdByName ?? "",
    });
    journalEntryId = entryRef.id;
  }

  batch.set(saleRef, {
    saleNumber,
    schemaVersion: SALE_SCHEMA_VERSION,
    status: input.status,
    channel: input.channel,
    currency: "MNT",
    customer: normalizeSaleCustomer(input.customer),
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

  states.forEach((state) => writeProductStock(batch, state));

  await batch.commit();

  return { id: saleRef.id, saleNumber };
}

/**
 * Saves an edited sale. Any previously posted entry is reversed and a fresh one posted for
 * the new amounts, and the stock the old version held is released before the new version
 * reserves what it needs — so an edit that changes both the status and the item list nets
 * out correctly in one batch.
 */
export async function updateSale(
  id: string,
  previous: Pick<SaleRecord, "saleNumber" | "journalEntryId" | "paidAt" | "status" | "items">,
  input: SaleDraftInput,
): Promise<void> {
  const wasSettled = isSaleSettled(previous.status);
  const settled = isSaleSettled(input.status);

  const states = await loadStockStates([previous.items, input.items]);

  // Release first, then reserve, so swapping one item for another never trips the stock
  // check on quantity the sale itself is already holding.
  if (wasSettled) {
    applyItemMovements(states, previous.items, -1);
  }
  if (settled) {
    applyItemMovements(states, input.items, 1);
  }

  const cogsAmount = settled ? cogsForMovements(states, movementsForItems(input.items)) : 0;
  const builtEntry = settled ? buildEntryForSale(input, cogsAmount) : null;

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

  if (builtEntry && !isEmptyEntry(builtEntry)) {
    const entryNumber = await generateJournalEntryNumber();
    const entryRef = postJournalEntry(batch, entryNumber, builtEntry, {
      sourceType: "sale",
      sourceId: id,
      sourceNumber: previous.saleNumber,
      description: `Борлуулалт засварласан: ${previous.saleNumber}`,
      createdBy: input.createdByUid,
      createdByName: input.createdByName ?? "",
    });
    journalEntryId = entryRef.id;
  }

  batch.update(doc(db, SALES_COLLECTION, id), {
    status: input.status,
    channel: input.channel,
    customer: normalizeSaleCustomer(input.customer),
    address: input.address,
    items: input.items,
    totals: input.totals,
    paymentMethod: input.paymentMethod,
    paidAt: settled ? (previous.paidAt ?? new Date().toISOString()) : null,
    journalEntryId,
    updatedAt: serverTimestamp(),
  });

  states.forEach((state) => writeProductStock(batch, state));

  await batch.commit();
}

export async function deleteSale(
  id: string,
  sale: Pick<SaleRecord, "saleNumber" | "journalEntryId" | "status" | "items">,
): Promise<void> {
  const wasSettled = isSaleSettled(sale.status);
  const states = wasSettled ? await loadStockStates([sale.items]) : new Map<number | string, ProductStockState>();

  if (wasSettled) {
    applyItemMovements(states, sale.items, -1);
  }

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

  states.forEach((state) => writeProductStock(batch, state));

  await batch.commit();
}

/** One line of a return request — the caller only picks a product/variant and a quantity. */
export interface SaleReturnRequestItem {
  productId: number;
  variant: string | null;
  quantity: number;
}

/**
 * Books a full or partial return against a settled sale: the returned units go back onto the
 * shelf and a return entry (Sales Returns / VAT / money account, COGS reversed) is posted for
 * just the returned value — never the whole sale, so two partial returns against the same
 * sale net out correctly. Mirrors `transferService.ts`'s `createReturn`, but a sale/order
 * buyer carries no running balance, so the money always comes back out of whichever account
 * the sale was paid into instead of reducing a receivable.
 */
export async function createSaleReturn(
  id: string,
  requestItems: SaleReturnRequestItem[],
  reason: string,
  createdByUid: string,
  createdByName: string,
): Promise<string> {
  const entryNumber = await generateJournalEntryNumber();
  const returnId = doc(collection(db, SALES_COLLECTION)).id;

  await runTransaction(db, async (t) => {
    const saleRef = doc(db, SALES_COLLECTION, id);
    const snap = await t.get(saleRef);
    if (!snap.exists()) {
      throw new Error("Борлуулалт олдсонгүй");
    }

    const data = snap.data() as Record<string, unknown>;
    const status = normalizeStatus(data.status);
    if (!isSaleSettled(status)) {
      throw new Error("Зөвхөн бүртгэгдсэн (төлбөр орсон) борлуулалтыг буцаах боломжтой");
    }

    const items = deserializeSaleItems(data.items);
    const existingReturns = deserializeReturns(data.returns);
    const returned = returnedQuantities(existingReturns);

    const returnItems: RetailReturnItem[] = [];
    for (const request of requestItems) {
      if (!(request.quantity > 0)) continue;
      const original = items.find((item) => item.productId === request.productId && (item.variant ?? null) === request.variant);
      if (!original) {
        throw new Error("Энэ борлуулалтад байхгүй барааг буцаах боломжгүй");
      }
      const key = returnLineKey(original.productId, original.variant);
      const remaining = original.quantity - (returned.get(key) ?? 0);
      if (request.quantity > remaining) {
        throw new Error(`"${original.name}" барааны буцаах тоо хэтэрсэн байна. Боломжит: ${Math.max(0, remaining)}`);
      }
      returnItems.push({
        productId: original.productId,
        variant: original.variant,
        name: original.name,
        quantity: request.quantity,
        unitPrice: original.unitPrice,
      });
    }

    if (returnItems.length === 0) {
      throw new Error("Буцаах бараа сонгогдоогүй байна");
    }

    // Every product read must complete before the first write in this transaction.
    const states = new Map<number | string, ProductStockState>();
    for (const item of returnItems) {
      if (states.has(item.productId)) continue;
      const productSnap = await t.get(productRef(item.productId));
      states.set(
        item.productId,
        readProductStockState(item.productId, productSnap.exists() ? (productSnap.data() as Record<string, unknown>) : null),
      );
    }

    const returnGross = returnItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const vatMode = normalizeVatMode((data.totals as Record<string, unknown> | undefined)?.vatMode);
    const vatAmount = vatCarriedBy(returnGross, vatMode);
    const returnNet = returnGross - vatAmount;

    const movements: StockMovementRequest[] = returnItems.map((item) => ({
      productId: item.productId,
      variant: item.variant,
      quantity: item.quantity,
    }));
    const cogsAmount = cogsForMovements(states, movements);

    for (const movement of movements) {
      const state = states.get(movement.productId);
      if (!state) continue;
      applyStockMovement(state, { variant: movement.variant, quantity: -movement.quantity }, { validate: false });
    }

    const channel = normalizeChannel(data.channel);
    const paymentMethod = normalizePaymentMethod(data.paymentMethod);
    const builtEntry = saleChannelEarnsRevenue(channel)
      ? buildSaleReturnEntry({ returnAmount: returnNet, vatAmount, cogsAmount, paymentMethod })
      : buildReversalEntry(buildGoodsWriteOffEntry({ cogsAmount }).lines);

    const saleNumber = String(data.saleNumber ?? id);
    let journalEntryId: string | null = null;
    if (!isEmptyEntry(builtEntry)) {
      const entryRef = postJournalEntry(t, entryNumber, builtEntry, {
        sourceType: "sale",
        sourceId: id,
        sourceNumber: saleNumber,
        description: `Буцаалт: ${saleNumber}`,
        createdBy: createdByUid,
        createdByName,
      });
      journalEntryId = entryRef.id;
    }

    const returnRecord: RetailReturnRecord = {
      id: returnId,
      items: returnItems,
      subtotal: returnNet,
      vatAmount,
      totalAmount: returnGross,
      reason,
      journalEntryId,
      createdByUid,
      createdByName,
      createdAt: new Date().toISOString(),
    };

    t.update(saleRef, {
      returns: [...existingReturns, returnRecord],
      updatedAt: serverTimestamp(),
    });

    states.forEach((state) => writeProductStock(t, state));
  });

  return returnId;
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
