/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";
import { getProductLabel } from "./adminHelpers";

const STATUS_ORDER = ["planning", "curing", "ready"] as const;
type BatchStatus = typeof STATUS_ORDER[number];

const STATUS_COLOR: Record<string, string> = {
  planning: "#94a3b8",
  curing:   "#8b5cf6",
  ready:    "#10b981",
};

export default function FactoryProductionPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    products,
    rawMaterials,
    productionBatches,
    productionBatchError,
    productionAdvanceError,
    setProductionBatchError,
    setProductionBatchModal,
    setProductionAdvanceError,
    setProductionAdvanceModal,
    openConfirmModal,
    deleteProductionBatch,
  } = ctx;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const filtered = productionBatches.filter((b: any) => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!b.productName.toLowerCase().includes(q) && !b.batchCode.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const statusLabel = (status: any): string => {
    switch (status) {
      case "planning": return copy.statusPlanning;
      case "curing":   return copy.statusCuring;
      case "ready":    return copy.statusReady;
      default:         return status;
    }
  };

  const nextStatusOf = (status: any): any | null => {
    if (status === "planning") return "curing";
    if (status === "curing")   return "ready";
    return null;
  };

  const statusIndex = (status: string) => STATUS_ORDER.indexOf(status as BatchStatus);

  /* ── timeline steps for a batch ── */
  const timelineSteps = (batch: any) => {
    const currentIdx = statusIndex(batch.status);
    return STATUS_ORDER.map((s, i) => {
      const done    = i < currentIdx;
      const current = i === currentIdx;
      let date: string | null = null;
      if (s === "planning") date = batch.createdAt ? batch.createdAt.slice(0, 10) : null;
      if (s === "curing")   date = batch.startedAt ?? null;
      if (s === "ready")    date = batch.readyAt ?? null;
      return { status: s, label: statusLabel(s), color: STATUS_COLOR[s], done, current, date };
    });
  };

  const LOW_STOCK_THRESHOLD = 100;
  const planningCount = productionBatches.filter((b: any) => b.status === "planning").length;
  const curingCount   = productionBatches.filter((b: any) => b.status === "curing").length;
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const readyThisMonthCount = productionBatches.filter(
    (b: any) => b.status === "ready" && b.readyAt && b.readyAt.startsWith(thisMonth),
  ).length;
  const lowStockCount = rawMaterials.filter((r: any) => r.remaining < LOW_STOCK_THRESHOLD).length;

  const openCreateBatchModal = () => {
    const firstProduct = products[0];
    setProductionBatchError(null);
    setProductionBatchModal({
      mode: "create",
      draft: {
        id: "", batchCode: "",
        productId: firstProduct ? firstProduct.id : 0,
        productName: firstProduct ? firstProduct.name : "",
        status: "planning",
        plannedQuantity: 0, actualQuantity: null,
        startedAt: null, expectedReadyAt: null, readyAt: null,
        plannedVariant: firstProduct?.variants?.[0]?.name ?? null,
        selectedRecipeId: null,
        supplies: [], totalCost: 0, notes: "",
      },
    });
  };

  const openEditBatchModal = (batch: any) => {
    setProductionBatchError(null);
    setProductionBatchModal({
      mode: "edit",
      previous: batch,
      draft: {
        id: batch.id, batchCode: batch.batchCode,
        productId: batch.productId, productName: batch.productName,
        status: batch.status,
        plannedQuantity: batch.plannedQuantity, actualQuantity: batch.actualQuantity,
        startedAt: batch.startedAt, expectedReadyAt: batch.expectedReadyAt, readyAt: batch.readyAt,
        plannedVariant: batch.plannedVariant ?? null,
        selectedRecipeId: null,
        supplies: batch.supplies.map((s: any) => ({ ...s })),
        totalCost: batch.totalCost, notes: batch.notes,
      },
    });
  };

  const openAdvanceModal = (batch: any) => {
    const target = nextStatusOf(batch.status);
    if (!target) return;
    const today = new Date().toISOString().slice(0, 10);
    const product = products.find((p: any) => p.id === batch.productId);
    const firstVariant = batch.plannedVariant ?? product?.variants?.[0]?.name ?? "";
    setProductionAdvanceError(null);
    setProductionAdvanceModal({
      batch, targetStatus: target,
      startedAt: batch.startedAt ?? today,
      expectedReadyAt: batch.expectedReadyAt ?? "",
      readyAt: today,
      actualQuantity: batch.plannedQuantity,
      variantName: firstVariant,
    });
  };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.productionKicker}</p>
          <h1>{copy.productionTitle}</h1>
          <p>{copy.productionText}</p>
        </div>
      </div>

      {productionBatchError   && <div className="admin-alert admin-alert-danger">{productionBatchError}</div>}
      {productionAdvanceError && <div className="admin-alert admin-alert-danger">{productionAdvanceError}</div>}

      <div className="admin-summary-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-summary-card"><span>{copy.productionPlanningCount}</span><strong>{planningCount}</strong></div>
        <div className="admin-summary-card"><span>{copy.productionCuringCount}</span><strong>{curingCount}</strong></div>
        <div className="admin-summary-card"><span>{copy.productionReadyThisMonth}</span><strong>{readyThisMonthCount}</strong></div>
        <div className="admin-summary-card">
          <span>{copy.productionLowStockWarning}</span>
          <strong style={{ color: lowStockCount > 0 ? "#dc2626" : undefined }}>{lowStockCount}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-search">
          <Search size={16} className="admin-filter-search-icon" />
          <input
            type="text"
            placeholder={copy.searchByName}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="admin-filter-group">
          <SlidersHorizontal size={14} className="admin-filter-group-icon" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">{copy.productionBatchStatus}</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-meta">
          {(search || filterStatus) && (
            <button type="button" className="admin-filter-clear" onClick={() => { setSearch(""); setFilterStatus(""); }}>
              <X size={14} /> {copy.clearFilters}
            </button>
          )}
          <span className="admin-filter-count">{filtered.length} / {productionBatches.length}</span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.productionBatchesTitle}</h2>
            <p>{copy.productionBatchesSummary}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreateBatchModal}>
            <Plus size={16} /> {copy.productionBatchModalCreate}
          </button>
        </div>

        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>#</th>
                <th>{copy.productionBatchCode}</th>
                <th>{copy.productionBatchProduct}</th>
                <th>{copy.productionBatchStatus}</th>
                <th>{copy.productionBatchPlannedQty}</th>
                <th>{copy.productionBatchActualQty}</th>
                <th>{copy.productionBatchStartedAt}</th>
                <th>{copy.productionBatchExpectedReadyAt}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="admin-table-empty">{copy.productionBatchesEmpty}</td>
                </tr>
              ) : (
                filtered.map((batch: any, idx: number) => {
                  const next   = nextStatusOf(batch.status);
                  const isOpen = expandedId === batch.id;
                  const steps  = isOpen ? timelineSteps(batch) : [];

                  const supplies: any[] = batch.supplies ?? [];
                  const calcTotal = supplies.reduce((sum: number, s: any) =>
                    s.unitCost !== null && s.unitCost !== undefined
                      ? sum + s.quantity * s.unitCost : sum, 0);
                  const byUnit: Record<string, number> = {};
                  supplies.forEach((s: any) => { byUnit[s.unit] = (byUnit[s.unit] ?? 0) + s.quantity; });
                  const qtyLabel = Object.entries(byUnit).map(([u, q]) => `${q} ${u}`).join(" + ");

                  return [
                    <tr
                      key={batch.id}
                      onClick={() => setExpandedId(isOpen ? null : batch.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ color: "#9ca3af", paddingRight: 0 }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td>{idx + 1}</td>
                      <td><strong>{batch.batchCode}</strong></td>
                      <td>
                        {getProductLabel(batch.productId, batch.productName)}
                        {(batch.producedVariant || batch.plannedVariant) && (
                          <span style={{ marginLeft: 8, color: "#6366f1", fontSize: "0.78rem", fontWeight: 600 }}>
                            {batch.producedVariant ?? batch.plannedVariant}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          display: "inline-block",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "999px",
                          background: STATUS_COLOR[batch.status],
                          color: "#fff",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}>{statusLabel(batch.status)}</span>
                      </td>
                      <td>{batch.plannedQuantity}</td>
                      <td>{batch.actualQuantity ?? "—"}</td>
                      <td>{batch.startedAt || (batch.createdAt ? batch.createdAt.slice(0, 10) : "—")}</td>
                      <td>{batch.expectedReadyAt || "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="admin-table-actions">
                          {next && (
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-neutral"
                              title={statusLabel(next)}
                              onClick={() => openAdvanceModal(batch)}
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={() => openEditBatchModal(batch)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() =>
                              openConfirmModal({
                                title: copy.confirmDeleteTitle,
                                description: copy.deleteProductionBatchDescription,
                                confirmLabel: copy.delete,
                                destructive: true,
                                onConfirm: () => deleteProductionBatch(batch),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>,

                    isOpen && (
                      <tr key={`${batch.id}-expand`}>
                        <td
                          colSpan={10}
                          style={{ padding: 0, background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}
                        >
                          <div style={{ padding: "18px 20px 20px 36px", display: "flex", gap: 48, flexWrap: "wrap" }}>

                            {/* ── Статус хуваарь ── */}
                            <div style={{ minWidth: 260 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                                Статус шилжилт
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                                {steps.map((step, i) => {
                                  const isLast = i === steps.length - 1;
                                  const dotColor = step.done
                                    ? "#d1fae5"
                                    : step.current
                                      ? step.color
                                      : "#e5e7eb";
                                  const dotBorder = step.done
                                    ? "#10b981"
                                    : step.current
                                      ? step.color
                                      : "#d1d5db";
                                  return (
                                    <div key={step.status} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                                      {/* dot + line */}
                                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
                                        <div style={{
                                          width: 20, height: 20, borderRadius: "50%",
                                          background: dotColor,
                                          border: `2px solid ${dotBorder}`,
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                          flexShrink: 0,
                                          marginTop: 1,
                                        }}>
                                          {step.done && (
                                            <svg width="10" height="10" viewBox="0 0 10 10">
                                              <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#10b981" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                          )}
                                          {step.current && (
                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
                                          )}
                                        </div>
                                        {!isLast && (
                                          <div style={{
                                            width: 2,
                                            flex: 1,
                                            minHeight: 24,
                                            background: step.done ? "#10b981" : "#e5e7eb",
                                            marginTop: 2,
                                            marginBottom: 2,
                                          }} />
                                        )}
                                      </div>
                                      {/* label + date */}
                                      <div style={{ paddingBottom: isLast ? 0 : 18 }}>
                                        <div style={{
                                          fontSize: 13,
                                          fontWeight: step.current ? 700 : 500,
                                          color: step.current ? step.color : step.done ? "#111827" : "#9ca3af",
                                        }}>
                                          {step.label}
                                        </div>
                                        {(step.done || step.current) && (
                                          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                                            {step.date ?? "—"}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* notes */}
                              {batch.notes && (
                                <div style={{ marginTop: 16, fontSize: 13, color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                                  <span style={{ fontWeight: 500, color: "#374151" }}>Тэмдэглэл: </span>
                                  {batch.notes}
                                </div>
                              )}
                            </div>

                            {/* ── Ашигласан материал ── */}
                            <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                                Ашигласан түүхий эд
                              </div>
                              {(!batch.supplies || batch.supplies.length === 0) ? (
                                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Материал тодорхойлогдоогүй.</p>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                      <th style={{ textAlign: "left",  padding: "4px 12px 6px 0", color: "#6b7280", fontWeight: 500 }}>Материал</th>
                                      <th style={{ textAlign: "right", padding: "4px 12px 6px 0", color: "#6b7280", fontWeight: 500 }}>Хэмжээ</th>
                                      <th style={{ textAlign: "right", padding: "4px 12px 6px 0", color: "#6b7280", fontWeight: 500 }}>Нэгжийн үнэ</th>
                                      <th style={{ textAlign: "right", padding: "4px 0    6px 0", color: "#6b7280", fontWeight: 500 }}>Нийлбэр</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {supplies.map((s: any, si: number) => {
                                      const lineTotal = s.unitCost !== null && s.unitCost !== undefined
                                        ? s.quantity * s.unitCost : null;
                                      return (
                                        <tr key={si} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                          <td style={{ padding: "5px 12px 5px 0", color: "#111827" }}>{s.rawMaterialName}</td>
                                          <td style={{ padding: "5px 12px 5px 0", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                                            {s.quantity} {s.unit}
                                          </td>
                                          <td style={{ padding: "5px 12px 5px 0", textAlign: "right", color: "#6b7280" }}>
                                            {s.unitCost !== null && s.unitCost !== undefined ? s.unitCost.toLocaleString() : "—"}
                                          </td>
                                          <td style={{ padding: "5px 0", textAlign: "right", color: "#374151", fontWeight: 500 }}>
                                            {lineTotal !== null ? lineTotal.toLocaleString() : "—"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                                      <td style={{ paddingTop: 8, fontWeight: 600, fontSize: 12, color: "#374151" }}>Нийт</td>
                                      <td style={{ paddingTop: 8, textAlign: "right", fontWeight: 600, color: "#374151", fontSize: 12 }}>
                                        {qtyLabel || "—"}
                                      </td>
                                      <td style={{ paddingTop: 8 }} />
                                      <td style={{ paddingTop: 8, textAlign: "right", fontWeight: 700, color: "#111827" }}>
                                        {calcTotal > 0 ? calcTotal.toLocaleString() : "—"}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              )}

                              {/* actual quantity note when ready */}
                              {batch.status === "ready" && batch.actualQuantity !== null && (
                                <div style={{ marginTop: 14, fontSize: 13, color: "#374151", borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                                  <span style={{ color: "#6b7280" }}>Төлөвлөсөн: </span>
                                  <strong>{batch.plannedQuantity}</strong>
                                  <span style={{ margin: "0 8px", color: "#d1d5db" }}>→</span>
                                  <span style={{ color: "#6b7280" }}>Бодит гарц: </span>
                                  <strong style={{ color: "#10b981" }}>{batch.actualQuantity}</strong>
                                </div>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
