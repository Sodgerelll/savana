/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  LineChart,
  PieChart,
  Search,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
  WalletCards,
  X,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import type { FinanceEntryRecord } from "../../lib/financeEntries";
import type { FinanceWeeklyKpiRecord } from "../../lib/financeKpis";
import { ACCOUNT_CODES, seedChartOfAccounts } from "../../lib/accounting/chartOfAccounts";
import { deriveAutoFinanceEntries } from "../../lib/accounting/autoFinanceEntries";
import { computeDiscountStats } from "../../lib/discountStats";

const MONTH_NAMES_MN = [
  "1-р сар", "2-р сар", "3-р сар", "4-р сар", "5-р сар", "6-р сар",
  "7-р сар", "8-р сар", "9-р сар", "10-р сар", "11-р сар", "12-р сар",
];
const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SOURCE_LABELS: Record<string, { mn: string; en: string }> = {
  order: { mn: "Онлайн захиалга", en: "Online order" },
  sale: { mn: "Борлуулалт", en: "Sale" },
  transfer: { mn: "Шилжүүлэг", en: "Transfer" },
  payment: { mn: "Төлбөр", en: "Payment" },
  directSale: { mn: "Шууд борлуулалт", en: "Direct sale" },
  customerTransaction: { mn: "Харилцагчийн гүйлгээ", en: "Customer transaction" },
};

const MONEY_CODES: string[] = [ACCOUNT_CODES.CASH, ACCOUNT_CODES.BANK, ACCOUNT_CODES.CLEARING];

