/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import { getProductLabel } from "./adminHelpers";
import { AdminModal } from "./AdminModal";

interface EditSaleModal {
  sale: any;
  quantity: number;
  unitPrice: number;
  note: string;
}

export default function DirectSalesPage({ ctx }: { ctx: AdminCtx }) {
  const {
    directSales,
    directSalesError,
    language,
    formatAdminDateTime,
    formatStorePrice,
    collectionNameBySlug,
    updateDirectSale,
    deleteDirectSale,
    openConfirmModal,
    copy,
  } = ctx;

  const [search, setSearch] = useState("");
  const [editModal, setEditModal] = useState<EditSaleModal | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return directSales as any[];
    const q = search.toLowerCase();
    return (directSales as any[]).filter(
      (s: any) =>
        s.productName?.toLowerCase().includes(q) ||
        s.saleNumber?.toLowerCase().includes(q) ||
        s.variant?.toLowerCase().includes(q),
    );
  }, [directSales, search]);

  const totalQty = useMemo(() => filtered.reduce((s: number, r: any) => s + r.quantity, 0), [filtered]);
  const totalRevenue = useMemo(() => filtered.reduce((s: number, r: any) => s + r.lineTotal, 0), [filtered]);

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = useMemo(
    () => (directSales as any[]).filter((s: any) => (s.createdAt ?? "").slice(0, 10) === today),
    [directSales, today],
  );
  const todayRevenue = useMemo(() => todaySales.reduce((s: number, r: any) => s + r.lineTotal, 0), [todaySales]);

  const openEdit = (sale: any) => {
    setEditModal({ sale, quantity: sale.quantity, unitPrice: sale.unitPrice, note: sale.note ?? "" });
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editModal) return;
    if (editModal.quantity <= 0) {
      setEditError(language === "MN" ? "Тоо ширхэг 0-ээс их байх ёстой." : "Quantity must be greater than 0.");
      return;
    }
    if (editModal.unitPrice <= 0) {
      setEditError(language === "MN" ? "Үнэ 0-ээс их байх ёстой." : "Price must be greater than 0.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateDirectSale(
        editModal.sale.id,
        {
          productId: editModal.sale.productId,
          variant: editModal.sale.variant,
          quantity: editModal.sale.quantity,
          journalEntryId: editModal.sale.journalEntryId,
        },
        { quantity: editModal.quantity, unitPrice: editModal.unitPrice, note: editModal.note },
      );
      setEditModal(null);
    } catch (err: any) {
      setEditError(err?.message ?? (language === "MN" ? "Алдаа гарлаа." : "An error occurred."));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = (sale: any) => {
    openConfirmModal({
      title: language === "MN" ? "Устгах уу?" : "Delete sale?",
      description: language === "MN"
        ? `"${getProductLabel(sale.productId, sale.productName)}" борлуулалтын бүртгэлийг устгах уу? Бүтээгдэхүүний зарагдсан тоо шинэчлэгдэнэ.`
        : `Delete sale record for "${getProductLabel(sale.productId, sale.productName)}"? Product sold count will be adjusted.`,
      confirmLabel: copy.delete ?? (language === "MN" ? "Устгах" : "Delete"),
      destructive: true,
      onConfirm: () =>
        deleteDirectSale(sale.id, {
          productId: sale.productId,
          variant: sale.variant,
          quantity: sale.quantity,
          journalEntryId: sale.journalEntryId,
        }),
    });
  };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{language === "MN" ? "Борлуулалт" : "Sales"}</p>
          <h1>{language === "MN" ? "Борлуулалтын түүх" : "Direct Sales History"}</h1>
          <p>
            {language === "MN"
              ? "Бүтээгдэхүүн хуудаснаас шууд хийсэн борлуулалтын бүртгэл."
              : "Direct sales recorded from the products page."}
          </p>
        </div>
      </div>

      {directSalesError && (
        <div className="admin-sync-error">
          {language === "MN"
            ? `Борлуулалтын түүх ачаалахад алдаа гарлаа: ${directSalesError}`
            : `Failed to load sales history: ${directSalesError}`}
        </div>
      )}

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Нийт борлуулалт" : "Total sales"}</span>
          <strong>{(directSales as any[]).length}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Нийт тоо ширхэг" : "Total qty"}</span>
          <strong>{totalQty}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Нийт орлого" : "Total revenue"}</span>
          <strong>{formatStorePrice(totalRevenue)}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Өнөөдрийн борлуулалт" : "Today's sales"}</span>
          <strong>{todaySales.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Өнөөдрийн орлого" : "Today's revenue"}</span>
          <strong>{formatStorePrice(todayRevenue)}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-search">
          <Search size={16} className="admin-filter-search-icon" />
          <input
            type="text"
            placeholder={language === "MN" ? "Бүтээгдэхүүн, дугаараар хайх..." : "Search by product, number..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="admin-filter-meta">
          {search && (
            <button type="button" className="admin-filter-clear" onClick={() => setSearch("")}>
              <X size={14} />
              {language === "MN" ? "Цэвэрлэх" : "Clear"}
            </button>
          )}
          <span className="admin-filter-count">
            {filtered.length} / {(directSales as any[]).length}{" "}
            {language === "MN" ? "үр дүн" : "results"}
          </span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{language === "MN" ? "Борлуулалтын бүртгэл" : "Sales records"}</h2>
            <p>
              {language === "MN"
                ? "Захиалгаас тусдаа бүртгэгдсэн шууд борлуулалтууд."
                : "Direct sales recorded separately from web orders."}
            </p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{language === "MN" ? "Дугаар" : "Number"}</th>
                <th>{language === "MN" ? "Огноо" : "Date"}</th>
                <th>{language === "MN" ? "Бүтээгдэхүүн" : "Product"}</th>
                <th>{language === "MN" ? "Ангилал" : "Category"}</th>
                <th>{language === "MN" ? "Variant" : "Variant"}</th>
                <th className="admin-th-right">{language === "MN" ? "Тоо" : "Qty"}</th>
                <th className="admin-th-right">{language === "MN" ? "Нэгж үнэ" : "Unit price"}</th>
                <th className="admin-th-right">{language === "MN" ? "Нийт" : "Total"}</th>
                <th>{language === "MN" ? "Тэмдэглэл" : "Note"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="admin-table-empty">
                    {language === "MN" ? "Борлуулалт байхгүй байна." : "No sales yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((sale: any, idx: number) => (
                  <tr key={sale.id}>
                    <td style={{ color: "#aaa", fontSize: "0.78rem" }}>{idx + 1}</td>
                    <td>
                      <small>
                        <strong>{sale.saleNumber}</strong>
                      </small>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatAdminDateTime(sale.createdAt, language)}</td>
                    <td>
                      <div className="admin-table-primary-row">
                        {sale.productImage && (
                          <div className="admin-product-thumb">
                            <img src={sale.productImage} alt={sale.productName} />
                          </div>
                        )}
                        <span>
                          <strong>{getProductLabel(sale.productId, sale.productName)}</strong>
                        </span>
                      </div>
                    </td>
                    <td>{collectionNameBySlug?.get(sale.category) ?? sale.category}</td>
                    <td>{sale.variant || "—"}</td>
                    <td className="admin-td-right">{sale.quantity}</td>
                    <td className="admin-td-right">{formatStorePrice(sale.unitPrice)}</td>
                    <td className="admin-td-right">
                      <strong>{formatStorePrice(sale.lineTotal)}</strong>
                    </td>
                    <td style={{ color: "#888", fontSize: "0.85rem" }}>{sale.note || "—"}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={() => openEdit(sale)}
                          title={language === "MN" ? "Засах" : "Edit"}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleDelete(sale)}
                          title={language === "MN" ? "Устгах" : "Delete"}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: "right" }}>
                    <strong>{language === "MN" ? "Нийт" : "Total"}</strong>
                  </td>
                  <td className="admin-td-right">
                    <strong>{totalQty}</strong>
                  </td>
                  <td />
                  <td className="admin-td-right">
                    <strong>{formatStorePrice(totalRevenue)}</strong>
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {editModal && (
        <AdminModal
          title={language === "MN" ? "Борлуулалт засах" : "Edit sale"}
          onClose={() => !editSaving && setEditModal(null)}
          disableClose={editSaving}
        >
          <form
            className="admin-modal-form"
            onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}
          >
            {/* Product info (read-only) */}
            <div className="sale-modal-product-card">
              {editModal.sale.productImage ? (
                <img
                  className="sale-modal-product-img"
                  src={editModal.sale.productImage}
                  alt={editModal.sale.productName}
                />
              ) : (
                <div className="sale-modal-product-img sale-modal-product-img-placeholder">
                  {editModal.sale.productName.slice(0, 1)}
                </div>
              )}
              <div className="sale-modal-product-info">
                <strong>{getProductLabel(editModal.sale.productId, editModal.sale.productName)}</strong>
                <span>{editModal.sale.variant ? `Variant: ${editModal.sale.variant}` : (language === "MN" ? "Variant байхгүй" : "No variant")}</span>
                <span style={{ fontSize: "0.8rem", color: "#888" }}>{editModal.sale.saleNumber}</span>
              </div>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{language === "MN" ? "Тоо ширхэг" : "Quantity"}</span>
                <input
                  type="number"
                  min="1"
                  value={editModal.quantity}
                  onChange={(e) => setEditModal({ ...editModal, quantity: Number(e.target.value) || 0 })}
                  required
                  disabled={editSaving}
                />
              </label>
              <label className="admin-field">
                <span>{language === "MN" ? "Зарсан үнэ (нэгж)" : "Sale price (unit)"}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editModal.unitPrice}
                  onChange={(e) => setEditModal({ ...editModal, unitPrice: Number(e.target.value) || 0 })}
                  required
                  disabled={editSaving}
                />
              </label>
            </div>

            <label className="admin-field">
              <span>{language === "MN" ? "Тэмдэглэл" : "Note"}</span>
              <input
                type="text"
                value={editModal.note}
                onChange={(e) => setEditModal({ ...editModal, note: e.target.value })}
                disabled={editSaving}
              />
            </label>

            <div className="sale-modal-total-row">
              <span>{language === "MN" ? "Нийт дүн" : "Total"}</span>
              <span className="sale-modal-total-amount">
                {formatStorePrice(editModal.quantity * editModal.unitPrice)}
              </span>
            </div>

            {editError && <p className="sale-modal-error">{editError}</p>}

            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setEditModal(null)} disabled={editSaving}>
                {language === "MN" ? "Цуцлах" : "Cancel"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={editSaving}>
                {editSaving ? (language === "MN" ? "Хадгалж байна..." : "Saving...") : (language === "MN" ? "Хадгалах" : "Save")}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  );
}
