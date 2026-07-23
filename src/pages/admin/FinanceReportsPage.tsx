/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronLeft, ChevronRight, LineChart, PieChart, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import type { FinanceEntryRecord } from "../../lib/financeEntries";
import type { FinanceWeeklyKpiRecord } from "../../lib/financeKpis";

const MONTH_NAMES_MN = [
  "1-р сар", "2-р сар", "3-р сар", "4-р сар", "5-р сар", "6-р сар",
  "7-р сар", "8-р сар", "9-р сар", "10-р сар", "11-р сар", "12-р сар",
];
const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

export default function FinanceReportsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    financeEntries,
    financeWeeklyKpis,
    saveWeeklyKpi,
    orders,
    directSales,
    language,
    formatStorePrice,
    setActiveSection,
  } = ctx;

  const mn = language === "MN";
  const monthNames = mn ? MONTH_NAMES_MN : MONTH_NAMES_EN;
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const yearPrefix = `${viewYear}-`;

  const yearEntries = useMemo(
    () => (financeEntries as FinanceEntryRecord[]).filter((e) => e.date.startsWith(yearPrefix)),
    [financeEntries, yearPrefix],
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

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">Finance</p>
          <h1>{mn ? "Санхүүгийн тайлан" : "Financial reports"}</h1>
          <p>
            {mn
              ? "Захирлын түвшний хяналтын самбар: P&L, мөнгөн урсгал, зардлын задаргаа, KPI хяналт."
              : "Director-level dashboard: P&L, cashflow, expense breakdown, and KPI monitoring."}
          </p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-outline" onClick={() => setActiveSection("financeOverview")}>
            {mn ? "Гүйлгээ бүртгэх" : "Record entries"}
          </button>
        </div>
      </div>

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
                ? "Алдагдалтай сарууд улаанаар, ашигтай нь ногооноор тодорно."
                : "Loss months are highlighted red; profitable months green."}
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

      {/* 5. Expense breakdown */}
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

      {/* 6. Weekly KPI monitor */}
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
  );
}
