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
import {
  buildTransferConfirmedEntry,
  buildReversalEntry,
  buildTransferReturnEntry,
  buildPaymentReceivedEntry,
} from "../lib/accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry, readJournalEntryLines } from "../lib/accounting/postEntryClient";
import { COUNTERS_COLLECTION, reserveDocumentNumber } from "../lib/documentNumbers";
import { CUSTOMER_TRANSACTIONS_COLLECTION } from "../lib/customerTransactions";
import {
  applyStockMovement,
  availableStock,
  productRef,
  readProductStockState,
  writeProductStock,
  PRODUCTS_COLLECTION,
  STOCK_MOVEMENTS_COLLECTION,
  type ProductStockState,
} from "../lib/inventory";

export const TRANSFERS_COLLECTION = "transfers";
export const CUSTOMERS_COLLECTION = "customers";
export const PAYMENTS_COLLECTION = "payments";
export const CUSTOMER_TIMELINE_COLLECTION = "customerTimeline";
export const CUSTOMER_PRICING_COLLECTION = "customerPricing";
export { COUNTERS_COLLECTION, PRODUCTS_COLLECTION, STOCK_MOVEMENTS_COLLECTION };

// ─── Number Generator ─────────────────────────────────────────────────────────

export function generateTransferNumber(): Promise<string> {
  return reserveDocumentNumber("transfer");
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

  // Read the catalogue's own field names rather than the CRM view's, since this is the raw
  // product document.
  const productData = productSnap.data() as Record<string, unknown>;
  const listPrice = Number(productData.price ?? 0);
  const wholesalePrice = Number(productData.wholesalePrice ?? 0);
  const customer = { id: customerSnap.id, ...customerSnap.data() } as Customer;

  // 2. Wholesale category
  if (customer.category === "WHOLESALE" && wholesalePrice > 0) {
    return { price: wholesalePrice, type: "wholesale", label: "Бөөний" };
  }

  // 3. VIP discount
  if (customer.category === "VIP" && customer.discountRate > 0) {
    const discountedPrice = Math.round(listPrice * (1 - customer.discountRate / 100));
    return { price: discountedPrice, type: "discount", label: `VIP -${customer.discountRate}%` };
  }

  // 4. Standard
  return { price: listPrice, type: "standard", label: "Стандарт" };
}

// ─── Customer balance ─────────────────────────────────────────────────────────

/**
 * How much a confirmed transfer adds to what the customer owes. PAID transfers add
 * nothing; everything else adds whatever has not been settled yet.
 */
