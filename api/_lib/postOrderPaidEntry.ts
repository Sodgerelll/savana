// Server-side (Admin SDK) posting of the journal entry for an online order transitioning
// to "paid". Kept separate from src/lib/accounting/* (which targets the browser Firebase
// client SDK) since this module runs in Vercel's Node serverless runtime — duplicating the
// small set of account codes needed here is intentional, not an oversight.

/* eslint-disable @typescript-eslint/no-explicit-any */

const ACCOUNT_CODES = {
  CLEARING: "1030",
  INVENTORY: "1210",
  VAT_PAYABLE: "2410",
  REVENUE_ONLINE: "4100",
  REVENUE_SHIPPING: "4400",
  COGS: "5000",
} as const;

const ACCOUNT_NAMES: Record<string, string> = {
  [ACCOUNT_CODES.CLEARING]: "Bonum/QPay clearing",
  [ACCOUNT_CODES.INVENTORY]: "Бэлэн бүтээгдэхүүний нөөц",
  [ACCOUNT_CODES.VAT_PAYABLE]: "НӨАТ-ын өглөг",
  [ACCOUNT_CODES.REVENUE_ONLINE]: "Онлайн борлуулалтын орлого",
  [ACCOUNT_CODES.REVENUE_SHIPPING]: "Хүргэлтийн орлого",
  [ACCOUNT_CODES.COGS]: "Борлуулсан барааны өртөг",
};

/** The shop's timezone — see businessYear() in src/lib/documentNumbers.ts. */
const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";

function businessYear(): number {
  return Number(
    new Intl.DateTimeFormat("en", { timeZone: BUSINESS_TIME_ZONE, year: "numeric" }).format(new Date()),
  );
}

interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

function line(accountCode: string, debit: number, credit: number): JournalLine | null {
  const roundedDebit = Math.round(debit);
  const roundedCredit = Math.round(credit);
  if (roundedDebit === 0 && roundedCredit === 0) return null;
  return { accountCode, accountName: ACCOUNT_NAMES[accountCode] ?? accountCode, debit: roundedDebit, credit: roundedCredit };
}

/**
 * Mirrors buildOrderPaidEntry() in src/lib/accounting/entryBuilders.ts. Any НӨАТ the order
 * carries is credited to the VAT payable account and only the net remainder is booked as
 * revenue — the same split every other sales channel performs.
 */
function buildOrderPaidLines(
  grandTotal: number,
  cogsAmount: number,
  vatAmount: number,
  shippingAmount: number,
): { lines: JournalLine[]; totalAmount: number } {
  const tax = Math.max(0, Math.min(Math.round(vatAmount), Math.round(grandTotal)));
  const shipping = Math.max(0, Math.min(Math.round(shippingAmount), Math.round(grandTotal) - tax));
  const lines = [
    line(ACCOUNT_CODES.CLEARING, grandTotal, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, 0, tax),
    line(ACCOUNT_CODES.REVENUE_SHIPPING, 0, shipping),
    line(ACCOUNT_CODES.REVENUE_ONLINE, 0, Math.round(grandTotal) - tax - shipping),
    ...(cogsAmount > 0
      ? [line(ACCOUNT_CODES.COGS, cogsAmount, 0), line(ACCOUNT_CODES.INVENTORY, 0, cogsAmount)]
      : []),
  ].filter((l): l is JournalLine => l !== null);

  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(`Order-paid journal entry is not balanced: debit=${totalDebit} credit=${totalCredit}`);
  }
  return { lines, totalAmount: totalDebit };
}

interface VariantStock {
  name?: string;
  quantity?: number;
  soldCount?: number;
  [key: string]: unknown;
}

/**
 * Server-side counterpart of src/lib/inventory.ts. Duplicated for the same reason the
 * account codes are: this module runs against the Admin SDK in Vercel's Node runtime and
 * cannot import the browser client's helpers.
 *
 * Stock is never blocked here — the money has already been taken, so an order that exceeds
 * stock must still be recorded and let the figure show the shortfall.
 */
