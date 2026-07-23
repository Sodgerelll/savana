import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { CUSTOMERS_COLLECTION } from "./customers";
import {
  buildCustomerTransactionSaleEntry,
  buildCustomerTransactionReturnEntry,
  buildReversalEntry,
} from "./accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry, JOURNAL_ENTRIES_COLLECTION } from "./accounting/postEntryClient";

export const CUSTOMER_TRANSACTIONS_COLLECTION = "customerTransactions";
export const CUSTOMER_TRANSACTION_SCHEMA_VERSION = 1;

export type CustomerTransactionType = "delivery" | "sale" | "return";
export type CustomerTransactionPaymentStatus = "unpaid" | "partial" | "paid";
export type CustomerTransactionPaymentMethod = "cash" | "bank" | "qpay" | "other";

export interface CustomerTransactionItem {
  productId: number;
  productName: string;
  category: string;
  image: string | null;
  variant: string | null;
  quantity: number;
  soldQuantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CustomerTransactionTotals {
  subtotal: number;
  discount: number;
  grandTotal: number;
}

export interface CustomerTransactionPayment {
  status: CustomerTransactionPaymentStatus;
  paidAmount: number;
  method: CustomerTransactionPaymentMethod | null;
  paidAt: string | null;
}

export interface CustomerTransactionCustomerSnapshot {
  code: string;
  name: string;
  phoneNumber: string;
}

export interface CustomerTransactionRecord {
  id: string;
  txNumber: string;
  type: CustomerTransactionType;
  customerId: string;
  customerSnapshot: CustomerTransactionCustomerSnapshot;
  items: CustomerTransactionItem[];
  totals: CustomerTransactionTotals;
  payment: CustomerTransactionPayment;
  relatedTransactionId: string | null;
  transactionDate: string | null;
  note: string;
  createdByUid: string;
  createdAt: string | null;
  updatedAt: string | null;
  journalEntryId?: string | null;
}

export interface CreateCustomerTransactionInput {
  type: CustomerTransactionType;
  customerId: string;
  customerSnapshot: CustomerTransactionCustomerSnapshot;
  items: CustomerTransactionItem[];
  totals: CustomerTransactionTotals;
  payment: CustomerTransactionPayment;
  relatedTransactionId?: string | null;
  transactionDate?: string | null;
  note?: string;
  createdByUid: string;
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

export function createEmptyTransactionDraft(): CustomerTransactionRecord {
  return {
    id: "",
    txNumber: "",
    type: "delivery",
    customerId: "",
    customerSnapshot: { code: "", name: "", phoneNumber: "" },
    items: [],
    totals: { subtotal: 0, discount: 0, grandTotal: 0 },
    payment: { status: "unpaid", paidAmount: 0, method: null, paidAt: null },
    relatedTransactionId: null,
    transactionDate: new Date().toISOString().slice(0, 10),
    note: "",
    createdByUid: "",
    createdAt: null,
    updatedAt: null,
    journalEntryId: null,
  };
}

function normalizeType(value: unknown): CustomerTransactionType {
  if (value === "delivery" || value === "return") {
    return value;
  }
  return "sale";
}

function normalizePaymentStatus(value: unknown): CustomerTransactionPaymentStatus {
  if (value === "paid" || value === "partial") {
    return value;
  }
  return "unpaid";
}

function normalizePaymentMethod(value: unknown): CustomerTransactionPaymentMethod | null {
  if (value === "cash" || value === "bank" || value === "qpay" || value === "other") {
    return value;
  }
  return null;
}

function deserializeTransaction(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): CustomerTransactionRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const customerSnapshot =
    typeof data.customerSnapshot === "object" && data.customerSnapshot !== null
      ? (data.customerSnapshot as Record<string, unknown>)
      : {};
  const totals =
    typeof data.totals === "object" && data.totals !== null
      ? (data.totals as Record<string, unknown>)
      : {};
  const payment =
    typeof data.payment === "object" && data.payment !== null
      ? (data.payment as Record<string, unknown>)
      : {};

