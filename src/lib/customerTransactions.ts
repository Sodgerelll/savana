import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { CUSTOMERS_COLLECTION } from "./customers";
import {
  buildCustomerTransactionSaleEntry,
  buildCustomerTransactionReturnEntry,
  buildCustomerTransactionSettlementEntry,
  buildReversalEntry,
  isEmptyEntry,
} from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  readJournalEntryLines,
} from "./accounting/postEntryClient";
import { reserveDocumentNumber } from "./documentNumbers";
import {
  applyStockMovement,
  productRef,
  readProductStockState,
  writeProductStock,
  type ProductStockState,
} from "./inventory";
import { normalizeVatMode as normalizeVat, vatCarriedBy, type VatMode } from "./vat";

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
  /** List price at the time of transfer — greater than unitPrice when sold at a discount. */
  originalUnitPrice?: number;
  lineTotal: number;
}

export type CustomerTransactionDiscountType = "amount" | "percent";

export interface CustomerTransactionTotals {
  subtotal: number;
  /** Money amount actually subtracted from the subtotal. */
  discount: number;
  /** How the discount was entered; "amount" for records saved before this field existed. */
  discountType?: CustomerTransactionDiscountType;
  /** Raw entered value — ₮ amount when discountType is "amount", 0-100 when "percent". */
  discountValue?: number;
  /** How НӨАТ relates to the entered prices — same three modes the Sales module uses. */
  vatMode?: VatMode;
  /** НӨАТ in tugriks carried by `grandTotal`. */
  vatAmount?: number;
  grandTotal: number;
}

/** One recorded payment against a transaction's outstanding balance. */
export interface CustomerTransactionPaymentEntry {
  /** YYYY-MM-DD payment date. */
  date: string;
  amount: number;
  note: string;
  createdAt: string | null;
  createdByUid: string;
}

export interface CustomerTransactionPayment {
  status: CustomerTransactionPaymentStatus;
  paidAmount: number;
  method: CustomerTransactionPaymentMethod | null;
  paidAt: string | null;
  /** Individual payment records; paidAmount = initial payment + sum of entries. */
  entries?: CustomerTransactionPaymentEntry[];
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
  /**
   * Cost of the goods as it stood when the transaction was first recorded.
   *
   * Every edit — including recording a payment, which goes through the edit path — cancels
   * the old journal entry and posts a fresh one. Recomputing the cost each time meant a
   * later production batch that changed `costPrice` silently restated the margin on a sale
   * that had already happened. Stamped once, reused from then on.
   */
  cogsAmount?: number | null;
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
    totals: { subtotal: 0, discount: 0, discountType: "amount", discountValue: 0, grandTotal: 0 },
    payment: { status: "unpaid", paidAmount: 0, method: null, paidAt: null },
    relatedTransactionId: null,
    transactionDate: new Date().toISOString().slice(0, 10),
    note: "",
    createdByUid: "",
    createdAt: null,
    updatedAt: null,
    journalEntryId: null,
    cogsAmount: null,
  };
}

// ─── Seller "record sales" entry ─────────────────────────────────────────────
//
// A product-centric shortcut on the Борлуулагч → Бүтээгдэхүүнээр tab: the operator types
// how many of each transferred product the seller has sold and a discount on that value.
// It is stored as a `type: "sale"` document — a wholesale sales allowance. The goods left
// stock on the delivery that transferred them, so this moves no stock; its only book
// effect is the discount, which comes off the seller's balance and off wholesale revenue.

export interface SellerSaleLineInput {
  productId: number;
  productName: string;
  category?: string;
  image?: string | null;
  variant?: string | null;
  /** Quantity sold now. */
  soldNow: number;
  /** Price the seller sells at. */
  unitPrice: number;
  /** List price at transfer time — kept so the modal can show the struck-through original. */
  originalUnitPrice?: number;
}

export interface SellerSaleDiscount {
  type: CustomerTransactionDiscountType;
  value: number;
}

export interface SellerSaleTotals {
  subtotal: number;
  discountType: CustomerTransactionDiscountType;
  discountValue: number;
  discount: number;
  grandTotal: number;
}

/**
 * Resolves the money side of a "record sales" entry: the gross value of the units sold, the
 * discount in tugriks (a percentage is taken off the gross; a ₮ amount is capped at it),
 * and the net the seller is left owing for them.
 */
