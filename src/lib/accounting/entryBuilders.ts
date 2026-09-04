import { ACCOUNT_CODES, ACCOUNT_NAMES, mapPaymentMethodToAccount, type AccountCode } from "./chartOfAccounts";

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface BuiltEntry {
  lines: JournalLine[];
  totalAmount: number;
}

function round(amount: number): number {
  return Math.round(amount);
}

function line(accountCode: AccountCode, debit: number, credit: number): JournalLine | null {
  const roundedDebit = round(debit);
  const roundedCredit = round(credit);
  if (roundedDebit === 0 && roundedCredit === 0) return null;
  return { accountCode, accountName: ACCOUNT_NAMES[accountCode] ?? accountCode, debit: roundedDebit, credit: roundedCredit };
}

/** Safety net — every builder below must return a balanced set of lines. */
function assertBalanced(lines: JournalLine[]): BuiltEntry {
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Journal entry is not balanced: debit=${totalDebit} credit=${totalCredit}. Lines: ${JSON.stringify(lines)}`,
    );
  }
  return { lines, totalAmount: totalDebit };
}

function cogsLines(cogsAmount: number): JournalLine[] {
  if (cogsAmount <= 0) return [];
  const debit = line(ACCOUNT_CODES.COGS, cogsAmount, 0);
  const credit = line(ACCOUNT_CODES.INVENTORY, 0, cogsAmount);
  return [debit, credit].filter((l): l is JournalLine => l !== null);
}

/**
 * НӨАТ carried by a gross amount, clamped so it can never exceed the amount itself or
 * turn negative — every builder that splits VAT out of a total funnels through this.
 */
function clampVat(grossAmount: number, vatAmount: number | undefined): number {
  return Math.max(0, Math.min(round(vatAmount ?? 0), round(grossAmount)));
}

/**
 * Delivery charged on top of the goods, clamped so it can never exceed what is left of a
 * total once НӨАТ has been carved out. Booked to its own revenue account: folding it into
 * goods revenue overstates what the products earned, since delivery is billed at cost.
 */
function clampShipping(grossAmount: number, vatAmount: number, shippingAmount: number | undefined): number {
  return Math.max(0, Math.min(round(shippingAmount ?? 0), round(grossAmount) - vatAmount));
}

/** True when a built entry carries no lines at all, so the caller can skip posting it. */
export function isEmptyEntry(entry: BuiltEntry): boolean {
  return entry.lines.length === 0;
}

// ─── Wholesale Transfer (confirmTransfer) ─────────────────────────────────────

export function buildTransferConfirmedEntry(params: {
  paymentMethod: string;
  paidAmount: number;
  remainingAmount: number;
  subtotal: number;
  taxAmount: number;
  cogsAmount: number;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const lines = [
    line(moneyAccount, params.paidAmount, 0),
    line(ACCOUNT_CODES.AR, params.remainingAmount, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, 0, params.taxAmount),
    line(ACCOUNT_CODES.REVENUE_WHOLESALE, 0, params.subtotal),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/** Mirror-image reversal of a previously posted entry (used to cancel a Transfer). */
export function buildReversalEntry(originalLines: JournalLine[]): BuiltEntry {
  const lines = originalLines.map((l) => ({
    accountCode: l.accountCode,
    accountName: l.accountName,
    debit: l.credit,
    credit: l.debit,
  }));
  return assertBalanced(lines);
}

/**
 * A wholesale return. `returnTotal` is the net value of the goods coming back and
 * `taxAmount` the НӨАТ that was charged on them — the tax has to be debited back out of
 * the VAT payable account, otherwise the shop keeps owing tax on a sale it un-made.
 */
export function buildTransferReturnEntry(params: {
  returnTotal: number;
  cogsAmount: number;
  taxAmount?: number;
}): BuiltEntry {
  const taxAmount = Math.max(0, round(params.taxAmount ?? 0));
  const lines = [
    line(ACCOUNT_CODES.SALES_RETURNS, params.returnTotal, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, taxAmount, 0),
    line(ACCOUNT_CODES.AR, 0, round(params.returnTotal) + taxAmount),
    ...cogsLines(params.cogsAmount).reverse().map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

export function buildPaymentReceivedEntry(params: { amount: number; method: string }): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.method);
  const lines = [line(moneyAccount, params.amount, 0), line(ACCOUNT_CODES.AR, 0, params.amount)].filter(
    (l): l is JournalLine => l !== null,
  );
  return assertBalanced(lines);
}

// ─── Direct sale (POS) ────────────────────────────────────────────────────────

export function buildDirectSaleEntry(params: {
  lineTotal: number;
  cogsAmount: number;
  vatAmount?: number;
}): BuiltEntry {
  const vatAmount = clampVat(params.lineTotal, params.vatAmount);
  const lines = [
    line(ACCOUNT_CODES.CASH, params.lineTotal, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, 0, vatAmount),
    line(ACCOUNT_CODES.REVENUE_DIRECT, 0, round(params.lineTotal) - vatAmount),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

// ─── Offline sale (store, messenger, phone, … — the Sales module) ─────────────

/**
 * Counterpart of api/_lib/postOrderPaidEntry.ts for sales taken outside the storefront:
 * revenue is booked as direct (non-online) sales and the money lands in whichever account
 * the selected payment method settles into instead of the Bonum clearing account.
 *
 * `grandTotal` is what the buyer pays, so any НӨАТ it carries is split off into the VAT
 * payable account and only the net remainder is booked as revenue.
 */
export function buildSaleEntry(params: {
  grandTotal: number;
  cogsAmount: number;
  paymentMethod: string;
  vatAmount?: number;
  shippingAmount?: number;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const vatAmount = clampVat(params.grandTotal, params.vatAmount);
  const shippingAmount = clampShipping(params.grandTotal, vatAmount, params.shippingAmount);
  const lines = [
    line(moneyAccount, params.grandTotal, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, 0, vatAmount),
    line(ACCOUNT_CODES.REVENUE_SHIPPING, 0, shippingAmount),
    line(ACCOUNT_CODES.REVENUE_DIRECT, 0, round(params.grandTotal) - vatAmount - shippingAmount),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/**
 * A Sales/Orders return. Unlike the wholesale return above, these buyers carry no running
 * balance, so what was collected has to come straight back out of the money account it was
 * paid into instead of reducing a receivable.
 */
export function buildSaleReturnEntry(params: {
  /** Returned value net of VAT — debited to Sales Returns. */
  returnAmount: number;
  vatAmount: number;
  cogsAmount: number;
  paymentMethod: string;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const returnAmount = round(params.returnAmount);
  const vatAmount = round(params.vatAmount);
  const lines = [
    line(ACCOUNT_CODES.SALES_RETURNS, returnAmount, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, vatAmount, 0),
    line(moneyAccount, 0, returnAmount + vatAmount),
    ...cogsLines(params.cogsAmount).reverse().map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/**
 * Goods that left stock without a sale — gifts and own use. No money changes hands and
 * no revenue is earned, so the only movement is inventory turning into an expense at cost.
 * Returns an empty entry when the cost is unknown, which the caller skips posting.
 */
export function buildGoodsWriteOffEntry(params: { cogsAmount: number }): BuiltEntry {
  const lines = [
    line(ACCOUNT_CODES.GOODS_WRITE_OFF, params.cogsAmount, 0),
    line(ACCOUNT_CODES.INVENTORY, 0, params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

// ─── Online order (storefront checkout settled through Bonum) ──────────────────

/**
 * Browser-side counterpart of api/_lib/postOrderPaidEntry.ts — kept here so the online
 * channel splits НӨАТ the same way every other channel does. The two must stay in step.
 */
export function buildOrderPaidEntry(params: {
  grandTotal: number;
  cogsAmount: number;
  vatAmount?: number;
  shippingAmount?: number;
}): BuiltEntry {
  const vatAmount = clampVat(params.grandTotal, params.vatAmount);
  const shippingAmount = clampShipping(params.grandTotal, vatAmount, params.shippingAmount);
  const lines = [
    line(ACCOUNT_CODES.CLEARING, params.grandTotal, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, 0, vatAmount),
    line(ACCOUNT_CODES.REVENUE_SHIPPING, 0, shippingAmount),
    line(ACCOUNT_CODES.REVENUE_ONLINE, 0, round(params.grandTotal) - vatAmount - shippingAmount),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

// ─── Production & purchasing ──────────────────────────────────────────────────

/**
 * A batch reaching "ready": the raw materials it consumed become finished goods, so their
 * cost moves from the raw-materials account into finished-goods inventory. This is the
 * debit side that COGS later credits back out — without it the inventory account only ever
 * shrinks.
 */
export function buildProductionCompletedEntry(params: { producedCost: number }): BuiltEntry {
  const lines = [
    line(ACCOUNT_CODES.INVENTORY, params.producedCost, 0),
    line(ACCOUNT_CODES.RAW_MATERIALS, 0, params.producedCost),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/** Buying raw materials: stock of materials grows, the money account it was paid from shrinks. */
export function buildRawMaterialPurchaseEntry(params: {
  amount: number;
  paymentMethod?: string | null;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const lines = [
    line(ACCOUNT_CODES.RAW_MATERIALS, params.amount, 0),
    line(moneyAccount, 0, params.amount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/**
 * Raw materials consumed outside of a production batch — waste, samples, testing. No money
 * changes hands, so the only movement is stock turning into an expense at cost, mirroring
 * buildGoodsWriteOffEntry for finished goods.
 */
export function buildRawMaterialWriteOffEntry(params: { amount: number }): BuiltEntry {
  const lines = [
    line(ACCOUNT_CODES.RAW_MATERIAL_WRITE_OFF, params.amount, 0),
    line(ACCOUNT_CODES.RAW_MATERIALS, 0, params.amount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/** Buying packaging: stock of packaging grows, the money account it was paid from shrinks. */
export function buildPackagingPurchaseEntry(params: {
  amount: number;
  paymentMethod?: string | null;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const lines = [
    line(ACCOUNT_CODES.PACKAGING, params.amount, 0),
    line(moneyAccount, 0, params.amount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/**
 * Packaging consumed outside of a sale — waste, samples, damage. No money changes hands, so
 * the only movement is stock turning into an expense at cost, mirroring buildRawMaterialWriteOffEntry.
 */
export function buildPackagingWriteOffEntry(params: { amount: number }): BuiltEntry {
  const lines = [
    line(ACCOUNT_CODES.PACKAGING_WRITE_OFF, params.amount, 0),
    line(ACCOUNT_CODES.PACKAGING, 0, params.amount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

// ─── Manually recorded income / expense (the Finance ledger) ───────────────────

/**
 * A hand-entered ledger row — rent, salaries, marketing, or income that is not a product
 * sale. Without this the trial balance shows revenue with no costs against it.
 */
export function buildFinanceLedgerEntry(params: {
  type: "income" | "expense";
  amount: number;
  paymentMethod?: string | null;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const lines = (
    params.type === "expense"
      ? [line(ACCOUNT_CODES.OPERATING_EXPENSE, params.amount, 0), line(moneyAccount, 0, params.amount)]
      : [line(moneyAccount, params.amount, 0), line(ACCOUNT_CODES.OTHER_INCOME, 0, params.amount)]
  ).filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

// ─── Customer transaction (sale/delivery/return) ──────────────────────────────

export function buildCustomerTransactionSaleEntry(params: {
  paymentMethod: string | null;
  paidAmount: number;
  grandTotal: number;
  cogsAmount: number;
  vatAmount?: number;
}): BuiltEntry {
  // A payment can never exceed what is owed, so the receivable side is floored at zero
  // rather than turning into a negative debit that would misstate the AR balance.
  const paidAmount = Math.min(round(params.paidAmount), round(params.grandTotal));
  const remaining = round(params.grandTotal) - paidAmount;
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const vatAmount = clampVat(params.grandTotal, params.vatAmount);
  const lines = [
    line(moneyAccount, paidAmount, 0),
    line(ACCOUNT_CODES.AR, remaining, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, 0, vatAmount),
    line(ACCOUNT_CODES.REVENUE_WHOLESALE, 0, round(params.grandTotal) - vatAmount),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

export function buildCustomerTransactionReturnEntry(params: {
  grandTotal: number;
  cogsAmount: number;
  vatAmount?: number;
}): BuiltEntry {
  const vatAmount = clampVat(params.grandTotal, params.vatAmount);
  const lines = [
    line(ACCOUNT_CODES.SALES_RETURNS, round(params.grandTotal) - vatAmount, 0),
    line(ACCOUNT_CODES.VAT_PAYABLE, vatAmount, 0),
    line(ACCOUNT_CODES.AR, 0, params.grandTotal),
    ...cogsLines(params.cogsAmount).reverse().map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

/**
 * A reseller settling goods they were already billed for on an earlier delivery: `paidAmount`
 * lands in the cash/bank account it was received into and `allowanceAmount` is the price
 * concession the shop grants, booked to sales returns & allowances. Both clear that much of
 * the receivable. No revenue or COGS — those were posted when the goods were transferred.
 * Comes out empty when nothing was paid and nothing was allowed.
 */
export function buildCustomerTransactionSettlementEntry(params: {
  paymentMethod: string | null;
  paidAmount: number;
  allowanceAmount: number;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const paidAmount = Math.max(0, round(params.paidAmount));
  const allowanceAmount = Math.max(0, round(params.allowanceAmount));
  const lines = [
    line(moneyAccount, paidAmount, 0),
    line(ACCOUNT_CODES.SALES_RETURNS, allowanceAmount, 0),
    line(ACCOUNT_CODES.AR, 0, paidAmount + allowanceAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}
