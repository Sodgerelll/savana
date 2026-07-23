import { ACCOUNT_CODES } from "./chartOfAccounts";
import type { JournalEntryRecord } from "./journalQueries";

/**
 * A display-only income/expense row derived from a posted journal entry, so
 * the finance calendar/ledger windows show automated sales alongside manual
 * financeEntries records. These never exist in the financeEntries collection —
 * they are recomputed from journalEntries on every render and cannot be
 * edited or deleted from the ledger UI.
 */
export interface AutoFinanceEntry {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  categoryEn: string;
  note: string;
  /** Business date, YYYY-MM-DD. */
  date: string;
  sourceType: string;
  auto: true;
}

const REVENUE_CATEGORY: Record<string, { mn: string; en: string }> = {
  [ACCOUNT_CODES.REVENUE_ONLINE]: { mn: "Вэб захиалга", en: "Web orders" },
  [ACCOUNT_CODES.REVENUE_WHOLESALE]: { mn: "Бөөний борлуулалт", en: "Wholesale" },
  [ACCOUNT_CODES.REVENUE_DIRECT]: { mn: "Борлуулалт", en: "Sales" },
};

function entryDate(entry: JournalEntryRecord): string | null {
  const raw = entry.date ?? entry.createdAt;
  if (!raw) return null;
  const day = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Converts posted journal entries into simple income/expense ledger rows:
 * - net credit on a revenue account (4100/4200/4300) → income row
 * - net debit on sales returns (4910) → expense row ("Буцаалт")
 * Reversal entries naturally produce the mirrored row, so a cancelled sale
 * shows up as a matching expense line rather than silently disappearing.
 * COGS / inventory / VAT movements are intentionally skipped — they belong to
 * the trial balance, not the cash-style ledger.
 */
export function deriveAutoFinanceEntries(journalEntries: JournalEntryRecord[]): AutoFinanceEntry[] {
  const rows: AutoFinanceEntry[] = [];

  for (const entry of journalEntries) {
    const date = entryDate(entry);
    if (!date) continue;

    for (const code of Object.keys(REVENUE_CATEGORY)) {
      let net = 0;
      for (const line of entry.lines) {
        if (line.accountCode === code) net += line.credit - line.debit;
      }
      if (net === 0) continue;
      const category = REVENUE_CATEGORY[code];
      rows.push({
        id: `auto-${entry.id}-${code}`,
        type: net > 0 ? "income" : "expense",
        amount: Math.abs(net),
        category: net > 0 ? category.mn : "Цуцлалт",
        categoryEn: net > 0 ? category.en : "Reversal",
        note: entry.description || entry.sourceNumber,
        date,
        sourceType: entry.sourceType,
        auto: true,
      });
    }

    let returnsNet = 0;
    for (const line of entry.lines) {
      if (line.accountCode === ACCOUNT_CODES.SALES_RETURNS) returnsNet += line.debit - line.credit;
    }
    if (returnsNet !== 0) {
      rows.push({
        id: `auto-${entry.id}-${ACCOUNT_CODES.SALES_RETURNS}`,
        type: returnsNet > 0 ? "expense" : "income",
        amount: Math.abs(returnsNet),
        category: "Буцаалт",
        categoryEn: "Returns",
        note: entry.description || entry.sourceNumber,
        date,
        sourceType: entry.sourceType,
        auto: true,
      });
    }
  }

  return rows;
}