export function resolveSellerSaleTotals(
  lines: SellerSaleLineInput[],
  discount: SellerSaleDiscount,
): SellerSaleTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + roundAmount(line.unitPrice) * Math.max(0, Math.trunc(line.soldNow || 0)),
    0,
  );
  const discountType: CustomerTransactionDiscountType =
    discount.type === "percent" ? "percent" : "amount";
  const rawValue = Math.max(0, Number(discount.value) || 0);
  const discountValue = discountType === "percent" ? Math.min(100, rawValue) : roundAmount(rawValue);
  const discountAmount = Math.min(
    subtotal,
    discountType === "percent" ? Math.round((subtotal * discountValue) / 100) : discountValue,
  );
  return {
    subtotal,
    discountType,
    discountValue,
    discount: discountAmount,
    grandTotal: Math.max(0, subtotal - discountAmount),
  };
}

/**
 * Builds the `createCustomerTransaction` input for a seller "record sales" entry. Lines with
 * a zero quantity are dropped; each surviving line is stored fully sold
 * (`soldQuantity === quantity`) so the Бүтээгдэхүүнээр tab can count it as sell-through.
 *
 * `paidAmount` is the cash the reseller hands over for these goods — it defaults to the full
 * net (list value less the discount) and is capped there. Together with the discount it
 * clears that much of the receivable the delivery raised.
 */
export function buildSellerSaleInput(params: {
  customerId: string;
  customerSnapshot: CustomerTransactionCustomerSnapshot;
  lines: SellerSaleLineInput[];
  discount: SellerSaleDiscount;
  paidAmount?: number | null;
  paymentMethod?: CustomerTransactionPaymentMethod;
  transactionDate?: string | null;
  note?: string;
  createdByUid: string;
}): CreateCustomerTransactionInput {
  const soldLines = params.lines.filter((line) => Math.trunc(line.soldNow || 0) > 0);
  const totals = resolveSellerSaleTotals(soldLines, params.discount);
  const items: CustomerTransactionItem[] = soldLines.map((line) => {
    const quantity = Math.trunc(line.soldNow);
    const unitPrice = roundAmount(line.unitPrice);
    return {
      productId: line.productId,
      productName: line.productName,
      category: line.category ?? "",
      image: line.image ?? null,
      variant: line.variant ?? null,
      quantity,
      soldQuantity: quantity,
      unitPrice,
      originalUnitPrice: roundAmount(line.originalUnitPrice ?? line.unitPrice) || unitPrice,
      lineTotal: unitPrice * quantity,
    };
  });
  const paidAmount = Math.max(
    0,
    Math.min(totals.grandTotal, roundAmount(params.paidAmount ?? totals.grandTotal)),
  );
  const status: CustomerTransactionPaymentStatus =
    paidAmount <= 0 ? "unpaid" : paidAmount >= totals.grandTotal ? "paid" : "partial";
  return {
    type: "sale",
    customerId: params.customerId,
    customerSnapshot: params.customerSnapshot,
    items,
    totals: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      discountType: totals.discountType,
      discountValue: totals.discountValue,
      vatMode: "none",
      vatAmount: 0,
      grandTotal: totals.grandTotal,
    },
    payment: {
      status,
      paidAmount,
      method: paidAmount > 0 ? params.paymentMethod ?? "cash" : null,
      paidAt: paidAmount > 0 ? new Date().toISOString() : null,
    },
    relatedTransactionId: null,
    transactionDate: params.transactionDate ?? new Date().toISOString().slice(0, 10),
    note: params.note ?? "",
    createdByUid: params.createdByUid,
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
          .map((item): CustomerTransactionItem | null => {
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
              originalUnitPrice: Number(itemData.originalUnitPrice ?? itemData.unitPrice ?? 0),
              lineTotal: Number(itemData.lineTotal ?? 0),
            } satisfies CustomerTransactionItem;
          })
          .filter((item): item is CustomerTransactionItem => item !== null)
      : [],
    totals: {
      subtotal: Number(totals.subtotal ?? 0),
      discount: Number(totals.discount ?? 0),
      discountType: totals.discountType === "percent" ? "percent" : "amount",
      discountValue: Number(totals.discountValue ?? totals.discount ?? 0),
      vatMode: normalizeVat(totals.vatMode),
      vatAmount: Number(totals.vatAmount ?? 0),
      grandTotal: Number(totals.grandTotal ?? 0),
    },
    payment: {
      status: normalizePaymentStatus(payment.status),
      paidAmount: Number(payment.paidAmount ?? 0),
      method: normalizePaymentMethod(payment.method),
      paidAt: parseTimestamp(payment.paidAt),
      entries: Array.isArray(payment.entries)
        ? payment.entries
            .map((entry): CustomerTransactionPaymentEntry | null => {
              if (typeof entry !== "object" || entry === null) {
                return null;
              }
              const entryData = entry as Record<string, unknown>;
              return {
                date: String(entryData.date ?? ""),
                amount: Number(entryData.amount ?? 0),
                note: String(entryData.note ?? ""),
                createdAt: parseTimestamp(entryData.createdAt),
                createdByUid: String(entryData.createdByUid ?? ""),
              };
            })
            .filter((entry): entry is CustomerTransactionPaymentEntry => entry !== null)
        : [],
    },
    relatedTransactionId:
      typeof data.relatedTransactionId === "string" ? data.relatedTransactionId : null,
    transactionDate: typeof data.transactionDate === "string" ? data.transactionDate : null,
    note: String(data.note ?? ""),
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
    cogsAmount: typeof data.cogsAmount === "number" ? data.cogsAmount : null,
  };
}

