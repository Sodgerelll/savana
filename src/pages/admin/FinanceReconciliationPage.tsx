/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlertTriangle, CheckCircle2, HelpCircle, Search, X, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import type { CrmPaymentRecord } from "../../lib/crmPayments";
import type { CustomerTransactionRecord } from "../../lib/customerTransactions";
import type { DirectSaleRecord } from "../../lib/directSales";
import type { SaleRecord } from "../../lib/sales";
import { getSaleCustomerName } from "./adminHelpers";
import { ACCOUNT_CODES } from "../../lib/accounting/chartOfAccounts";

type ReconStatus = "ok" | "missing" | "mismatch";

interface ReconRow {
  id: string;
  sourceType: "order" | "sale" | "directSale" | "customerTransaction" | "payment";
  number: string;
  name: string;
  date: string | null;
  /** What the source document says the ledger should contain. */
  expected: number;
  /** What the ledger actually contains (net across originals, reversals, re-posts). */
  actual: number;
  entryCount: number;
  status: ReconStatus;
}

const SOURCE_LABELS: Record<ReconRow["sourceType"], { mn: string; en: string }> = {
  order: { mn: "Онлайн захиалга", en: "Online order" },
  sale: { mn: "Борлуулалт", en: "Sale" },
  directSale: { mn: "Шууд борлуулалт", en: "Direct sale" },
  customerTransaction: { mn: "Борлуулагчийн гүйлгээ", en: "Seller transaction" },
  payment: { mn: "Авлагын төлбөр", en: "AR payment" },
};

/** Net movement (credit − debit, or debit − credit) on one account across a set of entries. */
function netOnAccount(entries: any[], accountCode: string, direction: "credit" | "debit"): number {
  let net = 0;
  for (const entry of entries) {
    for (const line of entry.lines ?? []) {
      if (line.accountCode !== accountCode) continue;
      net += direction === "credit" ? line.credit - line.debit : line.debit - line.credit;
    }
  }
  return net;
}

function statusFor(expected: number, actual: number, entryCount: number): ReconStatus {
  if (entryCount === 0) return "missing";
  return expected === actual ? "ok" : "mismatch";
}

