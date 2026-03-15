import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export const ORDERS_COLLECTION = "orders";
export const ORDER_SCHEMA_VERSION = 1;
export const SHIPPING_FEE = 8000;
export type OrderPaymentMethod = "qpay";
export type OrderPaymentStatus = "pending" | "paid" | "failed" | "cancelled";
export type OrderStatus = "pending" | "payment_paid";

export interface OrderItemPayload {
  productId: number;
  name: string;
  category: string;
  image: string | null;
  variant: string | null;
  quantity: number;
  unitPrice: number;
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
  provider: "qpay";
  status: OrderPaymentStatus;
  amount: number;
  qrPayload: string;
  paidAt: string | null;
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
  totals: {
    subtotal: number;
    shippingFee: number;
    grandTotal: number;
  };
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
  currency: string;
  auth: CreateOrderInput["auth"];
  customer: OrderCustomerPayload;
  address: OrderAddressPayload;
  items: OrderItemPayload[];
  totals: CreateOrderInput["totals"];
  payment: OrderPaymentPayload;
  createdAt: string | null;
  updatedAt: string | null;
}

function createOrderNumber(id: string) {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ulaanbaatar",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = dateParts.find((part) => part.type === "year")?.value ?? "00";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "00";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "00";
  const suffix = id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase().padEnd(4, "0");

  return `ORD-${year}${month}${day}${suffix}`;
}

function createQpayQrPayload(input: {
  orderNumber: string;
  amount: number;
  phoneNumber: string;
  uid: string;
}) {
  return JSON.stringify({
    provider: "QPAY",
    merchant: "Savana",
    orderNumber: input.orderNumber,
    amount: input.amount,
    currency: "MNT",
    phoneNumber: input.phoneNumber,
    customerId: input.uid,
  });
}

function normalizePaymentStatus(value: unknown): OrderPaymentStatus {
  if (value === "paid" || value === "failed" || value === "cancelled") {
    return value;
  }

  return "pending";
}

function normalizeOrderStatus(value: unknown): OrderStatus {
  return value === "payment_paid" ? "payment_paid" : "pending";
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
          .map((item) => {
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
              lineTotal: Number(itemData.lineTotal ?? 0),
            } satisfies OrderItemPayload;
          })
          .filter((item): item is OrderItemPayload => item !== null)
      : [],
    totals: {
      subtotal: Number(totalsData.subtotal ?? 0),
      shippingFee: Number(totalsData.shippingFee ?? 0),
      grandTotal: Number(totalsData.grandTotal ?? 0),
    },
    payment: {
      method: "qpay",
      provider: "qpay",
      status: normalizePaymentStatus(paymentData.status),
      amount: Number(paymentData.amount ?? 0),
      qrPayload: String(paymentData.qrPayload ?? ""),
      paidAt: parseTimestamp(paymentData.paidAt),
    },
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const orderRef = doc(collection(db, ORDERS_COLLECTION));
  const orderNumber = createOrderNumber(orderRef.id);
  const payment: OrderPaymentPayload = {
    method: "qpay",
    provider: "qpay",
    status: "pending",
    amount: input.totals.grandTotal,
    qrPayload: createQpayQrPayload({
      orderNumber,
      amount: input.totals.grandTotal,
      phoneNumber: input.customer.phoneNumber,
      uid: input.auth.uid,
    }),
    paidAt: null,
  };

  await setDoc(orderRef, {
    orderNumber,
    schemaVersion: ORDER_SCHEMA_VERSION,
    status: "pending",
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
    method: "qpay" as const,
    provider: "qpay" as const,
    status: normalizePaymentStatus(paymentData.status),
    amount: Number(paymentData.amount ?? 0),
    qrPayload: String(paymentData.qrPayload ?? ""),
    paidAt: parseTimestamp(paymentData.paidAt),
  } satisfies OrderPaymentPayload;
}

export async function markOrderAsPaid(orderId: string) {
  const paidAt = new Date().toISOString();

  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
    status: "payment_paid",
    "payment.status": "paid",
    "payment.paidAt": paidAt,
    updatedAt: serverTimestamp(),
  });

  return getOrderPaymentSnapshot(orderId);
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