function generateTxNumber(): Promise<string> {
  return reserveDocumentNumber("customerTransaction");
}

function roundAmount(value: number): number {
  return Math.round(Number(value) || 0);
}

function sanitizeItemImage(image: string | null): string | null {
  const trimmed = typeof image === "string" ? image.trim() : "";
  // Embedded data-URL images are 50-350KB each and push the transaction
  // document past Firestore's 1 MiB limit — only keep real URLs.
  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }
  return trimmed;
}

function sanitizeItems(items: CustomerTransactionItem[]): CustomerTransactionItem[] {
  return items.map((item) => {
    const unitPrice = roundAmount(item.unitPrice);
    return {
      ...item,
      image: sanitizeItemImage(item.image),
      unitPrice,
      originalUnitPrice: roundAmount(item.originalUnitPrice ?? unitPrice) || unitPrice,
      lineTotal: roundAmount(unitPrice * item.quantity),
    };
  });
}

function sanitizeTotals(totals: CustomerTransactionTotals): CustomerTransactionTotals {
  const discountType: CustomerTransactionDiscountType =
    totals.discountType === "percent" ? "percent" : "amount";
  const rawValue = Number(totals.discountValue ?? totals.discount) || 0;
  const vatMode = normalizeVat(totals.vatMode);
  const grandTotal = roundAmount(totals.grandTotal);
  return {
    subtotal: roundAmount(totals.subtotal),
    discount: roundAmount(totals.discount),
    discountType,
    discountValue:
      discountType === "percent" ? Math.min(100, Math.max(0, rawValue)) : roundAmount(rawValue),
    vatMode,
    // Recomputed rather than trusted, so the tax split can never drift from the total the
    // customer is actually billed. By the time totals reach here grandTotal is always the
    // gross figure — `added` mode has already put the tax inside it — so both modes carve
    // the tax back out of the gross the same way.
    vatAmount: vatCarriedBy(grandTotal, vatMode),
    grandTotal,
  };
}

function sanitizePayment(payment: CustomerTransactionPayment): CustomerTransactionPayment {
  return {
    ...payment,
    paidAmount: roundAmount(payment.paidAmount),
    entries: (payment.entries ?? []).map((entry) => ({
      ...entry,
      amount: roundAmount(entry.amount),
      note: entry.note ?? "",
    })),
  };
}

function sanitizeTransactionInput(
  input: CreateCustomerTransactionInput,
): CreateCustomerTransactionInput {
  return {
    ...input,
    items: sanitizeItems(input.items),
    totals: sanitizeTotals(input.totals),
    payment: sanitizePayment(input.payment),
  };
}

/**
 * Which way the goods travel, in the inventory module's convention where a positive
 * quantity leaves stock: delivery and sale send goods out, a return brings them back.
 */
