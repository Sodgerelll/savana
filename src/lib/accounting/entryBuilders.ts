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

export function buildTransferReturnEntry(params: { returnTotal: number; cogsAmount: number }): BuiltEntry {
  const lines = [
    line(ACCOUNT_CODES.SALES_RETURNS, params.returnTotal, 0),
    line(ACCOUNT_CODES.AR, 0, params.returnTotal),
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

export function buildDirectSaleEntry(params: { lineTotal: number; cogsAmount: number }): BuiltEntry {
  const lines = [
    line(ACCOUNT_CODES.CASH, params.lineTotal, 0),
    line(ACCOUNT_CODES.REVENUE_DIRECT, 0, params.lineTotal),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

// ─── Manual order (admin-registered web/messenger/phone order) ────────────────

/**
 * Counterpart of api/_lib/postOrderPaidEntry.ts for orders an admin registers by hand:
 * the money lands in whichever account the selected payment method settles into instead
 * of always going through the Bonum clearing account.
 */
export function buildManualOrderEntry(params: {
  grandTotal: number;
  cogsAmount: number;
  paymentMethod: string;
}): BuiltEntry {
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const lines = [
    line(moneyAccount, params.grandTotal, 0),
    line(ACCOUNT_CODES.REVENUE_ONLINE, 0, params.grandTotal),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

// ─── Customer transaction (sale/delivery/return) ──────────────────────────────

export function buildCustomerTransactionSaleEntry(params: {
  paymentMethod: string | null;
  paidAmount: number;
  grandTotal: number;
  cogsAmount: number;
}): BuiltEntry {
  const remaining = params.grandTotal - params.paidAmount;
  const moneyAccount = mapPaymentMethodToAccount(params.paymentMethod);
  const lines = [
    line(moneyAccount, params.paidAmount, 0),
    line(ACCOUNT_CODES.AR, remaining, 0),
    line(ACCOUNT_CODES.REVENUE_WHOLESALE, 0, params.grandTotal),
    ...cogsLines(params.cogsAmount),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}

export function buildCustomerTransactionReturnEntry(params: { grandTotal: number; cogsAmount: number }): BuiltEntry {
  const lines = [
    line(ACCOUNT_CODES.SALES_RETURNS, params.grandTotal, 0),
    line(ACCOUNT_CODES.AR, 0, params.grandTotal),
    ...cogsLines(params.cogsAmount).reverse().map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  ].filter((l): l is JournalLine => l !== null);
  return assertBalanced(lines);
}
