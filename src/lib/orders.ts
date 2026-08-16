import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { documentNumberFromId } from "./documentNumbers";
import {
  applyStockMovement,
  productRef,
  readProductStockState,
  writeProductStock,
  type ProductStockState,
} from "./inventory";
import { normalizeVatMode, type VatMode } from "./vat";

export const ORDERS_COLLECTION = "orders";
export const ORDER_SCHEMA_VERSION = 1;
export const SHIPPING_FEE = 8000;
export type OrderPaymentMethod = "bonum" | "cash" | "bank_transfer";
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

async function createBonumInvoice(amount: number, transactionId: string): Promise<{ invoiceId: string; followUpLink: string }> {
  const res = await fetch("/api/bonum/invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, transactionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(err["error"] ?? `Bonum invoice failed: ${res.status}`));
  }

  return res.json() as Promise<{ invoiceId: string; followUpLink: string }>;
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

function deserializeOrder(snapshot: QueryDocumentSnapshot<DocumentData>): OrderRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const authData = typeof data.auth === "object" && data.auth !== null ? (data.auth as Record<string, unknown>) : {};
  const customerData =
    typeof data.customer === "object" && data.customer !== null ? (data.customer as Record<string, unknown>) : {};
  const addressData =
    typeof data.address === "object" && data.address !== null ? (data.address as Record<string, unknown>) : {};
  const totalsData =
    typeof data.totals === "object" && data.totals !== null ? (data.totals as Record<string, unknown>) : {};
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
    totals: {
      subtotal: Number(totalsData.subtotal ?? 0),
      shippingFee: Number(totalsData.shippingFee ?? 0),
      grandTotal: Number(totalsData.grandTotal ?? 0),
      discountTotal: Number(totalsData.discountTotal ?? 0),
      vatMode: normalizeVatMode(totalsData.vatMode),
      vatAmount: Number(totalsData.vatAmount ?? 0),
    },
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
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const orderRef = doc(collection(db, ORDERS_COLLECTION));
  const orderNumber = createOrderNumber(orderRef.id);

  // Use the Firestore doc ID as Bonum transactionId so the webhook can look up the order
  // TEST MODE: fixed 100₮ invoice so real money is not charged during development
  const bonumResult = await createBonumInvoice(100, orderRef.id);

  const payment: OrderPaymentPayload = {
    method: "bonum",
    provider: "bonum",
    status: "pending",
    amount: input.totals.grandTotal,
    // followUpLink is the URL opened when the user scans the QR code
    qrPayload: bonumResult.followUpLink,
    invoiceId: bonumResult.invoiceId,
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

  return {
    id: orderRef.id,
    orderNumber,
    payment,
  };
}

export async function getOrderPaymentSnapshot(orderId: string) {
  const snapshot = await getDoc(doc(db, ORDERS_COLLECTION, orderId));

  if (!snapshot.exists()) {
    throw new Error("Order not found.");
  }

  const data = snapshot.data() as Record<string, unknown>;
  const paymentData =
    typeof data.payment === "object" && data.payment !== null
      ? (data.payment as Record<string, unknown>)
      : {};

  return {
    method: normalizePaymentMethod(paymentData.method),
    provider: normalizePaymentMethod(paymentData.provider),
    status: normalizePaymentStatus(paymentData.status),
    amount: Number(paymentData.amount ?? 0),
    qrPayload: String(paymentData.qrPayload ?? ""),
    invoiceId: typeof paymentData.invoiceId === "string" ? paymentData.invoiceId : null,
    paidAt: parseTimestamp(paymentData.paidAt),
  } satisfies OrderPaymentPayload;
}

interface BonumCheckResult {
  paid: boolean;
  paymentVendor?: string;
  completedAt?: string;
  terminalId?: string;
  bonumAmount?: number;
}

async function verifyBonumPayment(invoiceId: string): Promise<BonumCheckResult> {
  const res = await fetch(`/api/bonum/check?invoiceId=${encodeURIComponent(invoiceId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(err["error"] ?? `Payment check failed: ${res.status}`));
  }
  return res.json() as Promise<BonumCheckResult>;
}

/**
 * Marks an order paid via the server (POST /api/orders/mark-paid), which re-verifies with
 * Bonum and posts the accounting journal entry using the Admin SDK — the online-order ledger
 * entry must never be self-authored by the customer's own browser. Falls back to the previous
 * direct-Firestore write (no journal entry) only when the server reports it has no Admin SDK
 * credentials configured (local dev without FIREBASE_SERVICE_ACCOUNT_JSON).
 */
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
  if (err.fallback) {
    // Only in development. In production a missing service account must fail loudly: the
    // fallback flips the order to paid without posting a journal entry and without moving
    // stock, so a misconfigured deploy would quietly build up revenue the ledger never saw.
    if (import.meta.env.DEV) {
      return markOrderAsPaidClientFallback(orderId);
    }

    throw new Error(
      "Төлбөрийн баталгаажуулалт түр боломжгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.",
    );
  }

  throw new Error(String(err["error"] ?? `Mark-paid failed: ${res.status}`));
}

/** Dev-only fallback used when the server has no Admin SDK credentials — does not post a journal entry. */
async function markOrderAsPaidClientFallback(orderId: string) {
  const currentPayment = await getOrderPaymentSnapshot(orderId);

  let bonumDetails: Omit<BonumCheckResult, "paid"> = {};

  if (currentPayment.invoiceId) {
    const checkResult = await verifyBonumPayment(currentPayment.invoiceId);
    if (!checkResult.paid) {
      throw new Error("Төлбөр Bonum системд баталгаажаагүй байна. Төлбөрөө хийсний дараа дахин шалгана уу.");
    }
    const { paid, ...details } = checkResult;
    void paid;
    bonumDetails = details;
  }

  const nextPayment: OrderPaymentPayload = {
    ...buildPaymentForOrderStatus("paid", currentPayment),
    ...(bonumDetails.paymentVendor !== undefined && { bonumPaymentVendor: bonumDetails.paymentVendor }),
    ...(bonumDetails.completedAt !== undefined && { bonumCompletedAt: bonumDetails.completedAt }),
    ...(bonumDetails.terminalId !== undefined && { bonumTerminalId: bonumDetails.terminalId }),
    ...(bonumDetails.bonumAmount !== undefined && { bonumAmount: bonumDetails.bonumAmount }),
  };

  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
    status: "paid",
    payment: nextPayment,
    updatedAt: serverTimestamp(),
  });

  return nextPayment;
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

/** Web orders (placed through the storefront) are never deletable — only orders from other channels are. */
export async function deleteOrder(orderId: string) {
  await runTransaction(db, async (t) => {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const snap = await t.get(orderRef);
    if (!snap.exists()) return;

    const data = snap.data() as Record<string, unknown>;
    const items = deserializeOrderItems(data.items);
    // Only give stock back if this order ever took it.
    const states = data.stockApplied ? await loadOrderStockStates(t, items) : null;

    if (states) {
      applyOrderStock(states, items, -1);
      states.forEach((state) => writeProductStock(t, state));
    }

    t.delete(orderRef);
  });
}

/**
 * Saves an admin's edits to an order. Stock follows the order's *payment* status, not its
 * delivery status: it leaves when the order becomes paid and returns if the order is put
 * back to unpaid, so the shelf always agrees with the revenue that has been recognised.
 * The movement happens in the same transaction as the status change.
 */
export async function updateOrderByAdmin(orderId: string, input: UpdateOrderAdminInput) {
  const nextPayment = buildPaymentForOrderStatus(input.status, input.payment);
  const shouldHoldStock = nextPayment.status === "paid";

  await runTransaction(db, async (t) => {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const snap = await t.get(orderRef);
    if (!snap.exists()) {
      throw new Error("Order not found.");
    }

    const data = snap.data() as Record<string, unknown>;
    const stockApplied = Boolean(data.stockApplied);
    const items = deserializeOrderItems(data.items);
    const crossesBoundary = stockApplied !== shouldHoldStock;

    const states = crossesBoundary ? await loadOrderStockStates(t, items) : null;

    if (states) {
      applyOrderStock(states, items, shouldHoldStock ? 1 : -1);
      states.forEach((state) => writeProductStock(t, state));
    }

    t.update(orderRef, {
      status: input.status,
      source: input.source,
      customer: input.customer,
      address: input.address,
      payment: nextPayment,
      stockApplied: shouldHoldStock,
      updatedAt: serverTimestamp(),
    });
  });

  return nextPayment;
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