  return {
    id: snapshot.id,
    txNumber: String(data.txNumber ?? snapshot.id),
    type: normalizeType(data.type),
    customerId: String(data.customerId ?? ""),
    customerSnapshot: {
      code: String(customerSnapshot.code ?? ""),
      name: String(customerSnapshot.name ?? ""),
      phoneNumber: String(customerSnapshot.phoneNumber ?? ""),
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
              productName: String(itemData.productName ?? ""),
              category: String(itemData.category ?? ""),
              image: typeof itemData.image === "string" ? itemData.image : null,
              variant: typeof itemData.variant === "string" ? itemData.variant : null,
              quantity: Number(itemData.quantity ?? 0),
              soldQuantity: Number(itemData.soldQuantity ?? 0),
              unitPrice: Number(itemData.unitPrice ?? 0),
              lineTotal: Number(itemData.lineTotal ?? 0),
            } satisfies CustomerTransactionItem;
          })
          .filter((item): item is CustomerTransactionItem => item !== null)
      : [],
    totals: {
      subtotal: Number(totals.subtotal ?? 0),
      discount: Number(totals.discount ?? 0),
      grandTotal: Number(totals.grandTotal ?? 0),
    },
    payment: {
      status: normalizePaymentStatus(payment.status),
      paidAmount: Number(payment.paidAmount ?? 0),
      method: normalizePaymentMethod(payment.method),
      paidAt: parseTimestamp(payment.paidAt),
    },
    relatedTransactionId:
      typeof data.relatedTransactionId === "string" ? data.relatedTransactionId : null,
    transactionDate: typeof data.transactionDate === "string" ? data.transactionDate : null,
    note: String(data.note ?? ""),
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
  };
}

async function generateTxNumber(): Promise<string> {
  const snapshot = await getDocs(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION));
  let maxNumber = 0;
  snapshot.docs.forEach((docSnapshot) => {
    const txNumber = String(docSnapshot.data().txNumber ?? "");
    const match = txNumber.match(/TX-(\d+)/);
    if (match) {
      const num = Number(match[1]);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  });
  return `TX-${String(maxNumber + 1).padStart(6, "0")}`;
}

function stockSignForType(type: CustomerTransactionType): number {
  // delivery & sale remove stock; return adds stock back
  if (type === "return") return 1;
  return -1;
}

function customerDeltaForTransaction(
  type: CustomerTransactionType,
  totals: CustomerTransactionTotals,
  payment: CustomerTransactionPayment,
  sign: 1 | -1 = 1,
): { totalSales: number; totalPaid: number; outstandingBalance: number } {
  if (type === "return") {
    return {
      totalSales: -totals.grandTotal * sign,
      totalPaid: -payment.paidAmount * sign,
      outstandingBalance: -(totals.grandTotal - payment.paidAmount) * sign,
    };
  }
  return {
    totalSales: totals.grandTotal * sign,
    totalPaid: payment.paidAmount * sign,
    outstandingBalance: (totals.grandTotal - payment.paidAmount) * sign,
  };
}

interface ProductStockPatch {
  productId: number;
  totalStock: number;
  soldCount: number;
  costPrice: number;
  variants: Array<{ name: string; price: number; quantity: number; soldCount?: number }> | null;
}

async function loadProductPatches(
  items: CustomerTransactionItem[],
): Promise<Map<number, ProductStockPatch>> {
  const uniqueIds = Array.from(new Set(items.map((item) => item.productId)));
  const patches = new Map<number, ProductStockPatch>();

  await Promise.all(
    uniqueIds.map(async (productId) => {
      const ref = doc(db, "products", String(productId));
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      patches.set(productId, {
        productId,
        totalStock: Number(data.totalStock ?? 0),
        soldCount: Number(data.soldCount ?? 0),
        costPrice: Number(data.costPrice ?? 0),
        variants: Array.isArray(data.variants)
          ? (data.variants as ProductStockPatch["variants"])
          : null,
      });
    }),
  );

  return patches;
}

