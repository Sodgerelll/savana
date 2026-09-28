import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { documentNumberFromId } from "./documentNumbers";
import {
  applyStockMovement,
  cogsForMovements,
  productRef,
  readProductStockState,
  writeProductStock,
  type ProductStockState,
} from "./inventory";
import { normalizeVatMode, type VatMode } from "./vat";
import {
  buildOrderPaidEntry,
  buildReversalEntry,
  buildSaleReturnEntry,
  isEmptyEntry,
  type JournalLine,
} from "./accounting/entryBuilders";
import { ACCOUNT_CODES } from "./accounting/chartOfAccounts";
import {
  JOURNAL_ENTRIES_COLLECTION,
  generateJournalEntryNumber,
  postJournalEntry,
  readJournalEntryLines,
} from "./accounting/postEntryClient";
import {
  completesReturn,
  deserializeReturns,
  retailReturnMoney,
  returnLineKey,
  returnedQuantities,
  type RetailReturnItem,
  type RetailReturnRecord,
} from "./returns";

export const ORDERS_COLLECTION = "orders";

/**
 * What a storefront order's QR field holds between being saved and the server raising its
 * invoice. Never shown — the checkout takes the real link from the server's answer. It is
 * not empty so that an order saved while the previous rules were still live (they asked for
 * a non-empty value) is accepted by both versions; firestore.rules pins it to exactly this.
 */
export const AWAITING_INVOICE_QR = "awaiting-invoice";
export const ORDER_SCHEMA_VERSION = 1;
export type OrderPaymentMethod = "bonum" | "cash" | "bank_transfer" | "pos" | "gift";
export type OrderPaymentStatus = "pending" | "paid" | "failed" | "cancelled";
export type OrderStatus = "new" | "paid" | "delivering" | "delivered";
export const ORDER_STATUS_VALUES = ["new", "paid", "delivering", "delivered"] as const;

/**
 * Channel the order arrived through. Every order this module creates is a storefront
 * checkout and writes "web" — the non-web values only appear on legacy documents saved
 * before offline sales moved to their own module (see src/lib/sales.ts).
 */
export type OrderSource =
  | "web"
  | "messenger"
  | "facebook"
  | "instagram"
  | "phone"
  | "email"
  | "walk_in"
  | "gift"
  | "usage"
  | "other";
export const ORDER_SOURCE_VALUES = [
  "web",
  "messenger",
  "facebook",
  "instagram",
  "phone",
  "email",
  "walk_in",
  "gift",
  "usage",
  "other",
] as const;

export interface OrderItemPayload {
  productId: number;
  name: string;
  category: string;
  image: string | null;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  /** List price at the time of sale — greater than unitPrice when sold at a discount. */
  originalUnitPrice?: number;
  lineTotal: number;
}

export interface OrderAddressPayload {
  region: string;
  districtOrSoum: string;
  khorooOrBag: string;
  streetAddress: string;
  additionalAddress: string;
}

export interface OrderCustomerPayload {
  fullName: string;
  phoneNumber: string;
  email: string | null;
  note: string;
}

export interface OrderPaymentPayload {
  method: OrderPaymentMethod;
  provider: OrderPaymentMethod;
  status: OrderPaymentStatus;
  amount: number;
  /** followUpLink URL from Bonum — used as QR content so the user can scan and pay */
  qrPayload: string;
  /** Bonum invoiceId — used to check payment status */
  invoiceId: string | null;
  paidAt: string | null;
  /** Bonum transaction details — populated when payment is confirmed */
  bonumPaymentVendor?: string;
  bonumCompletedAt?: string;
  bonumTerminalId?: string;
  bonumAmount?: number;
}

export interface OrderTotalsPayload {
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
  /** Total amount saved through discounts across all items. */
  discountTotal?: number;
  /** Shop-wide НӨАТ policy stamped on at checkout, so the ledger can split the tax later. */
  vatMode?: VatMode;
  /** НӨАТ in tugriks carried by `grandTotal`. */
  vatAmount?: number;
}

export interface CreateOrderInput {
  auth: {
    uid: string;
    isAnonymous: boolean;
    method: string;
  };
  customer: OrderCustomerPayload;
  address: OrderAddressPayload;
  items: OrderItemPayload[];
  totals: OrderTotalsPayload;
}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  payment: OrderPaymentPayload;
  /** The lines and totals as the server priced them — what the invoice is for. */
  items: OrderItemPayload[];
  totals: OrderTotalsPayload;
}

