import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
  writeBatch,
  Timestamp,
  increment,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  Transfer,
  TransferItem,
  TransferType,
  PaymentMethod,
  Customer,
  CrmProduct,
  CustomerPricing,
} from "../types/crm";

export const TRANSFERS_COLLECTION = "transfers";
export const CUSTOMERS_COLLECTION = "customers";
export const PRODUCTS_COLLECTION = "products";
export const PAYMENTS_COLLECTION = "payments";
export const STOCK_MOVEMENTS_COLLECTION = "stockMovements";
export const CUSTOMER_TIMELINE_COLLECTION = "customerTimeline";
export const CUSTOMER_PRICING_COLLECTION = "customerPricing";
export const COUNTERS_COLLECTION = "counters";

// ─── Number Generator ─────────────────────────────────────────────────────────

export async function generateTransferNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const counterRef = doc(db, COUNTERS_COLLECTION, "transfers");

  return runTransaction(db, async (t) => {
    const snap = await t.get(counterRef);
    let lastNumber = 0;

    if (snap.exists()) {
      const data = snap.data();
      if (data.year === currentYear) {
        lastNumber = data.lastNumber ?? 0;
      }
    }

    const newNumber = lastNumber + 1;
    t.set(counterRef, { lastNumber: newNumber, year: currentYear, prefix: "TRF" });
    return `TRF-${currentYear}-${String(newNumber).padStart(5, "0")}`;
  });
}

// ─── Effective Price ──────────────────────────────────────────────────────────

export async function getEffectivePrice(
  customerId: string,
  productId: string
): Promise<{ price: number; type: "special" | "wholesale" | "discount" | "standard"; label: string }> {
  const now = Timestamp.now();

  // 1. Check special pricing
  const pricingSnap = await getDocs(
    query(
      collection(db, CUSTOMER_PRICING_COLLECTION),
      where("customerId", "==", customerId),
      where("productId", "==", productId),
      where("isActive", "==", true)
    )
  );

  for (const pDoc of pricingSnap.docs) {
    const p = pDoc.data() as CustomerPricing;
    const validFrom = p.validFrom;
    const validUntil = p.validUntil;
    if (validFrom <= now && (!validUntil || validUntil >= now)) {
      return { price: p.specialPrice, type: "special", label: "Тусгай" };
    }
  }

  // 2. Get product and customer
  const [productSnap, customerSnap] = await Promise.all([
    getDoc(doc(db, PRODUCTS_COLLECTION, productId)),
    getDoc(doc(db, CUSTOMERS_COLLECTION, customerId)),
  ]);

  if (!productSnap.exists() || !customerSnap.exists()) {
    return { price: 0, type: "standard", label: "Стандарт" };
  }

  const product = { id: productSnap.id, ...productSnap.data() } as CrmProduct;
  const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;

  // 2. Wholesale category
  if (customer.category === "WHOLESALE" && product.wholesalePrice > 0) {
    return { price: product.wholesalePrice, type: "wholesale", label: "Бөөний" };
  }

  // 3. VIP discount
  if (customer.category === "VIP" && customer.discountRate > 0) {
    const discountedPrice = Math.round(product.unitPrice * (1 - customer.discountRate / 100));
    return { price: discountedPrice, type: "discount", label: `VIP -${customer.discountRate}%` };
  }

  // 4. Standard
  return { price: product.unitPrice, type: "standard", label: "Стандарт" };
}

// ─── Create Transfer ──────────────────────────────────────────────────────────

export interface CreateTransferInput {
  customerId: string;
  customerName: string;
  type: TransferType;
  items: Array<{
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    originalPrice: number;
    discountPercent: number;
  }>;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  taxEnabled: boolean;
  referenceNumber: string;
  notes: string;
  createdBy: string;
  createdByName: string;
}