function stockSignForType(type: CustomerTransactionType): 1 | -1 {
  return type === "return" ? -1 : 1;
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
  if (type === "sale") {
    // A reseller settling goods billed on an earlier delivery: `discount` is the price
    // allowance the shop grants and `payment.paidAmount` the cash actually received. Together
    // they clear that much of the receivable — no new sale value is billed, but the money
    // received does count towards what the seller has paid.
    return {
      totalSales: -totals.discount * sign,
      totalPaid: payment.paidAmount * sign,
      outstandingBalance: -(totals.discount + payment.paidAmount) * sign,
    };
  }
  return {
    totalSales: totals.grandTotal * sign,
    totalPaid: payment.paidAmount * sign,
    outstandingBalance: (totals.grandTotal - payment.paidAmount) * sign,
  };
}

/**
 * Reads the stock position of every product in the given item lists, inside the caller's
 * transaction so the read is part of the same consistency window as the write.
 */
async function loadStockStates(
  t: Transaction,
  itemLists: (CustomerTransactionItem[] | undefined)[],
): Promise<Map<number | string, ProductStockState>> {
  const uniqueIds = Array.from(
    new Set(
      itemLists
        .flatMap((items) => items ?? [])
        .map((item) => item.productId)
        .filter((id) => id > 0),
    ),
  );
  const states = new Map<number | string, ProductStockState>();

  // Sequential rather than Promise.all: a Firestore transaction serialises its reads and
  // must finish all of them before the first write.
  for (const productId of uniqueIds) {
    const snap = await t.get(productRef(productId));
    states.set(
      productId,
      readProductStockState(productId, snap.exists() ? (snap.data() as Record<string, unknown>) : null),
    );
  }

  return states;
}

/** Best-effort COGS for a set of items — 0 for any product missing a costPrice. */
function cogsForItems(states: Map<number | string, ProductStockState>, items: CustomerTransactionItem[]): number {
  return items.reduce((sum, item) => {
    const state = states.get(item.productId);
    return state && state.costPrice > 0 ? sum + state.costPrice * item.quantity : sum;
  }, 0);
}