export default function FinanceReconciliationPage({ ctx }: { ctx: AdminCtx }) {
  const {
    // The raw order collection: legacy hand-registered orders still carry ledger entries
    // under sourceType "order", so excluding them here would report them as orphans.
    allOrders: orders,
    sales,
    customerTransactions,
    directSales,
    crmPayments,
    journalEntries,
    language,
    formatStorePrice,
    formatAdminDateTime,
  } = ctx;

  const mn = language === "MN";
  const [statusFilter, setStatusFilter] = useState<string>("problems");
  const [search, setSearch] = useState("");

  // Group every journal entry by its source document. Reversals and re-posted
  // entries share the same sourceId, so summing nets the whole chain.
  const entriesBySource = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const entry of (journalEntries as any[]) ?? []) {
      const key = `${entry.sourceType}:${entry.sourceId}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  }, [journalEntries]);

  const rows = useMemo<ReconRow[]>(() => {
    const result: ReconRow[] = [];

    // 1. Settled online orders → revenue 4100 credit must equal grandTotal.
    for (const order of (orders as any[]) ?? []) {
      if (order.payment?.status !== "paid") continue;
      const expected = Number(order.totals?.grandTotal ?? 0);
      const entries = entriesBySource.get(`order:${order.id}`) ?? [];
      const actual = netOnAccount(entries, ACCOUNT_CODES.REVENUE_ONLINE, "credit");
      result.push({
        id: `order-${order.id}`,
        sourceType: "order",
        number: `#${order.orderNumber}`,
        name: order.customer?.fullName || order.customer?.phoneNumber || (mn ? "Зочин" : "Guest"),
        date: order.payment?.paidAt ?? order.createdAt ?? null,
        expected,
        actual,
        entryCount: entries.length,
        status: statusFor(expected, actual, entries.length),
      });
    }

    // 2. Settled offline sales → revenue must equal grandTotal. Sales post to 4300, but
    // sales migrated out of the old manual-order flow carry their original 4100 entry,
    // so both revenue accounts are netted together.
    for (const sale of (sales as SaleRecord[]) ?? []) {
      if (sale.status === "new") continue;
      const entries = entriesBySource.get(`sale:${sale.id}`) ?? [];
      const actual =
        netOnAccount(entries, ACCOUNT_CODES.REVENUE_DIRECT, "credit") +
        netOnAccount(entries, ACCOUNT_CODES.REVENUE_ONLINE, "credit");
      const expected = sale.totals.grandTotal;
      result.push({
        id: `offlineSale-${sale.id}`,
        sourceType: "sale",
        number: sale.saleNumber,
        name: getSaleCustomerName(sale) || (mn ? "Нэргүй" : "Unnamed"),
        date: sale.paidAt ?? sale.createdAt,
        expected,
        actual,
        entryCount: entries.length,
        status: statusFor(expected, actual, entries.length),
      });
    }

    // 3. Direct/POS sales → revenue 4300 credit must equal lineTotal.
    for (const sale of (directSales as DirectSaleRecord[]) ?? []) {
      const entries = entriesBySource.get(`directSale:${sale.id}`) ?? [];
      const actual = netOnAccount(entries, ACCOUNT_CODES.REVENUE_DIRECT, "credit");
      result.push({
        id: `sale-${sale.id}`,
        sourceType: "directSale",
        number: sale.saleNumber,
        name: sale.productName,
        date: sale.createdAt,
        expected: sale.lineTotal,
        actual,
        entryCount: entries.length,
        status: statusFor(sale.lineTotal, actual, entries.length),
      });
    }

    // 4. Seller transactions → wholesale revenue 4200 credit (or returns 4910 debit) must equal grandTotal.
    for (const tx of (customerTransactions as CustomerTransactionRecord[]) ?? []) {
      const entries = entriesBySource.get(`customerTransaction:${tx.id}`) ?? [];
      const isReturn = tx.type === "return";
      const actual = isReturn
        ? netOnAccount(entries, ACCOUNT_CODES.SALES_RETURNS, "debit")
        : netOnAccount(entries, ACCOUNT_CODES.REVENUE_WHOLESALE, "credit");
      const expected = tx.totals.grandTotal;
      result.push({
        id: `tx-${tx.id}`,
        sourceType: "customerTransaction",
        number: tx.txNumber,
        name: `${tx.customerSnapshot.name}${isReturn ? (mn ? " (буцаалт)" : " (return)") : ""}`,
        date: tx.transactionDate ?? tx.createdAt,
        expected,
        actual,
        entryCount: entries.length,
        status: statusFor(expected, actual, entries.length),
      });
    }

    // 5. AR payments → AR 1110 credit must equal the payment amount.
    for (const payment of (crmPayments as CrmPaymentRecord[]) ?? []) {
      const entries = entriesBySource.get(`payment:${payment.id}`) ?? [];
      const actual = netOnAccount(entries, ACCOUNT_CODES.AR, "credit");
      result.push({
        id: `payment-${payment.id}`,
        sourceType: "payment",
        number: payment.referenceNumber || payment.id.slice(0, 8).toUpperCase(),
        name: payment.customerName,
        date: payment.paidAt,
        expected: payment.amount,
        actual,
        entryCount: entries.length,
        status: statusFor(payment.amount, actual, entries.length),
      });
    }

    return result.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  }, [orders, sales, directSales, customerTransactions, crmPayments, entriesBySource, mn]);

  // Journal entries whose source document is no longer visible (e.g. a deleted
  // seller transaction). Not automatically an error — deletions keep their
  // ledger trail on purpose — but worth surfacing.
  const orphanEntries = useMemo(() => {
    const knownIds = new Set<string>();
    for (const order of (orders as any[]) ?? []) knownIds.add(`order:${order.id}`);
    for (const sale of (sales as SaleRecord[]) ?? []) knownIds.add(`sale:${sale.id}`);
    for (const sale of (directSales as DirectSaleRecord[]) ?? []) knownIds.add(`directSale:${sale.id}`);
    for (const tx of (customerTransactions as CustomerTransactionRecord[]) ?? []) knownIds.add(`customerTransaction:${tx.id}`);
    for (const payment of (crmPayments as CrmPaymentRecord[]) ?? []) knownIds.add(`payment:${payment.id}`);
    const checkedTypes = new Set(["order", "sale", "directSale", "customerTransaction", "payment"]);
    return ((journalEntries as any[]) ?? []).filter(
      (entry) => checkedTypes.has(entry.sourceType) && !knownIds.has(`${entry.sourceType}:${entry.sourceId}`),
    );
  }, [journalEntries, orders, sales, directSales, customerTransactions, crmPayments]);

  const okCount = rows.filter((r) => r.status === "ok").length;
  const missingRows = rows.filter((r) => r.status === "missing");
  const mismatchRows = rows.filter((r) => r.status === "mismatch");
  const mismatchDiff = mismatchRows.reduce((sum, r) => sum + (r.expected - r.actual), 0);
  const missingTotal = missingRows.reduce((sum, r) => sum + r.expected, 0);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter === "problems" && row.status === "ok") return false;
      if (statusFilter === "ok" && row.status !== "ok") return false;
      if (statusFilter === "missing" && row.status !== "missing") return false;
      if (statusFilter === "mismatch" && row.status !== "mismatch") return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return row.number.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
    });
  }, [rows, statusFilter, search]);

  const statusBadge = (status: ReconStatus) => {
    if (status === "ok") {
      return (
        <span className="finance-type-badge finance-type-income">
          <CheckCircle2 size={13} />
          {mn ? "Тохирсон" : "Matched"}
        </span>
      );
    }
    if (status === "missing") {
      return (
        <span className="finance-type-badge finance-type-expense">
          <XCircle size={13} />
          {mn ? "Бичилт алга" : "No entry"}
        </span>
      );
    }
    return (
      <span className="finance-type-badge finance-type-expense">
        <AlertTriangle size={13} />
        {mn ? "Зөрүүтэй" : "Mismatch"}
      </span>
    );
  };

  const sourceLabel = (type: ReconRow["sourceType"]) => (mn ? SOURCE_LABELS[type].mn : SOURCE_LABELS[type].en);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">Finance</p>
          <h1>{mn ? "Тулгалт (Reconciliation)" : "Reconciliation"}</h1>
          <p>
            {mn
              ? "Захиалга, борлуулалт, төлбөрийн баримт бүрийг журналын бичилттэй тулгаж, дутуу болон зөрүүтэй бичилтийг илрүүлнэ."
              : "Cross-checks every order, sale, and payment document against its journal entries and flags missing or mismatched postings."}
          </p>
        </div>
      </div>

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span><CheckCircle2 size={14} /> {mn ? "Тохирсон" : "Matched"}</span>
          <strong className="finance-amount-income">{okCount} / {rows.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span><XCircle size={14} /> {mn ? "Бичилт алга" : "Missing entries"}</span>
          <strong className={missingRows.length > 0 ? "finance-amount-expense" : ""}>
            {missingRows.length} ш · {formatStorePrice(missingTotal)}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span><AlertTriangle size={14} /> {mn ? "Зөрүүтэй" : "Mismatched"}</span>
          <strong className={mismatchRows.length > 0 ? "finance-amount-expense" : ""}>
            {mismatchRows.length} ш · {formatStorePrice(mismatchDiff)}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span><HelpCircle size={14} /> {mn ? "Эх баримтгүй бичилт" : "Orphan entries"}</span>
          <strong>{orphanEntries.length}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-search">
          <Search size={16} className="admin-filter-search-icon" />
          <input
            type="text"
            placeholder={mn ? "Дугаар, нэрээр хайх..." : "Search by number, name..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="admin-search-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="problems">{mn ? "Зөвхөн асуудалтай" : "Problems only"}</option>
          <option value="all">{mn ? "Бүгд" : "All"}</option>
          <option value="ok">{mn ? "Тохирсон" : "Matched"}</option>
          <option value="missing">{mn ? "Бичилт алга" : "Missing"}</option>
          <option value="mismatch">{mn ? "Зөрүүтэй" : "Mismatched"}</option>
        </select>
        <div className="admin-filter-meta">
          {search && (
            <button type="button" className="admin-filter-clear" onClick={() => setSearch("")}>
              <X size={14} />
              {mn ? "Цэвэрлэх" : "Clear"}
            </button>
          )}
          <span className="admin-filter-count">
            {visibleRows.length} / {rows.length} {mn ? "баримт" : "documents"}
          </span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{mn ? "Баримт ↔ журналын тулгалт" : "Document ↔ journal matching"}</h2>
            <p>
              {mn
                ? "Хүлээгдэж буй дүн = эх баримтын дүн. Бодит дүн = журналын цэвэр дүн (цуцлалт, дахин бичилтийг нэгтгэсэн)."
                : "Expected = source document amount. Actual = net ledger amount (reversals and re-posts included)."}
            </p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{mn ? "Төлөв" : "Status"}</th>
                <th>{mn ? "Дугаар" : "Number"}</th>
                <th>{mn ? "Эх үүсвэр" : "Source"}</th>
                <th>{mn ? "Нэр" : "Name"}</th>
                <th>{mn ? "Огноо" : "Date"}</th>
                <th className="admin-th-right">{mn ? "Хүлээгдэж буй" : "Expected"}</th>
                <th className="admin-th-right">{mn ? "Бодит (журнал)" : "Actual (ledger)"}</th>
                <th className="admin-th-right">{mn ? "Зөрүү" : "Diff"}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-table-empty">
                    {statusFilter === "problems"
                      ? mn ? "Асуудалтай баримт алга — бүгд тохирч байна. ✓" : "No problems found — everything matches. ✓"
                      : mn ? "Баримт олдсонгүй." : "No documents found."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const diff = row.expected - row.actual;
                  return (
                    <tr key={row.id} className={row.status !== "ok" ? "finance-row-loss" : ""}>
                      <td>{statusBadge(row.status)}</td>
                      <td><strong>{row.number}</strong></td>
                      <td>{sourceLabel(row.sourceType)}</td>
                      <td className="admin-table-cell-wrap">{row.name}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {row.date ? formatAdminDateTime(row.date, language) : "—"}
                      </td>
                      <td className="admin-td-right">{formatStorePrice(row.expected)}</td>
                      <td className="admin-td-right">
                        {row.entryCount === 0 ? "—" : formatStorePrice(row.actual)}
                      </td>
                      <td className={`admin-td-right ${diff !== 0 ? "finance-amount-expense" : ""}`}>
                        {diff === 0 ? "—" : <strong>{formatStorePrice(diff)}</strong>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {orphanEntries.length > 0 && (
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div>
              <h2>{mn ? "Эх баримтгүй журналын бичилт" : "Journal entries without a source document"}</h2>
              <p>
                {mn
                  ? "Эх баримт нь устгагдсан бичилтүүд. Санхүүгийн ул мөр хадгалагдах ёстой тул энэ нь алдаа биш, харин шалгаж баталгаажуулах жагсаалт."
                  : "Entries whose source document was deleted. The ledger keeps its trail on purpose — review rather than error."}
              </p>
            </div>
          </div>
          <div className="admin-data-table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>{mn ? "Дугаар" : "Number"}</th>
                  <th>{mn ? "Огноо" : "Date"}</th>
                  <th>{mn ? "Эх үүсвэр" : "Source"}</th>
                  <th>{mn ? "Тайлбар" : "Description"}</th>
                  <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
                </tr>
              </thead>
              <tbody>
                {orphanEntries.map((entry: any) => (
                  <tr key={entry.id}>
                    <td><small><strong>{entry.entryNumber}</strong></small></td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatAdminDateTime(entry.date, language)}</td>
                    <td>{sourceLabel(entry.sourceType as ReconRow["sourceType"])}</td>
                    <td className="admin-table-cell-wrap">{entry.description}</td>
                    <td className="admin-td-right">{formatStorePrice(entry.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
