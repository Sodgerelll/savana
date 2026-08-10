import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildManualOrderEntry } from "./accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry } from "./accounting/postEntryClient";

export const ORDERS_COLLECTION = "orders";
export const ORDER_SCHEMA_VERSION = 1;
export const SHIPPING_FEE = 8000;
export type OrderPaymentMethod = "bonum" | "cash" | "bank_transfer";
export type OrderPaymentStatus = "pending" | "paid" | "failed" | "cancelled";
export type OrderStatus = "new" | "paid" | "delivering" | "delivered";
export const ORDER_STATUS_VALUES = ["new", "paid", "delivering", "delivered"] as const;

/** Channel the order arrived through. Storefront checkout always writes "web". */
export type OrderSource =
  | "web"
  | "messenger"
  | "facebook"
  | "instagram"
  | "phone"
  | "email"
  | "walk_in"
  | "other";
export const ORDER_SOURCE_VALUES = [
  "web",
  "messenger",
  "facebook",
  "instagram",
  "phone",
  "email",
  "walk_in",
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

/**
 * An order the admin took by hand (Messenger, phone, walk-in, …) and typed into the
 * Orders page. No Bonum invoice is involved — payment method and status come straight
 * from the form.
 */
export interface CreateManualOrderInput {
  source: OrderSource;
  status: OrderStatus;
  paymentMethod: OrderPaymentMethod;
  customer: OrderCustomerPayload;
  address: OrderAddressPayload;
  items: OrderItemPayload[];
  totals: OrderTotalsPayload;
  createdByUid: string;
  createdByName?: string;
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
  /** True for orders registered by an admin from the Orders page. */
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

function createOrderNumber(): string {
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

  return `ORD-${year}${month}${day}${randomLetter}${randomDigits}`;
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
    items: Array.isArray(data.items)
      ? data.items
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
          .filter((item): item is OrderItemPayload => item !== null)
      : [],
    totals: {
      subtotal: Number(totalsData.subtotal ?? 0),
      shippingFee: Number(totalsData.shippingFee ?? 0),
      grandTotal: Number(totalsData.grandTotal ?? 0),
      discountTotal: Number(totalsData.discountTotal ?? 0),
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
  const orderNumber = createOrderNumber();

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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: orderRef.id,
    orderNumber,
    payment,
  };
}

/** Best-effort COGS for an order: sums costPrice × quantity for the products that carry one. */
async function sumOrderCogs(items: OrderItemPayload[]): Promise<number> {
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

/**
 * Registers an order the admin took by hand. Unlike the storefront flow no Bonum invoice
 * is created, so the payment is whatever the admin selected. When the order is registered
 * as already settled (paid/delivering/delivered) the revenue journal entry is posted in
 * the same batch, so manual sales reach Finance the same way Bonum-paid web orders do.
 */
export async function createManualOrder(input: CreateManualOrderInput): Promise<CreatedOrder> {
  const orderRef = doc(collection(db, ORDERS_COLLECTION));
  const orderNumber = createOrderNumber();
  const isSettled = input.status !== "new";

  const payment: OrderPaymentPayload = {
    method: input.paymentMethod,
    provider: input.paymentMethod,
    status: isSettled ? "paid" : "pending",
    amount: input.totals.grandTotal,
    qrPayload: "",
    invoiceId: null,
    paidAt: isSettled ? new Date().toISOString() : null,
  };

  // Both reads (product costPrice) and the entry-number transaction must complete before
  // the batch is assembled — writeBatch itself cannot read.
  const cogsAmount = isSettled ? await sumOrderCogs(input.items) : 0;
  const entryNumber = isSettled ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);
  let journalEntryId: string | null = null;

  if (entryNumber) {
    const entryRef = postJournalEntry(
      batch,
      entryNumber,
      buildManualOrderEntry({
        grandTotal: input.totals.grandTotal,
        cogsAmount,
        paymentMethod: input.paymentMethod,
      }),
      {
        sourceType: "order",
        sourceId: orderRef.id,
        sourceNumber: orderNumber,
        description: `Гараар бүртгэсэн захиалга: ${orderNumber}`,
        createdBy: input.createdByUid,
        createdByName: input.createdByName ?? "",
      },
    );
    journalEntryId = entryRef.id;
  }

  batch.set(orderRef, {
    orderNumber,
    schemaVersion: ORDER_SCHEMA_VERSION,
    status: input.status,
    source: input.source,
    isManual: true,
    currency: "MNT",
    // Manual orders belong to no signed-in shopper — an empty uid never matches
    // isOrderOwner(), so they stay admin-only.
    auth: { uid: "", isAnonymous: false, method: "manual" },
    customer: input.customer,
    address: input.address,
    items: input.items,
    totals: input.totals,
    payment,
    createdByUid: input.createdByUid,
    journalEntryId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();

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
    return markOrderAsPaidClientFallback(orderId);
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
    const { paid: _paid, ...details } = checkResult;
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

export async function updateOrderByAdmin(orderId: string, input: UpdateOrderAdminInput) {
  const nextPayment = buildPaymentForOrderStatus(input.status, input.payment);

  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
    status: input.status,
    source: input.source,
    customer: input.customer,
    address: input.address,
    payment: nextPayment,
    updatedAt: serverTimestamp(),
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

export async function searchOrderByNumber(orderNumber: string): Promise<OrderRecord | null> {
  const snapshot = await getDocs(
    query(
      collection(db, ORDERS_COLLECTION),
      where("orderNumber", "==", orderNumber.toUpperCase().trim()),
      limit(1),
    ),
  );
  if (snapshot.empty) return null;
  return deserializeOrder(snapshot.docs[0]);
}