export async function createTransfer(input: CreateTransferInput): Promise<string> {
  const transferNumber = await generateTransferNumber();

  const items: TransferItem[] = input.items.map((item) => ({
    ...item,
    lineTotal: Math.round(item.quantity * item.unitPrice * (1 - item.discountPercent / 100)),
  }));

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmount = items.reduce(
    (s, i) => s + Math.round(i.quantity * i.originalPrice) - i.lineTotal,
    0
  );
  const taxRate = input.taxEnabled ? 10 : 0;
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const totalAmount = subtotal + taxAmount;
  const paidAmount = input.paymentMethod === "CREDIT" ? 0 : Math.min(input.paidAmount, totalAmount);
  const remainingAmount = totalAmount - paidAmount;

  let paymentStatus: Transfer["paymentStatus"] = "UNPAID";
  if (input.paymentMethod === "CREDIT") {
    paymentStatus = "CREDIT";
  } else if (paidAmount >= totalAmount) {
    paymentStatus = "PAID";
  } else if (paidAmount > 0) {
    paymentStatus = "PARTIAL";
  }

  const ref = await addDoc(collection(db, TRANSFERS_COLLECTION), {
    transferNumber,
    customerId: input.customerId,
    customerName: input.customerName,
    type: input.type,
    status: "DRAFT",
    paymentStatus,
    paymentMethod: input.paymentMethod,
    items,
    subtotal,
    discountAmount,
    taxRate,
    taxAmount,
    totalAmount,
    paidAmount,
    remainingAmount,
    notes: input.notes,
    parentTransferId: null,
    deliveredAt: null,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Timeline log
  await addDoc(collection(db, CUSTOMER_TIMELINE_COLLECTION), {
    customerId: input.customerId,
    type: "TRANSFER_CREATED",
    title: `Шилжүүлэг үүсгэв: ${transferNumber}`,
    description: `${items.length} бараа, ${formatMoney(totalAmount)}`,
    relatedId: ref.id,
    amount: totalAmount,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

// ─── Confirm Transfer ─────────────────────────────────────────────────────────

export async function confirmTransfer(
  transferId: string,
  userId: string,
  userName: string
): Promise<{ success: boolean; lowStockAlerts: string[] }> {
  const lowStockAlerts: string[] = [];

  await runTransaction(db, async (t) => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transferId);
    const transferSnap = await t.get(transferRef);
    if (!transferSnap.exists()) throw new Error("Шилжүүлэг олдсонгүй");

    const transfer = { id: transferSnap.id, ...transferSnap.data() } as Transfer;
    if (transfer.status !== "DRAFT") throw new Error("Зөвхөн ноорог шилжүүлгийг батлах боломжтой");

    const customerRef = doc(db, CUSTOMERS_COLLECTION, transfer.customerId);
    const customerSnap = await t.get(customerRef);
    if (!customerSnap.exists()) throw new Error("Харилцагч олдсонгүй");

    // Check & deduct stock for each item
    for (const item of transfer.items) {
      const productRef = doc(db, PRODUCTS_COLLECTION, item.productId);
      const productSnap = await t.get(productRef);
      if (!productSnap.exists()) throw new Error(`Бараа олдсонгүй: ${item.productName}`);

      const product = productSnap.data() as CrmProduct;
      const currentStock = product.currentStock ?? 0;

      if (currentStock < item.quantity) {
        throw new Error(
          `"${item.productName}" барааны нөөц хүрэлцэхгүй байна. Нөөц: ${currentStock}, Шаардлага: ${item.quantity}`
        );
      }

      const newStock = currentStock - item.quantity;
      t.update(productRef, { currentStock: newStock });

      // Add stock movement
      const movRef = doc(collection(db, STOCK_MOVEMENTS_COLLECTION));
      t.set(movRef, {
        productId: item.productId,
        productName: item.productName,
        transferId,
        customerId: transfer.customerId,
        customerName: transfer.customerName,
        type: "OUT",
        quantity: item.quantity,
        balanceAfter: newStock,
        reason: `Шилжүүлэг: ${transfer.transferNumber}`,
        createdBy: userId,
        createdByName: userName,
        createdAt: serverTimestamp(),
      });

      if (newStock <= (product.minStockLevel ?? 0)) {
        lowStockAlerts.push(`${item.productName} (нөөц: ${newStock})`);
      }
    }

    // Update transfer status
    t.update(transferRef, {
      status: "CONFIRMED",
      updatedAt: serverTimestamp(),
    });

    // Update customer balance and stats
    // CREDIT: owes full amount; PARTIAL: owes remaining; UNPAID: owes full amount; PAID: owes nothing
    const balanceDelta =
      transfer.paymentStatus === "CREDIT"
        ? transfer.totalAmount
        : transfer.paymentStatus === "PARTIAL"
          ? transfer.remainingAmount
          : transfer.paymentStatus === "UNPAID"
            ? transfer.totalAmount
            : 0;

    t.update(customerRef, {
      totalOrders: increment(1),
      totalRevenue: increment(transfer.totalAmount),
      lastOrderDate: serverTimestamp(),
      ...(balanceDelta > 0 ? { balance: increment(balanceDelta) } : {}),
    });

    // Timeline
    const timelineRef = doc(collection(db, CUSTOMER_TIMELINE_COLLECTION));
    t.set(timelineRef, {
      customerId: transfer.customerId,
      type: "TRANSFER_CONFIRMED",
      title: `Шилжүүлэг батлагдлаа: ${transfer.transferNumber}`,
      description: `${transfer.items.length} бараа, ${formatMoney(transfer.totalAmount)}`,
      relatedId: transferId,
      amount: transfer.totalAmount,
      createdBy: userId,
      createdByName: userName,
      createdAt: serverTimestamp(),
    });
  });

  return { success: true, lowStockAlerts };
}

// ─── Ship Transfer ────────────────────────────────────────────────────────────

export async function shipTransfer(
  transferId: string,
  userId: string,
  userName: string
): Promise<void> {
  const transferRef = doc(db, TRANSFERS_COLLECTION, transferId);
  const snap = await getDoc(transferRef);
  if (!snap.exists()) throw new Error("Шилжүүлэг олдсонгүй");
  const transfer = snap.data() as Transfer;

  await updateDoc(transferRef, { status: "SHIPPED", updatedAt: serverTimestamp() });

  await addDoc(collection(db, CUSTOMER_TIMELINE_COLLECTION), {
    customerId: transfer.customerId,
    type: "TRANSFER_SHIPPED",
    title: `Илгээгдлээ: ${transfer.transferNumber}`,
    description: `${formatMoney(transfer.totalAmount)}`,
    relatedId: transferId,
    amount: transfer.totalAmount,
    createdBy: userId,
    createdByName: userName,
    createdAt: serverTimestamp(),
  });
}

// ─── Deliver Transfer ─────────────────────────────────────────────────────────

export async function deliverTransfer(
  transferId: string,
  userId: string,
  userName: string
): Promise<void> {
  const transferRef = doc(db, TRANSFERS_COLLECTION, transferId);
  const snap = await getDoc(transferRef);
  if (!snap.exists()) throw new Error("Шилжүүлэг олдсонгүй");
  const transfer = snap.data() as Transfer;

  await updateDoc(transferRef, {
    status: "DELIVERED",
    deliveredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addDoc(collection(db, CUSTOMER_TIMELINE_COLLECTION), {
    customerId: transfer.customerId,
    type: "TRANSFER_DELIVERED",
    title: `Хүргэгдлээ: ${transfer.transferNumber}`,
    description: `${formatMoney(transfer.totalAmount)}`,
    relatedId: transferId,
    amount: transfer.totalAmount,
    createdBy: userId,
    createdByName: userName,
    createdAt: serverTimestamp(),
  });
}

// ─── Cancel Transfer ──────────────────────────────────────────────────────────

export async function cancelTransfer(
  transferId: string,
  userId: string,
  userName: string
): Promise<void> {
  await runTransaction(db, async (t) => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transferId);
    const transferSnap = await t.get(transferRef);
    if (!transferSnap.exists()) throw new Error("Шилжүүлэг олдсонгүй");
    const transfer = { id: transferSnap.id, ...transferSnap.data() } as Transfer;

    if (!["DRAFT", "CONFIRMED", "SHIPPED"].includes(transfer.status)) {
      throw new Error("Зөвхөн ноорог, батлагдсан эсвэл илгээгдсэн шилжүүлгийг цуцлах боломжтой");
    }

    // DRAFT transfers have no stock deducted yet — just mark cancelled
    if (transfer.status !== "DRAFT") {
      const customerRef = doc(db, CUSTOMERS_COLLECTION, transfer.customerId);

      // Restore stock
      for (const item of transfer.items) {
        const productRef = doc(db, PRODUCTS_COLLECTION, item.productId);
        const productSnap = await t.get(productRef);
        if (!productSnap.exists()) continue;
        const product = productSnap.data() as CrmProduct;
        const newStock = (product.currentStock ?? 0) + item.quantity;
        t.update(productRef, { currentStock: newStock });

        const movRef = doc(collection(db, STOCK_MOVEMENTS_COLLECTION));
        t.set(movRef, {
          productId: item.productId,
          productName: item.productName,
          transferId,
          customerId: transfer.customerId,
          customerName: transfer.customerName,
          type: "RETURN",
          quantity: item.quantity,
          balanceAfter: newStock,
          reason: `Цуцлагдсан: ${transfer.transferNumber}`,
          createdBy: userId,
          createdByName: userName,
          createdAt: serverTimestamp(),
        });
      }

      // Reverse balance and stats — include UNPAID (full amount was owed)
      const balanceDelta =
        transfer.paymentStatus === "CREDIT"
          ? transfer.totalAmount
          : transfer.paymentStatus === "PARTIAL"
            ? transfer.remainingAmount
            : transfer.paymentStatus === "UNPAID"
              ? transfer.totalAmount
              : 0;

      t.update(customerRef, {
        totalOrders: increment(-1),
        totalRevenue: increment(-transfer.totalAmount),
        ...(balanceDelta > 0 ? { balance: increment(-balanceDelta) } : {}),
      });
    }

    t.update(transferRef, { status: "CANCELLED", updatedAt: serverTimestamp() });

    const timelineRef = doc(collection(db, CUSTOMER_TIMELINE_COLLECTION));
    t.set(timelineRef, {
      customerId: transfer.customerId,
      type: "TRANSFER_CANCELLED",
      title: `Цуцлагдлаа: ${transfer.transferNumber}`,
      description: `${formatMoney(transfer.totalAmount)}`,
      relatedId: transferId,
      amount: transfer.totalAmount,
      createdBy: userId,
      createdByName: userName,
      createdAt: serverTimestamp(),
    });
  });
}

// ─── Add Payment ──────────────────────────────────────────────────────────────

export interface AddPaymentInput {
  transferId: string | null;
  customerId: string;
  customerName: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER" | "QPAY" | "SOCIALPAY";
  referenceNumber: string;
  notes: string;
  createdBy: string;
  createdByName: string;
}

export async function addPayment(input: AddPaymentInput): Promise<void> {
  await runTransaction(db, async (t) => {
    const customerRef = doc(db, CUSTOMERS_COLLECTION, input.customerId);

    if (input.transferId) {
      const transferRef = doc(db, TRANSFERS_COLLECTION, input.transferId);
      const transferSnap = await t.get(transferRef);
      if (!transferSnap.exists()) throw new Error("Шилжүүлэг олдсонгүй");
      const transfer = transferSnap.data() as Transfer;

      const newPaid = transfer.paidAmount + input.amount;
      const newRemaining = Math.max(0, transfer.totalAmount - newPaid);
      const newPaymentStatus: Transfer["paymentStatus"] =
        newRemaining <= 0 ? "PAID" : "PARTIAL";

      t.update(transferRef, {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        paymentStatus: newPaymentStatus,
        updatedAt: serverTimestamp(),
      });
    }

    // Reduce customer balance
    t.update(customerRef, { balance: increment(-input.amount) });

    // Create payment record
    const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
    t.set(paymentRef, {
      transferId: input.transferId,
      customerId: input.customerId,
      customerName: input.customerName,
      amount: input.amount,
      method: input.method,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      paidAt: serverTimestamp(),
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
    });

    // Timeline
    const timelineRef = doc(collection(db, CUSTOMER_TIMELINE_COLLECTION));
    t.set(timelineRef, {
      customerId: input.customerId,
      type: "PAYMENT_RECEIVED",
      title: `Төлбөр хүлээн авлаа`,
      description: `${formatMoney(input.amount)} — ${methodLabel(input.method)}`,
      relatedId: paymentRef.id,
      amount: input.amount,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt: serverTimestamp(),
    });
  });
}

// ─── Create Return ────────────────────────────────────────────────────────────

export interface ReturnItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export async function createReturn(
  originalTransferId: string,
  returnItems: ReturnItem[],
  reason: string,
  createdBy: string,
  createdByName: string
): Promise<string> {
  let returnId = "";

  await runTransaction(db, async (t) => {
    const origRef = doc(db, TRANSFERS_COLLECTION, originalTransferId);
    const origSnap = await t.get(origRef);
    if (!origSnap.exists()) throw new Error("Эх шилжүүлэг олдсонгүй");
    const orig = { id: origSnap.id, ...origSnap.data() } as Transfer;

    if (orig.status !== "DELIVERED") {
      throw new Error("Зөвхөн хүргэгдсэн шилжүүлгийн буцаалт хийх боломжтой");
    }

    const returnTotal = returnItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const transferNumber = await generateTransferNumber();

    const returnRef = doc(collection(db, TRANSFERS_COLLECTION));
    returnId = returnRef.id;

    const items: TransferItem[] = returnItems.map((i) => ({
      productId: i.productId,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      originalPrice: i.unitPrice,
      discountPercent: 0,
      lineTotal: i.quantity * i.unitPrice,
    }));

    t.set(returnRef, {
      transferNumber,
      customerId: orig.customerId,
      customerName: orig.customerName,
      type: "RETURN",
      status: "DELIVERED",
      paymentStatus: "PAID",
      paymentMethod: "CASH",
      items,
      subtotal: returnTotal,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: returnTotal,
      paidAmount: returnTotal,
      remainingAmount: 0,
      notes: reason,
      parentTransferId: originalTransferId,
      deliveredAt: serverTimestamp(),
      createdBy,
      createdByName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Restore stock
    for (const item of returnItems) {
      const productRef = doc(db, PRODUCTS_COLLECTION, item.productId);
      const productSnap = await t.get(productRef);
      if (!productSnap.exists()) continue;
      const product = productSnap.data() as CrmProduct;
      const newStock = (product.currentStock ?? 0) + item.quantity;
      t.update(productRef, { currentStock: newStock });

      const movRef = doc(collection(db, STOCK_MOVEMENTS_COLLECTION));
      t.set(movRef, {
        productId: item.productId,
        productName: item.productName,
        transferId: returnRef.id,
        customerId: orig.customerId,
        customerName: orig.customerName,
        type: "RETURN",
        quantity: item.quantity,
        balanceAfter: newStock,
        reason: `Буцаалт: ${transferNumber}`,
        createdBy,
        createdByName,
        createdAt: serverTimestamp(),
      });
    }

    // Update customer
    const customerRef = doc(db, CUSTOMERS_COLLECTION, orig.customerId);
    t.update(customerRef, {
      balance: increment(-returnTotal),
      totalReturns: increment(returnTotal),
    });

    // Timeline
    const timelineRef = doc(collection(db, CUSTOMER_TIMELINE_COLLECTION));
    t.set(timelineRef, {
      customerId: orig.customerId,
      type: "RETURN_CREATED",
      title: `Буцаалт: ${transferNumber}`,
      description: `${returnItems.length} бараа, ${formatMoney(returnTotal)}`,
      relatedId: returnRef.id,
      amount: returnTotal,
      createdBy,
      createdByName,
      createdAt: serverTimestamp(),
    });
  });

  return returnId;
}

// ─── Add Timeline Note ────────────────────────────────────────────────────────

export async function addTimelineNote(
  customerId: string,
  note: string,
  createdBy: string,
  createdByName: string
): Promise<void> {
  await addDoc(collection(db, CUSTOMER_TIMELINE_COLLECTION), {
    customerId,
    type: "NOTE_ADDED",
    title: "Тэмдэглэл нэмлээ",
    description: note,
    relatedId: null,
    amount: null,
    createdBy,
    createdByName,
    createdAt: serverTimestamp(),
  });
}

// ─── Load products for selector ───────────────────────────────────────────────

export async function getActiveProducts(): Promise<CrmProduct[]> {
  const snap = await getDocs(
    query(collection(db, PRODUCTS_COLLECTION), where("isActive", "==", true), orderBy("name"))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CrmProduct);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("mn-MN").format(amount) + "₮";
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    CASH: "Бэлэн",
    BANK_TRANSFER: "Банк",
    QPAY: "QPay",
    SOCIALPAY: "SocialPay",
  };
  return map[method] ?? method;
}

export async function checkProductHasTransfers(productId: number): Promise<boolean> {
  const snapshot = await getDocs(collection(db, TRANSFERS_COLLECTION));
  const productIdStr = String(productId);
  return snapshot.docs.some((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, unknown>;
    const items = Array.isArray(data.items) ? data.items : [];
    return items.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as Record<string, unknown>).productId === productIdStr,
    );
  });
}

export async function getTransferLockedProductIds(): Promise<Set<number>> {
  const snapshot = await getDocs(collection(db, TRANSFERS_COLLECTION));
  const locked = new Set<number>();
  snapshot.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data() as Record<string, unknown>;
    const items = Array.isArray(data.items) ? data.items : [];
    items.forEach((item) => {
      if (typeof item === "object" && item !== null) {
        const pid = (item as Record<string, unknown>).productId;
        if (typeof pid === "string") {
          const num = Number(pid);
          if (!isNaN(num) && num > 0) locked.add(num);
        }
      }
    });
  });
  return locked;
}