function applySoldQuantities(
  data: Record<string, unknown>,
  items: OrderItem[],
): { patch: { soldCount: number; variants?: VariantStock[] }; shortfall: boolean } {
  const variants = Array.isArray(data.variants)
    ? (data.variants as VariantStock[]).map((v) => ({ ...v }))
    : null;
  let soldCount = Number(data.soldCount ?? 0);

  for (const item of items) {
    const quantity = Number(item.quantity ?? 0);
    if (!quantity) continue;

    soldCount += quantity;

    if (variants && item.variant) {
      const match = variants.find((v) => v.name === item.variant);
      if (match) {
        match.soldCount = Number(match.soldCount ?? 0) + quantity;
      }
    }
  }

  // Stock is never blocked here, but a shelf that has gone negative is worth saying out
  // loud: nothing reserves stock at checkout, so two shoppers can pay for the same last
  // unit. The order carries the flag so an admin can find the ones that need chasing.
  const shortfall = variants
    ? variants.some((v) => Number(v.quantity ?? 0) - Number(v.soldCount ?? 0) < 0)
    : Number(data.totalStock ?? 0) - soldCount < 0;

  return { patch: variants ? { soldCount, variants } : { soldCount }, shortfall };
}

async function generateJournalEntryNumber(db: any): Promise<string> {
  // Read in the shop's timezone, not the runtime's: this counter is also advanced from an
  // admin's browser in Ulaanbaatar, and a year that disagrees resets the sequence.
  const currentYear = businessYear();
  const counterRef = db.collection("counters").doc("journalEntries");

  return db.runTransaction(async (t: any) => {
    const snap = await t.get(counterRef);
    let lastNumber = 0;
    if (snap.exists) {
      const data = snap.data();
      if (data.year === currentYear) lastNumber = data.lastNumber ?? 0;
    }
    const newNumber = lastNumber + 1;
    t.set(counterRef, { lastNumber: newNumber, year: currentYear, prefix: "JE" });
    return `JE-${currentYear}-${String(newNumber).padStart(6, "0")}`;
  });
}

interface OrderItem {
  productId?: number;
  quantity?: number;
  unitPrice?: number;
  variant?: string | null;
}

/** The catalogue's own price for an ordered line — the variant's when the item names one. */
function catalogueUnitPrice(productData: Record<string, unknown> | undefined, item: OrderItem): number {
  if (!productData) return 0;

  if (item.variant && Array.isArray(productData.variants)) {
    const match = (productData.variants as VariantStock[]).find((v) => v.name === item.variant);
    if (match) return Number((match as { price?: unknown }).price ?? 0);
  }

  return Number(productData.price ?? 0);
}

/**
 * What the ordered goods are actually worth according to the catalogue.
 *
 * The order document is written by the shopper's own browser, and Firestore rules cannot
 * sum a list — so the `subtotal` it claims is not evidence of anything. Each line is
 * re-priced at no more than the catalogue's own price (a discount only ever lowers it, so
 * clamping downwards never rejects a legitimate sale) and the total is capped at whatever
 * the order claimed. Charging a buyer less than list is their business; booking revenue
 * that no product ever justified is not.
 */
function verifiedGoodsValue(
  items: OrderItem[],
  productData: Map<number, Record<string, unknown>>,
  statedSubtotal: number,
): number {
  let recomputed = 0;

  for (const item of items) {
    const quantity = Math.max(0, Number(item.quantity ?? 0));
    const stated = Math.max(0, Number(item.unitPrice ?? 0));
    const listed = item.productId != null ? catalogueUnitPrice(productData.get(item.productId), item) : 0;
    // A product with no price recorded cannot vouch for the line, so the stated price stands.
    const unit = listed > 0 ? Math.min(stated, listed) : stated;
    recomputed += unit * quantity;
  }

  // An order with no subtotal recorded at all predates the field rather than understating
  // it, so the re-priced figure stands on its own instead of clamping the sale to nothing.
  if (!(statedSubtotal > 0)) {
    return Math.round(recomputed);
  }

  return Math.min(Math.round(statedSubtotal), Math.round(recomputed));
}

/**
 * Posts the "order paid" journal entry and moves the ordered goods out of stock, exactly
 * once per order, guarded by the order's own payment.status (only acts while it is still
 * "pending"). Safe to call from both the Bonum webhook and the client-fallback mark-paid
 * endpoint — whichever gets there first wins, the other is a no-op.
 *
 * Payment is the moment revenue is recognised, so it is also the moment stock moves: the
 * ledger entry and the stock movement are written in the same transaction and can never
 * happen without each other.
 *
 * Returns the posted entry id, or null if the order was already paid (no-op).
 */
