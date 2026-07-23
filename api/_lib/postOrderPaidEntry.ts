// Server-side (Admin SDK) posting of the journal entry for an online order transitioning
// to "paid". Kept separate from src/lib/accounting/* (which targets the browser Firebase
// client SDK) since this module runs in Vercel's Node serverless runtime — duplicating the
// small set of account codes needed here is intentional, not an oversight.

/* eslint-disable @typescript-eslint/no-explicit-any */

const ACCOUNT_CODES = {
  CLEARING: "1030",
  INVENTORY: "1210",
  REVENUE_ONLINE: "4100",
  COGS: "5000",
} as const;

const ACCOUNT_NAMES: Record<string, string> = {
  [ACCOUNT_CODES.CLEARING]: "Bonum/QPay clearing",
  [ACCOUNT_CODES.INVENTORY]: "Бэлэн бүтээгдэхүүний нөөц",
  [ACCOUNT_CODES.REVENUE_ONLINE]: "Онлайн борлуулалтын орлого",
  [ACCOUNT_CODES.COGS]: "Борлуулсан барааны өртөг",
};

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

function buildOrderPaidLines(grandTotal: number, cogsAmount: number): { lines: JournalLine[]; totalAmount: number } {
  const lines = [
    line(ACCOUNT_CODES.CLEARING, grandTotal, 0),
    line(ACCOUNT_CODES.REVENUE_ONLINE, 0, grandTotal),
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

async function generateJournalEntryNumber(db: any): Promise<string> {
  const currentYear = new Date().getFullYear();
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
}

/**
 * Posts the "order paid" journal entry exactly once per order, guarded by the order's
 * own payment.status (only posts while it is still "pending"). Safe to call from both
 * the Bonum webhook and the client-fallback mark-paid endpoint — whichever gets there
 * first wins, the other is a no-op.
 *
 * Returns the posted entry id, or null if the order was already paid (no-op).
 */
export async function postOrderPaidEntry(
  db: any,
  orderId: string,
  bonumFields: Record<string, unknown>,
): Promise<string | null> {
  // Pre-fetch the item product docs' costPrice for a best-effort COGS line. Reads happen
  // outside the main transaction (order composition doesn't change once created), then the
  // entry number is reserved via its own standalone transaction — both before the main
  // transaction opens, so the main transaction only ever reads the order doc before writing.
  const orderRef = db.collection("orders").doc(orderId);
  const preSnap = await orderRef.get();
  if (!preSnap.exists) return null;
  const preData = preSnap.data() as Record<string, unknown>;
  if ((preData.payment as Record<string, unknown> | undefined)?.status === "paid") {
    return null; // already posted by the other path (webhook vs. mark-paid race)
  }

  const items = Array.isArray(preData.items) ? (preData.items as OrderItem[]) : [];
  const uniqueProductIds = Array.from(new Set(items.map((item) => item.productId).filter((id): id is number => id != null)));
  const costPriceByProductId = new Map<number, number>();
  await Promise.all(
    uniqueProductIds.map(async (productId) => {
      const snap = await db.collection("products").doc(String(productId)).get();
      if (snap.exists) {
        const cost = Number((snap.data() as Record<string, unknown>).costPrice ?? 0);
        if (cost > 0) costPriceByProductId.set(productId, cost);
      }
    }),
  );
  const cogsAmount = items.reduce((sum, item) => {
    const cost = item.productId != null ? costPriceByProductId.get(item.productId) : undefined;
    return cost ? sum + cost * (item.quantity ?? 0) : sum;
  }, 0);

  const entryNumber = await generateJournalEntryNumber(db);

  return db.runTransaction(async (t: any) => {
    const snap = await t.get(orderRef);
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    const currentPayment = (data.payment as Record<string, unknown>) ?? {};
    if (currentPayment.status === "paid") return null; // idempotency guard, re-checked inside the transaction

    const grandTotal = Number((data.totals as Record<string, unknown> | undefined)?.grandTotal ?? currentPayment.amount ?? 0);
    const { lines, totalAmount } = buildOrderPaidLines(grandTotal, cogsAmount);

    const { FieldValue } = await import("firebase-admin/firestore");

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

    t.update(orderRef, {
      status: "paid",
      payment: {
        ...currentPayment,
        status: "paid",
        paidAt: new Date().toISOString(),
        ...bonumFields,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return entryRef.id;
  });
}
