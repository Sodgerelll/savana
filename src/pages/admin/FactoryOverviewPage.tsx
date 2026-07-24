/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlertTriangle, ArrowRight, Box, Layers, Package, Truck, Zap } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

const LOW_STOCK_THRESHOLD = 100;
const WARN_STOCK_THRESHOLD = 300;

const BATCH_STATUS_COLOR: Record<string, string> = {
  planning: "#94a3b8",
  curing:   "#8b5cf6",
  ready:    "#10b981",
};
const BATCH_STATUS_BG: Record<string, string> = {
  planning: "#f1f5f9",
  curing:   "#ede9fe",
  ready:    "#d1fae5",
};
const ORDER_STATUS_COLOR: Record<string, string> = {
  paid:       "#d97706",
  delivering: "#2563eb",
  delivered:  "#059669",
};
const ORDER_STATUS_BG: Record<string, string> = {
  paid:       "#fef3c7",
  delivering: "#dbeafe",
  delivered:  "#d1fae5",
};

/* ── sub-section divider label ── */
const SectionLabel = ({ color, children }: { color: string; children: React.ReactNode }) => (
  <div style={{
    fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
    color, paddingBottom: 6, borderBottom: `2px solid ${color}22`, marginBottom: 10,
  }}>
    {children}
  </div>
);

/* ── inline stock bar ── */
const StockBar = ({ value, max, low }: { value: number; max: number; low: boolean }) => {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 4, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", minWidth: 48 }}>
      <div style={{
        height: "100%", width: `${pct}%`, borderRadius: 99,
        background: low ? "#dc2626" : pct < 50 ? "#f59e0b" : "#10b981",
        transition: "width .3s",
      }} />
    </div>
  );
};