/** Best-effort COGS for a set of items — 0 for any product missing a costPrice. */
function cogsForItems(patches: Map<number, ProductStockPatch>, items: CustomerTransactionItem[]): number {
  return items.reduce((sum, item) => {
    const patch = patches.get(item.productId);
    return patch && patch.costPrice > 0 ? sum + patch.costPrice * item.quantity : sum;
  }, 0);
}

function applyItemsToPatches(
  patches: Map<number, ProductStockPatch>,
  items: CustomerTransactionItem[],
  sign: number,
) {
  items.forEach((item) => {
    const patch = patches.get(item.productId);
    if (!patch) return;
    const delta = item.quantity * sign; // negative = deduct for delivery/sale
    patch.soldCount = Math.max(0, patch.soldCount - delta);
    if (item.variant && patch.variants) {
      const idx = patch.variants.findIndex((v) => v.name === item.variant);
      if (idx >= 0) {
        const v = patch.variants[idx];
        patch.variants[idx] = {
          ...v,
          soldCount: Math.max(0, Number(v.soldCount ?? 0) - delta),
        };
      }
    }
  });
}

function writeProductPatches(
  batch: ReturnType<typeof writeBatch>,
  patches: Map<number, ProductStockPatch>,
) {
  patches.forEach((patch) => {
    const ref = doc(db, "products", String(patch.productId));
    batch.update(ref, {
      soldCount: patch.soldCount,
      ...(patch.variants ? { variants: patch.variants } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

async function loadCustomerAggregates(customerId: string) {
  const ref = doc(db, CUSTOMERS_COLLECTION, customerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Customer not found");
  }
  const data = snap.data() as Record<string, unknown>;
  return {
    ref,
    totalSales: Number(data.totalSales ?? 0),
    totalPaid: Number(data.totalPaid ?? 0),
    outstandingBalance: Number(data.outstandingBalance ?? 0),
  };
}

export async function createCustomerTransaction(
  input: CreateCustomerTransactionInput,
): Promise<string> {
  const txNumber = await generateTxNumber();
  const txRef = doc(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION));

  const productPatches = await loadProductPatches(input.items);
  const cogsAmount = cogsForItems(productPatches, input.items);
  applyItemsToPatches(productPatches, input.items, stockSignForType(input.type));

  const customer = await loadCustomerAggregates(input.customerId);
  const delta = customerDeltaForTransaction(input.type, input.totals, input.payment);

  const batch = writeBatch(db);

  const entryNumber = await generateJournalEntryNumber();
  const builtEntry =
    input.type === "return"
      ? buildCustomerTransactionReturnEntry({ grandTotal: input.totals.grandTotal, cogsAmount })
      : buildCustomerTransactionSaleEntry({
          paymentMethod: input.payment.method,
          paidAmount: input.payment.paidAmount,
          grandTotal: input.totals.grandTotal,
          cogsAmount,
        });
  const entryRef = postJournalEntry(batch, entryNumber, builtEntry, {
    sourceType: "customerTransaction",
    sourceId: txRef.id,
    sourceNumber: txNumber,
    description: `Харилцагчийн гүйлгээ: ${txNumber} — ${input.customerSnapshot.name}`,
    createdBy: input.createdByUid,
  });

  batch.set(txRef, {
    schemaVersion: CUSTOMER_TRANSACTION_SCHEMA_VERSION,
    txNumber,
    type: input.type,
    customerId: input.customerId,
    customerSnapshot: input.customerSnapshot,
    items: input.items,
    totals: input.totals,
    payment: input.payment,
    relatedTransactionId: input.relatedTransactionId ?? null,
    transactionDate: input.transactionDate ?? null,
    note: input.note ?? "",
    createdByUid: input.createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    journalEntryId: entryRef.id,
  });

  writeProductPatches(batch, productPatches);

  batch.update(customer.ref, {
    totalSales: customer.totalSales + delta.totalSales,
    totalPaid: customer.totalPaid + delta.totalPaid,
    outstandingBalance: customer.outstandingBalance + delta.outstandingBalance,
    lastTransactionAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return txRef.id;
}

export async function updateCustomerTransaction(
  id: string,
  previous: CustomerTransactionRecord,
  next: CreateCustomerTransactionInput,
): Promise<void> {
  const txRef = doc(db, CUSTOMER_TRANSACTIONS_COLLECTION, id);

  // Combine all items (old + new) so we get a consistent stock snapshot
  const combinedItems = [...previous.items, ...next.items];
  const productPatches = await loadProductPatches(combinedItems);

  // Reverse previous effect then apply new effect
  applyItemsToPatches(productPatches, previous.items, -stockSignForType(previous.type));
  applyItemsToPatches(productPatches, next.items, stockSignForType(next.type));

  const batch = writeBatch(db);

  // Reverse the previously posted entry (from its stored lines, not recomputed), then post a
  // fresh one reflecting the updated type/items/payment.
  if (previous.journalEntryId) {
    const oldEntrySnap = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, previous.journalEntryId));
    if (oldEntrySnap.exists()) {
      const oldLines = (oldEntrySnap.data() as { lines?: Parameters<typeof buildReversalEntry>[0] }).lines ?? [];
      const reversalEntryNumber = await generateJournalEntryNumber();
      postJournalEntry(batch, reversalEntryNumber, buildReversalEntry(oldLines), {
        sourceType: "customerTransaction",
        sourceId: id,
        sourceNumber: previous.txNumber,
        description: `Гүйлгээ засварласан — хуучин бичилтийг цуцаллаа: ${previous.txNumber}`,
        reversalOf: previous.journalEntryId,
        createdBy: next.createdByUid,
      });
    }
  }

  const nextCogsAmount = cogsForItems(productPatches, next.items);
  const nextEntryNumber = await generateJournalEntryNumber();
  const nextBuiltEntry =
    next.type === "return"
      ? buildCustomerTransactionReturnEntry({ grandTotal: next.totals.grandTotal, cogsAmount: nextCogsAmount })
      : buildCustomerTransactionSaleEntry({
          paymentMethod: next.payment.method,
          paidAmount: next.payment.paidAmount,
          grandTotal: next.totals.grandTotal,
          cogsAmount: nextCogsAmount,
        });
  const nextEntryRef = postJournalEntry(batch, nextEntryNumber, nextBuiltEntry, {
    sourceType: "customerTransaction",
    sourceId: id,
    sourceNumber: previous.txNumber,
    description: `Гүйлгээ засварласан: ${previous.txNumber}`,
    createdBy: next.createdByUid,
  });

  batch.update(txRef, {
    type: next.type,
    customerId: next.customerId,
    customerSnapshot: next.customerSnapshot,
    items: next.items,
    totals: next.totals,
    payment: next.payment,
    relatedTransactionId: next.relatedTransactionId ?? null,
    transactionDate: next.transactionDate ?? null,
    note: next.note ?? "",
    updatedAt: serverTimestamp(),
    journalEntryId: nextEntryRef.id,
  });

  writeProductPatches(batch, productPatches);

  // Reverse previous customer delta
  if (previous.customerId === next.customerId) {
    const customer = await loadCustomerAggregates(next.customerId);
    const reverse = customerDeltaForTransaction(
      previous.type,
      previous.totals,
      previous.payment,
      -1,
    );
    const forward = customerDeltaForTransaction(next.type, next.totals, next.payment);
    batch.update(customer.ref, {
      totalSales: customer.totalSales + reverse.totalSales + forward.totalSales,
      totalPaid: customer.totalPaid + reverse.totalPaid + forward.totalPaid,
      outstandingBalance:
        customer.outstandingBalance + reverse.outstandingBalance + forward.outstandingBalance,
      lastTransactionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const prevCustomer = await loadCustomerAggregates(previous.customerId);
    const reverse = customerDeltaForTransaction(
      previous.type,
      previous.totals,
      previous.payment,
      -1,
    );
    batch.update(prevCustomer.ref, {
      totalSales: prevCustomer.totalSales + reverse.totalSales,
      totalPaid: prevCustomer.totalPaid + reverse.totalPaid,
      outstandingBalance: prevCustomer.outstandingBalance + reverse.outstandingBalance,
      updatedAt: serverTimestamp(),
    });

    const nextCustomer = await loadCustomerAggregates(next.customerId);
    const forward = customerDeltaForTransaction(next.type, next.totals, next.payment);
    batch.update(nextCustomer.ref, {
      totalSales: nextCustomer.totalSales + forward.totalSales,
      totalPaid: nextCustomer.totalPaid + forward.totalPaid,
      outstandingBalance: nextCustomer.outstandingBalance + forward.outstandingBalance,
      lastTransactionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function deleteCustomerTransaction(
  previous: CustomerTransactionRecord,
): Promise<void> {
  const txRef = doc(db, CUSTOMER_TRANSACTIONS_COLLECTION, previous.id);

  const productPatches = await loadProductPatches(previous.items);
  applyItemsToPatches(productPatches, previous.items, -stockSignForType(previous.type));

  const batch = writeBatch(db);
  batch.delete(txRef);
  writeProductPatches(batch, productPatches);

  if (previous.journalEntryId) {
    const entrySnap = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, previous.journalEntryId));
    if (entrySnap.exists()) {
      const lines = (entrySnap.data() as { lines?: Parameters<typeof buildReversalEntry>[0] }).lines ?? [];
      const entryNumber = await generateJournalEntryNumber();
      postJournalEntry(batch, entryNumber, buildReversalEntry(lines), {
        sourceType: "customerTransaction",
        sourceId: previous.id,
        sourceNumber: previous.txNumber,
        description: `Гүйлгээ устгасан — бичилтийг цуцаллаа: ${previous.txNumber}`,
        reversalOf: previous.journalEntryId,
        createdBy: previous.createdByUid,
      });
    }
  }

  try {
    const customer = await loadCustomerAggregates(previous.customerId);
    const reverse = customerDeltaForTransaction(
      previous.type,
      previous.totals,
      previous.payment,
      -1,
    );
    batch.update(customer.ref, {
      totalSales: customer.totalSales + reverse.totalSales,
      totalPaid: customer.totalPaid + reverse.totalPaid,
      outstandingBalance: customer.outstandingBalance + reverse.outstandingBalance,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // customer may have been deleted; ignore reversal
  }

  await batch.commit();
}

export function subscribeToCustomerTransactions({
  customerId,
  onData,
  onError,
}: {
  customerId?: string;
  onData: (transactions: CustomerTransactionRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  const base = collection(db, CUSTOMER_TRANSACTIONS_COLLECTION);
  const q = customerId
    ? query(base, where("customerId", "==", customerId), orderBy("createdAt", "desc"))
    : query(base, orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((docSnapshot) => deserializeTransaction(docSnapshot)));
    },
    onError,
  );
}

export async function checkProductHasTransactions(productId: number): Promise<boolean> {
  const snapshot = await getDocs(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION));
  return snapshot.docs.some((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, unknown>;
    const items = Array.isArray(data.items) ? data.items : [];
    return items.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).productId === productId,
    );
  });
}

export async function getTransactionLockedProductIds(): Promise<Set<number>> {
  const snapshot = await getDocs(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION));
  const locked = new Set<number>();
  snapshot.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, unknown>;
    const items = Array.isArray(data.items) ? data.items : [];
    items.forEach((item) => {
      if (typeof item === "object" && item !== null) {
        const pid = (item as Record<string, unknown>).productId;
        if (typeof pid === "number" && !isNaN(pid)) {
          locked.add(pid);
        } else if (typeof pid === "string") {
          const num = Number(pid);
          if (!isNaN(num) && num > 0) locked.add(num);
        }
      }
    });
  });
  return locked;
}