function outstandingDeltaFor(transfer: Pick<Transfer, "paymentStatus" | "totalAmount" | "remainingAmount">): number {
  switch (transfer.paymentStatus) {
    case "PAID":
      return 0;
    case "PARTIAL":
      return transfer.remainingAmount;
    default:
      // CREDIT and UNPAID both owe the whole amount.
      return transfer.totalAmount;
  }
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
    variant?: string | null;
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
    variant: item.variant ?? null,
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
  const entryNumber = await generateJournalEntryNumber();

  await runTransaction(db, async (t) => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transferId);
    const transferSnap = await t.get(transferRef);
    if (!transferSnap.exists()) throw new Error("Шилжүүлэг олдсонгүй");

    const transfer = { id: transferSnap.id, ...transferSnap.data() } as Transfer;
    if (transfer.status !== "DRAFT") throw new Error("Зөвхөн ноорог шилжүүлгийг батлах боломжтой");

    const customerRef = doc(db, CUSTOMERS_COLLECTION, transfer.customerId);
    const customerSnap = await t.get(customerRef);
    if (!customerSnap.exists()) throw new Error("Харилцагч олдсонгүй");

    // ── Check & deduct stock. Reads run first: a Firestore transaction cannot read
    // after it has written, and the stock states are needed to validate before anything
    // is committed. Stock lives in totalStock/soldCount, the same pair every other module
    // uses — the CRM's old private `currentStock` field never existed on these documents.
    const states = new Map<string, ProductStockState>();
    const minStockLevels = new Map<string, number>();

    for (const item of transfer.items) {
      const productId = item.productId;
      if (states.has(productId)) continue;

      const productSnap = await t.get(productRef(productId));
      if (!productSnap.exists()) throw new Error(`Бараа олдсонгүй: ${item.productName}`);

      const productData = productSnap.data() as Record<string, unknown>;
      states.set(productId, readProductStockState(productId, productData));
      minStockLevels.set(productId, Number(productData.minStockLevel ?? 0));
    }

    let cogsAmount = 0;
    for (const item of transfer.items) {
      const productId = item.productId;
      const state = states.get(productId)!;
      const variant = item.variant ?? null;
      const available = availableStock(state, variant);

      if (available < item.quantity) {
        throw new Error(
          `"${item.productName}" барааны нөөц хүрэлцэхгүй байна. Нөөц: ${available}, Шаардлага: ${item.quantity}`,
        );
      }

      if (state.costPrice > 0) {
        cogsAmount += state.costPrice * item.quantity;
      }

      applyStockMovement(state, { variant, quantity: item.quantity }, { productName: item.productName });

      const remaining = availableStock(state, variant);
      const movRef = doc(collection(db, STOCK_MOVEMENTS_COLLECTION));
      t.set(movRef, {
        productId: item.productId,
        productName: item.productName,
        transferId,
        customerId: transfer.customerId,
        customerName: transfer.customerName,
        type: "OUT",
        quantity: item.quantity,
        balanceAfter: remaining,
        reason: `Шилжүүлэг: ${transfer.transferNumber}`,
        createdBy: userId,
        createdByName: userName,
        createdAt: serverTimestamp(),
      });

      if (remaining <= (minStockLevels.get(productId) ?? 0)) {
        lowStockAlerts.push(`${item.productName} (нөөц: ${remaining})`);
      }
    }

    states.forEach((state) => writeProductStock(t, state));

    // Post accounting journal entry (cash/AR debit, revenue/VAT credit, COGS if known)
    const builtEntry = buildTransferConfirmedEntry({
      paymentMethod: transfer.paymentMethod,
      paidAmount: transfer.paidAmount,
      remainingAmount: transfer.remainingAmount,
      subtotal: transfer.subtotal,
      taxAmount: transfer.taxAmount,
      cogsAmount,
    });
    const entryRef = postJournalEntry(t, entryNumber, builtEntry, {
      sourceType: "transfer",
      sourceId: transferId,
      sourceNumber: transfer.transferNumber,
      description: `Шилжүүлэг батлагдлаа: ${transfer.transferNumber}`,
      createdBy: userId,
      createdByName: userName,
    });

    // Update transfer status
    t.update(transferRef, {
      status: "CONFIRMED",
      journalEntryId: entryRef.id,
      updatedAt: serverTimestamp(),
    });

    // Money handed over when the transfer was written up is a payment like any other and
    // belongs in the payment record. It used to live only as a number on the transfer, so
    // the customer's payment history and every payment report simply missed it.
    if (transfer.paidAmount > 0) {
      const initialPaymentRef = doc(collection(db, PAYMENTS_COLLECTION));
      t.set(initialPaymentRef, {
        transferId,
        customerId: transfer.customerId,
        customerName: transfer.customerName,
        amount: transfer.paidAmount,
        method: transfer.paymentMethod,
        referenceNumber: "",
        notes: "Шилжүүлэг батлах үеийн төлбөр",
        // The confirm entry above already debited this money into its account, so this
        // record carries no journal entry of its own. The flag says so, and keeps
        // reconciliation from looking for one that was never meant to exist.
        settledWithTransfer: true,
        paidAt: serverTimestamp(),
        createdBy: userId,
        createdByName: userName,
        createdAt: serverTimestamp(),
      });
    }

    // Update customer balance and stats, on the same three aggregate fields the reseller
    // transactions module maintains — one debt figure per customer, not two.
    const outstandingDelta = outstandingDeltaFor(transfer);

    t.update(customerRef, {
      totalOrders: increment(1),
      totalSales: increment(transfer.totalAmount),
      totalPaid: increment(transfer.paidAmount),
      outstandingBalance: increment(outstandingDelta),
      lastOrderDate: serverTimestamp(),
      lastTransactionAt: serverTimestamp(),
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
  // Reserved even if this cancel turns out to be a no-op reversal (DRAFT transfer) — a
  // harmless skipped sequence number, avoided doing this inside the transaction below since
  // it would require a counter read after the writes further down.
  const entryNumber = await generateJournalEntryNumber();

  // Payments taken against this transfer after it was confirmed have their own journal
  // entries, and cancelling used to leave every one of them standing: the sale was undone
  // but the cash stayed, so the receivable account drifted negative by exactly what the
  // customer had paid. Each one is mirrored back below, which is the ledger's way of
  // saying the money is going back.
  //
  // Queried outside the transaction because the client SDK cannot run a query inside one.
  // Payments the confirm entry already accounted for are skipped — reversing the confirm
  // entry has taken care of those.
  const settledPayments = await getDocs(
    query(collection(db, PAYMENTS_COLLECTION), where("transferId", "==", transferId)),
  );
  const refundablePayments = settledPayments.docs
    .map((snapshot) => snapshot.data() as { amount?: number; method?: string; settledWithTransfer?: boolean })
    .filter((payment) => payment.settledWithTransfer !== true && Number(payment.amount ?? 0) > 0);

  const refundEntryNumbers: string[] = [];
  for (let index = 0; index < refundablePayments.length; index += 1) {
    refundEntryNumbers.push(await generateJournalEntryNumber());
  }

  await runTransaction(db, async (t) => {
    const transferRef = doc(db, TRANSFERS_COLLECTION, transferId);
    const transferSnap = await t.get(transferRef);
    if (!transferSnap.exists()) throw new Error("Шилжүүлэг олдсонгүй");
    const transfer = { id: transferSnap.id, ...transferSnap.data() } as Transfer;

    if (!["DRAFT", "CONFIRMED", "SHIPPED"].includes(transfer.status)) {
      throw new Error("Зөвхөн ноорог, батлагдсан эсвэл илгээгдсэн шилжүүлгийг цуцлах боломжтой");
    }

    // Must read before any writes are issued in this transaction.
    const originalLines =
      transfer.status !== "DRAFT" && transfer.journalEntryId
        ? await readJournalEntryLines(t, transfer.journalEntryId)
        : null;

    // DRAFT transfers have no stock deducted yet — just mark cancelled
    if (transfer.status !== "DRAFT") {
      const customerRef = doc(db, CUSTOMERS_COLLECTION, transfer.customerId);

      // Restore stock. All reads happen before the first write below.
      const states = new Map<string, ProductStockState>();
      for (const item of transfer.items) {
        const productId = item.productId;
        if (states.has(productId)) continue;
        const productSnap = await t.get(productRef(productId));
        if (!productSnap.exists()) continue;
        states.set(productId, readProductStockState(productId, productSnap.data() as Record<string, unknown>));
      }

      for (const item of transfer.items) {
        const state = states.get(item.productId);
        if (!state) continue;
        const variant = item.variant ?? null;

        applyStockMovement(state, { variant, quantity: -item.quantity }, { validate: false });

        const movRef = doc(collection(db, STOCK_MOVEMENTS_COLLECTION));
        t.set(movRef, {
          productId: item.productId,
          productName: item.productName,
          transferId,
          customerId: transfer.customerId,
          customerName: transfer.customerName,
          type: "RETURN",
          quantity: item.quantity,
          balanceAfter: availableStock(state, variant),
          reason: `Цуцлагдсан: ${transfer.transferNumber}`,
          createdBy: userId,
          createdByName: userName,
          createdAt: serverTimestamp(),
        });
      }

      states.forEach((state) => writeProductStock(t, state));

      // Reverse the aggregates the confirm step applied, field for field.
      t.update(customerRef, {
        totalOrders: increment(-1),
        totalSales: increment(-transfer.totalAmount),
        totalPaid: increment(-transfer.paidAmount),
        outstandingBalance: increment(-outstandingDeltaFor(transfer)),
      });

      // Reverse the original confirm entry (mirror image) if one was posted.
      if (originalLines) {
        postJournalEntry(t, entryNumber, buildReversalEntry(originalLines), {
          sourceType: "transfer",
          sourceId: transferId,
          sourceNumber: transfer.transferNumber,
          description: `Цуцлагдлаа: ${transfer.transferNumber}`,
          reversalOf: transfer.journalEntryId,
          createdBy: userId,
          createdByName: userName,
        });
      }

      // Give back every payment taken against this transfer: money leaves the account it
      // landed in and the receivable it settled is restored, which the confirm reversal
      // then clears along with the rest of the sale.
      //
      // Booked against the transfer rather than the payment document, so each payment's own
      // entry still reconciles against its own record.
      refundablePayments.forEach((payment, index) => {
        postJournalEntry(
          t,
          refundEntryNumbers[index],
          buildReversalEntry(
            buildPaymentReceivedEntry({
              amount: Number(payment.amount ?? 0),
              method: String(payment.method ?? "CASH"),
            }).lines,
          ),
          {
            sourceType: "transfer",
            sourceId: transferId,
            sourceNumber: transfer.transferNumber,
            description: `Цуцлагдсан шилжүүлгийн төлбөр буцаалаа: ${transfer.transferNumber}`,
            createdBy: userId,
            createdByName: userName,
          },
        );
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
  if (!(input.amount > 0)) {
    throw new Error("Төлсөн дүн 0-ээс их байх ёстой");
  }

  const entryNumber = await generateJournalEntryNumber();

  await runTransaction(db, async (t) => {
    const customerRef = doc(db, CUSTOMERS_COLLECTION, input.customerId);

    // ── Reads first: a Firestore transaction cannot read once it has written. ──
    const transferRef = input.transferId ? doc(db, TRANSFERS_COLLECTION, input.transferId) : null;
    const transferSnap = transferRef ? await t.get(transferRef) : null;
    const customerSnap = await t.get(customerRef);

    if (!customerSnap.exists()) throw new Error("Харилцагч олдсонгүй");

    if (transferRef && transferSnap) {
      if (!transferSnap.exists()) throw new Error("Шилжүүлэг олдсонгүй");
      const transfer = transferSnap.data() as Transfer;

      // A payment can never be larger than what is still owed on the transfer. Without
      // this the receivable account went negative and the customer's balance quietly
      // turned into a credit no one had granted.
      const remaining = Math.max(0, transfer.totalAmount - transfer.paidAmount);
      if (input.amount > remaining) {
        throw new Error(
          `Төлсөн дүн үлдэгдлээс их байж болохгүй. Үлдэгдэл: ${formatMoney(remaining)}`,
        );
      }

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
    } else {
      // A payment against no particular transfer settles the customer's running debt, so
      // it is bounded by that debt for the same reason.
      const outstanding = Math.max(0, Number(customerSnap.data().outstandingBalance ?? 0));
      if (input.amount > outstanding) {
        throw new Error(
          `Төлсөн дүн харилцагчийн өрөөс их байж болохгүй. Өр: ${formatMoney(outstanding)}`,
        );
      }
    }

    // The money received both settles debt and counts towards what the customer has paid.
    t.update(customerRef, {
      outstandingBalance: increment(-input.amount),
      totalPaid: increment(input.amount),
    });

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

    // Post accounting journal entry (cash/bank/clearing debit, AR credit)
    postJournalEntry(t, entryNumber, buildPaymentReceivedEntry({ amount: input.amount, method: input.method }), {
      sourceType: "payment",
      sourceId: paymentRef.id,
      sourceNumber: paymentRef.id,
      description: `Төлбөр хүлээн авлаа — ${input.customerName}`,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
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
  variant?: string | null;
}

/** Identifies one returnable line of the original transfer. */
function returnLineKey(item: { productId: string; variant?: string | null }): string {
  return `${item.productId}|${item.variant ?? ""}`;
}

/**
 * How much of each line of `originalTransferId` has already come back, across every return
 * booked against it.
 */
async function alreadyReturnedQuantities(originalTransferId: string): Promise<Map<string, number>> {
  const priorReturns = await getDocs(
    query(collection(db, TRANSFERS_COLLECTION), where("parentTransferId", "==", originalTransferId)),
  );

  const returned = new Map<string, number>();
  for (const snapshot of priorReturns.docs) {
    const data = snapshot.data() as Partial<Transfer>;
    if (data.status === "CANCELLED") continue;
    for (const item of data.items ?? []) {
      const key = returnLineKey(item);
      returned.set(key, (returned.get(key) ?? 0) + Number(item.quantity ?? 0));
    }
  }

  return returned;
}

export async function createReturn(
  originalTransferId: string,
  returnItems: ReturnItem[],
  reason: string,
  createdBy: string,
  createdByName: string
): Promise<string> {
  let returnId = "";
  // Both numbers reserve through their own transactions, so they are taken before the
  // business transaction opens — a nested transaction would not take part in this one's
  // retry and consistency window.
  const entryNumber = await generateJournalEntryNumber();
  const transferNumber = await generateTransferNumber();
  // Same reason: the client SDK cannot run a query inside a transaction.
  const returnedSoFar = await alreadyReturnedQuantities(originalTransferId);

  await runTransaction(db, async (t) => {
    const origRef = doc(db, TRANSFERS_COLLECTION, originalTransferId);
    const origSnap = await t.get(origRef);
    if (!origSnap.exists()) throw new Error("Эх шилжүүлэг олдсонгүй");
    const orig = { id: origSnap.id, ...origSnap.data() } as Transfer;

    if (orig.status !== "DELIVERED") {
      throw new Error("Зөвхөн хүргэгдсэн шилжүүлгийн буцаалт хийх боломжтой");
    }

    // Nothing used to stop the same goods being returned over and over: each return simply
    // added its quantity back to stock and credited the customer again. A line can only
    // give back what it delivered, minus whatever earlier returns already took.
    const deliveredByLine = new Map<string, { quantity: number; name: string }>();
    for (const item of orig.items) {
      const key = returnLineKey(item);
      const existing = deliveredByLine.get(key);
      deliveredByLine.set(key, {
        quantity: (existing?.quantity ?? 0) + Number(item.quantity ?? 0),
        name: item.productName,
      });
    }

    const requestedByLine = new Map<string, number>();
    for (const item of returnItems) {
      if (!(item.quantity > 0)) {
        throw new Error(`"${item.productName}" барааны буцаах тоо 0-ээс их байх ёстой`);
      }
      const key = returnLineKey(item);
      requestedByLine.set(key, (requestedByLine.get(key) ?? 0) + item.quantity);
    }

    for (const [key, requested] of requestedByLine) {
      const delivered = deliveredByLine.get(key);
      if (!delivered) {
        throw new Error("Энэ шилжүүлэгт байхгүй барааг буцаах боломжгүй");
      }
      const remaining = delivered.quantity - (returnedSoFar.get(key) ?? 0);
      if (requested > remaining) {
        throw new Error(
          `"${delivered.name}" барааны буцаах тоо хэтэрсэн байна. Боломжит: ${Math.max(0, remaining)}, Хүсэлт: ${requested}`,
        );
      }
    }

    // Every product read must complete before the first write in this transaction.
    const states = new Map<string, ProductStockState>();
    for (const item of returnItems) {
      const productId = item.productId;
      if (states.has(productId)) continue;
      const productSnap = await t.get(productRef(productId));
      if (!productSnap.exists()) continue;
      states.set(productId, readProductStockState(productId, productSnap.data() as Record<string, unknown>));
    }

    const returnTotal = returnItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    // The goods came back with the tax that was charged on them, so the tax comes back too.
    // Booking the return net of НӨАТ left the shop owing tax on a sale it had un-made.
    const returnTaxRate = Number(orig.taxRate ?? 0);
    const returnTaxAmount = Math.round(returnTotal * (returnTaxRate / 100));
    const returnGrandTotal = returnTotal + returnTaxAmount;

    // How much of this credit actually cancels debt. Anything beyond what the customer
    // still owes is money already handed over that has to come back to them — recorded as
    // a refund due rather than pushed into the balance, where it used to show up as a
    // negative figure that read like the shop owed itself money.
    const outstandingOnOriginal = Math.max(0, Number(orig.remainingAmount ?? 0));
    const debtReduction = Math.min(returnGrandTotal, outstandingOnOriginal);
    const refundDue = returnGrandTotal - debtReduction;

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
      variant: i.variant ?? null,
    }));

    t.set(returnRef, {
      transferNumber,
      customerId: orig.customerId,
      customerName: orig.customerName,
      type: "RETURN",
      status: "DELIVERED",
      // No money moves when goods come back; it moves when the refund is paid. The record
      // used to claim the return was settled in cash the moment it was written.
      paymentStatus: refundDue > 0 ? "UNPAID" : "PAID",
      paymentMethod: "CASH",
      items,
      subtotal: returnTotal,
      discountAmount: 0,
      taxRate: returnTaxRate,
      taxAmount: returnTaxAmount,
      totalAmount: returnGrandTotal,
      paidAmount: 0,
      remainingAmount: refundDue,
      /** What the customer is owed back in cash, once their debt has been cancelled. */
      refundDue,
      notes: reason,
      parentTransferId: originalTransferId,
      deliveredAt: serverTimestamp(),
      createdBy,
      createdByName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Restore stock
    let cogsAmount = 0;
    for (const item of returnItems) {
      const state = states.get(item.productId);
      if (!state) continue;
      if (state.costPrice > 0) {
        cogsAmount += state.costPrice * item.quantity;
      }
      const variant = item.variant ?? null;
      applyStockMovement(state, { variant, quantity: -item.quantity }, { validate: false });

      const movRef = doc(collection(db, STOCK_MOVEMENTS_COLLECTION));
      t.set(movRef, {
        productId: item.productId,
        productName: item.productName,
        transferId: returnRef.id,
        customerId: orig.customerId,
        customerName: orig.customerName,
        type: "RETURN",
        quantity: item.quantity,
        balanceAfter: availableStock(state, variant),
        reason: `Буцаалт: ${transferNumber}`,
        createdBy,
        createdByName,
        createdAt: serverTimestamp(),
      });
    }

    states.forEach((state) => writeProductStock(t, state));

    // Update customer: the return cancels what was billed, and cancels debt only as far as
    // there was debt to cancel.
    const customerRef = doc(db, CUSTOMERS_COLLECTION, orig.customerId);
    t.update(customerRef, {
      outstandingBalance: increment(-debtReduction),
      totalSales: increment(-returnGrandTotal),
      totalReturns: increment(returnGrandTotal),
    });

    // Post accounting journal entry (sales returns debit, VAT debit, AR credit, reverse COGS)
    const entryRef = postJournalEntry(
      t,
      entryNumber,
      buildTransferReturnEntry({ returnTotal, cogsAmount, taxAmount: returnTaxAmount }),
      {
        sourceType: "transfer",
        sourceId: returnRef.id,
        sourceNumber: transferNumber,
        description: `Буцаалт: ${transferNumber}`,
        createdBy,
        createdByName,
      },
    );
    t.update(returnRef, { journalEntryId: entryRef.id });

    // Timeline
    const timelineRef = doc(collection(db, CUSTOMER_TIMELINE_COLLECTION));
    t.set(timelineRef, {
      customerId: orig.customerId,
      type: "RETURN_CREATED",
      title: `Буцаалт: ${transferNumber}`,
      description:
        `${returnItems.length} бараа, ${formatMoney(returnGrandTotal)}` +
        (refundDue > 0 ? ` — буцаах төлбөр: ${formatMoney(refundDue)}` : ""),
      relatedId: returnRef.id,
      amount: returnGrandTotal,
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

/**
 * The catalogue as the CRM screens consume it.
 *
 * This reads the real `products` documents and maps them onto CrmProduct. It used to
 * filter on `isActive` and read `unitPrice`/`currentStock` — none of which the product
 * editor writes — so the selector was always empty and every transfer failed its stock
 * check. Active-ness is `status`, price is `price`, and stock is `totalStock - soldCount`.
 *
 * A product with variants yields one row per variant, each carrying that variant's own
 * price and remaining stock, so a transfer can name exactly what left the shelf.
 */
export async function getActiveProducts(): Promise<CrmProduct[]> {
  const snap = await getDocs(query(collection(db, PRODUCTS_COLLECTION), where("status", "==", "active")));

  const rows = snap.docs.flatMap((d) => {
    const data = d.data() as Record<string, unknown>;
    const state = readProductStockState(Number(d.id), data);
    const name = String(data.name ?? "");
    const listPrice = Number(data.price ?? 0);
    const base = {
      id: d.id,
      sku: String(data.sku ?? d.id),
      costPrice: state.costPrice,
      minStockLevel: Number(data.minStockLevel ?? 0),
      unit: "PIECE" as const,
      category: String(data.category ?? ""),
      isActive: true,
    };

    if (state.variants && state.variants.length > 0) {
      return state.variants.map((variant): CrmProduct => {
        const variantPrice = Number(variant.price ?? 0) || listPrice;
        return {
          ...base,
          name: `${name} — ${variant.name}`,
          unitPrice: variantPrice,
          wholesalePrice: Number(data.wholesalePrice ?? 0) || variantPrice,
          currentStock: availableStock(state, variant.name),
          variant: variant.name,
        };
      });
    }

    return [
      {
        ...base,
        name,
        unitPrice: listPrice,
        wholesalePrice: Number(data.wholesalePrice ?? 0) || listPrice,
        currentStock: availableStock(state, null),
        variant: null,
      } satisfies CrmProduct,
    ];
  });

  // Sorted here rather than in the query: `orderBy("name")` would need a composite index
  // alongside the status filter, and the catalogue is small enough to sort in memory.
  return rows.sort((a, b) => a.name.localeCompare(b.name));
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

/**
 * Removes a customer and everything hanging off them.
 *
 * Only safe while nothing has reached the ledger. A confirmed transfer or a seller
 * transaction has already recognised revenue, moved stock and posted a journal entry, and
 * deleting the paperwork underneath does not undo any of that — it used to leave orphaned
 * revenue and receivables in the accounts, stock permanently deducted, and the seller
 * transactions themselves untouched, since this only ever looked at transfers.
 *
 * Those have to be cancelled or returned on their own terms first. A customer who has
 * traded is meant to be deactivated, not deleted.
 */
export async function deleteCustomerCascade(customerId: string): Promise<void> {
  // Checked once, outside the retry wrapper below: a customer who has traded is a settled
  // answer, not a transient failure, and retrying it three times only delays the refusal.
  const transferSnap = await getDocs(
    query(collection(db, TRANSFERS_COLLECTION), where("customerId", "==", customerId))
  );

  const settledTransfers = transferSnap.docs.filter((snapshot) => {
    const status = String((snapshot.data() as Record<string, unknown>).status ?? "");
    return status !== "DRAFT" && status !== "CANCELLED";
  });

  if (settledTransfers.length > 0) {
    throw new Error(
      `Энэ харилцагчид батлагдсан ${settledTransfers.length} шилжүүлэг байна. Устгахын өмнө тэдгээрийг цуцлах эсвэл буцаах шаардлагатай. Түүхийг хадгалахын тулд харилцагчийг идэвхгүй болгохыг зөвлөж байна.`,
    );
  }

  const transactionSnap = await getDocs(
    query(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION), where("customerId", "==", customerId))
  );

  if (!transactionSnap.empty) {
    throw new Error(
      `Энэ харилцагчид ${transactionSnap.size} гүйлгээ бүртгэгдсэн байна. Устгахын өмнө гүйлгээ бүрийг устгах, эсвэл харилцагчийг идэвхгүй болгоно уу.`,
    );
  }

  await withRetry(async () => {
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
