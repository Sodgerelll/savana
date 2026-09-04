/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlertTriangle, CheckCircle2, HelpCircle, Search, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { TRANSFERS_COLLECTION } from "../../services/transferService";
import type { Transfer } from "../../types/crm";
import type { AdminCtx } from "./adminShellTypes";
import type { CrmPaymentRecord } from "../../lib/crmPayments";
import type { CustomerTransactionRecord } from "../../lib/customerTransactions";
import type { DirectSaleRecord } from "../../lib/directSales";
import type { SaleRecord } from "../../lib/sales";
import { getSaleCustomerName } from "./adminHelpers";
import { ACCOUNT_CODES } from "../../lib/accounting/chartOfAccounts";
import { journalWindowStart } from "../../lib/accounting/journalQueries";

type ReconStatus = "ok" | "missing" | "mismatch";

interface ReconRow {
  id: string;
  sourceType: "order" | "sale" | "directSale" | "customerTransaction" | "payment" | "transfer";
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
  transfer: { mn: "Бөөний шилжүүлэг", en: "Wholesale transfer" },
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

  // Wholesale transfers are not part of the admin shell's context, so this page subscribes
  // to them itself. They used to be excluded from reconciliation altogether, which left
  // every transfer's ledger entry unchecked.
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  useEffect(
    () =>
      onSnapshot(collection(db, TRANSFERS_COLLECTION), (snapshot) => {
        setTransfers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Transfer));
      }),
    [],
  );

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
      const expected = Number(order.totals?.grandTotal ?? 0) - Number(order.totals?.vatAmount ?? 0);
      const entries = entriesBySource.get(`order:${order.id}`) ?? [];
      // Delivery is credited to its own account now, so the two revenue lines are netted
      // together against the same expected figure — entries posted before the split have
      // no 4400 line and still add up.
      const actual =
        netOnAccount(entries, ACCOUNT_CODES.REVENUE_ONLINE, "credit") +
        netOnAccount(entries, ACCOUNT_CODES.REVENUE_SHIPPING, "credit");
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

    // 2. Settled offline sales → revenue must equal grandTotal net of НӨАТ, since any VAT
    // the sale carries is credited to 2410 instead. Sales post to 4300, but sales migrated
    // out of the old manual-order flow carry their original 4100 entry, so both revenue
    // accounts are netted together.
    for (const sale of (sales as SaleRecord[]) ?? []) {
      if (sale.status === "new") continue;
      const entries = entriesBySource.get(`sale:${sale.id}`) ?? [];
      const actual =
        netOnAccount(entries, ACCOUNT_CODES.REVENUE_DIRECT, "credit") +
        netOnAccount(entries, ACCOUNT_CODES.REVENUE_ONLINE, "credit") +
        netOnAccount(entries, ACCOUNT_CODES.REVENUE_SHIPPING, "credit");
      const expected = sale.totals.grandTotal - (sale.totals.vatAmount ?? 0);
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
      const expected = sale.lineTotal - (sale.vatAmount ?? 0);
      result.push({
        id: `sale-${sale.id}`,
        sourceType: "directSale",
        number: sale.saleNumber,
        name: sale.productName,
        date: sale.createdAt,
        expected,
        actual,
        entryCount: entries.length,
        status: statusFor(expected, actual, entries.length),
      });
    }

    // 4. Seller transactions → wholesale revenue 4200 credit (or returns 4910 debit) must equal grandTotal.
    for (const tx of (customerTransactions as CustomerTransactionRecord[]) ?? []) {
      const entries = entriesBySource.get(`customerTransaction:${tx.id}`) ?? [];
      // A "sale" record settles goods billed on an earlier delivery: it credits AR for the
      // cash received plus the discount allowed, and books no revenue of its own.
      if (tx.type === "sale") {
        const settled = Math.round((tx.totals.discount ?? 0) + (tx.payment?.paidAmount ?? 0));
        if (settled === 0) continue; // nothing paid or allowed — no ledger entry to check
        const arCredited = netOnAccount(entries, ACCOUNT_CODES.AR, "credit");
        result.push({
          id: `tx-${tx.id}`,
          sourceType: "customerTransaction",
          number: tx.txNumber,
          name: `${tx.customerSnapshot.name}${mn ? " (борлуулалт)" : " (sale)"}`,
          date: tx.transactionDate ?? tx.createdAt,
          expected: settled,
          actual: arCredited,
          entryCount: entries.length,
          status: statusFor(settled, arCredited, entries.length),
        });
        continue;
      }
      const isReturn = tx.type === "return";
      const actual = isReturn
        ? netOnAccount(entries, ACCOUNT_CODES.SALES_RETURNS, "debit")
        : netOnAccount(entries, ACCOUNT_CODES.REVENUE_WHOLESALE, "credit");
      const expected = tx.totals.grandTotal - (tx.totals.vatAmount ?? 0);
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
      // Money taken at confirmation is booked by the transfer's own entry, checked above.
      if (payment.settledWithTransfer) continue;
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

    // 6. Wholesale transfers → a sale credits wholesale revenue 4200 with the subtotal
    // (any tax goes to 2410 separately); a return debits sales returns 4910 with its total.
    // Cancelled transfers keep their entry plus a mirror reversal, so both net to zero.
    for (const transfer of transfers) {
      if (transfer.status === "DRAFT") continue;
      const entries = entriesBySource.get(`transfer:${transfer.id}`) ?? [];
      const isReturn = transfer.type === "RETURN";
      const cancelled = transfer.status === "CANCELLED";
      const actual = isReturn
        ? netOnAccount(entries, ACCOUNT_CODES.SALES_RETURNS, "debit")
        : netOnAccount(entries, ACCOUNT_CODES.REVENUE_WHOLESALE, "credit");
      // Both directions are measured net of tax: a sale credits wholesale revenue with its
      // subtotal, and a return debits sales returns with the same figure — the НӨАТ on
      // either goes to 2410 on its own line.
      const expected = cancelled ? 0 : transfer.subtotal;
      result.push({
        id: `transfer-${transfer.id}`,
        sourceType: "transfer",
        number: transfer.transferNumber,
        name: `${transfer.customerName}${isReturn ? (mn ? " (буцаалт)" : " (return)") : ""}`,
        date: transfer.deliveredAt?.toDate?.().toISOString() ?? transfer.createdAt?.toDate?.().toISOString() ?? null,
        expected,
        actual,
        entryCount: entries.length,
        status: statusFor(expected, actual, entries.length),
      });
    }

    // The ledger is subscribed to over a rolling window, so a document older than that
    // window has no entries loaded to match against and would be reported as missing a
    // posting it does in fact have.
    const windowStart = journalWindowStart();
    return result
      .filter((row) => !row.date || String(row.date).slice(0, 10) >= windowStart)
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  }, [orders, sales, directSales, customerTransactions, crmPayments, transfers, entriesBySource, mn]);

  // Journal entries whose source document is no longer visible (e.g. a deleted
  // seller transaction). Not automatically an error — deletions keep their
  // ledger trail on purpose — but worth surfacing.
  const orphanEntries = useMemo(() => {
    const knownIds = new Set<string>();
    for (const order of (orders as any[]) ?? []) knownIds.add(`order:${order.id}`);
    for (const sale of (sales as SaleRecord[]) ?? []) knownIds.add(`sale:${sale.id}`);
    for (const sale of (directSales as DirectSaleRecord[]) ?? []) knownIds.add(`directSale:${sale.id}`);
    for (const tx of (customerTransactions as CustomerTransactionRecord[]) ?? []) knownIds.add(`customerTransaction:${tx.id}`);
    for (const transfer of transfers) knownIds.add(`transfer:${transfer.id}`);
    for (const payment of (crmPayments as CrmPaymentRecord[]) ?? []) knownIds.add(`payment:${payment.id}`);
    const checkedTypes = new Set(["order", "sale", "directSale", "customerTransaction", "payment", "transfer"]);
    return ((journalEntries as any[]) ?? []).filter(
      (entry) => checkedTypes.has(entry.sourceType) && !knownIds.has(`${entry.sourceType}:${entry.sourceId}`),
    );
  }, [journalEntries, orders, sales, directSales, customerTransactions, crmPayments, transfers]);

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
