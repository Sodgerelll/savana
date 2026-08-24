/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ChevronDown, ChevronRight, Minus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";
import { packagingPurchaseLandedCost } from "../../lib/storefrontRepository";

const LOW_STOCK_THRESHOLD = 100;

export default function FactoryInventoryPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    packagingItems,
    setPackagingModal,
    setPackagingPurchaseModal,
    setPackagingUsageModal,
    openConfirmModal,
    deletePackaging,
    removePackagingPurchase,
    removePackagingUsage,
  } = ctx;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filtered = packagingItems.filter((item: any) =>
    !search || item.name.toLowerCase().includes(search.toLowerCase()),
  );

  const totalCostValue = packagingItems.reduce(
    (sum: number, m: any) =>
      sum + (m.purchaseLog ?? []).reduce((s: number, p: any) => s + packagingPurchaseLandedCost(p), 0),
    0,
  );

  const totalConsumedValue = packagingItems.reduce(
    (sum: number, m: any) =>
      sum + (m.usageLog ?? []).reduce(
        (s: number, u: any) => s + (u.unitCost && u.unitCost > 0 ? u.quantity * u.unitCost : 0),
        0,
      ),
    0,
  );

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
          <p className="admin-kicker">{language === "MN" ? "Factory" : "Factory"}</p>
          <h1>{copy.inventoryTitle}</h1>
          <p>{copy.inventoryText}</p>
        </div>
      </div>

      <div className="admin-summary-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Нийт төрөл" : "Total types"}</span>
          <strong>{packagingItems.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Нийт үлдэгдэл" : "Total remaining"}</span>
          <strong>{packagingItems.reduce((s: number, p: any) => s + p.remaining, 0)}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.packagingTotalCostValue}</span>
          <strong>{Math.round(totalCostValue).toLocaleString()}₮</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.packagingTotalConsumedValue}</span>
          <strong>{Math.round(totalConsumedValue).toLocaleString()}₮</strong>
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
        <div className="admin-filter-meta">
          {search && (
            <button type="button" className="admin-filter-clear" onClick={() => setSearch("")}>
              <X size={14} /> {copy.clearFilters}
            </button>
          )}
          <span className="admin-filter-count">{filtered.length} / {packagingItems.length}</span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.packagingTitle}</h2>
            <p>{copy.packagingSummary}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              setPackagingModal({
                mode: "create",
                draft: {
                  id: Date.now(),
                  name: "",
                  size: "",
                  remaining: 0,
                  unitCost: null,
                  sortOrder: packagingItems.length,
                  purchaseLog: [],
                  usageLog: [],
                },
              })
            }
          >
            <Plus size={16} /> {copy.packagingModalCreate}
          </button>
        </div>

        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>#</th>
                <th>{copy.packagingName}</th>
                <th>{copy.packagingSize}</th>
                <th>{copy.packagingRemaining}</th>
                <th>{copy.packagingUnitCost}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">{copy.packagingEmpty}</td>
                </tr>
              ) : (
                filtered.map((item: any, idx: number) => {
                  const isOpen = expandedId === item.id;
                  const log: any[] = item.purchaseLog ?? [];
                  const purchases: any[] = isOpen ? log : [];
                  const usageLog: any[] = item.usageLog ?? [];
                  const manualUsages: any[] = isOpen ? usageLog : [];

                  const totalManualUsed = manualUsages
                    .reduce((sum: number, u: any) => sum + (u.quantity ?? 0), 0);

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
                      <td>{item.size || "—"}</td>
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
                          : item.unitCost !== null && item.unitCost !== undefined ? item.unitCost : "—"}
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
                            title={copy.packagingPurchaseAdd}
                            onClick={() =>
                              setPackagingPurchaseModal({
                                packagingId: item.id,
                                packagingName: item.name,
                                draft: {
                                  quantity: 0,
                                  unitCost: item.unitCost,
                                  supplier: "",
                                  origin: "",
                                  cargo: 0,
                                  purchasedAt: new Date().toISOString().slice(0, 10),
                                  notes: "",
                                  paymentMethod: "cash",
                                },
                              })
                            }
                          >
                            <Plus size={15} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            title={copy.packagingUsageAdd}
                            onClick={() =>
                              setPackagingUsageModal({
                                packagingId: item.id,
                                packagingName: item.name,
                                remaining: item.remaining,
                                draft: {
                                  quantity: 0,
                                  reason: "",
                                  usedAt: new Date().toISOString().slice(0, 10),
                                  notes: "",
                                },
                              })
                            }
                          >
                            <Minus size={15} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={() => setPackagingModal({ mode: "edit", draft: { ...item } })}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() =>
                              openConfirmModal({
                                title: copy.confirmDeleteTitle,
                                description: copy.deletePackagingDescription,
                                confirmLabel: copy.delete,
                                destructive: true,
                                onConfirm: () => deletePackaging(item.id),
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
                          colSpan={7}
                          style={{ padding: 0, background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}
                        >
                          <div style={{ padding: "16px 20px 20px 36px", display: "flex", gap: 40, flexWrap: "wrap" }}>

                            {/* Татан авалт */}
                            <div style={{ flex: "1 1 100%", minWidth: 280 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                <span style={subHeadStyle}>{copy.packagingPurchasesTitle}</span>
                                {purchases.length > 0 && (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                                    {copy.packagingPurchaseTotalAdded}: <strong>{totalAdded} ш</strong>
                                  </span>
                                )}
                              </div>

                              {purchases.length === 0 ? (
                                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{copy.packagingPurchasesEmpty}</p>
                              ) : (
                                <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                      <th style={thStyle}>{copy.rawMaterialPurchasedAt}</th>
                                      <th style={thStyle}>{copy.rawMaterialPurchaseSupplier}</th>
                                      <th style={thStyle}>{copy.rawMaterialPurchaseOrigin}</th>
                                      <th style={thStyle}>{copy.rawMaterialPurchaseCargo}</th>
                                      <th style={{ ...thStyle, textAlign: "right" }}>{copy.rawMaterialPurchaseQty}</th>
                                      <th style={{ ...thStyle, textAlign: "right" }}>{copy.rawMaterialPurchaseUnitCost}</th>
                                      <th style={{ ...thStyle, textAlign: "right" }}>{copy.packagingPurchaseTotalAmount}</th>
                                      <th style={{ width: 32 }} />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchases.map((p: any) => {
                                      const total = packagingPurchaseLandedCost(p);
                                      return (
                                      <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#374151" }}>{p.purchasedAt || "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>{p.supplier || "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>{p.origin || "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>{p.cargo ? `${p.cargo.toLocaleString()}₮` : "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                                          +{p.quantity} ш
                                        </td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", color: "#6b7280" }}>
                                          {p.unitCost !== null && p.unitCost !== undefined ? p.unitCost : "—"}
                                        </td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", fontWeight: 600, color: "#111827" }}>
                                          {total > 0 ? `${total.toLocaleString()}₮` : "—"}
                                        </td>
                                        <td style={{ padding: "5px 0" }} onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            className="admin-icon-btn"
                                            style={{ width: 24, height: 24 }}
                                            onClick={() =>
                                              openConfirmModal({
                                                title: copy.confirmDeleteTitle,
                                                description: copy.packagingPurchaseDeleteConfirm,
                                                confirmLabel: copy.delete,
                                                destructive: true,
                                                onConfirm: () => removePackagingPurchase(item.id, p),
                                              })
                                            }
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                </div>
                              )}
                            </div>

                            {/* Гар зарцуулалт */}
                            <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                <span style={subHeadStyle}>{copy.packagingUsageTitle}</span>
                                {manualUsages.length > 0 && (
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                                    {copy.packagingUsageTotal}: <strong>{totalManualUsed} ш</strong>
                                  </span>
                                )}
                              </div>

                              {manualUsages.length === 0 ? (
                                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{copy.packagingUsageEmpty}</p>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                      <th style={thStyle}>{copy.rawMaterialUsedAt}</th>
                                      <th style={thStyle}>{copy.rawMaterialUsageReason}</th>
                                      <th style={{ ...thStyle, textAlign: "right" }}>{copy.rawMaterialUsageQty}</th>
                                      <th style={{ width: 32 }} />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {manualUsages.map((u: any) => (
                                      <tr key={u.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#374151" }}>{u.usedAt || "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#6b7280" }}>{u.reason || "—"}</td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                                          -{u.quantity} ш
                                        </td>
                                        <td style={{ padding: "5px 0" }} onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            className="admin-icon-btn"
                                            style={{ width: 24, height: 24 }}
                                            onClick={() =>
                                              openConfirmModal({
                                                title: copy.confirmDeleteTitle,
                                                description: copy.packagingUsageDeleteConfirm,
                                                confirmLabel: copy.delete,
                                                destructive: true,
                                                onConfirm: () => removePackagingUsage(item.id, u),
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
