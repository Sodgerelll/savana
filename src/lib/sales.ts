import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
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
  readJournalEntryLines,
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
import { calculateVat, VAT_MODE_VALUES, VAT_RATE, type VatMode } from "./vat";
import {
  completesReturn,
  deserializeReturns,
  retailReturnMoney,
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

/**
 * Payment "methods" where the buyer hands over nothing — the goods leave as a
 * complimentary gift ("Бэлгэнд"). Booked as a write-off at cost, exactly like the gift
 * channel, so a freebie can never inflate cash or revenue no matter which channel it was
 * sold through.
 */
const NON_REVENUE_PAYMENT_METHODS: readonly SalePaymentMethod[] = ["gift"];

export function salePaymentEarnsRevenue(paymentMethod: SalePaymentMethod): boolean {
  return !NON_REVENUE_PAYMENT_METHODS.includes(paymentMethod);
}

/** A sale earns revenue only when both its channel and its payment method call for it. */
export function saleEarnsRevenue(channel: SaleChannel, paymentMethod: SalePaymentMethod): boolean {
  return saleChannelEarnsRevenue(channel) && salePaymentEarnsRevenue(paymentMethod);
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
  /** Local YYYY-MM-DD the sale is booked on. Defaults to the server time when omitted. */
  saleDate?: string;
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

/** Local (not UTC) YYYY-MM-DD for `date`, matching what an <input type="date"> holds. */
function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Combines a picked YYYY-MM-DD with the current time of day, so a backdated sale still
 *  sorts chronologically against other sales entered the same day. */
function saleDateToTimestamp(saleDate: string): string {
  const now = new Date();
  const [year, month, day] = saleDate.split("-").map(Number);
  return new Date(
    year,
    (month || 1) - 1,
    day || 1,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds(),
  ).toISOString();
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
  if (value === "bank_transfer" || value === "bonum" || value === "pos" || value === "gift") {
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
 * Reads the current stock position of every product touched by the given item lists, inside
 * the caller's transaction. Sequential because a transaction must finish all its reads before
 * the first write. Reading here — rather than before a WriteBatch, as this used to — is what
 * keeps two sales saved at the same moment from each writing back a count that ignores the
 * other.
 */
async function loadStockStates(
  t: Transaction,
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

  for (const productId of productIds) {
    const snapshot = await t.get(productRef(productId));
    states.set(
      productId,
      readProductStockState(productId, snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null),
    );
  }

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
 *
 * Delivery goes to its own revenue account, exactly as it does for a storefront order —
 * it used to be folded into goods revenue here, so the same delivery fee was reported two
 * different ways depending on the channel.
 */
function buildEntryForSale(
  input: Pick<SaleDraftInput, "channel" | "paymentMethod" | "totals">,
  cogsAmount: number,
): BuiltEntry {
  if (!saleEarnsRevenue(input.channel, input.paymentMethod)) {
    return buildGoodsWriteOffEntry({ cogsAmount });
  }

  return buildSaleEntry({
    grandTotal: input.totals.grandTotal,
    vatAmount: input.totals.vatAmount ?? 0,
    shippingAmount: input.totals.shippingFee ?? 0,
    cogsAmount,
    paymentMethod: input.paymentMethod,
  });
}

/** Who is acting, for the journal entries an edit or deletion posts. */
function currentActorUid(fallback: string): string {
  return auth?.currentUser?.uid ?? fallback;
}

/**
 * Registers a sale made outside the storefront. When it is saved as settled
 * (paid/delivering/delivered) the journal entry AND the stock movement are written in the
 * same transaction, so offline sales reach Finance the same way Bonum-paid web orders do and
 * the ledger can never disagree with what is on the shelf.
 *
 * Throws InsufficientStockError before writing anything when the items exceed what is in
 * stock, so a settled sale can never oversell.
 */
export async function createSale(input: SaleDraftInput): Promise<CreatedSale> {
  const saleRef = doc(collection(db, SALES_COLLECTION));
  const settled = isSaleSettled(input.status);

  // Both run their own transactions, so they are reserved before this one opens.
  const saleNumber = await createSaleNumber();
  const entryNumber = settled ? await generateJournalEntryNumber() : null;

  await runTransaction(db, async (t) => {
    const states = settled ? await loadStockStates(t, [input.items]) : new Map<number | string, ProductStockState>();
    const cogsAmount = settled ? cogsForMovements(states, movementsForItems(input.items)) : 0;

    if (settled) {
      applyItemMovements(states, input.items, 1);
    }

    const builtEntry = settled ? buildEntryForSale(input, cogsAmount) : null;
    let journalEntryId: string | null = null;

    if (builtEntry && entryNumber && !isEmptyEntry(builtEntry)) {
      const entryRef = postJournalEntry(t, entryNumber, builtEntry, {
        sourceType: "sale",
        sourceId: saleRef.id,
        sourceNumber: saleNumber,
        description: saleEarnsRevenue(input.channel, input.paymentMethod)
          ? `Борлуулалт: ${saleNumber}`
          : `Бэлэг/дотоод хэрэглээ: ${saleNumber}`,
        createdBy: input.createdByUid,
        createdByName: input.createdByName ?? "",
      });
      journalEntryId = entryRef.id;
    }

    t.set(saleRef, {
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
      createdAt: input.saleDate ? saleDateToTimestamp(input.saleDate) : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    states.forEach((state) => writeProductStock(t, state));
  });

  return { id: saleRef.id, saleNumber };
}

/**
 * The goods a sale's returns have already brought back, per line. An edit must keep at least
 * that many on the sale — otherwise the returns would refer to units the sale no longer has.
 */
function assertEditKeepsReturnedUnits(
  returns: RetailReturnRecord[],
  nextItems: SaleItemPayload[],
  nextSettled: boolean,
): void {
  if (returns.length === 0) return;

  if (!nextSettled) {
    throw new Error("Буцаалт бүртгэгдсэн борлуулалтыг төлөгдөөгүй төлөвт шилжүүлэх боломжгүй.");
  }

  const kept = new Map<string, number>();
  for (const item of nextItems) {
    const key = returnLineKey(item.productId, item.variant);
    kept.set(key, (kept.get(key) ?? 0) + item.quantity);
  }
  for (const [key, returnedQuantity] of returnedQuantities(returns)) {
    if ((kept.get(key) ?? 0) < returnedQuantity) {
      throw new Error("Буцаагдсан тооноос бага болгож засах боломжгүй — эхлээд буцаалтыг шалгана уу.");
    }
  }
}

/**
 * Saves an edited sale. Whatever the stored sale held is undone first (stock back, entry
 * reversed) and the edited version is applied fresh, in one transaction.
 *
 * The undo works from the sale as it is stored, not from the copy the screen was showing, so
 * an edit made from a stale tab cannot put back goods the sale no longer holds. A sale with
 * returns stays settled and keeps at least the returned units; its return entries stand.
 */
export async function updateSale(
  id: string,
  previous: Pick<SaleRecord, "saleNumber" | "journalEntryId" | "paidAt" | "status" | "items" | "createdAt">,
  input: SaleDraftInput,
): Promise<void> {
  const saleRef = doc(db, SALES_COLLECTION, id);
  const settled = isSaleSettled(input.status);

  // Which entries the edit will post depends on the stored sale; read it first so the numbers
  // can be reserved (they run their own transactions), then confirm it inside.
  const pre = await getDoc(saleRef);
  if (!pre.exists()) {
    throw new Error("Борлуулалт олдсонгүй");
  }
  const preData = pre.data() as Record<string, unknown>;
  const storedEntryId = typeof preData.journalEntryId === "string" ? preData.journalEntryId : null;
  const reversalNumber = storedEntryId ? await generateJournalEntryNumber() : null;
  const entryNumber = settled ? await generateJournalEntryNumber() : null;

  await runTransaction(db, async (t) => {
    const snap = await t.get(saleRef);
    if (!snap.exists()) {
      throw new Error("Борлуулалт олдсонгүй");
    }
    const data = snap.data() as Record<string, unknown>;
    const currentEntryId = typeof data.journalEntryId === "string" ? data.journalEntryId : null;
    if (currentEntryId !== storedEntryId) {
      throw new Error("Борлуулалт өөр газраас өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.");
    }

    const storedItems = deserializeSaleItems(data.items);
    const wasSettled = isSaleSettled(normalizeStatus(data.status));
    assertEditKeepsReturnedUnits(deserializeReturns(data.returns), input.items, settled);

    // ── Reads ──
    const states = await loadStockStates(t, [storedItems, input.items]);
    const oldLines = storedEntryId ? await readJournalEntryLines(t, storedEntryId) : null;

    // ── Stock ──
    if (wasSettled) {
      applyItemMovements(states, storedItems, -1);
    }
    if (settled) {
      applyItemMovements(states, input.items, 1);
    }

    // ── Ledger ──
    if (storedEntryId && oldLines && reversalNumber) {
      postJournalEntry(t, reversalNumber, buildReversalEntry(oldLines), {
        sourceType: "sale",
        sourceId: id,
        sourceNumber: previous.saleNumber,
        description: "Борлуулалт засварласан — хуучин бичилтийг цуцаллаа",
        reversalOf: storedEntryId,
        createdBy: currentActorUid(input.createdByUid),
      });
    }

    const cogsAmount = settled ? cogsForMovements(states, movementsForItems(input.items)) : 0;
    const builtEntry = settled ? buildEntryForSale(input, cogsAmount) : null;
    let journalEntryId: string | null = null;

    if (builtEntry && entryNumber && !isEmptyEntry(builtEntry)) {
      const entryRef = postJournalEntry(t, entryNumber, builtEntry, {
        sourceType: "sale",
        sourceId: id,
        sourceNumber: previous.saleNumber,
        description: `Борлуулалт засварласан: ${previous.saleNumber}`,
        createdBy: input.createdByUid,
        createdByName: input.createdByName ?? "",
      });
      journalEntryId = entryRef.id;
    }

    // The date field only moves when the admin actually picked a different day; re-saving an
    // untouched date keeps the original timestamp rather than re-stamping it with the edit's
    // time of day.
    const storedCreatedAt = parseTimestamp(data.createdAt) ?? previous.createdAt;
    const previousSaleDate = storedCreatedAt ? toDateInputValue(new Date(storedCreatedAt)) : null;
    const createdAtUpdate =
      input.saleDate && input.saleDate !== previousSaleDate
        ? { createdAt: saleDateToTimestamp(input.saleDate) }
        : {};
    const storedPaidAt = parseTimestamp(data.paidAt);

    t.update(saleRef, {
      status: input.status,
      channel: input.channel,
      customer: normalizeSaleCustomer(input.customer),
      address: input.address,
      items: input.items,
      totals: input.totals,
      paymentMethod: input.paymentMethod,
      paidAt: settled ? (storedPaidAt ?? new Date().toISOString()) : null,
      journalEntryId,
      ...createdAtUpdate,
      updatedAt: serverTimestamp(),
    });

    states.forEach((state) => writeProductStock(t, state));
  });
}

/**
 * Deletes a sale: its stock comes back and its entry is reversed, in one transaction. A sale
 * with returns cannot be deleted — its returned units are already back on the shelf and its
 * return entries already refunded the buyer, so deleting it would do both a second time.
 */
export async function deleteSale(
  id: string,
  sale: Pick<SaleRecord, "saleNumber" | "journalEntryId" | "status" | "items">,
): Promise<void> {
  const saleRef = doc(db, SALES_COLLECTION, id);

  const pre = await getDoc(saleRef);
  if (!pre.exists()) {
    return;
  }
  const preData = pre.data() as Record<string, unknown>;
  if (deserializeReturns(preData.returns).length > 0) {
    throw new Error("Буцаалт бүртгэгдсэн борлуулалтыг устгах боломжгүй.");
  }
  const storedEntryId = typeof preData.journalEntryId === "string" ? preData.journalEntryId : null;
  const reversalNumber = storedEntryId ? await generateJournalEntryNumber() : null;

  await runTransaction(db, async (t) => {
    const snap = await t.get(saleRef);
    if (!snap.exists()) {
      return;
    }
    const data = snap.data() as Record<string, unknown>;
    const currentEntryId = typeof data.journalEntryId === "string" ? data.journalEntryId : null;
    if (currentEntryId !== storedEntryId || deserializeReturns(data.returns).length > 0) {
      throw new Error("Борлуулалт өөр газраас өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.");
    }

    const storedItems = deserializeSaleItems(data.items);
    const wasSettled = isSaleSettled(normalizeStatus(data.status));
    const states = wasSettled ? await loadStockStates(t, [storedItems]) : new Map<number | string, ProductStockState>();
    const oldLines = storedEntryId ? await readJournalEntryLines(t, storedEntryId) : null;

    if (wasSettled) {
      applyItemMovements(states, storedItems, -1);
    }

    if (storedEntryId && oldLines && reversalNumber) {
      postJournalEntry(t, reversalNumber, buildReversalEntry(oldLines), {
        sourceType: "sale",
        sourceId: id,
        sourceNumber: sale.saleNumber,
        description: "Борлуулалт устгасан — бичилтийг цуцаллаа",
        reversalOf: storedEntryId,
        createdBy: currentActorUid("system"),
      });
    }

    t.delete(saleRef);
    states.forEach((state) => writeProductStock(t, state));
  });
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

    // What the buyer was actually charged for the goods: the total less delivery and any
    // НӨАТ added on top. Worked out from the total rather than `subtotal`, which some sales
    // store before the whole-sale discount and others (migrated orders) after it — and a
    // return valued at list price refunded the discount back to the buyer.
    const totalsData = (data.totals as Record<string, unknown> | undefined) ?? {};
    const vatMode = normalizeVatMode(totalsData.vatMode);
    const chargedVat = Number(totalsData.vatAmount ?? 0);
    const chargedGoodsValue = Math.max(
      0,
      Number(totalsData.grandTotal ?? 0) -
        Number(totalsData.shippingFee ?? 0) -
        (vatMode === "added" ? chargedVat : 0),
    );
    const money = retailReturnMoney({
      linesValue: returnItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      allLinesValue: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      chargedGoodsValue,
      chargedVat,
      vatMode,
      priorReturns: existingReturns,
      completesReturn: completesReturn(items, existingReturns, returnItems),
    });
    const vatAmount = money.vat;
    const returnNet = money.net;
    const returnGross = money.gross;

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
    const builtEntry = saleEarnsRevenue(channel, paymentMethod)
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
