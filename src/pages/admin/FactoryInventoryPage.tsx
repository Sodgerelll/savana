/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

export default function FactoryInventoryPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    packagingItems,
    setPackagingModal,
    openConfirmModal,
    deletePackaging,
  } = ctx;

  const [search, setSearch] = useState("");

  const filtered = packagingItems.filter((item: any) =>
    !search || item.name.toLowerCase().includes(search.toLowerCase()),
  );

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
                draft: { id: Date.now(), name: "", size: "", remaining: 0, sortOrder: packagingItems.length },
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
                <th>#</th>
                <th>{copy.packagingName}</th>
                <th>{copy.packagingSize}</th>
                <th>{copy.packagingRemaining}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">{copy.packagingEmpty}</td>
                </tr>
              ) : (
                filtered.map((item: any, idx: number) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.size || "—"}</td>
                    <td>{item.remaining}</td>
                    <td>
                      <div className="admin-table-actions">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