export async function postOrderPaidEntry(
  db: any,
  orderId: string,
  bonumFields: Record<string, unknown>,
): Promise<string | null> {
  const orderRef = db.collection("orders").doc(orderId);
  const preSnap = await orderRef.get();
  if (!preSnap.exists) return null;
  const preData = preSnap.data() as Record<string, unknown>;
  if ((preData.payment as Record<string, unknown> | undefined)?.status === "paid") {
    return null; // already posted by the other path (webhook vs. mark-paid race)
  }

  const items = Array.isArray(preData.items) ? (preData.items as OrderItem[]) : [];
  const uniqueProductIds = Array.from(
    new Set(items.map((item) => item.productId).filter((id): id is number => id != null)),
  );

  // The entry number is reserved via its own standalone transaction, before the main one
  // opens, so the main transaction only ever reads before it writes.
  const entryNumber = await generateJournalEntryNumber(db);

  return db.runTransaction(async (t: any) => {
    // ── Reads first ──
    const snap = await t.get(orderRef);
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    const currentPayment = (data.payment as Record<string, unknown>) ?? {};
    if (currentPayment.status === "paid") return null; // re-checked inside the transaction

    const productSnaps = new Map<number, any>();
    for (const productId of uniqueProductIds) {
      const productSnap = await t.get(db.collection("products").doc(String(productId)));
      if (productSnap.exists) productSnaps.set(productId, productSnap);
    }

    const cogsAmount = items.reduce((sum, item) => {
      const productSnap = item.productId != null ? productSnaps.get(item.productId) : undefined;
      const cost = productSnap ? Number((productSnap.data() as Record<string, unknown>).costPrice ?? 0) : 0;
      return cost > 0 ? sum + cost * (item.quantity ?? 0) : sum;
    }, 0);

    const totals = (data.totals as Record<string, unknown> | undefined) ?? {};
    const statedGrandTotal = Number(totals.grandTotal ?? currentPayment.amount ?? 0);
    const vatAmount = Math.max(0, Number(totals.vatAmount ?? 0));
    const shippingFee = Math.max(0, Number(totals.shippingFee ?? 0));

    // Re-price the goods against the catalogue before anything reaches the ledger.
    const productData = new Map<number, Record<string, unknown>>();
    for (const [productId, snapshot] of productSnaps) {
      productData.set(productId, snapshot.data() as Record<string, unknown>);
    }
    const goodsValue = verifiedGoodsValue(items, productData, Number(totals.subtotal ?? 0));
    const vatAddedOnTop = totals.vatMode === "added";
    const verifiedGrandTotal = Math.min(
      Math.round(statedGrandTotal),
      goodsValue + Math.round(shippingFee) + (vatAddedOnTop ? Math.round(vatAmount) : 0),
    );
    const grandTotal = Math.max(0, verifiedGrandTotal);
    const totalsAdjusted = grandTotal !== Math.round(statedGrandTotal);

    const { lines, totalAmount } = buildOrderPaidLines(grandTotal, cogsAmount, vatAmount, shippingFee);

    const { FieldValue } = await import("firebase-admin/firestore");

    // ── Writes ──
    const entryRef = db.collection("journalEntries").doc();
    t.set(entryRef, {
      entryNumber,
      date: new Date().toISOString(),
      sourceType: "order",
      sourceId: orderId,
      sourceNumber: String(data.orderNumber ?? orderId),
      description: `Онлайн захиалга төлөгдлөө: ${data.orderNumber ?? orderId}`,
      lines,
      totalAmount,
      currency: "MNT",
      reversalOf: null,
      createdBy: "system:bonum",
      createdByName: "Bonum",
      createdAt: FieldValue.serverTimestamp(),
    });

    // Stock only moves if this order has not already taken it — an order an admin marked
    // paid by hand before the webhook arrived is left alone.
    let stockShortfall = false;
    if (!data.stockApplied) {
      for (const [productId, productSnap] of productSnaps) {
        const productItems = items.filter((item) => item.productId === productId);
        const { patch, shortfall } = applySoldQuantities(
          productSnap.data() as Record<string, unknown>,
          productItems,
        );
        if (shortfall) stockShortfall = true;
        t.update(productSnap.ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
      }
    }

    t.update(orderRef, {
      status: "paid",
      payment: {
        ...currentPayment,
        status: "paid",
        paidAt: new Date().toISOString(),
        ...bonumFields,
      },
      stockApplied: true,
      // Set when the order took the last unit (or more) off the shelf, and when the totals
      // the browser claimed did not survive re-pricing against the catalogue.
      stockShortfall,
      totalsAdjusted,
      ledgerGrandTotal: grandTotal,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return entryRef.id;
  });
}
