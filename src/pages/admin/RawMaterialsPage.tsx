/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

const LOW_STOCK_THRESHOLD = 100;

const STATUS_COLOR: Record<string, string> = {
  planning:    "#6b7280",
  in_progress: "#d97706",
  curing:      "#7c3aed",
  ready:       "#16a34a",
};

export default function RawMaterialsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    rawMaterials,
    rawMaterialError,
    setRawMaterialError,
    setRawMaterialModal,
    setRawMaterialPurchaseModal,
    productionBatches,
    openConfirmModal,
    deleteRawMaterial,
    removeRawMaterialPurchase,
  } = ctx;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const filtered = rawMaterials.filter((item: any) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && item.category !== filterCategory) return false;
    return true;
  });

  const CATEGORIES = ["oil", "lye", "fragrance", "colorant", "additive", "other"] as const;

  const categoryLabel = (cat: any): string => {
    switch (cat) {
      case "oil":       return copy.rawMaterialCategoryOil;
      case "lye":       return copy.rawMaterialCategoryLye;
      case "fragrance": return copy.rawMaterialCategoryFragrance;
      case "colorant":  return copy.rawMaterialCategoryColorant;
      case "additive":  return copy.rawMaterialCategoryAdditive;
      default:          return copy.rawMaterialCategoryOther;
    }
  };

  const statusLabel = (status: string): string => {
    switch (status) {
      case "planning":    return copy.rawMaterialHistoryPending;
      case "in_progress": return copy.productionStatusInProgress ?? "In Progress";
      case "curing":      return copy.productionStatusCuring ?? "Curing";
      case "ready":       return copy.productionStatusReady ?? "Ready";
      default:            return status;
    }
  };

  const usagesForMaterial = (materialId: number) =>
    ((productionBatches ?? []) as any[])
      .flatMap((batch: any) => {
        const supply = batch.supplies?.find((s: any) => s.rawMaterialId === materialId);
        return supply ? [{ batch, supply }] : [];
      })
      .sort((a: any, b: any) => {
        const da = a.batch.startedAt ?? a.batch.createdAt ?? "";
        const db = b.batch.startedAt ?? b.batch.createdAt ?? "";
        return db.localeCompare(da);
      });

  const subHeadStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 8,
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "4px 12px 6px 0",
    color: "#6b7280",
    fontWeight: 500,
    fontSize: 12,
  };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.productionKicker}</p>
          <h1>{copy.rawMaterialsTitle}</h1>
          <p>{copy.rawMaterialsSummary}</p>
        </div>
      </div>

      {rawMaterialError && <div className="admin-alert admin-alert-danger">{rawMaterialError}</div>}

      <div className="admin-summary-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-summary-card">
          <span>Нийт төрөл</span>
          <strong>{rawMaterials.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span>Нийт үлдэгдэл</span>
          <strong>{rawMaterials.reduce((s: number, r: any) => s + r.remaining, 0)}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.productionLowStockWarning}</span>
          <strong style={{ color: rawMaterials.filter((r: any) => r.remaining < LOW_STOCK_THRESHOLD).length > 0 ? "#dc2626" : undefined }}>
            {rawMaterials.filter((r: any) => r.remaining < LOW_STOCK_THRESHOLD).length}
          </strong>
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
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">{copy.rawMaterialCategory}</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{categoryLabel(cat)}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-meta">
          {(search || filterCategory) && (
            <button type="button" className="admin-filter-clear" onClick={() => { setSearch(""); setFilterCategory(""); }}>
              <X size={14} /> {copy.clearFilters}
            </button>
          )}
          <span className="admin-filter-count">{filtered.length} / {rawMaterials.length}</span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.rawMaterialsTitle}</h2>
            <p>{copy.rawMaterialsSummary}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setRawMaterialError(null);
              setRawMaterialModal({
                mode: "create",
                draft: {
                  id: Date.now(),
                  name: "",
                  category: "oil",
                  unit: "g",
                  remaining: 0,
                  unitCost: null,
                  notes: "",
                  sortOrder: rawMaterials.length,
                },
              });
            }}
          >
            <Plus size={16} /> {copy.rawMaterialModalCreate}
          </button>
        </div>

        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>#</th>
                <th>{copy.rawMaterialName}</th>
                <th>{copy.rawMaterialCategory}</th>
                <th>{copy.rawMaterialUnit}</th>
                <th>{copy.rawMaterialRemaining}</th>
                <th>{copy.rawMaterialUnitCost}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-table-empty">{copy.rawMaterialsEmpty}</td>
                </tr>
              ) : (
                filtered.map((item: any, idx: number) => {
                  const isOpen = expandedId === item.id;
                  const usages = isOpen ? usagesForMaterial(item.id) : [];
                  const log: any[] = item.purchaseLog ?? [];
                  const purchases: any[] = isOpen ? log : [];

                  const totalDeducted = usages
                    .filter(({ batch }: any) => batch.status !== "planning")
                    .reduce((sum: number, { supply }: any) => sum + (supply.quantity ?? 0), 0);

                  const totalAdded = purchases
                    .reduce((sum: number, p: any) => sum + (p.quantity ?? 0), 0);

                  // Weighted average unit cost from purchaseLog
                  const logWithCost = log.filter((p: any) => p.unitCost !== null && p.unitCost !== undefined);
                  const avgUnitCost = logWithCost.length > 0
                    ? logWithCost.reduce((sum: number, p: any) => sum + p.unitCost * p.quantity, 0) /
                      logWithCost.reduce((sum: number, p: any) => sum + p.quantity, 0)
                    : null;

                  // Total purchased from purchaseLog (all entries)
                  const totalPurchased = log.reduce((sum: number, p: any) => sum + (p.quantity ?? 0), 0);

                  return [
                    <tr
                      key={item.id}
                      onClick={() => setExpandedId(isOpen ? null : item.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ color: "#9ca3af", paddingRight: 0 }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td>{idx + 1}</td>
                      <td><strong>{item.name}</strong></td>
                      <td>{categoryLabel(item.category)}</td>
                      <td>{item.unit}</td>
                      <td style={{ color: item.remaining < LOW_STOCK_THRESHOLD ? "#dc2626" : undefined }}>
                        {item.remaining}
                        {totalPurchased > 0 && (
                          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400, marginTop: 1 }}>
                            +{totalPurchased} нийт
                          </div>
                        )}
                      </td>
                      <td>
                        {avgUnitCost !== null
                          ? Math.round(avgUnitCost).toLocaleString()
                          : item.unitCost !== null ? item.unitCost : "—"}
                        {avgUnitCost !== null && (
                          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400, marginTop: 1 }}>
                            дунджаар
                          </div>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            title={copy.rawMaterialPurchaseAdd}
                            onClick={() =>
                              setRawMaterialPurchaseModal({
                                rawMaterialId: item.id,
                                rawMaterialName: item.name,
                                unit: item.unit,
                                draft: {
                                  quantity: 0,
                                  unitCost: item.unitCost,
                                  supplier: "",
                                  purchasedAt: new Date().toISOString().slice(0, 10),
                                  notes: "",
                                },
                              })
                            }
                          >
                            <Plus size={15} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={() => {
                              setRawMaterialError(null);
                              setRawMaterialModal({ mode: "edit", draft: { ...item } });
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() =>
                              openConfirmModal({
                                title: copy.confirmDeleteTitle,
                                description: copy.deleteRawMaterialDescription,
                                confirmLabel: copy.delete,
                                destructive: true,
                                onConfirm: () => deleteRawMaterial(item.id),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>,

                    isOpen && (
                      <tr key={`${item.id}-expand`}>
                        <td
                          colSpan={8}
                          style={{ padding: 0, background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}
                        >
                          <div style={{ padding: "16px 20px 20px 36px", display: "flex", gap: 40, flexWrap: "wrap" }}>

                            {/* Татан авалт */}
                            <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                <span style={subHeadStyle}>{copy.rawMaterialPurchasesTitle}</span>
                                {purchases.length > 0 && (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                                    {copy.rawMaterialPurchaseTotalAdded}: <strong>{totalAdded} {item.unit}</strong>
                                  </span>
                                )}
                              </div>

                              {purchases.length === 0 ? (
                                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{copy.rawMaterialPurchasesEmpty}</p>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                      <th style={thStyle}>{copy.rawMaterialPurchasedAt}</th>
                                      <th style={thStyle}>{copy.rawMaterialPurchaseSupplier}</th>
                                      <th style={{ ...thStyle, textAlign: "right" }}>{copy.rawMaterialPurchaseQty}</th>
                                      <th style={{ ...thStyle, textAlign: "right" }}>{copy.rawMaterialPurchaseUnitCost}</th>
                                      <th style={{ width: 32 }} />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchases.map((p: any) => (
                                      <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#374151" }}>{p.purchasedAt || "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>{p.supplier || "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                                          +{p.quantity} {p.unit}
                                        </td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", color: "#6b7280" }}>
                                          {p.unitCost !== null && p.unitCost !== undefined ? p.unitCost : "—"}
                                        </td>
                                        <td style={{ padding: "5px 0" }} onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            className="admin-icon-btn"
                                            style={{ width: 24, height: 24 }}
                                            onClick={() =>
                                              openConfirmModal({
                                                title: copy.confirmDeleteTitle,
                                                description: copy.rawMaterialPurchaseDeleteConfirm,
                                                confirmLabel: copy.delete,
                                                destructive: true,
                                                onConfirm: () => removeRawMaterialPurchase(item.id, p),
                                              })
                                            }
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>

                            {/* Үйлдвэрлэлийн зарцуулалт */}
                            <div style={{ flex: "1 1 340px", minWidth: 280 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                <span style={subHeadStyle}>{copy.rawMaterialHistoryTitle}</span>
                                {usages.length > 0 && (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                                    {copy.rawMaterialHistoryDeducted}: <strong>{totalDeducted} {item.unit}</strong>
                                  </span>
                                )}
                              </div>

                              {usages.length === 0 ? (
                                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{copy.rawMaterialHistoryEmpty}</p>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                      <th style={thStyle}>{copy.rawMaterialHistoryBatchCode}</th>
                                      <th style={thStyle}>{copy.rawMaterialHistoryProduct}</th>
                                      <th style={thStyle}>{copy.rawMaterialHistoryStatus}</th>
                                      <th style={thStyle}>{copy.rawMaterialHistoryStartedAt}</th>
                                      <th style={{ ...thStyle, textAlign: "right" }}>{copy.rawMaterialHistoryQty}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {usages.map(({ batch, supply }: any) => {
                                      const color = STATUS_COLOR[batch.status] ?? "#6b7280";
                                      return (
                                        <tr key={batch.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                          <td style={{ padding: "5px 12px 5px 0", fontWeight: 600, color: "#111827" }}>{batch.batchCode}</td>
                                          <td style={{ padding: "5px 12px 5px 0", color: "#374151" }}>{batch.productName}</td>
                                          <td style={{ padding: "5px 12px 5px 0" }}>
                                            <span style={{
                                              display: "inline-block",
                                              padding: "1px 8px",
                                              borderRadius: 9999,
                                              fontSize: 11,
                                              fontWeight: 600,
                                              background: color + "22",
                                              color,
                                            }}>
                                              {statusLabel(batch.status)}
                                            </span>
                                          </td>
                                          <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>
                                            {batch.startedAt ?? batch.createdAt?.slice(0, 10) ?? "—"}
                                          </td>
                                          <td style={{ padding: "5px 0", textAlign: "right", fontWeight: 700, color: batch.status === "planning" ? "#9ca3af" : "#dc2626" }}>
                                            -{supply.quantity} {supply.unit}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
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