export default function FactoryOverviewPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    rawMaterials,
    packagingItems,
    productionBatches,
    orders,
    setActiveSection,
    getOrderStatusLabel,
    formatStorePrice,
  } = ctx;

  const mn = language === "MN";

  /* ── dates ── */
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  /* ── production ── */
  const planningBatches = (productionBatches as any[]).filter((b) => b.status === "planning");
  const curingBatches   = (productionBatches as any[]).filter((b) => b.status === "curing");
  const readyBatches    = (productionBatches as any[]).filter((b) => b.status === "ready");

  const unitsThisMonth = readyBatches
    .filter((b) => b.readyAt?.startsWith(thisMonth))
    .reduce((s: number, b: any) => s + (b.actualQuantity ?? 0), 0);

  const activeBatches = [...curingBatches, ...planningBatches].sort((a: any, b: any) => {
    if (a.status !== b.status) return a.status === "curing" ? -1 : 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  /* ── stock ── */
  const rawSorted     = (rawMaterials as any[]).slice().sort((a, b) => a.remaining - b.remaining);
  const rawMax        = rawSorted.length > 0 ? Math.max(...rawSorted.map((r: any) => r.remaining)) : 1;
  const lowRaw        = rawSorted.filter((r: any) => r.remaining < LOW_STOCK_THRESHOLD);
  const pkgSorted     = (packagingItems as any[]).slice().sort((a, b) => a.remaining - b.remaining);
  const pkgMax        = pkgSorted.length > 0 ? Math.max(...pkgSorted.map((p: any) => p.remaining)) : 1;
  const lowPkg        = pkgSorted.filter((p: any) => p.remaining < LOW_STOCK_THRESHOLD);
  const totalAlerts   = lowRaw.length + lowPkg.length;

  /* ── orders ── */
  const paidOrders       = (orders as any[]).filter((o) => o.status === "paid");
  const deliveringOrders = (orders as any[]).filter((o) => o.status === "delivering");
  const deliveredToday   = (orders as any[]).filter(
    (o) => o.status === "delivered" && (o.updatedAt ?? o.createdAt ?? "").startsWith(today),
  );

  /* ── output per product ── */
  const outputByProduct = new Map<number, { name: string; total: number; batches: number }>();
  readyBatches.forEach((b: any) => {
    const e = outputByProduct.get(b.productId);
    if (e) { e.total += b.actualQuantity ?? 0; e.batches++; }
    else outputByProduct.set(b.productId, { name: b.productName, total: b.actualQuantity ?? 0, batches: 1 });
  });
  const outputRows = Array.from(outputByProduct.values()).sort((a, b) => b.total - a.total);

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
        transition: "background .15s, border-color .15s",
      }}
    >
      {label} <ArrowRight size={12} />
    </button>
  );

  const batchBadge = (status: string) => (
    <span style={{
      display: "inline-block", padding: "0.18rem 0.55rem", borderRadius: 999,
      fontSize: "0.72rem", fontWeight: 700,
      background: BATCH_STATUS_BG[status] ?? "#f3f4f6",
      color: BATCH_STATUS_COLOR[status] ?? "#6b7280",
    }}>
      {status === "planning" ? copy.statusPlanning : status === "curing" ? copy.statusCuring : copy.statusReady}
    </span>
  );

  const orderBadge = (status: string) => (
    <span style={{
      display: "inline-block", padding: "0.18rem 0.55rem", borderRadius: 999,
      fontSize: "0.72rem", fontWeight: 700,
      background: ORDER_STATUS_BG[status] ?? "#f3f4f6",
      color: ORDER_STATUS_COLOR[status] ?? "#6b7280",
    }}>
      {getOrderStatusLabel(status, language)}
    </span>
  );

  /* ── KPI card ── */
  const kpi = (
    icon: React.ReactNode,
    label: string,
    value: number | string,
    accent?: string,
    sub?: string,
  ) => (
    <div style={{
      background: "#ffffffcc",
      border: `1.5px solid ${accent ? `${accent}33` : "rgba(183,185,167,.65)"}`,
      borderRadius: 14,
      padding: "1rem 1.1rem",
      display: "flex", flexDirection: "column", gap: 6,
      boxShadow: "0 2px 12px rgba(58,52,18,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ color: accent ?? "#9ca3af", opacity: 0.85 }}>{icon}</span>
      </div>
      <strong style={{ fontSize: "1.75rem", lineHeight: 1, color: accent ?? "var(--color-heading)", fontFamily: "var(--font-heading)" }}>
        {value}
      </strong>
      {sub && <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{sub}</span>}
    </div>
  );

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{mn ? "Factory" : "Factory"}</p>
          <h1>{mn ? "Factory overview" : "Factory overview"}</h1>
          <p>{mn ? "Үйлдвэрлэл, нөөц, захиалгын ерөнхий дүр зураг." : "Production, inventory, and order pipeline at a glance."}</p>
        </div>
      </div>

      {/* ── KPI: Production ── */}
      <div className="admin-kpi-grid" style={{ marginBottom: "0.75rem" }}>
        {kpi(<Zap size={16} />, mn ? "Боловсорч буй" : "Curing", curingBatches.length,
          curingBatches.length > 0 ? "#8b5cf6" : undefined,
          curingBatches.length > 0 ? curingBatches.map((b: any) => b.productName).slice(0, 2).join(", ") : undefined)}
        {kpi(<Package size={16} />, mn ? "Төлөвлөлтөд" : "Planning", planningBatches.length,
          undefined,
          planningBatches.length > 0 ? planningBatches.map((b: any) => b.productName).slice(0, 2).join(", ") : undefined)}
        {kpi(<Package size={16} />, mn ? "Сарын гарц (ширхэг)" : "Units this month", unitsThisMonth,
          unitsThisMonth > 0 ? "#10b981" : undefined)}
      </div>

      {/* ── KPI: Operations ── */}
      <div className="admin-kpi-grid" style={{ marginBottom: "1.5rem" }}>
        {kpi(<AlertTriangle size={16} />, mn ? "Нөөцийн анхааруулга" : "Stock alerts", totalAlerts,
          totalAlerts > 0 ? "#dc2626" : undefined,
          totalAlerts > 0 ? `${lowRaw.length} материал · ${lowPkg.length} савлагаа` : mn ? "Нөөц хангалттай" : "All stocks OK")}
        {kpi(<Truck size={16} />, mn ? "Хүргэлт хүлээж буй" : "Awaiting dispatch", paidOrders.length,
          paidOrders.length > 0 ? "#d97706" : undefined,
          paidOrders.length > 0 ? mn ? "Төлбөр баталгаажсан" : "Payment confirmed" : undefined)}
        {kpi(<Truck size={16} />, mn ? "Хүргэлтэнд гарсан" : "In transit", deliveringOrders.length,
          deliveringOrders.length > 0 ? "#2563eb" : undefined,
          `${mn ? "Өнөөдөр" : "Today"}: ${deliveredToday.length} ${mn ? "хүргэгдсэн" : "delivered"}`)}
      </div>

      {/* ── Row 1: Active batches + Order pipeline ── */}
      <div className="admin-two-col-grid" style={{ marginBottom: "1.25rem" }}>

        {/* Active batches */}
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={15} color="#8b5cf6" />
              <div>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Идэвхтэй batch" : "Active batches"}</h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                  {activeBatches.length > 0
                    ? `${curingBatches.length} ${mn ? "боловсорч буй" : "curing"} · ${planningBatches.length} ${mn ? "төлөвлөлтөд" : "planning"}`
                    : mn ? "Идэвхтэй batch байхгүй" : "No active batches"}
                </p>
              </div>
            </div>
            {navLink("factoryProduction", mn ? "Бүгдийг харах" : "View all")}
          </div>

          {activeBatches.length === 0 ? (
            <p style={{ padding: "0.5rem 1.4rem 1rem", color: "#9ca3af", fontSize: 13 }}>
              {mn ? "Одоогоор үйлдвэрлэлд batch байхгүй байна." : "No batches currently in production."}
            </p>
          ) : (
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Код" : "Code"}</th>
                    <th>{mn ? "Бүтээгдэхүүн" : "Product"}</th>
                    <th>{mn ? "Төлөв" : "Status"}</th>
                    <th style={{ textAlign: "right" }}>{mn ? "Тоо" : "Qty"}</th>
                    <th>{mn ? "Дуусах" : "Due"}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBatches.map((b: any) => (
                    <tr key={b.id}>
                      <td><strong style={{ fontSize: "0.78rem", fontFamily: "monospace" }}>{b.batchCode}</strong></td>
                      <td style={{ fontSize: "0.82rem" }}>{b.productName}</td>
                      <td>{batchBadge(b.status)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{b.plannedQuantity}</td>
                      <td style={{ fontSize: "0.75rem", color: "#6b7280" }}>{b.expectedReadyAt || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order pipeline */}
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Truck size={15} color="#2563eb" />
              <div>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Захиалгын pipeline" : "Order pipeline"}</h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                  {mn ? `Өнөөдөр ${deliveredToday.length} захиалга хүргэгдсэн` : `${deliveredToday.length} delivered today`}
                </p>
              </div>
            </div>
            {navLink("orders", mn ? "Захиалга руу" : "Go to orders")}
          </div>

          <div style={{ padding: "0 1.4rem 1.4rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Awaiting dispatch */}
            {paidOrders.length > 0 && (
              <div>
                <SectionLabel color="#d97706">
                  {mn ? "Хүргэлтийг хүлээж буй" : "Awaiting dispatch"} · {paidOrders.length}
                </SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {paidOrders.slice(0, 4).map((o: any) => (
                    <div key={o.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "0.55rem 0.75rem", background: "#fffbeb",
                      border: "1px solid #fde68a", borderRadius: 8,
                    }}>
                      <strong style={{ fontSize: "0.78rem", fontFamily: "monospace", minWidth: 120 }}>#{o.orderNumber}</strong>
                      <span style={{ fontSize: "0.8rem", color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.customer?.fullName || o.customer?.phoneNumber || "—"}
                      </span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
                        {formatStorePrice(o.totals?.grandTotal)}
                      </span>
                      {orderBadge(o.status)}
                    </div>
                  ))}
                  {paidOrders.length > 4 && (
                    <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: 0, textAlign: "center" }}>
                      +{paidOrders.length - 4} {mn ? "захиалга" : "more orders"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* In transit */}
            {deliveringOrders.length > 0 && (
              <div>
                <SectionLabel color="#2563eb">
                  {mn ? "Хүргэлтэнд гарсан" : "In transit"} · {deliveringOrders.length}
                </SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {deliveringOrders.slice(0, 4).map((o: any) => (
                    <div key={o.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "0.55rem 0.75rem", background: "#eff6ff",
                      border: "1px solid #bfdbfe", borderRadius: 8,
                    }}>
                      <strong style={{ fontSize: "0.78rem", fontFamily: "monospace", minWidth: 120 }}>#{o.orderNumber}</strong>
                      <span style={{ fontSize: "0.8rem", color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.customer?.fullName || o.customer?.phoneNumber || "—"}
                      </span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
                        {formatStorePrice(o.totals?.grandTotal)}
                      </span>
                      {orderBadge(o.status)}
                    </div>
                  ))}
                  {deliveringOrders.length > 4 && (
                    <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: 0, textAlign: "center" }}>
                      +{deliveringOrders.length - 4} {mn ? "захиалга" : "more orders"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {paidOrders.length === 0 && deliveringOrders.length === 0 && (
              <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>
                {mn ? "Хүлээгдэж буй захиалга байхгүй байна." : "No pending orders."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Raw materials + Packaging & Output ── */}
      <div className="admin-two-col-grid">

        {/* Left: Raw materials + Production output */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", alignSelf: "start" }}>

        {/* Raw materials */}
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={15} color={lowRaw.length > 0 ? "#dc2626" : "#6b7280"} />
              <div>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>{copy.rawMaterialsTitle}</h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: lowRaw.length > 0 ? "#dc2626" : "#6b7280" }}>
                  {(rawMaterials as any[]).length} {mn ? "төрлөөс" : "types ·"}{" "}
                  {lowRaw.length > 0
                    ? `${lowRaw.length} ${mn ? "дутагдаж байна" : "low stock"}`
                    : mn ? "бүгд хангалттай" : "all OK"}
                </p>
              </div>
            </div>
            {navLink("rawMaterials", mn ? "Бүгдийг харах" : "View all")}
          </div>

          {lowRaw.length > 0 && (
            <div style={{ margin: "0 1.4rem 0.5rem", padding: "0.5rem 0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <AlertTriangle size={13} color="#dc2626" style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: "0.78rem", color: "#991b1b" }}>
                <strong>{lowRaw.slice(0, 3).map((r: any) => r.name).join(", ")}{lowRaw.length > 3 ? ` …+${lowRaw.length - 3}` : ""}</strong>
              </span>
            </div>
          )}

          <div className="admin-data-table-wrap">
            <table className="admin-data-table" style={{ minWidth: "unset" }}>
              <thead>
                <tr>
                  <th>{copy.rawMaterialName}</th>
                  <th style={{ width: 64 }}>{copy.rawMaterialUnit}</th>
                  <th style={{ textAlign: "right", width: 72 }}>{copy.rawMaterialRemaining}</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {rawSorted.slice(0, 10).map((r: any) => {
                  const low = r.remaining < LOW_STOCK_THRESHOLD;
                  const warn = !low && r.remaining < WARN_STOCK_THRESHOLD;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span style={{ fontWeight: 500, color: low ? "#dc2626" : warn ? "#d97706" : "#111827" }}>
                          {r.name}
                        </span>
                      </td>
                      <td style={{ color: "#9ca3af", fontSize: "0.78rem" }}>{r.unit}</td>
                      <td style={{ textAlign: "right", fontWeight: low ? 700 : 500, color: low ? "#dc2626" : warn ? "#d97706" : "#374151" }}>
                        {r.remaining.toLocaleString()}
                      </td>
                      <td style={{ paddingLeft: 8 }}>
                        <StockBar value={r.remaining} max={rawMax} low={low} />
                      </td>
                    </tr>
                  );
                })}
                {(rawMaterials as any[]).length === 0 && (
                  <tr><td colSpan={4} className="admin-table-empty">{copy.rawMaterialsEmpty}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {(rawMaterials as any[]).length > 10 && (
            <p style={{ padding: "0.4rem 1.4rem 0.8rem", fontSize: "0.72rem", color: "#9ca3af", textAlign: "right" }}>
              {mn ? `${(rawMaterials as any[]).length} материалаас 10-г харуулж байна` : `Showing 10 of ${(rawMaterials as any[]).length}`}
            </p>
          )}
        </div>

        {/* Production output */}
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Package size={15} color="#10b981" />
              <div>
                <h2 style={{ margin: 0, fontSize: "1rem" }}>{mn ? "Нийт үйлдвэрлэлийн гарц" : "Production output"}</h2>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "#6b7280" }}>
                  {mn ? "Бүтээгдэхүүнээр нэгтгэсэн, бүх цаг" : "All-time by product"}
                </p>
              </div>
            </div>
            {navLink("factoryProduction", mn ? "Batch харах" : "View batches")}
          </div>
          <div className="admin-data-table-wrap">
            <table className="admin-data-table" style={{ minWidth: "unset" }}>
              <thead>
                <tr>
                  <th>{mn ? "Бүтээгдэхүүн" : "Product"}</th>
                  <th style={{ textAlign: "right" }}>{mn ? "Нийт гарц" : "Total output"}</th>
                  <th style={{ textAlign: "right", width: 72 }}>{mn ? "Batch" : "Batches"}</th>
                </tr>
              </thead>
              <tbody>
                {outputRows.length === 0 ? (
                  <tr><td colSpan={3} className="admin-table-empty">{mn ? "Дууссан batch байхгүй." : "No completed batches yet."}</td></tr>
                ) : (
                  outputRows.map((r, i) => (
                    <tr key={i}>
                      <td><strong style={{ fontSize: "0.85rem" }}>{r.name}</strong></td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#10b981", fontSize: "0.9rem" }}>{r.total.toLocaleString()}</td>
                      <td style={{ textAlign: "right", color: "#9ca3af", fontSize: "0.78rem" }}>{r.batches}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        {/* Packaging */}
        <div className="admin-data-card" style={{ alignSelf: "start" }}>
            <div className="admin-data-card-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Box size={15} color={lowPkg.length > 0 ? "#dc2626" : "#6b7280"} />
                <div>
                  <h2 style={{ margin: 0, fontSize: "1rem" }}>{copy.packagingTitle}</h2>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: lowPkg.length > 0 ? "#dc2626" : "#6b7280" }}>
                    {(packagingItems as any[]).length} {mn ? "төрөл · нийт" : "types · total"}:{" "}
                    <strong>{(packagingItems as any[]).reduce((s: number, p: any) => s + p.remaining, 0).toLocaleString()}</strong>
                    {lowPkg.length > 0 && <span style={{ marginLeft: 6 }}>· {lowPkg.length} {mn ? "дутагдалтай" : "low"}</span>}
                  </p>
                </div>
              </div>
              {navLink("factoryInventory", mn ? "Бүгдийг харах" : "View all")}
            </div>

            {lowPkg.length > 0 && (
              <div style={{ margin: "0 1.4rem 0.5rem", padding: "0.45rem 0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, display: "flex", gap: 8, alignItems: "center" }}>
                <AlertTriangle size={12} color="#dc2626" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "0.78rem", color: "#991b1b" }}>
                  <strong>{lowPkg.map((p: any) => p.name).join(", ")}</strong>
                </span>
              </div>
            )}

            <div className="admin-data-table-wrap">
              <table className="admin-data-table" style={{ minWidth: "unset" }}>
                <thead>
                  <tr>
                    <th>{copy.packagingName}</th>
                    <th>{copy.packagingSize}</th>
                    <th style={{ textAlign: "right", width: 72 }}>{copy.packagingRemaining}</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pkgSorted.length === 0 ? (
                    <tr><td colSpan={4} className="admin-table-empty">{copy.packagingEmpty}</td></tr>
                  ) : (
                    pkgSorted.map((p: any) => {
                      const low = p.remaining < LOW_STOCK_THRESHOLD;
                      const warn = !low && p.remaining < WARN_STOCK_THRESHOLD;
                      return (
                        <tr key={p.id}>
                          <td><span style={{ fontWeight: 500, color: low ? "#dc2626" : warn ? "#d97706" : "#111827" }}>{p.name}</span></td>
                          <td style={{ color: "#9ca3af", fontSize: "0.78rem" }}>{p.size || "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: low ? 700 : 500, color: low ? "#dc2626" : warn ? "#d97706" : "#374151" }}>
                            {p.remaining.toLocaleString()}
                          </td>
                          <td style={{ paddingLeft: 8 }}>
                            <StockBar value={p.remaining} max={pkgMax} low={low} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

      </div>
    </>
  );
}