/** True when two item lists move exactly the same goods, so the cost of them cannot have changed. */
function sameGoods(a: CustomerTransactionItem[], b: CustomerTransactionItem[]): boolean {
  if (a.length !== b.length) return false;
  const key = (item: CustomerTransactionItem) => `${item.productId}|${item.variant ?? ""}|${item.quantity}`;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * Moves stock for a transaction's items. `direction` is +1 to apply the transaction's own
 * effect and -1 to undo it; the type decides which way the goods travel (a return puts
 * them back). Validation is off for the undo direction, which only ever adds stock back.
 *
 * An edit re-applies its new item list through `reapplyEditedItems` instead, which knows
 * how much the transaction already held.
 */
function applyItemsToStates(
  states: Map<number | string, ProductStockState>,
  items: CustomerTransactionItem[],
  type: CustomerTransactionType,
  direction: 1 | -1,
  requireVariant = true,
) {
  const sign = stockSignForType(type) * direction;

  items.forEach((item) => {
    const state = states.get(item.productId);
    if (!state) return;
    applyStockMovement(
      state,
      { variant: item.variant, quantity: item.quantity * sign },
      { productName: item.productName, requireVariant },
    );
  });
}

const stockKey = (item: Pick<CustomerTransactionItem, "productId" | "variant">) =>
  `${item.productId}|${item.variant ?? ""}`;

/**
 * Re-applies an edited transaction's item list, on states from which `previous` has already
 * been undone.
 *
 * Units the transaction was already holding are re-taken WITHOUT a stock check: recording a
 * payment routes through the edit path with an unchanged item list, and trimming or leaving
 * a line alone must never be refused because the product has drifted oversold since (stock
 * legitimately goes negative — see inventory.ts). Only quantity added beyond what the
 * transaction already held is checked against what is actually on the shelf, and only when
 * the goods still travel the same way — switching a sale to a return re-applies in full.
 *
 * `requireVariant` is off throughout: a transaction recorded before its product had variants
 * must stay editable instead of getting stuck on MissingVariantError.
 */
function reapplyEditedItems(
  states: Map<number | string, ProductStockState>,
  previous: Pick<CustomerTransactionRecord, "items" | "type">,
  next: Pick<CreateCustomerTransactionInput, "items" | "type">,
) {
  const sameDirection = stockSignForType(previous.type) === stockSignForType(next.type);
  const heldByKey = new Map<string, number>();
  if (sameDirection) {
    for (const item of previous.items) {
      heldByKey.set(stockKey(item), (heldByKey.get(stockKey(item)) ?? 0) + item.quantity);
    }
  }

  const sign = stockSignForType(next.type);

  for (const item of next.items) {
    const state = states.get(item.productId);
    if (!state) continue;

    const held = heldByKey.get(stockKey(item)) ?? 0;
    const retained = Math.min(item.quantity, held);
    heldByKey.set(stockKey(item), held - retained);
    const added = item.quantity - retained;

    // Re-take what the transaction already owned, unchecked — this also brings the in-memory
    // stock back down before the added units are measured against it.
    if (retained > 0) {
      applyStockMovement(
        state,
        { variant: item.variant, quantity: retained * sign },
        { productName: item.productName, validate: false },
      );
    }
    // Anything genuinely new still has to fit on the shelf.
    if (added > 0) {
      applyStockMovement(
        state,
        { variant: item.variant, quantity: added * sign },
        { productName: item.productName, requireVariant: false },
      );
    }
  }
}

async function loadCustomerAggregates(t: Transaction, customerId: string) {
  const ref = doc(db, CUSTOMERS_COLLECTION, customerId);
  const snap = await t.get(ref);
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

/**
 * Builds the ledger entry a transaction produces — a wholesale sale, a return that credits
 * the receivable back, or a sale (allowance) that credits only its discount back. Each
 * splits off any НӨАТ the transaction carries.
 */
function buildEntryForTransaction(
  input: Pick<CreateCustomerTransactionInput, "type" | "totals" | "payment">,
  cogsAmount: number,
) {
  const vatAmount = input.totals.vatAmount ?? 0;

  if (input.type === "return") {
    return buildCustomerTransactionReturnEntry({
      grandTotal: input.totals.grandTotal,
      cogsAmount,
      vatAmount,
    });
  }

  if (input.type === "sale") {
    // A reseller settling already-billed goods: the cash received lands in its money
    // account, the discount is booked to sales returns & allowances, and the receivable is
    // credited for both. No revenue or COGS — those posted on the earlier delivery. Comes
    // out empty (and is skipped by the caller) when nothing was paid or allowed.
    return buildCustomerTransactionSettlementEntry({
      paymentMethod: input.payment.method,
      paidAmount: input.payment.paidAmount,
      allowanceAmount: input.totals.discount,
    });
  }

  return buildCustomerTransactionSaleEntry({
    paymentMethod: input.payment.method,
    paidAmount: input.payment.paidAmount,
    grandTotal: input.totals.grandTotal,
    cogsAmount,
    vatAmount,
  });
}

/**
 * Records a delivery, sale or return against a reseller. Stock, the customer's running
 * balance, the transaction document and the journal entry are written in one Firestore
 * transaction, so the three views of the same event can never drift apart — and the stock
 * read that decides whether there is enough to send is part of that same window.
 *
 * A `type: "sale"` record is the exception: it is a wholesale sales allowance for goods that
 * already left stock on their delivery, so it touches no stock and posts a journal entry
 * only for the discount it carries (nothing at all when that is zero).
 */
export async function createCustomerTransaction(
  rawInput: CreateCustomerTransactionInput,
): Promise<string> {
  const input = sanitizeTransactionInput(rawInput);
  const movesStock = input.type !== "sale";

  // Both numbers run their own transactions, so they are reserved up front.
  const txNumber = await generateTxNumber();
  const entryNumber = await generateJournalEntryNumber();

  const txRef = doc(collection(db, CUSTOMER_TRANSACTIONS_COLLECTION));

  await runTransaction(db, async (t) => {
    const states = movesStock
      ? await loadStockStates(t, [input.items])
      : new Map<number | string, ProductStockState>();
    const customer = await loadCustomerAggregates(t, input.customerId);

    const cogsAmount = movesStock ? cogsForItems(states, input.items) : 0;
    if (movesStock) {
      applyItemsToStates(states, input.items, input.type, 1);
    }

    const delta = customerDeltaForTransaction(input.type, input.totals, input.payment);

    const entry = buildEntryForTransaction(input, cogsAmount);
    const entryRef = isEmptyEntry(entry)
      ? null
      : postJournalEntry(t, entryNumber, entry, {
          sourceType: "customerTransaction",
          sourceId: txRef.id,
          sourceNumber: txNumber,
          description: `Харилцагчийн гүйлгээ: ${txNumber} — ${input.customerSnapshot.name}`,
          createdBy: input.createdByUid,
        });

    t.set(txRef, {
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
      journalEntryId: entryRef?.id ?? null,
      cogsAmount,
    });

    if (movesStock) {
      states.forEach((state) => writeProductStock(t, state));
    }

    t.update(customer.ref, {
      totalSales: customer.totalSales + delta.totalSales,
      totalPaid: customer.totalPaid + delta.totalPaid,
      outstandingBalance: customer.outstandingBalance + delta.outstandingBalance,
      lastTransactionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return txRef.id;
}

export async function updateCustomerTransaction(
  id: string,
  previous: CustomerTransactionRecord,
  rawNext: CreateCustomerTransactionInput,
  options?: { journalDescription?: string },
): Promise<void> {
  const next = sanitizeTransactionInput(rawNext);
  const txRef = doc(db, CUSTOMER_TRANSACTIONS_COLLECTION, id);

  // A "sale" record (wholesale allowance) holds no stock on either side of the edit.
  const prevMovesStock = previous.type !== "sale";
  const nextMovesStock = next.type !== "sale";

  const reversalEntryNumber = previous.journalEntryId ? await generateJournalEntryNumber() : null;
  const nextEntryNumber = await generateJournalEntryNumber();

  await runTransaction(db, async (t) => {
    // ── All reads first: a Firestore transaction cannot read after it has written. ──
    const states = await loadStockStates(t, [
      prevMovesStock ? previous.items : [],
      nextMovesStock ? next.items : [],
    ]);
    const movedCustomer = previous.customerId !== next.customerId;
    const prevCustomer = movedCustomer ? await loadCustomerAggregates(t, previous.customerId) : null;
    const nextCustomer = await loadCustomerAggregates(t, next.customerId);
    const oldLines = previous.journalEntryId
      ? await readJournalEntryLines(t, previous.journalEntryId)
      : null;

    // Undo the old version's stock effect, then re-apply the new one. Only quantity added
    // beyond what this transaction already held is checked against the shelf, so recording a
    // payment (an unchanged item list) or trimming a line is never blocked by a shortfall
    // that was already there — see reapplyEditedItems. A "sale" side moves no stock.
    if (prevMovesStock) {
      applyItemsToStates(states, previous.items, previous.type, -1);
    }
    if (nextMovesStock) {
      if (prevMovesStock) {
        reapplyEditedItems(states, previous, next);
      } else {
        applyItemsToStates(states, next.items, next.type, 1);
      }
    }

    // The cost of goods already sold does not change because the transaction was edited.
    // It is only recomputed when the goods themselves changed — recording a payment, which
    // also runs through here, leaves the original figure exactly where it was.
    const nextCogsAmount = !nextMovesStock
      ? 0
      : sameGoods(previous.items, next.items) && typeof previous.cogsAmount === "number"
        ? previous.cogsAmount
        : cogsForItems(states, next.items);

    // The old entry is reversed from its stored lines rather than recomputed, so a change
    // in how entries are built can never leave a half-cancelled pair behind.
    if (oldLines && reversalEntryNumber) {
      postJournalEntry(t, reversalEntryNumber, buildReversalEntry(oldLines), {
        sourceType: "customerTransaction",
        sourceId: id,
        sourceNumber: previous.txNumber,
        description: `Гүйлгээ засварласан — хуучин бичилтийг цуцаллаа: ${previous.txNumber}`,
        reversalOf: previous.journalEntryId,
        createdBy: next.createdByUid,
      });
    }

    const nextEntry = buildEntryForTransaction(next, nextCogsAmount);
    const nextEntryRef = isEmptyEntry(nextEntry)
      ? null
      : postJournalEntry(t, nextEntryNumber, nextEntry, {
          sourceType: "customerTransaction",
          sourceId: id,
          sourceNumber: previous.txNumber,
          description: options?.journalDescription ?? `Гүйлгээ засварласан: ${previous.txNumber}`,
          createdBy: next.createdByUid,
        });

    t.update(txRef, {
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
      journalEntryId: nextEntryRef?.id ?? null,
      cogsAmount: nextCogsAmount,
    });

    states.forEach((state) => writeProductStock(t, state));

    const reverse = customerDeltaForTransaction(previous.type, previous.totals, previous.payment, -1);
    const forward = customerDeltaForTransaction(next.type, next.totals, next.payment);

    if (prevCustomer) {
      // The transaction moved to a different customer: the old one gives its figures back
      // and the new one takes them on.
      t.update(prevCustomer.ref, {
        totalSales: prevCustomer.totalSales + reverse.totalSales,
        totalPaid: prevCustomer.totalPaid + reverse.totalPaid,
        outstandingBalance: prevCustomer.outstandingBalance + reverse.outstandingBalance,
        updatedAt: serverTimestamp(),
      });
      t.update(nextCustomer.ref, {
        totalSales: nextCustomer.totalSales + forward.totalSales,
        totalPaid: nextCustomer.totalPaid + forward.totalPaid,
        outstandingBalance: nextCustomer.outstandingBalance + forward.outstandingBalance,
        lastTransactionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      t.update(nextCustomer.ref, {
        totalSales: nextCustomer.totalSales + reverse.totalSales + forward.totalSales,
        totalPaid: nextCustomer.totalPaid + reverse.totalPaid + forward.totalPaid,
        outstandingBalance:
          nextCustomer.outstandingBalance + reverse.outstandingBalance + forward.outstandingBalance,
        lastTransactionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  });
}

export interface RecordTransactionPaymentInput {
  /** YYYY-MM-DD payment date. */
  date: string;
  amount: number;
  note?: string;
  createdByUid: string;
}

function paymentStatusForAmount(
  paidAmount: number,
  grandTotal: number,
): CustomerTransactionPaymentStatus {
  if (paidAmount <= 0) return "unpaid";
  return paidAmount >= grandTotal ? "paid" : "partial";
}

function paymentDateToIso(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-").map(Number);
    const now = new Date();
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Applies a changed payment object to a transaction via the edit path so
 * journal entries, customer aggregates and stock stay consistent.
 */
async function applyPaymentChange(
  previous: CustomerTransactionRecord,
  payment: CustomerTransactionPayment,
  createdByUid: string,
  journalDescription: string,
): Promise<void> {
  await updateCustomerTransaction(
    previous.id,
    previous,
    {
      type: previous.type,
      customerId: previous.customerId,
      customerSnapshot: { ...previous.customerSnapshot },
      items: previous.items.map((item) => ({ ...item })),
      totals: { ...previous.totals },
      payment,
      relatedTransactionId: previous.relatedTransactionId,
      transactionDate: previous.transactionDate,
      note: previous.note,
      createdByUid,
    },
    { journalDescription },
  );
}

/**
 * Records a payment against a transaction's outstanding balance. The paid
 * amount grows by the entry amount and the customer's outstanding balance
 * shrinks by the same amount (deduction principle).
 */
export async function recordCustomerTransactionPayment(
  previous: CustomerTransactionRecord,
  input: RecordTransactionPaymentInput,
): Promise<void> {
  if (previous.type === "return" || previous.type === "sale") {
    throw new Error("Энэ төрлийн гүйлгээнд төлбөр бүртгэх боломжгүй");
  }
  const amount = roundAmount(input.amount);
  const outstanding = roundAmount(previous.totals.grandTotal) - roundAmount(previous.payment.paidAmount);
  if (amount <= 0) {
    throw new Error("Төлсөн дүн 0-ээс их байх ёстой");
  }
  if (amount > outstanding) {
    throw new Error("Төлсөн дүн үлдэгдлээс их байж болохгүй");
  }

  const newPaidAmount = roundAmount(previous.payment.paidAmount) + amount;
  const entry: CustomerTransactionPaymentEntry = {
    date: input.date,
    amount,
    note: (input.note ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdByUid: input.createdByUid,
  };

  await applyPaymentChange(
    previous,
    {
      status: paymentStatusForAmount(newPaidAmount, previous.totals.grandTotal),
      paidAmount: newPaidAmount,
      method: previous.payment.method,
      paidAt: paymentDateToIso(input.date),
      entries: [...(previous.payment.entries ?? []), entry],
    },
    input.createdByUid,
    `Төлбөр бүртгэсэн: ${previous.txNumber} — ${previous.customerSnapshot.name}`,
  );
}

/**
 * Edits a previously recorded payment entry. paidAmount is recomputed by
 * replacing the old entry amount with the new one.
 */
export async function updateCustomerTransactionPaymentEntry(
  previous: CustomerTransactionRecord,
  entryIndex: number,
  input: RecordTransactionPaymentInput,
): Promise<void> {
  const entries = previous.payment.entries ?? [];
  const oldEntry = entries[entryIndex];
  if (!oldEntry) {
    throw new Error("Төлбөрийн бичилт олдсонгүй");
  }
  const amount = roundAmount(input.amount);
  if (amount <= 0) {
    throw new Error("Төлсөн дүн 0-ээс их байх ёстой");
  }
  const paidWithoutEntry = roundAmount(previous.payment.paidAmount) - roundAmount(oldEntry.amount);
  const available = roundAmount(previous.totals.grandTotal) - paidWithoutEntry;
  if (amount > available) {
    throw new Error("Төлсөн дүн үлдэгдлээс их байж болохгүй");
  }

  const newPaidAmount = paidWithoutEntry + amount;
  const nextEntries = entries.map((entry, idx) =>
    idx === entryIndex
      ? { ...entry, date: input.date, amount, note: (input.note ?? "").trim() }
      : entry,
  );

  await applyPaymentChange(
    previous,
    {
      status: paymentStatusForAmount(newPaidAmount, previous.totals.grandTotal),
      paidAmount: newPaidAmount,
      method: previous.payment.method,
      paidAt: previous.payment.paidAt,
      entries: nextEntries,
    },
    input.createdByUid,
    `Төлбөрийн бичилт засварласан: ${previous.txNumber} — ${previous.customerSnapshot.name}`,
  );
}

/**
 * Deletes a previously recorded payment entry. The entry amount is added back
 * to the transaction's outstanding balance.
 */
export async function deleteCustomerTransactionPaymentEntry(
  previous: CustomerTransactionRecord,
  entryIndex: number,
  createdByUid: string,
): Promise<void> {
  const entries = previous.payment.entries ?? [];
  const oldEntry = entries[entryIndex];
  if (!oldEntry) {
    throw new Error("Төлбөрийн бичилт олдсонгүй");
  }

  const newPaidAmount = Math.max(
    0,
    roundAmount(previous.payment.paidAmount) - roundAmount(oldEntry.amount),
  );

  await applyPaymentChange(
    previous,
    {
      status: paymentStatusForAmount(newPaidAmount, previous.totals.grandTotal),
      paidAmount: newPaidAmount,
      method: previous.payment.method,
      paidAt: newPaidAmount <= 0 ? null : previous.payment.paidAt,
      entries: entries.filter((_, idx) => idx !== entryIndex),
    },
    createdByUid,
    `Төлбөрийн бичилт устгасан: ${previous.txNumber} — ${previous.customerSnapshot.name}`,
  );
}

export async function deleteCustomerTransaction(
  previous: CustomerTransactionRecord,
): Promise<void> {
  const txRef = doc(db, CUSTOMER_TRANSACTIONS_COLLECTION, previous.id);
  const entryNumber = previous.journalEntryId ? await generateJournalEntryNumber() : null;
  // A "sale" record (wholesale allowance) never held stock, so there is nothing to give back.
  const movesStock = previous.type !== "sale";

  await runTransaction(db, async (t) => {
    const states = movesStock
      ? await loadStockStates(t, [previous.items])
      : new Map<number | string, ProductStockState>();
    // The customer may have been deleted since — the transaction still has to go away, so
    // a missing customer just means there are no aggregates left to correct.
    const customer = await loadCustomerAggregates(t, previous.customerId).catch(() => null);
    const lines = previous.journalEntryId
      ? await readJournalEntryLines(t, previous.journalEntryId)
      : null;

    if (movesStock) {
      applyItemsToStates(states, previous.items, previous.type, -1);
    }

    if (lines && entryNumber) {
      postJournalEntry(t, entryNumber, buildReversalEntry(lines), {
        sourceType: "customerTransaction",
        sourceId: previous.id,
        sourceNumber: previous.txNumber,
        description: `Гүйлгээ устгасан — бичилтийг цуцаллаа: ${previous.txNumber}`,
        reversalOf: previous.journalEntryId,
        createdBy: previous.createdByUid,
      });
    }

    t.delete(txRef);
    if (movesStock) {
      states.forEach((state) => writeProductStock(t, state));
    }

    if (customer) {
      const reverse = customerDeltaForTransaction(
        previous.type,
        previous.totals,
        previous.payment,
        -1,
      );
      t.update(customer.ref, {
        totalSales: customer.totalSales + reverse.totalSales,
        totalPaid: customer.totalPaid + reverse.totalPaid,
        outstandingBalance: customer.outstandingBalance + reverse.outstandingBalance,
        updatedAt: serverTimestamp(),
      });
    }
  });
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
