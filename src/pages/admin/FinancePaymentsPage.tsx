/* eslint-disable @typescript-eslint/no-explicit-any */
import { Banknote, ChevronLeft, ChevronRight, Clock, CreditCard, Search, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import type { CrmPaymentRecord } from "../../lib/crmPayments";
import type { CustomerTransactionRecord } from "../../lib/customerTransactions";
import type { DirectSaleRecord } from "../../lib/directSales";

type MethodKey = "cash" | "bank" | "clearing";

interface PaymentEvent {
  id: string;
  /** Business date, ISO string. */
  date: string;
  source: "order" | "payment" | "customerTransaction" | "directSale";
  number: string;
  counterparty: string;
  amount: number;
  methodKey: MethodKey;
  methodLabel: string;
  note: string;
}

const SOURCE_LABELS: Record<PaymentEvent["source"], { mn: string; en: string }> = {
  order: { mn: "Онлайн захиалга", en: "Online order" },
  payment: { mn: "Авлагын төлбөр", en: "AR payment" },
  customerTransaction: { mn: "Борлуулагчийн гүйлгээ", en: "Seller transaction" },
  directSale: { mn: "Шууд борлуулалт", en: "Direct sale" },
};

const METHOD_LABELS: Record<MethodKey, { mn: string; en: string }> = {
  cash: { mn: "Бэлэн", en: "Cash" },
  bank: { mn: "Банк", en: "Bank" },
  clearing: { mn: "QPay/Bonum", en: "QPay/Bonum" },
};

function methodKeyFor(method: string | null | undefined): MethodKey {
  switch (method) {
    case "CASH":
    case "cash":
      return "cash";
    case "BANK_TRANSFER":
    case "bank":
      return "bank";
    case "QPAY":
    case "SOCIALPAY":
    case "qpay":
    case "bonum":
      return "clearing";
    default:
      return "cash";
  }
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function FinancePaymentsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    orders,
    customerTransactions,
    directSales,
    crmPayments,
    language,
    formatStorePrice,
    formatAdminDateTime,
  } = ctx;

  const mn = language === "MN";
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const monthPrefix = monthKey(new Date(viewYear, viewMonth, 1));
  const todayPrefix = new Date().toISOString().slice(0, 10);

  const goToMonth = (offset: number) => {
    const next = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  // ── Unified money-in stream across every sales channel ──
  const allEvents = useMemo<PaymentEvent[]>(() => {
    const events: PaymentEvent[] = [];

    for (const order of (orders as any[]) ?? []) {
      if (order.payment?.status !== "paid") continue;
      const date = order.payment?.paidAt ?? order.updatedAt ?? order.createdAt;
      if (!date) continue;
      events.push({
        id: `order-${order.id}`,
        date,
        source: "order",
        number: String(order.orderNumber ?? order.id),
        counterparty: order.customer?.fullName || order.customer?.phoneNumber || (mn ? "Зочин" : "Guest"),
        amount: Number(order.payment?.amount ?? order.totals?.grandTotal ?? 0),
        methodKey: "clearing",
        methodLabel: order.payment?.paymentVendor ? String(order.payment.paymentVendor) : "Bonum",
        note: "",
      });
    }

    for (const payment of (crmPayments as CrmPaymentRecord[]) ?? []) {
      if (!payment.paidAt) continue;
      const key = methodKeyFor(payment.method);
      events.push({
        id: `payment-${payment.id}`,
        date: payment.paidAt,
        source: "payment",
        number: payment.referenceNumber || payment.id.slice(0, 8).toUpperCase(),
        counterparty: payment.customerName,
        amount: payment.amount,
        methodKey: key,
        methodLabel: mn ? METHOD_LABELS[key].mn : METHOD_LABELS[key].en,
        note: payment.notes,
      });
    }

    for (const tx of (customerTransactions as CustomerTransactionRecord[]) ?? []) {
      if (tx.type === "return" || tx.payment.paidAmount <= 0) continue;
      const date = tx.payment.paidAt ?? tx.transactionDate ?? tx.createdAt;
      if (!date) continue;
      const key = methodKeyFor(tx.payment.method);
      events.push({
        id: `tx-${tx.id}`,
        date,
        source: "customerTransaction",
        number: tx.txNumber,
        counterparty: tx.customerSnapshot.name,
        amount: tx.payment.paidAmount,
        methodKey: key,
        methodLabel: mn ? METHOD_LABELS[key].mn : METHOD_LABELS[key].en,
        note: tx.note,
      });
    }

    for (const sale of (directSales as DirectSaleRecord[]) ?? []) {
      if (!sale.createdAt) continue;
      events.push({
        id: `sale-${sale.id}`,
        date: sale.createdAt,
        source: "directSale",
        number: sale.saleNumber,
        counterparty: sale.productName,
        amount: sale.lineTotal,
        methodKey: "cash",
        methodLabel: mn ? METHOD_LABELS.cash.mn : METHOD_LABELS.cash.en,
        note: sale.note,
      });
    }

    return events.sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, crmPayments, customerTransactions, directSales, mn]);

  const monthEvents = useMemo(
    () => allEvents.filter((e) => e.date.startsWith(monthPrefix)),
    [allEvents, monthPrefix],
  );

  const filteredEvents = useMemo(() => {
    return monthEvents.filter((e) => {
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (methodFilter !== "all" && e.methodKey !== methodFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        e.number.toLowerCase().includes(q) ||
        e.counterparty.toLowerCase().includes(q) ||
        e.note.toLowerCase().includes(q)
      );
    });
  }, [monthEvents, sourceFilter, methodFilter, search]);

  const monthTotal = monthEvents.reduce((sum, e) => sum + e.amount, 0);
  const todayTotal = useMemo(
    () => allEvents.filter((e) => e.date.startsWith(todayPrefix)).reduce((sum, e) => sum + e.amount, 0),
    [allEvents, todayPrefix],
  );
  const methodTotals = useMemo(() => {
    const totals: Record<MethodKey, number> = { cash: 0, bank: 0, clearing: 0 };
    for (const e of monthEvents) totals[e.methodKey] += e.amount;
    return totals;
  }, [monthEvents]);

  // ── Pending invoices: orders awaiting Bonum payment ──
  const pendingOrders = useMemo(
    () => ((orders as any[]) ?? []).filter((o) => o.status === "new" && o.payment?.status === "pending"),
    [orders],
  );
  const pendingTotal = pendingOrders.reduce((sum, o) => sum + Number(o.totals?.grandTotal ?? 0), 0);

  const filteredTotal = filteredEvents.reduce((sum, e) => sum + e.amount, 0);

  const sourceLabel = (source: PaymentEvent["source"]) =>
    mn ? SOURCE_LABELS[source].mn : SOURCE_LABELS[source].en;

  const monthNames = mn
    ? ["1-р сар", "2-р сар", "3-р сар", "4-р сар", "5-р сар", "6-р сар", "7-р сар", "8-р сар", "9-р сар", "10-р сар", "11-р сар", "12-р сар"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">Finance</p>
          <h1>{mn ? "Төлбөр" : "Payments"}</h1>
          <p>
            {mn
              ? "Бүх сувгаар орж ирсэн төлбөрийн нэгдсэн урсгал: онлайн захиалга, авлагын төлбөр, борлуулагчийн гүйлгээ, шууд борлуулалт."
              : "Unified money-in stream across all channels: online orders, AR payments, seller transactions, and direct sales."}
          </p>
        </div>
      </div>

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span><Wallet size={14} /> {mn ? "Өнөөдөр орсон" : "Received today"}</span>
          <strong className="finance-amount-income">{formatStorePrice(todayTotal)}</strong>
        </div>
        <div className="admin-summary-card">
          <span><Banknote size={14} /> {mn ? "Энэ сард орсон" : "Received this month"}</span>
          <strong className="finance-amount-income">{formatStorePrice(monthTotal)}</strong>
        </div>
        <div className="admin-summary-card">
          <span><Clock size={14} /> {mn ? "Хүлээгдэж буй нэхэмжлэх" : "Pending invoices"}</span>
          <strong className={pendingOrders.length > 0 ? "finance-amount-expense" : ""}>
            {pendingOrders.length} ш · {formatStorePrice(pendingTotal)}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span><CreditCard size={14} /> {mn ? "Аргаар (энэ сар)" : "By method (this month)"}</span>
          <strong style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
            {(Object.keys(methodTotals) as MethodKey[]).map((key) => (
              <span key={key} style={{ display: "block" }}>
                {mn ? METHOD_LABELS[key].mn : METHOD_LABELS[key].en}: {formatStorePrice(methodTotals[key])}
              </span>
            ))}
          </strong>
        </div>
      </div>

      {pendingOrders.length > 0 && (
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div>
              <h2>{mn ? "Хүлээгдэж буй нэхэмжлэх" : "Pending invoices"}</h2>
              <p>
                {mn
                  ? "Bonum нэхэмжлэх үүссэн ч төлбөр нь баталгаажаагүй онлайн захиалгууд."
                  : "Online orders whose Bonum invoice has not been settled yet."}
              </p>
            </div>
          </div>
          <div className="admin-data-table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>{mn ? "Захиалга" : "Order"}</th>
                  <th>{mn ? "Огноо" : "Date"}</th>
                  <th>{mn ? "Харилцагч" : "Customer"}</th>
                  <th>{mn ? "Нэхэмжлэх" : "Invoice"}</th>
                  <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((order: any) => (
                  <tr key={order.id}>
                    <td><strong>#{order.orderNumber}</strong></td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatAdminDateTime(order.createdAt, language)}</td>
                    <td>{order.customer?.fullName || order.customer?.phoneNumber || "—"}</td>
                    <td>
                      <span className="admin-table-code">
                        {order.payment?.invoiceId ? String(order.payment.invoiceId).slice(0, 12) : "—"}
                      </span>
                    </td>
                    <td className="admin-td-right">
                      <strong>{formatStorePrice(order.totals?.grandTotal ?? 0)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="finance-calendar-head">
        <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => goToMonth(-1)} title={mn ? "Өмнөх сар" : "Previous month"}>
          <ChevronLeft size={16} />
        </button>
        <h2>{viewYear} {mn ? "он" : ""} · {monthNames[viewMonth]}</h2>
        <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => goToMonth(1)} title={mn ? "Дараах сар" : "Next month"}>
          <ChevronRight size={16} />
        </button>
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
        <select className="admin-search-input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="all">{mn ? "Бүх эх үүсвэр" : "All sources"}</option>
          {(Object.keys(SOURCE_LABELS) as PaymentEvent["source"][]).map((key) => (
            <option key={key} value={key}>{sourceLabel(key)}</option>
          ))}
        </select>
        <select className="admin-search-input" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
          <option value="all">{mn ? "Бүх арга" : "All methods"}</option>
          {(Object.keys(METHOD_LABELS) as MethodKey[]).map((key) => (
            <option key={key} value={key}>{mn ? METHOD_LABELS[key].mn : METHOD_LABELS[key].en}</option>
          ))}
        </select>
        <div className="admin-filter-meta">
          {(search || sourceFilter !== "all" || methodFilter !== "all") && (
            <button
              type="button"
              className="admin-filter-clear"
              onClick={() => { setSearch(""); setSourceFilter("all"); setMethodFilter("all"); }}
            >
              <X size={14} />
              {mn ? "Цэвэрлэх" : "Clear"}
            </button>
          )}
          <span className="admin-filter-count">
            {filteredEvents.length} / {monthEvents.length} {mn ? "гүйлгээ" : "events"}
          </span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{mn ? "Орсон төлбөрүүд" : "Received payments"}</h2>
            <p>{mn ? "Сонгосон сарын бүх сувгийн орлого." : "All-channel receipts for the selected month."}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{mn ? "Огноо" : "Date"}</th>
                <th>{mn ? "Дугаар" : "Number"}</th>
                <th>{mn ? "Эх үүсвэр" : "Source"}</th>
                <th>{mn ? "Харилцагч / Бараа" : "Counterparty"}</th>
                <th>{mn ? "Арга" : "Method"}</th>
                <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    {mn ? "Энэ сард төлбөр бүртгэгдээгүй байна." : "No payments recorded for this month."}
                  </td>
                </tr>
              ) : (
                filteredEvents.map((event) => (
                  <tr key={event.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatAdminDateTime(event.date, language)}</td>
                    <td><strong>{event.number}</strong></td>
                    <td>{sourceLabel(event.source)}</td>
                    <td className="admin-table-cell-wrap">{event.counterparty || "—"}</td>
                    <td>{event.methodLabel}</td>
                    <td className="admin-td-right finance-amount-income">
                      <strong>+{formatStorePrice(event.amount)}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredEvents.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: "right" }}>
                    <strong>{mn ? "Нийт" : "Total"}</strong>
                  </td>
                  <td className="admin-td-right finance-amount-income">
                    <strong>{formatStorePrice(filteredTotal)}</strong>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}