/** The server's answer to "raise the invoice for this order" (api/bonum/invoice.ts). */
export interface OrderInvoice {
  invoiceId: string;
  followUpLink: string;
  orderNumber: string;
  items: OrderItemPayload[];
  totals: OrderTotalsPayload;
}

/**
 * The order was saved but its invoice could not be raised. The order exists and can still be
 * paid — `requestOrderInvoice(orderId)` tries again — so the checkout keeps it instead of
 * starting over.
 */
export class OrderInvoiceError extends Error {
  readonly orderId: string;
  readonly orderNumber: string;

  constructor(orderId: string, orderNumber: string, message: string) {
    super(message);
    this.name = "OrderInvoiceError";
    this.orderId = orderId;
    this.orderNumber = orderNumber;
  }
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: OrderSource;
  /**
   * True on legacy orders an admin registered by hand before the Sales module existed.
   * The Orders page hides them; scripts/migrate-manual-orders-to-sales.mjs moves them.
   */
  isManual: boolean;
  createdByUid: string | null;
  currency: string;
  auth: CreateOrderInput["auth"];
  customer: OrderCustomerPayload;
  address: OrderAddressPayload;
  items: OrderItemPayload[];
  totals: OrderTotalsPayload;
  payment: OrderPaymentPayload;
  returns: RetailReturnRecord[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateOrderAdminInput {
  status: OrderStatus;
  source: OrderSource;
  customer: OrderCustomerPayload;
  address: OrderAddressPayload;
  payment: OrderPaymentPayload;
}

/**
 * Storefront checkouts cannot reserve a counter — that would need write access to
 * `counters/`, which only admins have — so the number is derived from the order's own
 * Firestore id instead. That is globally unique, unlike the random suffix this used to
 * append, which could collide silently.
 */
function createOrderNumber(orderId: string): string {
  return documentNumberFromId("ORD", orderId);
}

/**
 * Asks the server to price the order from the catalogue and raise its Bonum invoice. The
 * shopper's own ID token proves the order is theirs; the amount never leaves the browser.
 * Safe to repeat: an order that already has an invoice gets the same one back.
 */
export async function requestOrderInvoice(orderId: string): Promise<OrderInvoice> {
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error("Нэвтрэлт дууссан байна. Хуудсаа шинэчилнэ үү.");
  }

  const res = await fetch("/api/bonum/invoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ orderId }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(String(err["error"] ?? `Bonum invoice failed: ${res.status}`));
  }

  const data = (await res.json()) as Record<string, unknown>;
  return {
    invoiceId: String(data.invoiceId ?? ""),
    followUpLink: String(data.followUpLink ?? ""),
    orderNumber: String(data.orderNumber ?? ""),
    items: deserializeOrderItems(data.items),
    totals: deserializeOrderTotals(data.totals),
  };
}

function normalizePaymentMethod(value: unknown): OrderPaymentMethod {
  if (value === "cash" || value === "bank_transfer") {
    return value;
  }

  return "bonum";
}

function normalizePaymentStatus(value: unknown): OrderPaymentStatus {
  if (value === "paid" || value === "failed" || value === "cancelled") {
    return value;
  }

  return "pending";
}

/** Orders created before the source field existed are all storefront checkouts. */
function normalizeOrderSource(value: unknown): OrderSource {
  if (typeof value === "string" && (ORDER_SOURCE_VALUES as readonly string[]).includes(value)) {
    return value as OrderSource;
  }

  return "web";
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  if (value === "paid" || value === "delivering" || value === "delivered") {
    return value;
  }

  if (value === "payment_paid") {
    return "paid";
  }

  return "new";
}

function buildPaymentForOrderStatus(status: OrderStatus, currentPayment: OrderPaymentPayload): OrderPaymentPayload {
  if (status === "new") {
    return {
      ...currentPayment,
      status: "pending",
      paidAt: null,
    };
  }

  return {
    ...currentPayment,
    status: "paid",
    paidAt: currentPayment.paidAt ?? new Date().toISOString(),
  };
}

function parseTimestamp(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return null;
}

/** Item list of a raw order document, tolerant of anything malformed stored alongside it. */
function deserializeOrderItems(value: unknown): OrderItemPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): OrderItemPayload | null => {
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
      } satisfies OrderItemPayload;
    })
    .filter((item): item is OrderItemPayload => item !== null);
}

