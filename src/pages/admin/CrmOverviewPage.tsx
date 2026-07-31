/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlertTriangle, ArrowRight, ArrowLeftRight, Users, TrendingUp, Wallet, Package, ShoppingBag } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

/* ── shared helpers ── */
const SectionLabel = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
    color, paddingBottom: 6, borderBottom: `2px solid ${color}22`, marginBottom: 10,
  }}>
    {children}
  </div>
);

const BalanceBar = ({ value, max }: { value: number; max: number }) => {
  const pct =
    max > 0
      ? value > 0
        ? Math.min(100, Math.max(1, Math.round((value / max) * 100)))
        : 0
      : value > 0
        ? 100
        : 0;
  const color = pct > 66 ? "#dc2626" : pct > 33 ? "#d97706" : "#10b981";
  return (
    <div className="crm-ov-bar">
      <div className="crm-ov-bar-track">
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: color, transition: "width .3s" }} />
      </div>
      <span className="crm-ov-bar-pct" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
};

/* ── TX type badge ── */
const TX_COLOR: Record<string, { bg: string; color: string }> = {
  delivery: { bg: "#eff6ff", color: "#2563eb" },
  sale:     { bg: "#f0fdf4", color: "#16a34a" },
  return:   { bg: "#fef2f2", color: "#dc2626" },
};