interface MonthlyRow {
  monthIndex: number;
  income: number;
  expense: number;
  profit: number;
  margin: number | null;
  hasData: boolean;
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function sumLines(entries: any[], predicate: (code: string) => boolean): number {
  let total = 0;
  entries.forEach((entry) => {
    (entry.lines ?? []).forEach((line: any) => {
      if (predicate(line.accountCode)) {
        total += line.debit - line.credit;
      }
    });
  });
  return total;
}

export default function FinanceReportsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    financeEntries,
    financeWeeklyKpis,
    saveWeeklyKpi,
    orders,
    directSales,
    customerTransactions,
    journalEntries,
    chartOfAccounts,
    language,
    formatStorePrice,
    formatAdminDateTime,
    setActiveSection,
  } = ctx;

  const mn = language === "MN";
  const monthNames = mn ? MONTH_NAMES_MN : MONTH_NAMES_EN;
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [view, setView] = useState<"dashboard" | "journal" | "ledger">("dashboard");
  const yearPrefix = `${viewYear}-`;

  const ledgerEntries = journalEntries as any[];

  // Manual entries + automated rows derived from posted journal entries — the
  // dashboards below report on the combined stream.
  const combinedEntries = useMemo(() => {
    const auto = deriveAutoFinanceEntries(ledgerEntries);
    return [
      ...(financeEntries as FinanceEntryRecord[]).map((e) => ({ ...e, auto: false })),
      ...auto.map((e) => ({ ...e, recurringId: null })),
    ];
  }, [financeEntries, ledgerEntries]);

  const yearEntries = useMemo(
    () => combinedEntries.filter((e) => e.date.startsWith(yearPrefix)),
    [combinedEntries, yearPrefix],
  );

  // ── Monthly P&L rows ──
  const monthlyRows: MonthlyRow[] = useMemo(() => {
    const rows: MonthlyRow[] = Array.from({ length: 12 }, (_, monthIndex) => ({
      monthIndex,
      income: 0,
      expense: 0,
      profit: 0,
      margin: null,
      hasData: false,
    }));
    for (const entry of yearEntries) {
      const monthIndex = Number(entry.date.slice(5, 7)) - 1;
      if (monthIndex < 0 || monthIndex > 11) continue;
      const row = rows[monthIndex];
      if (entry.type === "income") row.income += entry.amount;
      else row.expense += entry.amount;
      row.hasData = true;
    }
    for (const row of rows) {
      row.profit = row.income - row.expense;
      row.margin = row.income > 0 ? (row.profit / row.income) * 100 : null;
    }
    return rows;
  }, [yearEntries]);

  const activeRows = monthlyRows.filter((row) => row.hasData);
  const totalIncome = activeRows.reduce((sum, row) => sum + row.income, 0);
  const totalExpense = activeRows.reduce((sum, row) => sum + row.expense, 0);
  const totalProfit = totalIncome - totalExpense;
  const totalMargin = totalIncome > 0 ? (totalProfit / totalIncome) * 100 : null;
  const monthlyAverage = activeRows.length > 0 ? totalProfit / activeRows.length : 0;

  // ── Cashflow rows with cumulative balance ──
  const cashflowRows = useMemo(() => {
    let cumulative = 0;
    return activeRows.map((row) => {
      cumulative += row.profit;
      return { ...row, cumulative };
    });
  }, [activeRows]);

  // ── Expense breakdown by category ──
  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of yearEntries) {
      if (entry.type !== "expense") continue;
      const key = entry.category.trim() || (mn ? "Ангилалгүй" : "Uncategorized");
      map.set(key, (map.get(key) ?? 0) + entry.amount);
    }
    const rows = [...map.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return { rows, total };
  }, [yearEntries, mn]);

  // ── Discounts given during the viewed year, by sales channel ──
  const yearDiscounts = useMemo(
    () => computeDiscountStats({ orders, directSales, customerTransactions }, yearPrefix.slice(0, 4)),
    [orders, directSales, customerTransactions, yearPrefix],
  );

  // ── Weekly KPI rows (last 8 ISO weeks) ──
  const weeklyRows = useMemo(() => {
    const kpiByWeek = new Map(
      (financeWeeklyKpis as FinanceWeeklyKpiRecord[]).map((record) => [record.week, record]),
    );
    const orderStats = new Map<string, { count: number; revenue: number }>();
    for (const order of (orders as any[]) ?? []) {
      if (!order.createdAt) continue;
      const week = isoWeekKey(new Date(order.createdAt));
      const bucket = orderStats.get(week) ?? { count: 0, revenue: 0 };
      bucket.count += 1;
      if (order.status !== "new") bucket.revenue += Number(order.totals?.grandTotal ?? 0);
      orderStats.set(week, bucket);
    }
    for (const sale of (directSales as any[]) ?? []) {
      if (!sale.createdAt) continue;
      const week = isoWeekKey(new Date(sale.createdAt));
      const bucket = orderStats.get(week) ?? { count: 0, revenue: 0 };
      bucket.revenue += Number(sale.lineTotal ?? 0);
      orderStats.set(week, bucket);
    }
    return Array.from({ length: 8 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (7 - i) * 7);
      const week = isoWeekKey(date);
      const stats = orderStats.get(week) ?? { count: 0, revenue: 0 };
      const kpi = kpiByWeek.get(week);
      return { week, ...stats, ctr: kpi?.ctr ?? null, conversionRate: kpi?.conversionRate ?? null };
    });
  }, [orders, directSales, financeWeeklyKpis]);

  const handleKpiBlur = (
    week: string,
    field: "ctr" | "conversionRate",
    rawValue: string,
    current: { ctr: number | null; conversionRate: number | null },
  ) => {
    const trimmed = rawValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && !Number.isFinite(parsed)) return;
    if (parsed === current[field]) return;
    void saveWeeklyKpi(week, { ...current, [field]: parsed });
  };

  const profitClass = (value: number) => (value >= 0 ? "finance-amount-income" : "finance-amount-expense");

  // ── Journal view state ──
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filteredJournal = useMemo(() => {
    return ledgerEntries.filter((entry) => {
      if (sourceFilter !== "all" && entry.sourceType !== sourceFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        entry.entryNumber?.toLowerCase().includes(q) ||
        entry.sourceNumber?.toLowerCase().includes(q) ||
        entry.description?.toLowerCase().includes(q)
      );
    });
  }, [ledgerEntries, search, sourceFilter]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sourceLabel = (type: string) => {
    const entry = SOURCE_LABELS[type];
    if (!entry) return type;
    return mn ? entry.mn : entry.en;
  };

  // ── Ledger view (account balances, trial balance, chart of accounts) ──
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  const cashBalance = useMemo(() => sumLines(ledgerEntries, (code) => MONEY_CODES.includes(code)), [ledgerEntries]);
  const arBalance = useMemo(() => sumLines(ledgerEntries, (code) => code === ACCOUNT_CODES.AR), [ledgerEntries]);
  const vatPayable = useMemo(
    () => -sumLines(ledgerEntries, (code) => code === ACCOUNT_CODES.VAT_PAYABLE),
    [ledgerEntries],
  );
  const revenueToday = useMemo(
    () =>
      -sumLines(
        ledgerEntries.filter((e: any) => String(e.date ?? "").slice(0, 10) === today),
        (code) => code === ACCOUNT_CODES.REVENUE_ONLINE || code === ACCOUNT_CODES.REVENUE_WHOLESALE || code === ACCOUNT_CODES.REVENUE_DIRECT,
      ),
    [ledgerEntries, today],
  );
  const revenueByMonth = useMemo(
    () =>
      -sumLines(
        ledgerEntries.filter((e: any) => String(e.date ?? "").slice(0, 7) === monthPrefix),
        (code) => code === ACCOUNT_CODES.REVENUE_ONLINE || code === ACCOUNT_CODES.REVENUE_WHOLESALE || code === ACCOUNT_CODES.REVENUE_DIRECT,
      ),
    [ledgerEntries, monthPrefix],
  );

  const revenueBySource = useMemo(() => {
    const buckets: Record<string, number> = { online: 0, wholesale: 0, direct: 0 };
    ledgerEntries.forEach((entry: any) => {
      (entry.lines ?? []).forEach((line: any) => {
        if (line.accountCode === ACCOUNT_CODES.REVENUE_ONLINE) buckets.online += line.credit - line.debit;
        if (line.accountCode === ACCOUNT_CODES.REVENUE_WHOLESALE) buckets.wholesale += line.credit - line.debit;
        if (line.accountCode === ACCOUNT_CODES.REVENUE_DIRECT) buckets.direct += line.credit - line.debit;
      });
    });
    return buckets;
  }, [ledgerEntries]);

  const trialBalance = useMemo(() => {
    const byCode = new Map<string, { accountName: string; debit: number; credit: number }>();
    ledgerEntries.forEach((entry) => {
      (entry.lines ?? []).forEach((line: any) => {
        const existing = byCode.get(line.accountCode) ?? { accountName: line.accountName, debit: 0, credit: 0 };
        existing.debit += line.debit;
        existing.credit += line.credit;
        byCode.set(line.accountCode, existing);
      });
    });
    return Array.from(byCode.entries())
      .map(([code, v]) => ({ code, ...v, balance: v.debit - v.credit }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [ledgerEntries]);

  const totalDebit = trialBalance.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trialBalance.reduce((s, r) => s + r.credit, 0);

  const isSeeded = (chartOfAccounts as any[]).length > 0;
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      await seedChartOfAccounts();
    } catch (err: any) {
      setSeedError(err?.message ?? (mn ? "Алдаа гарлаа." : "An error occurred."));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">Finance</p>
          <h1>{mn ? "Санхүүгийн тайлан" : "Financial reports"}</h1>
          <p>
            {mn
              ? "Захирлын түвшний хяналтын самбар: P&L, мөнгөн урсгал, зардлын задаргаа, KPI, журнал, дансны үлдэгдэл."
              : "Director-level dashboard: P&L, cashflow, expense breakdown, KPIs, journal, and trial balance."}
          </p>
        </div>
        <div className="admin-topbar-actions">
          <button
            type="button"
            className={view === "dashboard" ? "btn btn-primary" : "btn btn-outline"}
            onClick={() => setView("dashboard")}
          >
            {mn ? "Тайлан" : "Reports"}
          </button>
          <button
            type="button"
            className={view === "journal" ? "btn btn-primary" : "btn btn-outline"}
            onClick={() => setView("journal")}
          >
            {mn ? "Журнал" : "Journal"}
          </button>
          <button
            type="button"
            className={view === "ledger" ? "btn btn-primary" : "btn btn-outline"}
            onClick={() => setView("ledger")}
          >
            {mn ? "Данс" : "Ledger"}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => setActiveSection("financeOverview")}>
            {mn ? "Гүйлгээ бүртгэх" : "Record entries"}
          </button>
        </div>
      </div>

      {!isSeeded && (
        <div className="admin-data-card" style={{ padding: "1rem 1.25rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <p style={{ margin: 0, flex: "1 1 240px" }}>
            {mn
              ? "Дансны заавар (chart of accounts) хараахан үүсгэгдээгүй байна."
              : "The chart of accounts hasn't been seeded yet."}
          </p>
          <button type="button" className="btn btn-primary" onClick={handleSeed} disabled={seeding}>
            <DatabaseZap size={16} />
            {seeding ? (mn ? "Үүсгэж байна..." : "Seeding...") : (mn ? "Дансны заавар үүсгэх" : "Seed chart of accounts")}
          </button>
        </div>
      )}
      {seedError && <p className="sale-modal-error">{seedError}</p>}

      {view === "dashboard" && (
        <>
          <div className="finance-calendar-head">
            <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => setViewYear(viewYear - 1)} title={mn ? "Өмнөх он" : "Previous year"}>
              <ChevronLeft size={16} />
            </button>
            <h2>{viewYear} {mn ? "он" : ""}</h2>
            <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => setViewYear(viewYear + 1)} title={mn ? "Дараах он" : "Next year"}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* 1. Dashboard KPI cards */}
          <div className="admin-summary-grid">
            <div className="admin-summary-card">
              <span><TrendingUp size={14} /> {mn ? "Нийт орлого" : "Total income"}</span>
              <strong className="finance-amount-income">{formatStorePrice(totalIncome)}</strong>
            </div>
            <div className="admin-summary-card">
              <span><TrendingDown size={14} /> {mn ? "Нийт зардал" : "Total expense"}</span>
              <strong className="finance-amount-expense">{formatStorePrice(totalExpense)}</strong>
            </div>
            <div className="admin-summary-card">
              <span><Wallet size={14} /> {mn ? "Цэвэр ашиг" : "Net profit"}</span>
              <strong className={profitClass(totalProfit)}>{formatStorePrice(totalProfit)}</strong>
            </div>
            <div className="admin-summary-card">
              <span><PieChart size={14} /> {mn ? "Ашгийн хувь" : "Profit margin"}</span>
              <strong className={totalMargin !== null && totalMargin < 0 ? "finance-amount-expense" : ""}>{formatPercent(totalMargin)}</strong>
            </div>
            <div className="admin-summary-card">
              <span><LineChart size={14} /> {mn ? "Сарын дундаж" : "Monthly average"}</span>
              <strong className={profitClass(monthlyAverage)}>{formatStorePrice(Math.round(monthlyAverage))}</strong>
            </div>
          </div>

          {/* 2. P&L monthly table */}
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>{mn ? "P&L тайлан (Орлого – Зардал)" : "P&L report (Income – Expense)"}</h2>
                <p>
                  {mn
                    ? "Гараар бүртгэсэн болон журналаас автоматаар орсон гүйлгээг нэгтгэсэн. Алдагдалтай сарууд улаанаар тодорно."
                    : "Combines manual entries and automated journal postings. Loss months are highlighted red."}
                </p>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Сар" : "Month"}</th>
                    <th className="admin-th-right">{mn ? "Нийт орлого" : "Income"}</th>
                    <th className="admin-th-right">{mn ? "Нийт зардал" : "Expense"}</th>
                    <th className="admin-th-right">{mn ? "Цэвэр ашиг" : "Net profit"}</th>
                    <th className="admin-th-right">{mn ? "Ашгийн хувь" : "Margin"}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="admin-table-empty">
                        {mn ? "Энэ онд бүртгэл байхгүй байна." : "No entries for this year."}
                      </td>
                    </tr>
                  ) : (
                    activeRows.map((row) => (
                      <tr key={row.monthIndex} className={row.profit < 0 ? "finance-row-loss" : ""}>
                        <td>{monthNames[row.monthIndex]}</td>
                        <td className="admin-td-right">{formatStorePrice(row.income)}</td>
                        <td className={`admin-td-right ${row.profit < 0 ? "finance-amount-expense" : ""}`}>
                          {formatStorePrice(row.expense)}
                        </td>
                        <td className={`admin-td-right ${profitClass(row.profit)}`}>
                          <strong>{formatStorePrice(row.profit)}</strong>
                        </td>
                        <td className={`admin-td-right ${profitClass(row.profit)}`}>
                          <strong>{formatPercent(row.margin)}</strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {activeRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td><strong>{mn ? "Нийт дүн" : "Total"}</strong></td>
                      <td className="admin-td-right"><strong>{formatStorePrice(totalIncome)}</strong></td>
                      <td className="admin-td-right finance-amount-expense"><strong>{formatStorePrice(totalExpense)}</strong></td>
                      <td className={`admin-td-right ${profitClass(totalProfit)}`}><strong>{formatStorePrice(totalProfit)}</strong></td>
                      <td className={`admin-td-right ${profitClass(totalProfit)}`}><strong>{formatPercent(totalMargin)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* 3. Cashflow */}
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>{mn ? "Мөнгөн урсгалын тайлан" : "Cashflow report"}</h2>
                <p>
                  {mn
                    ? "Орсон, гарсан мөнгө, хуримтлалын үлдэгдэл. Сөрөг үлдэгдэл улаанаар анхааруулна."
                    : "Money in/out and the running balance. Negative balances warn in red."}
                </p>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Сар" : "Month"}</th>
                    <th className="admin-th-right">{mn ? "Орсон мөнгө" : "Money in"}</th>
                    <th className="admin-th-right">{mn ? "Гарсан мөнгө" : "Money out"}</th>
                    <th className="admin-th-right">{mn ? "Цэвэр урсгал" : "Net flow"}</th>
                    <th className="admin-th-right">{mn ? "Хуримтлалын үлдэгдэл" : "Running balance"}</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflowRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="admin-table-empty">
                        {mn ? "Энэ онд бүртгэл байхгүй байна." : "No entries for this year."}
                      </td>
                    </tr>
                  ) : (
                    cashflowRows.map((row) => (
                      <tr key={row.monthIndex}>
                        <td>{monthNames[row.monthIndex]}</td>
                        <td className="admin-td-right">{formatStorePrice(row.income)}</td>
                        <td className="admin-td-right">{formatStorePrice(row.expense)}</td>
                        <td className={`admin-td-right ${profitClass(row.profit)}`}>{formatStorePrice(row.profit)}</td>
                        <td className={`admin-td-right ${profitClass(row.cumulative)}`}>
                          <strong>{formatStorePrice(row.cumulative)}</strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Expense breakdown */}
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>{mn ? "Зардлын задаргаа (жилийн дүн)" : "Expense breakdown (yearly)"}</h2>
                <p>
                  {mn
                    ? "Ангиллаар (цалин, түрээс, бараа...) жилийн дүн, хувь."
                    : "Yearly totals and share by category (salary, rent, goods...)."}
                </p>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Ангилал" : "Category"}</th>
                    <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
                    <th className="admin-th-right">{mn ? "Хувь %" : "Share %"}</th>
                    <th>{mn ? "Визуал" : "Visual"}</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseBreakdown.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="admin-table-empty">
                        {mn ? "Зарлагын бүртгэл байхгүй байна." : "No expense entries."}
                      </td>
                    </tr>
                  ) : (
                    expenseBreakdown.rows.map((row) => {
                      const share = expenseBreakdown.total > 0 ? (row.amount / expenseBreakdown.total) * 100 : 0;
                      return (
                        <tr key={row.category}>
                          <td>{row.category}</td>
                          <td className="admin-td-right">{formatStorePrice(row.amount)}</td>
                          <td className="admin-td-right">{share.toFixed(1)}%</td>
                          <td>
                            <div className="finance-databar">
                              <span style={{ width: `${Math.max(2, share)}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {expenseBreakdown.rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td><strong>{mn ? "Нийт" : "Total"}</strong></td>
                      <td className="admin-td-right"><strong>{formatStorePrice(expenseBreakdown.total)}</strong></td>
                      <td className="admin-td-right"><strong>100.0%</strong></td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* 4.5 Discount report by sales channel */}
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>
                  <Tag size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                  {mn ? "Хямдралын тайлан (жилийн дүн)" : "Discount report (yearly)"}
                </h2>
                <p>
                  {mn
                    ? "Хямдралтай үнээр зарагдсан борлуулалт: онлайн захиалга, шууд борлуулалт, борлуулагч руу шилжүүлсэн сувгаар."
                    : "Sales made at discounted prices: online orders, direct sales, and seller transfers."}
                </p>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Суваг" : "Channel"}</th>
                    <th className="admin-th-right">{mn ? "Хямдралтай борлуулалт (ш)" : "Discounted sales"}</th>
                    <th className="admin-th-right">{mn ? "Хямдралын дүн" : "Discount amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  {yearDiscounts.total.count === 0 ? (
                    <tr>
                      <td colSpan={3} className="admin-table-empty">
                        {mn ? "Энэ онд хямдралтай борлуулалт бүртгэгдээгүй байна." : "No discounted sales recorded this year."}
                      </td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td>{mn ? "Онлайн захиалга" : "Online orders"}</td>
                        <td className="admin-td-right">{yearDiscounts.orders.count}</td>
                        <td className="admin-td-right finance-amount-expense">
                          {yearDiscounts.orders.amount > 0 ? `−${formatStorePrice(yearDiscounts.orders.amount)}` : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td>{mn ? "Шууд борлуулалт" : "Direct sales"}</td>
                        <td className="admin-td-right">{yearDiscounts.directSales.count}</td>
                        <td className="admin-td-right finance-amount-expense">
                          {yearDiscounts.directSales.amount > 0 ? `−${formatStorePrice(yearDiscounts.directSales.amount)}` : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td>{mn ? "Борлуулагч руу шилжүүлсэн" : "Seller transfers"}</td>
                        <td className="admin-td-right">{yearDiscounts.transfers.count}</td>
                        <td className="admin-td-right finance-amount-expense">
                          {yearDiscounts.transfers.amount > 0 ? `−${formatStorePrice(yearDiscounts.transfers.amount)}` : "—"}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
                {yearDiscounts.total.count > 0 && (
                  <tfoot>
                    <tr>
                      <td><strong>{mn ? "Нийт" : "Total"}</strong></td>
                      <td className="admin-td-right"><strong>{yearDiscounts.total.count}</strong></td>
                      <td className="admin-td-right finance-amount-expense">
                        <strong>−{formatStorePrice(yearDiscounts.total.amount)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* 5. Weekly KPI monitor */}
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>{mn ? "KPI хяналт (долоо хоног)" : "KPI monitor (weekly)"}</h2>
                <p>
                  {mn
                    ? "Захиалга, борлуулалт систем дотроос автоматаар. CTR, conversion rate-ийг гараар оруулна (шар нүд)."
                    : "Orders and revenue are automatic. Enter CTR and conversion rate manually (yellow cells)."}
                </p>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Долоо хоног" : "Week"}</th>
                    <th className="admin-th-right">{mn ? "Захиалга (ш)" : "Orders"}</th>
                    <th className="admin-th-right">{mn ? "Борлуулалт (₮)" : "Revenue"}</th>
                    <th className="admin-th-right">CTR (%)</th>
                    <th className="admin-th-right">Conversion rate (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRows.map((row) => (
                    <tr key={row.week}>
                      <td>{row.week}</td>
                      <td className="admin-td-right">{row.count}</td>
                      <td className="admin-td-right">{formatStorePrice(row.revenue)}</td>
                      <td className="admin-td-right">
                        <input
                          key={`${row.week}-ctr-${row.ctr ?? ""}`}
                          type="number"
                          step="0.1"
                          min="0"
                          className="finance-kpi-input"
                          defaultValue={row.ctr ?? ""}
                          onBlur={(e) =>
                            handleKpiBlur(row.week, "ctr", e.target.value, { ctr: row.ctr, conversionRate: row.conversionRate })
                          }
                        />
                      </td>
                      <td className="admin-td-right">
                        <input
                          key={`${row.week}-cvr-${row.conversionRate ?? ""}`}
                          type="number"
                          step="0.1"
                          min="0"
                          className="finance-kpi-input"
                          defaultValue={row.conversionRate ?? ""}
                          onBlur={(e) =>
                            handleKpiBlur(row.week, "conversionRate", e.target.value, { ctr: row.ctr, conversionRate: row.conversionRate })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === "journal" && (
        <>
          <div className="admin-filter-bar">
            <div className="admin-filter-search">
              <Search size={16} className="admin-filter-search-icon" />
              <input
                type="text"
                placeholder={mn ? "Дугаар, тайлбараар хайх..." : "Search by number, description..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="admin-search-input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">{mn ? "Бүх эх үүсвэр" : "All sources"}</option>
              {Object.keys(SOURCE_LABELS).map((key) => (
                <option key={key} value={key}>
                  {sourceLabel(key)}
                </option>
              ))}
            </select>
            <div className="admin-filter-meta">
              {search && (
                <button type="button" className="admin-filter-clear" onClick={() => setSearch("")}>
                  <X size={14} />
                  {mn ? "Цэвэрлэх" : "Clear"}
                </button>
              )}
              <span className="admin-filter-count">
                {filteredJournal.length} / {ledgerEntries.length} {mn ? "үр дүн" : "results"}
              </span>
            </div>
          </div>

          <div className="admin-data-card">
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>{mn ? "Дугаар" : "Number"}</th>
                    <th>{mn ? "Огноо" : "Date"}</th>
                    <th>{mn ? "Эх үүсвэр" : "Source"}</th>
                    <th>{mn ? "Тайлбар" : "Description"}</th>
                    <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJournal.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-table-empty">
                        {mn ? "Бичилт байхгүй байна." : "No journal entries yet."}
                      </td>
                    </tr>
                  ) : (
                    filteredJournal.map((entry) => (
                      <Fragment key={entry.id}>
                        <tr onClick={() => toggleExpanded(entry.id)} style={{ cursor: "pointer" }}>
                          <td>
                            {expanded.has(entry.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td>
                            <small>
                              <strong>{entry.entryNumber}</strong>
                            </small>
                            {entry.reversalOf && (
                              <div style={{ fontSize: "0.72rem", color: "#b45309" }}>
                                {mn ? "Цуцлалт" : "Reversal"}
                              </div>
                            )}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>{formatAdminDateTime(entry.date, language)}</td>
                          <td>{sourceLabel(entry.sourceType)}</td>
                          <td>{entry.description}</td>
                          <td className="admin-td-right">
                            <strong>{formatStorePrice(entry.totalAmount)}</strong>
                          </td>
                        </tr>
                        {expanded.has(entry.id) && (
                          <tr>
                            <td colSpan={6} style={{ background: "rgba(127,127,127,0.06)" }}>
                              <table className="admin-data-table" style={{ margin: 0, minWidth: "unset" }}>
                                <thead>
                                  <tr>
                                    <th>{mn ? "Данс" : "Account"}</th>
                                    <th className="admin-th-right">Debit</th>
                                    <th className="admin-th-right">Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(entry.lines ?? []).map((line: any, idx: number) => (
                                    <tr key={idx}>
                                      <td>
                                        {line.accountCode} — {line.accountName}
                                      </td>
                                      <td className="admin-td-right">{line.debit > 0 ? formatStorePrice(line.debit) : "—"}</td>
                                      <td className="admin-td-right">{line.credit > 0 ? formatStorePrice(line.credit) : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === "ledger" && (
        <>
          <div className="admin-summary-grid">
            <div className="admin-summary-card">
              <span>{mn ? "Мөнгөн хөрөнгө (касс+банк+clearing)" : "Cash + bank + clearing"}</span>
              <strong>{formatStorePrice(cashBalance)}</strong>
            </div>
            <div className="admin-summary-card">
              <span>{mn ? "Авлага (AR)" : "Accounts receivable"}</span>
              <strong>{formatStorePrice(arBalance)}</strong>
            </div>
            <div className="admin-summary-card">
              <span>{mn ? "НӨАТ-ын өглөг" : "VAT payable"}</span>
              <strong>{formatStorePrice(vatPayable)}</strong>
            </div>
            <div className="admin-summary-card">
              <span>{mn ? "Өнөөдрийн орлого" : "Today's revenue"}</span>
              <strong>{formatStorePrice(revenueToday)}</strong>
            </div>
            <div className="admin-summary-card">
              <span>{mn ? "Энэ сарын орлого" : "This month's revenue"}</span>
              <strong>{formatStorePrice(revenueByMonth)}</strong>
            </div>
          </div>

          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>
                  <TrendingUp size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                  {mn ? "Эх үүсвэрээр орлого" : "Revenue by source"}
                </h2>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Эх үүсвэр" : "Source"}</th>
                    <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{mn ? "Онлайн захиалга" : "Online orders"}</td>
                    <td className="admin-td-right">{formatStorePrice(revenueBySource.online)}</td>
                  </tr>
                  <tr>
                    <td>{mn ? "Бөөний борлуулалт (шилжүүлэг)" : "Wholesale (transfers)"}</td>
                    <td className="admin-td-right">{formatStorePrice(revenueBySource.wholesale)}</td>
                  </tr>
                  <tr>
                    <td>{mn ? "Дэлгүүрийн шууд борлуулалт" : "Direct/POS sales"}</td>
                    <td className="admin-td-right">{formatStorePrice(revenueBySource.direct)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>{mn ? "Дансны үлдэгдэл (trial balance)" : "Trial balance"}</h2>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Код" : "Code"}</th>
                    <th>{mn ? "Данс" : "Account"}</th>
                    <th className="admin-th-right">Debit</th>
                    <th className="admin-th-right">Credit</th>
                    <th className="admin-th-right">{mn ? "Үлдэгдэл" : "Balance"}</th>
                  </tr>
                </thead>
                <tbody>
                  {trialBalance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="admin-table-empty">
                        {mn ? "Өгөгдөл байхгүй байна." : "No data yet."}
                      </td>
                    </tr>
                  ) : (
                    trialBalance.map((row) => (
                      <tr key={row.code}>
                        <td>
                          <strong>{row.code}</strong>
                        </td>
                        <td>{row.accountName}</td>
                        <td className="admin-td-right">{formatStorePrice(row.debit)}</td>
                        <td className="admin-td-right">{formatStorePrice(row.credit)}</td>
                        <td className="admin-td-right">
                          <strong>{formatStorePrice(row.balance)}</strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {trialBalance.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ textAlign: "right" }}>
                        <strong>{mn ? "Нийт" : "Total"}</strong>
                      </td>
                      <td className="admin-td-right">
                        <strong>{formatStorePrice(totalDebit)}</strong>
                      </td>
                      <td className="admin-td-right">
                        <strong>{formatStorePrice(totalCredit)}</strong>
                      </td>
                      <td className="admin-td-right">
                        <strong>{formatStorePrice(totalDebit - totalCredit)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>
                  <WalletCards size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                  {mn ? "Дансны заавар" : "Chart of accounts"}
                </h2>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Код" : "Code"}</th>
                    <th>{mn ? "Нэр" : "Name"}</th>
                    <th>{mn ? "Төрөл" : "Type"}</th>
                  </tr>
                </thead>
                <tbody>
                  {(chartOfAccounts as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="admin-table-empty">
                        {mn ? "Дансны заавар байхгүй байна." : "No accounts yet."}
                      </td>
                    </tr>
                  ) : (
                    (chartOfAccounts as any[]).map((account) => (
                      <tr key={account.code}>
                        <td>
                          <small>
                            <strong>{account.code}</strong>
                          </small>
                        </td>
                        <td>{mn ? account.name : account.nameEn}</td>
                        <td>{account.type}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