/** Totals of a raw order document (or an API answer), tolerant of missing fields. */
function deserializeOrderTotals(value: unknown): OrderTotalsPayload {
  const totalsData = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    subtotal: Number(totalsData.subtotal ?? 0),
    shippingFee: Number(totalsData.shippingFee ?? 0),
    grandTotal: Number(totalsData.grandTotal ?? 0),
    discountTotal: Number(totalsData.discountTotal ?? 0),
    vatMode: normalizeVatMode(totalsData.vatMode),
    vatAmount: Number(totalsData.vatAmount ?? 0),
  };
}

function deserializeOrder(snapshot: QueryDocumentSnapshot<DocumentData>): OrderRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const authData = typeof data.auth === "object" && data.auth !== null ? (data.auth as Record<string, unknown>) : {};
  const customerData =
    typeof data.customer === "object" && data.customer !== null ? (data.customer as Record<string, unknown>) : {};
  const addressData =
    typeof data.address === "object" && data.address !== null ? (data.address as Record<string, unknown>) : {};
  const paymentData =
    typeof data.payment === "object" && data.payment !== null ? (data.payment as Record<string, unknown>) : {};

  return {
    id: snapshot.id,
    orderNumber: String(data.orderNumber ?? snapshot.id),
    status: normalizeOrderStatus(data.status),
    source: normalizeOrderSource(data.source),
    isManual: Boolean(data.isManual),
    createdByUid: typeof data.createdByUid === "string" ? data.createdByUid : null,
    currency: String(data.currency ?? "MNT"),
    auth: {
      uid: String(authData.uid ?? ""),
      isAnonymous: Boolean(authData.isAnonymous),
      method: String(authData.method ?? "unknown"),
    },
    customer: {
      fullName: String(customerData.fullName ?? ""),
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
    items: deserializeOrderItems(data.items),
    totals: deserializeOrderTotals(data.totals),
    payment: {
      method: normalizePaymentMethod(paymentData.method),
      provider: normalizePaymentMethod(paymentData.provider),
      status: normalizePaymentStatus(paymentData.status),
      amount: Number(paymentData.amount ?? 0),
      qrPayload: String(paymentData.qrPayload ?? ""),
      invoiceId: typeof paymentData.invoiceId === "string" ? paymentData.invoiceId : null,
      paidAt: parseTimestamp(paymentData.paidAt),
      ...(typeof paymentData.bonumPaymentVendor === "string" && { bonumPaymentVendor: paymentData.bonumPaymentVendor }),
      ...(typeof paymentData.bonumCompletedAt === "string" && { bonumCompletedAt: paymentData.bonumCompletedAt }),
      ...(typeof paymentData.bonumTerminalId === "string" && { bonumTerminalId: paymentData.bonumTerminalId }),
      ...(typeof paymentData.bonumAmount === "number" && { bonumAmount: paymentData.bonumAmount }),
    },
    returns: deserializeReturns(data.returns),
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const orderRef = doc(collection(db, ORDERS_COLLECTION));
  const orderNumber = createOrderNumber(orderRef.id);

  // Saved first, with no invoice: the browser may say what it wants to buy, but not what it
  // costs. The server then prices it from the catalogue, raises the Bonum invoice for that
  // figure and writes both onto the order (api/bonum/invoice.ts). The Firestore rules keep
  // the payment fields out of the shopper's reach — the invoice id, the QR link and the paid
  // state are the server's to set. The invoice used to be raised here for whatever amount
  // the browser named, which let a shopper pay 100₮ for any basket.
  const payment: OrderPaymentPayload = {
    method: "bonum",
    provider: "bonum",
    status: "pending",
    amount: input.totals.grandTotal,
    qrPayload: AWAITING_INVOICE_QR,
    invoiceId: null,
    paidAt: null,
  };

  await setDoc(orderRef, {
    orderNumber,
    schemaVersion: ORDER_SCHEMA_VERSION,
    status: "new",
    source: "web" satisfies OrderSource,
    isManual: false,
    currency: "MNT",
    auth: input.auth,
    customer: input.customer,
    address: input.address,
    items: input.items,
    totals: input.totals,
    payment,
    // Stock is not touched at checkout — it moves when the payment lands, which is also
    // when revenue is recognised. This flag records whether that movement has happened so
    // it can never be applied twice or released twice.
    stockApplied: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  let invoice: OrderInvoice;
  try {
    invoice = await requestOrderInvoice(orderRef.id);
  } catch (error) {
    throw new OrderInvoiceError(
      orderRef.id,
      orderNumber,
      error instanceof Error ? error.message : "Bonum invoice failed.",
    );
  }

  return {
    id: orderRef.id,
    orderNumber,
    items: invoice.items,
    totals: invoice.totals,
    payment: {
      ...payment,
      amount: invoice.totals.grandTotal,
      qrPayload: invoice.followUpLink,
      invoiceId: invoice.invoiceId,
    },
  };
}

/**
 * Asks the server to record this order's buyer in the CRM customer directory. Runs as
 * soon as the order is placed, so a shopper who never gets round to paying is still
 * registered as someone who tried to buy.
 *
 * Deliberately never throws: the buyer is already saved on the order itself, so a failed
 * directory sync must not surface as a checkout error. The paid path upserts the same
 * buyer again, which covers anything missed here.
 */
export async function registerOrderContact(orderId: string): Promise<void> {
  try {
    await fetch("/api/orders/register-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
  } catch (error) {
    console.warn("[orders] customer directory sync failed:", error);
  }
}

/**
 * Marks an order paid via the server (POST /api/orders/mark-paid), which asks Bonum about the
 * order's own invoice and posts the journal entry using the Admin SDK. There is no browser
 * fallback any more: a shopper's browser can never write a paid state, which is what made
 * "paid without paying" possible.
 */
export async function markOrderAsPaid(orderId: string) {
  const res = await fetch("/api/orders/mark-paid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });

  if (res.ok) {
    const { payment } = (await res.json()) as { payment: OrderPaymentPayload };
    return payment;
  }

  const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  throw new Error(String(err["error"] ?? `Mark-paid failed: ${res.status}`));
}

/**
 * Reads the stock position of every product on an order, inside the caller's transaction.
 * Sequential because a Firestore transaction serialises its reads and must finish them all
 * before the first write.
 */
async function loadOrderStockStates(
  t: Transaction,
  items: OrderItemPayload[],
): Promise<Map<number | string, ProductStockState>> {
  const productIds = Array.from(
    new Set(items.map((item) => item.productId).filter((id) => id > 0)),
  );
  const states = new Map<number | string, ProductStockState>();

  for (const productId of productIds) {
    const snap = await t.get(productRef(productId));
    states.set(
      productId,
      readProductStockState(productId, snap.exists() ? (snap.data() as Record<string, unknown>) : null),
    );
  }

  return states;
}

/**
 * Moves an order's items out of stock (`direction` +1) or back into it (-1). A web order
 * is never blocked on insufficient stock: the money has already been taken, so the right
 * outcome is a stock figure that goes negative and shows the shortfall, not a refusal to
 * record what was sold.
 */
function applyOrderStock(
  states: Map<number | string, ProductStockState>,
  items: OrderItemPayload[],
  direction: 1 | -1,
): void {
  for (const item of items) {
    const state = states.get(item.productId);
    if (!state) continue;
    applyStockMovement(
      state,
      { variant: item.variant, quantity: item.quantity * direction },
      { validate: false },
    );
  }
}

/**
 * Firestore refuses `undefined` anywhere in a document, and the order form clears the Bonum
 * fields by setting them to undefined when the payment method changes — which failed every
 * such save. Dropping the keys is what the form means.
 */
function withoutUndefined(payment: OrderPaymentPayload): OrderPaymentPayload {
  return Object.fromEntries(
    Object.entries(payment).filter(([, value]) => value !== undefined),
  ) as unknown as OrderPaymentPayload;
}

/** Who is acting, for the journal entries an admin's edit posts. */
function currentActorUid(): string {
  return auth?.currentUser?.uid ?? "admin";
}

/**
 * The journal entry that recognised an order's revenue and has not been reversed yet.
 *
 * Orders settled since the fix carry it as `journalEntryId`. Older ones do not, so the ledger
 * is searched: the order's own entries, the one crediting online revenue, that no later
 * entry reverses. Returns never credit revenue, so they cannot be mistaken for it.
 */
async function findOrderPaidEntryId(orderId: string, known: unknown): Promise<string | null> {
  if (typeof known === "string" && known) {
    return known;
  }

  const snapshot = await getDocs(
    query(collection(db, JOURNAL_ENTRIES_COLLECTION), where("sourceId", "==", orderId)),
  );
  const entries = snapshot.docs.map((entry) => ({
    id: entry.id,
    data: entry.data() as { sourceType?: string; reversalOf?: string | null; lines?: JournalLine[]; entryNumber?: string },
  }));
  const reversed = new Set(
    entries.map((entry) => entry.data.reversalOf).filter((id): id is string => typeof id === "string"),
  );

  const candidates = entries.filter(
    (entry) =>
      entry.data.sourceType === "order" &&
      !entry.data.reversalOf &&
      !reversed.has(entry.id) &&
      (entry.data.lines ?? []).some((line) => line.accountCode === ACCOUNT_CODES.REVENUE_ONLINE && line.credit > 0),
  );
  candidates.sort((left, right) => String(right.data.entryNumber ?? "").localeCompare(String(left.data.entryNumber ?? "")));
  return candidates[0]?.id ?? null;
}

/**
 * Deletes an order from a channel other than the storefront, undoing everything it did:
 * the stock it took comes back and the revenue it recognised is reversed in the ledger.
 *
 * Web orders are never deletable, nor is an order Bonum has collected money for — that money
 * has to go back through a return. An order that already has returns cannot be deleted
 * either: deleting it would give the returned units back to the shelf a second time.
 */
export async function deleteOrder(orderId: string) {
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);
  const pre = await getDoc(orderRef);
  if (!pre.exists()) return;

  const preData = pre.data() as Record<string, unknown>;
  const prePayment = (preData.payment as Record<string, unknown> | undefined) ?? {};
  const wasPaid = normalizePaymentStatus(prePayment.status) === "paid";

  if (normalizeOrderSource(preData.source) === "web") {
    throw new Error("Вэбсайтаас ирсэн захиалгыг устгах боломжгүй.");
  }
  if (wasPaid && typeof prePayment.invoiceId === "string" && prePayment.invoiceId) {
    throw new Error("Bonum-оор төлөгдсөн захиалгыг устгах боломжгүй. Буцаалт бүртгэнэ үү.");
  }
  if (deserializeReturns(preData.returns).length > 0) {
    throw new Error("Буцаалт бүртгэгдсэн захиалгыг устгах боломжгүй.");
  }

  const paidEntryId = wasPaid ? await findOrderPaidEntryId(orderId, preData.journalEntryId) : null;
  const reversalNumber = paidEntryId ? await generateJournalEntryNumber() : null;

  await runTransaction(db, async (t) => {
    const snap = await t.get(orderRef);
    if (!snap.exists()) return;

    const data = snap.data() as Record<string, unknown>;
    const payment = (data.payment as Record<string, unknown> | undefined) ?? {};
    if ((normalizePaymentStatus(payment.status) === "paid") !== wasPaid || deserializeReturns(data.returns).length > 0) {
      throw new Error("Захиалга өөр газраас өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.");
    }

    const items = deserializeOrderItems(data.items);
    // Only give stock back if this order ever took it.
    const states = data.stockApplied ? await loadOrderStockStates(t, items) : null;
    const paidLines = paidEntryId ? await readJournalEntryLines(t, paidEntryId) : null;

    if (states) {
      applyOrderStock(states, items, -1);
      states.forEach((state) => writeProductStock(t, state));
    }

    if (paidEntryId && paidLines && reversalNumber) {
      const orderNumber = String(data.orderNumber ?? orderId);
      postJournalEntry(t, reversalNumber, buildReversalEntry(paidLines), {
        sourceType: "order",
        sourceId: orderId,
        sourceNumber: orderNumber,
        description: `Захиалга устгасан — бичилтийг цуцаллаа: ${orderNumber}`,
        reversalOf: paidEntryId,
        createdBy: currentActorUid(),
      });
    }

    t.delete(orderRef);
  });
}

/**
 * Saves an admin's edits to an order. Stock and revenue follow the order's *payment*
 * status, not its delivery status: when an admin marks an order paid, its goods leave the
 * shelf and its revenue is booked; when they put it back to unpaid, the goods return and
 * that revenue entry is reversed. Both happen in the same transaction as the status change,
 * so the shelf, the ledger and the order always agree.
 *
 * An order with returns cannot go back to unpaid: its returns have already refunded part of
 * the money, and reversing the whole sale on top would refund it twice.
 */
export async function updateOrderByAdmin(orderId: string, input: UpdateOrderAdminInput) {
  let nextPayment = withoutUndefined(buildPaymentForOrderStatus(input.status, input.payment));
  const willBePaid = nextPayment.status === "paid";
  const orderRef = doc(db, ORDERS_COLLECTION, orderId);

  // Entry numbers reserve through their own transactions, so what the edit will post is
  // worked out from a read beforehand and confirmed against the fresh document inside.
  const pre = await getDoc(orderRef);
  if (!pre.exists()) {
    throw new Error("Order not found.");
  }
  const preData = pre.data() as Record<string, unknown>;
  const prePayment = (preData.payment as Record<string, unknown> | undefined) ?? {};
  const wasPaid = normalizePaymentStatus(prePayment.status) === "paid";

  // Money Bonum collected is settled: the order cannot be put back to unpaid (that is what a
  // return is for) and the payment record Bonum wrote — method, invoice, amounts — stays as it
  // is, whatever the form sends.
  const bonumCollected = wasPaid && typeof prePayment.invoiceId === "string" && prePayment.invoiceId !== "";
  if (bonumCollected && !willBePaid) {
    throw new Error("Bonum-оор төлөгдсөн захиалгыг төлөгдөөгүй болгох боломжгүй. Буцаалт бүртгэнэ үү.");
  }
  if (bonumCollected) {
    nextPayment = withoutUndefined({ ...(prePayment as unknown as OrderPaymentPayload) });
  } else {
    // An invoice id is only ever written by the server; the form cannot clear or change it
    // (the rules refuse that too). A shopper who settles an invoiced order some other way
    // keeps the invoice on record next to the method they actually used.
    nextPayment = {
      ...nextPayment,
      invoiceId: typeof prePayment.invoiceId === "string" ? prePayment.invoiceId : null,
      qrPayload: typeof prePayment.qrPayload === "string" ? prePayment.qrPayload : nextPayment.qrPayload,
    };
  }

  if (wasPaid && !willBePaid && deserializeReturns(preData.returns).length > 0) {
    throw new Error("Буцаалт бүртгэгдсэн захиалгыг төлөгдөөгүй төлөвт шилжүүлэх боломжгүй.");
  }

  const paidEntryId = wasPaid && !willBePaid ? await findOrderPaidEntryId(orderId, preData.journalEntryId) : null;
  const reversalNumber = paidEntryId ? await generateJournalEntryNumber() : null;
  const postNumber = !wasPaid && willBePaid ? await generateJournalEntryNumber() : null;

  await runTransaction(db, async (t) => {
    const snap = await t.get(orderRef);
    if (!snap.exists()) {
      throw new Error("Order not found.");
    }

    const data = snap.data() as Record<string, unknown>;
    const freshWasPaid =
      normalizePaymentStatus((data.payment as Record<string, unknown> | undefined)?.status) === "paid";
    if (freshWasPaid !== wasPaid) {
      throw new Error("Захиалга өөр газраас өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.");
    }

    const stockApplied = Boolean(data.stockApplied);
    const items = deserializeOrderItems(data.items);
    const crossesBoundary = stockApplied !== willBePaid;

    // ── Reads ──
    const states = crossesBoundary || postNumber ? await loadOrderStockStates(t, items) : null;
    const paidLines = paidEntryId && reversalNumber ? await readJournalEntryLines(t, paidEntryId) : null;

    const orderNumber = String(data.orderNumber ?? orderId);
    // undefined leaves the stored id alone; null clears it.
    let journalEntryId: string | null | undefined;

    // ── Writes ──
    if (postNumber && states) {
      const totals = deserializeOrderTotals(data.totals);
      const cogsAmount = cogsForMovements(
        states,
        items
          .filter((item) => item.productId > 0)
          .map((item) => ({ productId: item.productId, variant: item.variant, quantity: item.quantity })),
      );
      const built = buildOrderPaidEntry({
        grandTotal: totals.grandTotal,
        cogsAmount,
        vatAmount: totals.vatAmount,
        shippingAmount: totals.shippingFee,
        paymentMethod: nextPayment.method,
      });
      if (!isEmptyEntry(built)) {
        const entryRef = postJournalEntry(t, postNumber, built, {
          sourceType: "order",
          sourceId: orderId,
          sourceNumber: orderNumber,
          description: `Захиалга төлөгдсөн (гараар): ${orderNumber}`,
          createdBy: currentActorUid(),
        });
        journalEntryId = entryRef.id;
      }
    }

    if (wasPaid && !willBePaid) {
      if (paidEntryId && paidLines && reversalNumber) {
        postJournalEntry(t, reversalNumber, buildReversalEntry(paidLines), {
          sourceType: "order",
          sourceId: orderId,
          sourceNumber: orderNumber,
          description: `Захиалгын төлбөрийг цуцалсан: ${orderNumber}`,
          reversalOf: paidEntryId,
          createdBy: currentActorUid(),
        });
      }
      journalEntryId = null;
    }

    if (states && crossesBoundary) {
      applyOrderStock(states, items, willBePaid ? 1 : -1);
      states.forEach((state) => writeProductStock(t, state));
    }

    t.update(orderRef, {
      status: input.status,
      source: input.source,
      customer: input.customer,
      address: input.address,
      payment: nextPayment,
      stockApplied: willBePaid,
      ...(journalEntryId !== undefined ? { journalEntryId } : {}),
      updatedAt: serverTimestamp(),
    });
  });

  return nextPayment;
}

/** One line of a return request — the caller only picks a product/variant and a quantity. */
export interface OrderReturnRequestItem {
  productId: number;
  variant: string | null;
  quantity: number;
}

/**
 * Books a full or partial return against a paid order. Mirrors `createSaleReturn` in
 * `src/lib/sales.ts` — the two item shapes are identical, only the eligibility check and the
 * collection differ: an order is returnable once it has been paid (and therefore has taken
 * stock and money), regardless of its delivery status.
 */
export async function createOrderReturn(
  orderId: string,
  requestItems: OrderReturnRequestItem[],
  reason: string,
  createdByUid: string,
  createdByName: string,
): Promise<string> {
  const entryNumber = await generateJournalEntryNumber();
  const returnId = doc(collection(db, ORDERS_COLLECTION)).id;

  await runTransaction(db, async (t) => {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const snap = await t.get(orderRef);
    if (!snap.exists()) {
      throw new Error("Захиалга олдсонгүй");
    }

    const data = snap.data() as Record<string, unknown>;
    const paymentData =
      typeof data.payment === "object" && data.payment !== null ? (data.payment as Record<string, unknown>) : {};
    if (normalizePaymentStatus(paymentData.status) !== "paid") {
      throw new Error("Зөвхөн төлбөр төлөгдсөн захиалгыг буцаах боломжтой");
    }

    const items = deserializeOrderItems(data.items);
    const existingReturns = deserializeReturns(data.returns);
    const returned = returnedQuantities(existingReturns);

    const returnItems: RetailReturnItem[] = [];
    for (const request of requestItems) {
      if (!(request.quantity > 0)) continue;
      const original = items.find((item) => item.productId === request.productId && (item.variant ?? null) === request.variant);
      if (!original) {
        throw new Error("Энэ захиалгад байхгүй барааг буцаах боломжгүй");
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

    // Order lines already carry their discounted price and `subtotal` is their sum, so the
    // goods were charged at face value — unless the paid step booked less than the order
    // claimed (a legacy order whose totals did not survive re-pricing), in which case a
    // return can give back no more than the ledger ever took in.
    const totals = deserializeOrderTotals(data.totals);
    const vatOnTop = totals.vatMode === "added" ? (totals.vatAmount ?? 0) : 0;
    const ledgerGrandTotal = typeof data.ledgerGrandTotal === "number" ? data.ledgerGrandTotal : null;
    const chargedGoodsValue =
      ledgerGrandTotal === null
        ? totals.subtotal
        : Math.max(0, Math.min(totals.subtotal, ledgerGrandTotal - totals.shippingFee - vatOnTop));
    const money = retailReturnMoney({
      linesValue: returnItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      allLinesValue: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      chargedGoodsValue,
      chargedVat: totals.vatAmount ?? 0,
      vatMode: totals.vatMode ?? "none",
      priorReturns: existingReturns,
      completesReturn: completesReturn(items, existingReturns, returnItems),
    });
    const vatAmount = money.vat;
    const returnNet = money.net;
    const returnGross = money.gross;

    for (const item of returnItems) {
      const state = states.get(item.productId);
      if (!state) continue;
      applyStockMovement(state, { variant: item.variant, quantity: -item.quantity }, { validate: false });
    }
    const cogsAmount = cogsForMovements(
      states,
      returnItems.map((item) => ({ productId: item.productId, variant: item.variant, quantity: item.quantity })),
    );

    const orderNumber = String(data.orderNumber ?? orderId);
    const builtEntry = buildSaleReturnEntry({
      returnAmount: returnNet,
      vatAmount,
      cogsAmount,
      paymentMethod: normalizePaymentMethod(paymentData.method),
    });

    let journalEntryId: string | null = null;
    if (!isEmptyEntry(builtEntry)) {
      const entryRef = postJournalEntry(t, entryNumber, builtEntry, {
        sourceType: "order",
        sourceId: orderId,
        sourceNumber: orderNumber,
        description: `Буцаалт: ${orderNumber}`,
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

    t.update(orderRef, {
      returns: [...existingReturns, returnRecord],
      updatedAt: serverTimestamp(),
    });

    states.forEach((state) => writeProductStock(t, state));
  });

  return returnId;
}

export function subscribeToOrders({
  onData,
  onError,
}: {
  onData: (orders: OrderRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, ORDERS_COLLECTION), orderBy("createdAt", "desc")),
    (snapshot) => {
      const orders = snapshot.docs.map((documentSnapshot) => deserializeOrder(documentSnapshot));
      onData(orders);
    },
    onError,
  );
}

export function subscribeToUserOrders({
  uid,
  onData,
  onError,
}: {
  uid: string;
  onData: (orders: OrderRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(
      collection(db, ORDERS_COLLECTION),
      where("auth.uid", "==", uid),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) => {
      const orders = snapshot.docs.map((documentSnapshot) => deserializeOrder(documentSnapshot));
      onData(orders);
    },
    onError,
  );
}

/**
 * What a shopper is allowed to learn about an order from its number: where it is and what
 * is in it — never who bought it or where it is going.
 */
export interface OrderLookupResult {
  orderNumber: string;
  status: OrderStatus;
  items: Array<Pick<OrderItemPayload, "productId" | "name" | "image" | "variant" | "quantity" | "unitPrice" | "lineTotal">>;
  totals: Pick<OrderTotalsPayload, "subtotal" | "shippingFee" | "grandTotal">;
}

/**
 * Looks an order up by its ORD- number through the server.
 *
 * This used to query Firestore directly, which needed a rule allowing any `list` with
 * `limit == 1`. Rules cannot see a query's filters, so that one clause let anyone — signed
 * out included — pull a whole order document, buyer's name, phone and address included.
 * /api/orders/lookup reads it with the Admin SDK and returns only the fields above.
 */
export async function searchOrderByNumber(orderNumber: string): Promise<OrderLookupResult | null> {
  const res = await fetch(`/api/orders/lookup?orderNumber=${encodeURIComponent(orderNumber.toUpperCase().trim())}`);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(String(err["error"] ?? `Order lookup failed: ${res.status}`));
  }

  const data = (await res.json()) as Record<string, unknown>;

  return {
    orderNumber: String(data.orderNumber ?? ""),
    status: normalizeOrderStatus(data.status),
    items: deserializeOrderItems(data.items),
    totals: {
      subtotal: Number((data.totals as Record<string, unknown> | undefined)?.subtotal ?? 0),
      shippingFee: Number((data.totals as Record<string, unknown> | undefined)?.shippingFee ?? 0),
      grandTotal: Number((data.totals as Record<string, unknown> | undefined)?.grandTotal ?? 0),
    },
  };
}