export default function CrmOverviewPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    customers,
    customerTransactions,
    orders,
    setActiveSection,
    formatStorePrice,
    formatAdminDateTime,
  } = ctx;

  const mn = language === "MN";

  /* ── dates ── */
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  /* ── customer metrics ── */
  const activeCustomers    = (customers as any[]).filter((c) => c.status === "active");
  const totalOutstanding   = (customers as any[]).reduce((s: number, c: any) => s + (c.outstandingBalance ?? 0), 0);
  const customersWithDebt  = (customers as any[])
    .filter((c) => (c.outstandingBalance ?? 0) > 0)
    .sort((a, b) => b.outstandingBalance - a.outstandingBalance);

  const topCustomers = (customers as any[])
    .filter((c) => (c.totalSales ?? 0) > 0)
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 8);

  /* ── seller money flow: transferred = received + outstanding ── */
  const totalTransferredAmount = (customers as any[]).reduce((s: number, c: any) => s + (c.totalSales ?? 0), 0);
  const totalReceivedAmount    = (customers as any[]).reduce((s: number, c: any) => s + (c.totalPaid ?? 0), 0);
  const collectionRate = totalTransferredAmount > 0
    ? Math.round((totalReceivedAmount / totalTransferredAmount) * 100)
    : 0;

  /* ── transaction metrics ── */
  const salesTx = (customerTransactions as any[]).filter((tx) => tx.type !== "return");

  const todaySales = salesTx
    .filter((tx) => (tx.transactionDate ?? tx.createdAt ?? "").startsWith(todayStr))
    .reduce((s: number, tx: any) => s + (tx.totals?.grandTotal ?? 0), 0);

  const monthSales = salesTx
    .filter((tx) => (tx.transactionDate ?? tx.createdAt ?? "").startsWith(thisMonth))
    .reduce((s: number, tx: any) => s + (tx.totals?.grandTotal ?? 0), 0);

  const remainingUnits = (customerTransactions as any[]).reduce(
    (s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + ((it.quantity ?? 0) - (it.soldQuantity ?? 0)), 0),
    0,
  );
  const transferredUnits = (customerTransactions as any[]).reduce(
    (s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + (it.quantity ?? 0), 0),
    0,
  );

  const recentTx = (customerTransactions as any[])
    .slice()
    .sort((a, b) => ((b.transactionDate ?? b.createdAt ?? "") > (a.transactionDate ?? a.createdAt ?? "") ? 1 : -1))
    .slice(0, 6);

  /* ── online orders ── */
  const paidOrders       = (orders as any[]).filter((o) => o.status === "paid");
  const deliveringOrders = (orders as any[]).filter((o) => o.status === "delivering");
  const deliveredToday   = (orders as any[]).filter(
    (o) => o.status === "delivered" && (o.updatedAt ?? o.createdAt ?? "").startsWith(todayStr),
  );
  const onlineOrdersTotal = (orders as any[]).reduce(
    (s: number, o: any) => s + (o.totals?.grandTotal ?? 0),
    0,
  );

  /* ── segments ── */
  const orgCount  = (customers as any[]).filter((c) => c.type === "organization").length;
  const indCount  = (customers as any[]).filter((c) => c.type === "individual").length;
  const segments: { label: string; count: number; color: string }[] = [
    { label: mn ? "Байгууллага" : "Organization", count: orgCount,  color: "#8b5cf6" },
    { label: mn ? "Хувь хүн"    : "Individual",   count: indCount,  color: "#3b82f6" },
  ];

  /* ── helpers ── */
  const navLink = (section: string, label: string) => (
    <button
      type="button"
      onClick={() => setActiveSection(section)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "0.35rem 0.8rem", fontSize: "0.78rem", fontWeight: 600,
        color: "var(--color-accent)", background: "rgba(90,81,3,0.07)",
        border: "1px solid rgba(90,81,3,0.18)", borderRadius: 8,
        cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit",
        transition: "background .15s",
      }}
    >
      {label} <ArrowRight size={12} />
    </button>
  );

  const kpi = (icon: React.ReactNode, label: string, value: React.ReactNode, accent?: string, sub?: string) => (
    <div className="crm-ov-kpi" style={{ border: `1.5px solid ${accent ? `${accent}33` : "rgba(183,185,167,.65)"}` }}>
      <div className="crm-ov-kpi-head">
        <span className="crm-ov-kpi-label">{label}</span>
        <span style={{ color: accent ?? "#9ca3af", opacity: 0.85, flexShrink: 0 }}>{icon}</span>
      </div>
      <strong className="crm-ov-kpi-value" style={{ color: accent ?? "var(--color-heading)" }}>
        {value}
      </strong>
      {sub && <span className="crm-ov-kpi-sub">{sub}</span>}
    </div>
  );

  const txTypeBadge = (type: string) => {
    const c = TX_COLOR[type] ?? { bg: "#f3f4f6", color: "#6b7280" };
    const label = type === "delivery" ? (mn ? "Хүргэлт" : "Delivery")
      : type === "sale" ? (mn ? "Борлуулалт" : "Sale")
      : type === "return" ? (mn ? "Буцаалт" : "Return")
      : type;
    return (
      <span style={{ display: "inline-block", flexShrink: 0, padding: "0.15rem 0.5rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap", background: c.bg, color: c.color }}>
        {label}
      </span>
    );
  };

  const orderStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      paid:       { bg: "#fef3c7", color: "#d97706", label: mn ? "Төлөгдсөн" : "Paid" },
      delivering: { bg: "#dbeafe", color: "#2563eb", label: mn ? "Хүргэлтэнд" : "Delivering" },
    };
    const s = map[status] ?? { bg: "#f3f4f6", color: "#6b7280", label: status };
    return <span className="crm-ov-order-badge" style={{ display: "inline-block", padding: "0.15rem 0.5rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap", background: s.bg, color: s.color }}>{s.label}</span>;
  };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">CRM</p>
          <h1>{mn ? "CRM overview" : "CRM overview"}</h1>
          <p>{mn ? "Харилцагч, борлуулалт, авлага, захиалгын нэгдсэн дүр зураг." : "Customer pipeline, sales, receivables, and order status at a glance."}</p>
        </div>
      </div>

      {/* ── KPI row 1: seller money flow (transferred = received + outstanding) ── */}
      <SectionLabel color="#8b5cf6">
        {mn ? "Борлуулагчийн мөнгөн урсгал" : "Seller money flow"}
      </SectionLabel>
      <div className="admin-kpi-grid" style={{ marginBottom: "1rem" }}>
        {kpi(<ArrowLeftRight size={16} />, mn ? "Борлуулагч руу шилжүүлсэн дүн" : "Transferred to sellers",
          formatStorePrice(totalTransferredAmount),
          totalTransferredAmount > 0 ? "#8b5cf6" : undefined,
          `${salesTx.length} ${mn ? "шилжүүлэг" : "transfers"} · ${transferredUnits} ш`)}
        {kpi(<Wallet size={16} />, mn ? "Нийт авсан мөнгө" : "Total received",
          formatStorePrice(totalReceivedAmount),
          totalReceivedAmount > 0 ? "#10b981" : undefined,
          mn ? `Шилжүүлсэн дүнгийн ${collectionRate}% цугласан` : `${collectionRate}% of transferred collected`)}
        {kpi(<AlertTriangle size={16} />, copy.totalOutstanding, formatStorePrice(totalOutstanding),
          totalOutstanding > 0 ? "#dc2626" : undefined,
          customersWithDebt.length > 0
            ? `${customersWithDebt.length} ${mn ? "харилцагч" : "customers"} · ${mn ? "Шилжүүлсэн − Авсан" : "Transferred − Received"}`
            : mn ? "Авлага байхгүй" : "No debt")}
      </div>

      {/* ── KPI row 2: sales activity ── */}
      <SectionLabel color="#10b981">
        {mn ? "Борлуулалтын идэвх" : "Sales activity"}
      </SectionLabel>
      <div className="admin-kpi-grid" style={{ marginBottom: "1rem" }}>
        {kpi(<TrendingUp size={16} />, copy.txTodaySales, formatStorePrice(todaySales),
          todaySales > 0 ? "#10b981" : undefined)}
        {kpi(<TrendingUp size={16} />, copy.txMonthSales, formatStorePrice(monthSales),
          monthSales > 0 ? "#10b981" : undefined,
          `${(customerTransactions as any[]).filter((tx) => (tx.transactionDate ?? tx.createdAt ?? "").startsWith(thisMonth)).length} ${mn ? "гүйлгээ" : "transactions"}`)}
        {kpi(<Package size={16} />, mn ? "Борлуулагч дахь үлдэгдэл" : "Remaining at sellers", `${remainingUnits} ш`,
          remainingUnits > 0 ? "#d97706" : undefined,
          `${mn ? "Нийт шилжүүлсэн" : "Total transferred"}: ${transferredUnits} ш`)}
      </div>

      {/* ── KPI row 3: online channel ── */}
      <SectionLabel color="#2563eb">
        {mn ? "Онлайн суваг" : "Online channel"}
      </SectionLabel>
      <div className="admin-kpi-grid" style={{ marginBottom: "1.5rem" }}>
        {kpi(<ShoppingBag size={16} />, mn ? "Онлайн захиалгын нийт дүн" : "Online orders total",
          formatStorePrice(onlineOrdersTotal),
          onlineOrdersTotal > 0 ? "#2563eb" : undefined,
          `${orders.length} ${mn ? "захиалга" : "orders"}`)}
        {kpi(<ShoppingBag size={16} />, mn ? "Онлайн захиалга хүлээгдэж буй" : "Online orders pending",
          paidOrders.length + deliveringOrders.length,
          paidOrders.length + deliveringOrders.length > 0 ? "#2563eb" : undefined,
          `${mn ? "Өнөөдөр хүргэгдсэн" : "Delivered today"}: ${deliveredToday.length}`)}
      </div>

      {/* ── Row 1: Outstanding customers + Recent transactions ── */}
      <div className="admin-two-col-grid" style={{ marginBottom: "1.25rem" }}>

        {/* Outstanding balances */}
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Wallet size={15} color={customersWithDebt.length > 0 ? "#dc2626" : "#6b7280"} />
              <div>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Авлагатай харилцагч" : "Outstanding balances"}</h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: customersWithDebt.length > 0 ? "#dc2626" : "#6b7280" }}>
                  {customersWithDebt.length > 0
                    ? `${customersWithDebt.length} ${mn ? "харилцагч · нийт" : "customers · total"} ${formatStorePrice(totalOutstanding)}`
                    : mn ? "Авлага байхгүй байна" : "No outstanding balances"}
                </p>
              </div>
            </div>
            {navLink("crmCustomers", mn ? "Харилцагч руу" : "Customers")}
          </div>

          {customersWithDebt.length === 0 ? (
            <p style={{ padding: "0.5rem 1.4rem 1rem", color: "#9ca3af", fontSize: 13 }}>
              {mn ? "Бүх харилцагчийн авлага тэглэгдсэн байна." : "All customer balances are settled."}
            </p>
          ) : (
            <div className="admin-data-table-wrap">
              <table className="admin-data-table crm-ov-table" style={{ minWidth: "unset" }}>
                <thead>
                  <tr>
                    <th>{mn ? "Харилцагч" : "Customer"}</th>
                    <th style={{ textAlign: "right" }}>{mn ? "Авлага" : "Outstanding"}</th>
                    <th style={{ textAlign: "right" }}>{mn ? "Нийт борлуулалт" : "Total sales"}</th>
                    <th className="crm-ov-col-pct">{mn ? "Авлага %" : "Unpaid %"}</th>
                  </tr>
                </thead>
                <tbody>
                  {customersWithDebt.slice(0, 8).map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <strong style={{ fontSize: "0.85rem" }}>{c.name}</strong>
                          <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                            {c.type === "organization" ? (mn ? "Байгууллага" : "Org") : (mn ? "Хувь хүн" : "Individual")}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>
                        {formatStorePrice(c.outstandingBalance)}
                      </td>
                      <td style={{ textAlign: "right", color: "#6b7280", whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                        {formatStorePrice(c.totalSales)}
                      </td>
                      <td style={{ paddingLeft: 8 }}>
                        <BalanceBar value={c.outstandingBalance} max={c.totalSales ?? 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ArrowLeftRight size={15} color="#6b7280" />
              <div>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Сүүлийн гүйлгээ" : "Recent transactions"}</h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                  {mn ? `Нийт ${customerTransactions.length} гүйлгээ` : `${customerTransactions.length} total transactions`}
                </p>
              </div>
            </div>
            {navLink("crmCustomerTransactions", mn ? "Бүгдийг харах" : "View all")}
          </div>

          {recentTx.length === 0 ? (
            <p style={{ padding: "0.5rem 1.4rem 1rem", color: "#9ca3af", fontSize: 13 }}>
              {mn ? "Гүйлгээ байхгүй байна." : "No transactions yet."}
            </p>
          ) : (
            <div className="crm-ov-card-body" style={{ gap: 6 }}>
              {recentTx.map((tx: any) => {
                const transferred = tx.items.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0);
                const sold        = tx.items.reduce((s: number, i: any) => s + (i.soldQuantity ?? 0), 0);
                const remaining   = transferred - sold;
                const c = TX_COLOR[tx.type] ?? { bg: "#f3f4f6", color: "#6b7280" };
                return (
                  <div key={tx.id} className="crm-ov-tx-row" style={{
                    background: c.bg,
                    border: `1px solid ${c.color}33`,
                  }}>
                    <div className="crm-ov-tx-main">
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, minWidth: 0 }}>
                        {txTypeBadge(tx.type)}
                        <strong style={{ fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tx.customerSnapshot?.name || "—"}
                        </strong>
                      </div>
                      <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                        {formatAdminDateTime(tx.transactionDate ?? tx.createdAt, language)}
                        {remaining > 0 && <span style={{ marginLeft: 8, color: "#d97706", fontWeight: 600 }}>· {remaining} ш {mn ? "үлдэгдэл" : "remaining"}</span>}
                      </span>
                    </div>
                    <div className="crm-ov-tx-side">
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: tx.type === "return" ? "#dc2626" : "#111827" }}>
                        {formatStorePrice(tx.totals?.grandTotal)}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: tx.payment?.status === "paid" ? "#10b981" : "#d97706" }}>
                        {tx.payment?.status === "paid" ? (mn ? "Төлөгдсөн" : "Paid") : (mn ? "Хүлээгдэж буй" : "Pending")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Top customers + Segments & Online orders ── */}
      <div className="admin-two-col-grid">

        {/* Top customers */}
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={15} color="#10b981" />
              <div>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Шилдэг харилцагч" : "Top customers"}</h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                  {mn ? "Нийт борлуулалтаар эрэмбэлсэн" : "Ranked by total sales"}
                </p>
              </div>
            </div>
            {navLink("crmCustomers", mn ? "Бүгдийг харах" : "View all")}
          </div>

          {topCustomers.length === 0 ? (
            <p style={{ padding: "0.5rem 1.4rem 1rem", color: "#9ca3af", fontSize: 13 }}>
              {mn ? "Борлуулалтын мэдээлэл байхгүй байна." : "No sales data available."}
            </p>
          ) : (
            <div className="admin-data-table-wrap">
              <table className="admin-data-table crm-ov-table" style={{ minWidth: "unset" }}>
                <thead>
                  <tr>
                    <th className="crm-ov-col-rank">#</th>
                    <th>{mn ? "Харилцагч" : "Customer"}</th>
                    <th style={{ textAlign: "right" }}>{copy.customerTotalSales}</th>
                    <th style={{ textAlign: "right" }}>{mn ? "Авлага" : "Balance"}</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((c: any, i: number) => (
                    <tr key={c.id}>
                      <td style={{ color: i < 3 ? "#d97706" : "#9ca3af", fontWeight: 700, fontSize: "0.82rem" }}>
                        {i + 1}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <strong style={{ fontSize: "0.85rem" }}>{c.name}</strong>
                          <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
                            {c.type === "organization" ? (mn ? "Байгууллага" : "Org") : (mn ? "Хувь хүн" : "Individual")}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>
                        {formatStorePrice(c.totalSales)}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: "0.82rem", color: (c.outstandingBalance ?? 0) > 0 ? "#dc2626" : "#9ca3af" }}>
                        {(c.outstandingBalance ?? 0) > 0 ? formatStorePrice(c.outstandingBalance) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right column: Segments + Online orders */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Customer segments */}
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={15} color="#6b7280" />
                <div>
                  <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Харилцагчийн бүтэц" : "Customer segments"}</h2>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                    {mn ? `Нийт ${customers.length} харилцагч` : `${customers.length} total customers`}
                  </p>
                </div>
              </div>
              {navLink("crmCustomers", mn ? "Харилцагч" : "Customers")}
            </div>
            <div className="crm-ov-card-body" style={{ gap: 10 }}>
              {segments.map((seg) => {
                const pct = customers.length > 0 ? Math.round((seg.count / customers.length) * 100) : 0;
                return (
                  <div key={seg.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "#374151" }}>{seg.label}</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: seg.color }}>{seg.count} ({pct}%)</span>
                    </div>
                    <div style={{ height: 6, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: seg.color, borderRadius: 99, transition: "width .3s" }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem", marginTop: 4 }}>
                {[
                  { label: mn ? "Идэвхтэй" : "Active",   count: activeCustomers.length,                                          color: "#10b981" },
                  { label: mn ? "Идэвхгүй" : "Inactive", count: customers.length - activeCustomers.length,                       color: "#9ca3af" },
                ].map((seg) => (
                  <div key={seg.label} style={{ padding: "0.5rem 0.65rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                    <div style={{ fontSize: "0.7rem", color: "#6b7280", marginBottom: 2 }}>{seg.label}</div>
                    <strong style={{ fontSize: "1.1rem", color: seg.color }}>{seg.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Online order pipeline */}
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingBag size={15} color="#2563eb" />
                <div>
                  <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Онлайн захиалга" : "Online orders"}</h2>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                    {mn ? `Өнөөдөр ${deliveredToday.length} захиалга хүргэгдсэн` : `${deliveredToday.length} delivered today`}
                  </p>
                </div>
              </div>
              {navLink("orders", mn ? "Захиалга руу" : "Go to orders")}
            </div>
            <div className="crm-ov-card-body" style={{ gap: "0.85rem" }}>
              {paidOrders.length > 0 && (
                <div>
                  <SectionLabel color="#d97706">
                    {mn ? "Хүргэлт хүлээж буй" : "Awaiting dispatch"} · {paidOrders.length}
                  </SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {paidOrders.slice(0, 3).map((o: any) => (
                      <div key={o.id} className="crm-ov-order-row" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                        <strong className="crm-ov-order-id">#{o.orderNumber}</strong>
                        <span className="crm-ov-order-name">
                          {o.customer?.fullName || o.customer?.phoneNumber || "—"}
                        </span>
                        <span className="crm-ov-order-amount">{formatStorePrice(o.totals?.grandTotal)}</span>
                        {orderStatusBadge(o.status)}
                      </div>
                    ))}
                    {paidOrders.length > 3 && <p style={{ fontSize: "0.72rem", color: "#9ca3af", margin: 0, textAlign: "center" }}>+{paidOrders.length - 3} {mn ? "захиалга" : "more"}</p>}
                  </div>
                </div>
              )}
              {deliveringOrders.length > 0 && (
                <div>
                  <SectionLabel color="#2563eb">
                    {mn ? "Хүргэлтэнд гарсан" : "In transit"} · {deliveringOrders.length}
                  </SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {deliveringOrders.slice(0, 3).map((o: any) => (
                      <div key={o.id} className="crm-ov-order-row" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                        <strong className="crm-ov-order-id">#{o.orderNumber}</strong>
                        <span className="crm-ov-order-name">
                          {o.customer?.fullName || o.customer?.phoneNumber || "—"}
                        </span>
                        <span className="crm-ov-order-amount">{formatStorePrice(o.totals?.grandTotal)}</span>
                        {orderStatusBadge(o.status)}
                      </div>
                    ))}
                    {deliveringOrders.length > 3 && <p style={{ fontSize: "0.72rem", color: "#9ca3af", margin: 0, textAlign: "center" }}>+{deliveringOrders.length - 3} {mn ? "захиалга" : "more"}</p>}
                  </div>
                </div>
              )}
              {paidOrders.length === 0 && deliveringOrders.length === 0 && (
                <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>
                  {mn ? "Хүлээгдэж буй захиалга байхгүй байна." : "No pending online orders."}
                </p>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