// ─── Retry Wrapper ────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 300 * Math.pow(2, attempt - 1)));
    }
  }
  // Unreachable but satisfies TypeScript
  throw new Error("Retry exhausted");
}

// ─── Cascade Delete Customer ──────────────────────────────────────────────────

const BATCH_LIMIT = 400;

async function deleteDocs(collectionName: string, field: string, value: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, collectionName), where(field, "==", value))
  );
  if (snap.empty) return;

  // Delete in batches of 400 to stay under Firestore's 500-op limit
  const chunks: typeof snap.docs[] = [];
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    chunks.push(snap.docs.slice(i, i + BATCH_LIMIT));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export async function deleteCustomerCascade(customerId: string): Promise<void> {
  await withRetry(async () => {
    // 1. Find all transfers for this customer to delete related stock movements
    const transferSnap = await getDocs(
      query(collection(db, TRANSFERS_COLLECTION), where("customerId", "==", customerId))
    );
    for (const tDoc of transferSnap.docs) {
      await deleteDocs(STOCK_MOVEMENTS_COLLECTION, "transferId", tDoc.id);
    }

    // 2. Delete the transfers themselves
    if (!transferSnap.empty) {
      const chunks: typeof transferSnap.docs[] = [];
      for (let i = 0; i < transferSnap.docs.length; i += BATCH_LIMIT) {
        chunks.push(transferSnap.docs.slice(i, i + BATCH_LIMIT));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 3. Delete payments, pricing, and timeline in parallel
    await Promise.all([
      deleteDocs(PAYMENTS_COLLECTION, "customerId", customerId),
      deleteDocs(CUSTOMER_PRICING_COLLECTION, "customerId", customerId),
      deleteDocs(CUSTOMER_TIMELINE_COLLECTION, "customerId", customerId),
    ]);

    // 4. Delete the customer document last
    await deleteDoc(doc(db, CUSTOMERS_COLLECTION, customerId));
  });
}

// ─── Retried Public Mutations ─────────────────────────────────────────────────

export async function createTransferWithRetry(input: CreateTransferInput): Promise<string> {
  return withRetry(() => createTransfer(input));
}

export async function addPaymentWithRetry(input: AddPaymentInput): Promise<void> {
  return withRetry(() => addPayment(input));
}
