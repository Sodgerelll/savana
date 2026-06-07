/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronDown, ChevronUp, Pencil, Plus, Search, ShoppingBag, SlidersHorizontal, Store, Trash2, X } from "lucide-react";
import React, { useState } from "react";
import { AdminModal } from "./AdminModal";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";
import { getProductLabel } from "./adminHelpers";

interface DirectSaleModalState {
  product: any;
  variant: string;
  quantity: number;
  unitPrice: number;
  note: string;
}

export default function ProductsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    products,
    activeProducts,
    inactiveProductsCount,
    bestSellerCount,
    totalStockSum,
    totalSoldSum,
    totalRemainingSum,
    filteredProducts,
    selectableCategories,
    collectionNameBySlug,
    lockedProductIds,
    orders,
    customerTransactions,
    productionBatches,
    directSales,
    productSearchName,
    setProductSearchName,
    productFilterCategory,
    setProductFilterCategory,
    productFilterPriceMin,
    setProductFilterPriceMin,
    productFilterPriceMax,
    setProductFilterPriceMax,
    expandedProductId,
    setExpandedProductId,
    openProductModal,
    handleProductDeleteRequest,
    getProductPrimaryImage,
    formatAdminDateTime,
    formatStorePrice,
    setActiveSection,
    createDirectSale,
    updateDirectSale,
    deleteDirectSale,
    openConfirmModal,
    user,
  } = ctx;

  const [productTabs, setProductTabs] = useState<Map<number, string>>(new Map());
  const getProductTab = (id: number) => productTabs.get(id) ?? "sales";
  const setProductTab = (id: number, tab: string) =>
    setProductTabs((prev) => new Map(prev).set(id, tab));

  const [saleModal, setSaleModal] = useState<DirectSaleModalState | null>(null);
  const [saleSaving, setSaleSaving] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  interface EditSaleModal { sale: any; quantity: number; unitPrice: number; note: string; }
  const [editSaleModal, setEditSaleModal] = useState<EditSaleModal | null>(null);
  const [editSaleSaving, setEditSaleSaving] = useState(false);
  const [editSaleError, setEditSaleError] = useState<string | null>(null);

  const openEditSale = (sale: any) => {
    setEditSaleModal({ sale, quantity: sale.quantity, unitPrice: sale.unitPrice, note: sale.note ?? "" });
    setEditSaleError(null);
  };

  const handleEditSaleSave = async () => {
    if (!editSaleModal) return;
    if (editSaleModal.quantity <= 0) { setEditSaleError(language === "MN" ? "Тоо ширхэг 0-ээс их байх ёстой." : "Quantity must be > 0."); return; }
    if (editSaleModal.unitPrice <= 0) { setEditSaleError(language === "MN" ? "Үнэ 0-ээс их байх ёстой." : "Price must be > 0."); return; }
    const editProduct = products.find((p: any) => p.id === editSaleModal.sale.productId);
    if (editProduct) {
      // Old quantity is already in soldCount, so the editable ceiling is
      // current remaining + the original sale quantity.
      const ceiling = getAvailableStock(editProduct, editSaleModal.sale.variant) + editSaleModal.sale.quantity;
      if (editSaleModal.quantity > ceiling) {
        setEditSaleError(language === "MN"
          ? `Нөөц хүрэлцэхгүй байна. Дээд хэмжээ: ${Math.max(0, ceiling)}`
          : `Insufficient stock. Maximum: ${Math.max(0, ceiling)}`);
        return;
      }
    }
    setEditSaleSaving(true);
    setEditSaleError(null);
    try {
      await updateDirectSale(
        editSaleModal.sale.id,
        { productId: editSaleModal.sale.productId, variant: editSaleModal.sale.variant, quantity: editSaleModal.sale.quantity },
        { quantity: editSaleModal.quantity, unitPrice: editSaleModal.unitPrice, note: editSaleModal.note },
      );
      setEditSaleModal(null);
    } catch (err: any) {
      setEditSaleError(formatStockError(err));
    } finally {
      setEditSaleSaving(false);
    }
  };

  const handleDeleteSale = (sale: any) => {
    openConfirmModal({
      title: language === "MN" ? "Устгах уу?" : "Delete sale?",
      description: language === "MN"
        ? `"${sale.saleNumber}" борлуулалтын бүртгэлийг устгах уу?`
        : `Delete sale record "${sale.saleNumber}"?`,
      confirmLabel: copy.delete ?? "Устгах",
      destructive: true,
      onConfirm: () => deleteDirectSale(sale.id, { productId: sale.productId, variant: sale.variant, quantity: sale.quantity }),
    });
  };

  const openSaleModal = (product: any) => {
    const firstVariant = product.variants?.[0]?.name ?? "";
    setSaleModal({
      product,
      variant: firstVariant,
      quantity: 1,
      unitPrice: product.variants?.length ? (product.variants[0]?.price ?? product.price) : product.price,
      note: "",
    });
    setSaleError(null);
  };

  const handleSaleVariantChange = (variantName: string) => {
    if (!saleModal) return;
    const v = saleModal.product.variants?.find((vv: any) => vv.name === variantName);
    setSaleModal({ ...saleModal, variant: variantName, unitPrice: v?.price ?? saleModal.product.price });
  };

  const getAvailableStock = (product: any, variant: string | null): number => {
    if (variant && product?.variants?.length) {
      const v = product.variants.find((vv: any) => vv.name === variant);
      return Number(v?.quantity ?? 0) - Number(v?.soldCount ?? 0);
    }
    return Number(product?.totalStock ?? 0) - Number(product?.soldCount ?? 0);
  };

  const formatStockError = (err: any): string => {
    const msg = err?.message ?? "";
    if (typeof msg === "string" && msg.startsWith("INSUFFICIENT_STOCK:")) {
      const avail = msg.slice("INSUFFICIENT_STOCK:".length);
      return language === "MN"
        ? `Нөөц хүрэлцэхгүй байна. Боломжит үлдэгдэл: ${avail}`
        : `Insufficient stock. Available: ${avail}`;
    }
    return msg || (language === "MN" ? "Алдаа гарлаа." : "Error occurred.");
  };

  const handleSaleSubmit = async () => {
    if (!saleModal) return;
    if (saleModal.quantity <= 0) { setSaleError(language === "MN" ? "Тоо ширхэг 0-ээс их байх ёстой." : "Quantity must be > 0."); return; }
    if (saleModal.unitPrice <= 0) { setSaleError(language === "MN" ? "Үнэ 0-ээс их байх ёстой." : "Price must be > 0."); return; }
    const available = getAvailableStock(saleModal.product, saleModal.variant || null);
    if (saleModal.quantity > available) {
      setSaleError(language === "MN"
        ? `Нөөц хүрэлцэхгүй байна. Боломжит үлдэгдэл: ${Math.max(0, available)}`
        : `Insufficient stock. Available: ${Math.max(0, available)}`);
      return;
    }
    setSaleSaving(true);
    setSaleError(null);
    try {
      await createDirectSale({
        productId: saleModal.product.id,
        productName: saleModal.product.name,
        productImage: getProductPrimaryImage(saleModal.product) ?? null,
        category: saleModal.product.category,
        variant: saleModal.variant || null,
        quantity: saleModal.quantity,
        unitPrice: saleModal.unitPrice,
        note: saleModal.note,
        createdByUid: user?.uid ?? "",
      });
      setSaleModal(null);
    } catch (err: any) {
      setSaleError(formatStockError(err));
    } finally {
      setSaleSaving(false);
    }
  };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.products}</p>
          <h1>{copy.productsTitle}</h1>
          <p>{copy.productsText}</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-outline" onClick={() => setActiveSection("categories")}>
            <Store size={16} />
            {copy.openCategories}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openProductModal()}>
            <Plus size={16} />
            {copy.createProduct}
          </button>
        </div>
      </div>

      {selectableCategories.length === 0 && <div className="admin-sync-error">{copy.noCategories}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span>{copy.totalProducts}</span>
          <strong>{products.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.activeCount}</span>
          <strong>{activeProducts.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.inactiveCount}</span>
          <strong>{inactiveProductsCount}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.bestSellerCount}</span>
          <strong>{bestSellerCount}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.stockRemaining}/{copy.totalStock} - {copy.soldCount}</span>
          <strong>{totalRemainingSum}/{totalStockSum} - {totalSoldSum}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-search">
          <Search size={16} className="admin-filter-search-icon" />
          <input
            type="text"
            placeholder={copy.searchByName}
            value={productSearchName}
            onChange={(e) => setProductSearchName(e.target.value)}
          />
        </div>
        <div className="admin-filter-group">
          <SlidersHorizontal size={14} className="admin-filter-group-icon" />
          <select
            value={productFilterCategory}
            onChange={(e) => setProductFilterCategory(e.target.value)}
          >
            <option value="">{copy.allCategories}</option>
            {selectableCategories.map((cat: any) => (
              <option key={cat.slug} value={cat.slug}>{cat.name}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder={copy.priceMin}
            value={productFilterPriceMin}
            onChange={(e) => setProductFilterPriceMin(e.target.value)}
          />
          <span className="admin-filter-divider">–</span>
          <input
            type="number"
            placeholder={copy.priceMax}
            value={productFilterPriceMax}
            onChange={(e) => setProductFilterPriceMax(e.target.value)}
          />
        </div>
        <div className="admin-filter-meta">
          {(productSearchName || productFilterCategory || productFilterPriceMin || productFilterPriceMax) && (
            <button
              type="button"
              className="admin-filter-clear"
              onClick={() => {
                setProductSearchName("");
                setProductFilterCategory("");
                setProductFilterPriceMin("");
                setProductFilterPriceMax("");
              }}
            >
              <X size={14} />
              {copy.clearFilters}
            </button>
          )}
          <span className="admin-filter-count">
            {filteredProducts.length} / {products.length} {copy.showingResults}
          </span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.products}</h2>
            <p>{copy.productSummary}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.name}</th>
                <th>{copy.category}</th>
                <th className="admin-th-right">{copy.price}</th>
                <th className="admin-th-right">{copy.stockRemaining}/{copy.totalStock} - {copy.soldCount}</th>
                <th>{copy.status}</th>
                <th className="admin-th-right">{copy.actions}</th>
                <th className="admin-th-center"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    {copy.emptyProducts}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product: any) => {
                  const isExpanded = expandedProductId === product.id;
                  const variantStock = product.variants?.length
                    ? product.variants.reduce((s: number, v: any) => s + (v.quantity || 0), 0)
                    : 0;
                  const stock = product.variants?.length
                    ? variantStock
                    : (product.totalStock ?? 0);
                  const sold = product.soldCount ?? 0;
                  const remaining = stock - sold;
                  return (
                    <React.Fragment key={product.id}>
                      <tr
                        className={`admin-product-row-clickable ${isExpanded ? "admin-product-row-expanded" : ""}`}
                        onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                      >
                        <td>
                          <div className="admin-table-primary-row">
                            <div className="admin-product-thumb">
                              {getProductPrimaryImage(product) ? (
                                <img src={getProductPrimaryImage(product)} alt={product.name} />
                              ) : (
                                <span>{product.name.slice(0, 1)}</span>
                              )}
                            </div>
                            <div className="admin-table-primary">
                              <strong>{getProductLabel(product.id, product.name || "Product")}</strong>
                              {product.bestSeller && <small>{copy.bestSeller}</small>}
                            </div>
                          </div>
                        </td>
                        <td>{collectionNameBySlug.get(product.category) ?? product.category}</td>
                        <td className="admin-td-right">{formatStorePrice(product.price)}</td>
                        <td className="admin-td-right">{remaining}/{stock} - {sold}</td>
                        <td>
                          <StatusBadge
                            status={product.status}
                            activeLabel={copy.active}
                            inactiveLabel={copy.inactive}
                          />
                        </td>
                        <td>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-success"
                              onClick={(e) => { e.stopPropagation(); openSaleModal(product); }}
                              aria-label={`${language === "MN" ? "Зарах" : "Sell"} ${product.name}`}
                              title={language === "MN" ? "Зарах" : "Sell"}
                            >
                              <ShoppingBag size={15} />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-neutral"
                              onClick={(e) => { e.stopPropagation(); openProductModal(product); }}
                              aria-label={`${copy.edit} ${product.name}`}
                            >
                              <Pencil size={15} />
                            </button>
                            {!lockedProductIds.has(product.id) && (
                              <button
                                type="button"
                                className="admin-icon-btn"
                                onClick={(e) => { e.stopPropagation(); handleProductDeleteRequest(product); }}
                                aria-label={`${copy.delete} ${product.name}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="admin-td-center">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>
                      {isExpanded && (() => {
                        const productOrders = orders
                          .filter((o: any) => o.items.some((it: any) => it.productId === product.id))
                          .sort((a: any, b: any) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
                        const productTransfers = customerTransactions
                          .filter((tx: any) => tx.items.some((it: any) => it.productId === product.id))
                          .slice()
                          .sort((a: any, b: any) => {
                            const aDate = a.transactionDate ?? a.createdAt ?? "";
                            const bDate = b.transactionDate ?? b.createdAt ?? "";
                            return bDate.localeCompare(aDate);
                          });
                        const productDirectSales = (directSales ?? [])
                          .filter((s: any) => s.productId === product.id)
                          .slice()
                          .sort((a: any, b: any) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
                        const readyBatches = (productionBatches ?? [])
                          .filter((b: any) => b.productId === product.id && b.status === "ready")
                          .slice()
                          .sort((a: any, b: any) => (b.readyAt ?? "").localeCompare(a.readyAt ?? ""));
                        const activeTab = getProductTab(product.id);
                        return (
                          <tr className="admin-product-expand-row">
                            <td colSpan={7}>
                              <div className="admin-product-expand">
                                <div className="admin-product-expand-top">
                                  <div className="admin-product-expand-stats">
                                    <div className="admin-expand-stat">
                                      <small>{copy.stockRemaining}/{copy.totalStock} - {copy.soldCount}</small>
                                      <strong>{remaining}/{stock} - {sold}</strong>
                                    </div>
                                  </div>
                                  {product.variants?.length ? (
                                    <div className="admin-product-expand-variants">
                                      {product.variants.map((v: any, i: number) => {
                                        const vRemaining = (v.quantity || 0) - (v.soldCount ?? 0);
                                        return (
                                          <div key={i} className="admin-product-expand-variant">
                                            <span className="admin-expand-variant-name">{v.name}</span>
                                            <span>{formatStorePrice(v.price)}</span>
                                            <span className="admin-expand-variant-stock">{vRemaining}/{v.quantity || 0} - {v.soldCount ?? 0}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>

                                <div className="admin-expand-tabs">
                                  <button
                                    type="button"
                                    className={`admin-expand-tab${activeTab === "sales" ? " active" : ""}`}
                                    onClick={() => setProductTab(product.id, "sales")}
                                  >
                                    {language === "MN" ? "Захиалга" : "Orders"}
                                    {productOrders.length > 0 && (
                                      <span className="admin-expand-tab-badge">{productOrders.length}</span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className={`admin-expand-tab${activeTab === "directSales" ? " active" : ""}`}
                                    onClick={() => setProductTab(product.id, "directSales")}
                                  >
                                    {language === "MN" ? "Шууд борлуулалт" : "Direct sales"}
                                    {productDirectSales.length > 0 && (
                                      <span className="admin-expand-tab-badge">{productDirectSales.length}</span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className={`admin-expand-tab${activeTab === "transfers" ? " active" : ""}`}
                                    onClick={() => setProductTab(product.id, "transfers")}
                                  >
                                    {language === "MN" ? "Борлуулагч руу шилжүүлсэн" : "Seller transfers"}
                                    {productTransfers.length > 0 && (
                                      <span className="admin-expand-tab-badge">{productTransfers.length}</span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className={`admin-expand-tab${activeTab === "production" ? " active" : ""}`}
                                    onClick={() => setProductTab(product.id, "production")}
                                  >
                                    {language === "MN" ? "Үйлдвэрлэлийн нийлүүлэлт" : "Production supply"}
                                    {readyBatches.length > 0 && (
                                      <span className="admin-expand-tab-badge">{readyBatches.length}</span>
                                    )}
                                  </button>
                                </div>

                                {activeTab === "sales" && (
                                  <div className="admin-product-expand-section">
                                    {productOrders.length === 0 ? (
                                      <p className="admin-expand-empty">{language === "MN" ? "Борлуулалт байхгүй" : "No sales yet"}</p>
                                    ) : (
                                      <div className="admin-expand-sales-table-wrap">
                                        <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                          <thead>
                                            <tr>
                                              <th style={{ width: "2rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>#</th>
                                              <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>{language === "MN" ? "Огноо" : "Date"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Захиалга" : "Order"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Variant" : "Variant"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Тоо" : "Qty"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Үнэ" : "Price"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Нийт" : "Total"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Төлөв" : "Status"}</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {(() => {
                                              let rowNum = 0;
                                              return productOrders.map((o: any) =>
                                                o.items
                                                  .filter((it: any) => it.productId === product.id)
                                                  .map((it: any, idx: number) => {
                                                    rowNum++;
                                                    return (
                                                      <tr key={`${o.id}-${idx}`}>
                                                        <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>{rowNum}</td>
                                                        <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>{formatAdminDateTime(o.createdAt, language)}</td>
                                                        <td style={{ textAlign: "center" }}><small>#{o.orderNumber}</small></td>
                                                        <td style={{ textAlign: "center" }}>{it.variant || "—"}</td>
                                                        <td style={{ textAlign: "center" }}>{it.quantity}</td>
                                                        <td style={{ textAlign: "center" }}>{formatStorePrice(it.unitPrice)}</td>
                                                        <td style={{ textAlign: "center" }}><strong>{formatStorePrice(it.lineTotal)}</strong></td>
                                                        <td style={{ textAlign: "center" }}>
                                                          <span className={`admin-expand-order-status admin-expand-order-${o.status}`}>
                                                            {o.status}
                                                          </span>
                                                        </td>
                                                      </tr>
                                                    );
                                                  })
                                              );
                                            })()}
                                          </tbody>
                                          <tfoot>
                                            <tr>
                                              <td></td>
                                              <td colSpan={3} style={{ textAlign: "center" }}><strong>{language === "MN" ? "Нийт" : "Total"}</strong></td>
                                              <td style={{ textAlign: "center" }}><strong>{productOrders.reduce((s: number, o: any) => s + o.items.filter((it: any) => it.productId === product.id).reduce((a: number, it: any) => a + it.quantity, 0), 0)}</strong></td>
                                              <td></td>
                                              <td style={{ textAlign: "center" }}><strong>{formatStorePrice(productOrders.reduce((s: number, o: any) => s + o.items.filter((it: any) => it.productId === product.id).reduce((a: number, it: any) => a + it.lineTotal, 0), 0))}</strong></td>
                                              <td></td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {activeTab === "directSales" && (
                                  <div className="admin-product-expand-section">
                                    {productDirectSales.length === 0 ? (
                                      <p className="admin-expand-empty">{language === "MN" ? "Шууд борлуулалт байхгүй" : "No direct sales yet"}</p>
                                    ) : (
                                      <div className="admin-expand-sales-table-wrap">
                                        <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                          <thead>
                                            <tr>
                                              <th style={{ width: "2rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>#</th>
                                              <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>{language === "MN" ? "Огноо" : "Date"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Дугаар" : "Number"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Variant" : "Variant"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Тоо" : "Qty"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Үнэ" : "Price"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Нийт" : "Total"}</th>
                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Тэмдэглэл" : "Note"}</th>
                                              <th></th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {productDirectSales.map((s: any, idx: number) => (
                                              <tr key={s.id}>
                                                <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>{idx + 1}</td>
                                                <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>{formatAdminDateTime(s.createdAt, language)}</td>
                                                <td style={{ textAlign: "center" }}><small>{s.saleNumber}</small></td>
                                                <td style={{ textAlign: "center" }}>{s.variant || "—"}</td>
                                                <td style={{ textAlign: "center" }}>{s.quantity}</td>
                                                <td style={{ textAlign: "center" }}>{formatStorePrice(s.unitPrice)}</td>
                                                <td style={{ textAlign: "center" }}><strong>{formatStorePrice(s.lineTotal)}</strong></td>
                                                <td style={{ textAlign: "center", color: "#888", fontSize: "0.82rem" }}>{s.note || "—"}</td>
                                                <td>
                                                  <div className="admin-table-actions">
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn admin-icon-btn-neutral"
                                                      onClick={(e) => { e.stopPropagation(); openEditSale(s); }}
                                                      title={language === "MN" ? "Засах" : "Edit"}
                                                    >
                                                      <Pencil size={13} />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn"
                                                      onClick={(e) => { e.stopPropagation(); handleDeleteSale(s); }}
                                                      title={language === "MN" ? "Устгах" : "Delete"}
                                                    >
                                                      <Trash2 size={14} />
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr>
                                              <td></td>
                                              <td colSpan={3} style={{ textAlign: "center" }}><strong>{language === "MN" ? "Нийт" : "Total"}</strong></td>
                                              <td style={{ textAlign: "center" }}>
                                                <strong>{productDirectSales.reduce((s: number, r: any) => s + r.quantity, 0)}</strong>
                                              </td>
                                              <td></td>
                                              <td style={{ textAlign: "center" }}>
                                                <strong>{formatStorePrice(productDirectSales.reduce((s: number, r: any) => s + r.lineTotal, 0))}</strong>
                                              </td>
                                              <td></td>
                                              <td></td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {activeTab === "transfers" && (
                                  <div className="admin-product-expand-section">
                                    {productTransfers.length === 0 ? (
                                      <p className="admin-expand-empty">{language === "MN" ? "Шилжүүлэлт байхгүй" : "No transfers yet"}</p>
                                    ) : (() => {
                                      const totalQty = productTransfers.reduce(
                                        (s: number, tx: any) => s + tx.items.filter((it: any) => it.productId === product.id).reduce((a: number, it: any) => a + it.quantity, 0), 0,
                                      );
                                      const totalSoldQty = productTransfers.reduce(
                                        (s: number, tx: any) => s + tx.items.filter((it: any) => it.productId === product.id).reduce((a: number, it: any) => a + it.soldQuantity, 0), 0,
                                      );
                                      const totalAmount = productTransfers.reduce(
                                        (s: number, tx: any) => s + tx.items.filter((it: any) => it.productId === product.id).reduce((a: number, it: any) => a + it.lineTotal, 0), 0,
                                      );
                                      return (
                                        <div className="admin-expand-sales-table-wrap">
                                          <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                            <thead>
                                              <tr>
                                                <th style={{ width: "2rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>#</th>
                                                <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>{language === "MN" ? "Огноо" : "Date"}</th>
                                                <th style={{ textAlign: "center" }}>{copy.txCustomer}</th>
                                                <th style={{ textAlign: "center" }}>{copy.txVariant}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Зарсан" : "Sold"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Үнэ" : "Price"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Нийт" : "Total"}</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {(() => {
                                                let rowNum = 0;
                                                return productTransfers.map((tx: any) =>
                                                  tx.items
                                                    .filter((it: any) => it.productId === product.id)
                                                    .map((it: any, idx: number) => {
                                                      rowNum++;
                                                      return (
                                                        <tr key={`${tx.id}-${idx}`}>
                                                          <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>{rowNum}</td>
                                                          <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>
                                                            {formatAdminDateTime(tx.transactionDate ?? tx.createdAt, language)}
                                                          </td>
                                                          <td style={{ textAlign: "center" }}>
                                                            <strong>{tx.customerSnapshot.name}</strong>
                                                          </td>
                                                          <td style={{ textAlign: "center" }}>{it.variant || "—"}</td>
                                                          <td style={{ textAlign: "center" }}>{it.quantity}</td>
                                                          <td style={{ textAlign: "center" }}>{it.soldQuantity}</td>
                                                          <td style={{ textAlign: "center" }}>
                                                            <strong style={{ color: it.quantity - it.soldQuantity > 0 ? "#b14141" : "#2f7a4a" }}>
                                                              {it.quantity - it.soldQuantity}
                                                            </strong>
                                                          </td>
                                                          <td style={{ textAlign: "center" }}>{formatStorePrice(it.unitPrice)}</td>
                                                          <td style={{ textAlign: "center" }}>
                                                            <strong>{formatStorePrice(it.lineTotal)}</strong>
                                                          </td>
                                                        </tr>
                                                      );
                                                    }),
                                                );
                                              })()}
                                            </tbody>
                                            <tfoot>
                                              <tr>
                                                <td></td>
                                                <td colSpan={3} style={{ textAlign: "center" }}>
                                                  <strong>{language === "MN" ? "Нийт" : "Total"}</strong>
                                                </td>
                                                <td style={{ textAlign: "center" }}><strong>{totalQty}</strong></td>
                                                <td style={{ textAlign: "center" }}><strong>{totalSoldQty}</strong></td>
                                                <td style={{ textAlign: "center" }}>
                                                  <strong style={{ color: totalQty - totalSoldQty > 0 ? "#b14141" : "#2f7a4a" }}>
                                                    {totalQty - totalSoldQty}
                                                  </strong>
                                                </td>
                                                <td></td>
                                                <td style={{ textAlign: "center" }}><strong>{formatStorePrice(totalAmount)}</strong></td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}

                                {activeTab === "production" && (() => {
                                  const totalSupplied = readyBatches.reduce((s: number, b: any) => s + (b.actualQuantity ?? 0), 0);
                                  return (
                                    <div className="admin-product-expand-section">
                                      {readyBatches.length === 0 ? (
                                        <p className="admin-expand-empty">
                                          {language === "MN" ? "Үйлдвэрлэлийн бэлэн болсон batch байхгүй" : "No completed batches yet"}
                                        </p>
                                      ) : (
                                        <div className="admin-expand-sales-table-wrap">
                                          <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                            <thead>
                                              <tr>
                                                <th style={{ width: "2rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>#</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Batch код" : "Batch code"}</th>
                                                <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>{language === "MN" ? "Бэлэн болсон огноо" : "Ready date"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Бодит тоо (ш)" : "Actual qty"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Нийт өртөг" : "Total cost"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Нэгжийн өртөг" : "Unit cost"}</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {readyBatches.map((b: any, idx: number) => {
                                                const unitCost = b.actualQuantity > 0 ? Math.round(b.totalCost / b.actualQuantity) : 0;
                                                return (
                                                  <tr key={b.id}>
                                                    <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>{idx + 1}</td>
                                                    <td style={{ textAlign: "center" }}><strong>{b.batchCode}</strong></td>
                                                    <td style={{ whiteSpace: "nowrap", textAlign: "center" }}>
                                                      {formatAdminDateTime(b.readyAt, language)}
                                                    </td>
                                                    <td style={{ textAlign: "center" }}>
                                                      <strong style={{ color: "#059669" }}>+{b.actualQuantity ?? 0}</strong>
                                                    </td>
                                                    <td style={{ textAlign: "center" }}>
                                                      {b.totalCost > 0 ? formatStorePrice(b.totalCost) : "—"}
                                                    </td>
                                                    <td style={{ textAlign: "center" }}>
                                                      {unitCost > 0 ? formatStorePrice(unitCost) : "—"}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                            <tfoot>
                                              <tr>
                                                <td></td>
                                                <td colSpan={2} style={{ textAlign: "center" }}>
                                                  <strong>{language === "MN" ? "Нийт нийлүүлэгдсэн" : "Total supplied"}</strong>
                                                </td>
                                                <td style={{ textAlign: "center" }}>
                                                  <strong style={{ color: "#059669" }}>+{totalSupplied}</strong>
                                                </td>
                                                <td style={{ textAlign: "center" }}>
                                                  <strong>{formatStorePrice(readyBatches.reduce((s: number, b: any) => s + b.totalCost, 0))}</strong>
                                                </td>
                                                <td></td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {saleModal && (
        <AdminModal
          title={language === "MN" ? "Бараа зарах" : "Sell product"}
          onClose={() => !saleSaving && setSaleModal(null)}
          disableClose={saleSaving}
        >
          <div className="admin-modal-form">
            {/* Product info card */}
            <div className="sale-modal-product-card">
              {getProductPrimaryImage(saleModal.product) ? (
                <img
                  className="sale-modal-product-img"
                  src={getProductPrimaryImage(saleModal.product)}
                  alt={saleModal.product.name}
                />
              ) : (
                <div className="sale-modal-product-img sale-modal-product-img-placeholder">
                  {saleModal.product.name.slice(0, 1)}
                </div>
              )}
              <div className="sale-modal-product-info">
                <strong>{getProductLabel(saleModal.product.id, saleModal.product.name)}</strong>
                <span>{collectionNameBySlug?.get(saleModal.product.category) ?? saleModal.product.category}</span>
                <span className="sale-modal-list-price">
                  {language === "MN" ? "Жагсаалтын үнэ" : "List price"}: <strong>{formatStorePrice(saleModal.product.price)}</strong>
                </span>
              </div>
            </div>

            {/* Variant */}
            {saleModal.product.variants?.length > 0 && (
              <label className="admin-field">
                <span>{language === "MN" ? "Хэмжээ / Variant" : "Variant"}</span>
                <select
                  value={saleModal.variant}
                  onChange={(e) => handleSaleVariantChange(e.target.value)}
                  disabled={saleSaving}
                >
                  {saleModal.product.variants.map((v: any) => (
                    <option key={v.name} value={v.name}>{v.name} — {formatStorePrice(v.price)}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Qty + Price side by side */}
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{language === "MN" ? "Тоо ширхэг" : "Quantity"}</span>
                <input
                  type="number"
                  min={1}
                  value={saleModal.quantity}
                  onChange={(e) => setSaleModal({ ...saleModal, quantity: Math.max(1, Number(e.target.value)) })}
                  disabled={saleSaving}
                />
              </label>
              <label className="admin-field">
                <span>{language === "MN" ? "Зарсан үнэ (₮)" : "Sale price (₮)"}</span>
                <input
                  type="number"
                  min={0}
                  value={saleModal.unitPrice}
                  onChange={(e) => setSaleModal({ ...saleModal, unitPrice: Number(e.target.value) })}
                  disabled={saleSaving}
                />
              </label>
            </div>

            {/* Note */}
            <label className="admin-field">
              <span>{language === "MN" ? "Тэмдэглэл (заавал биш)" : "Note (optional)"}</span>
              <input
                type="text"
                value={saleModal.note}
                onChange={(e) => setSaleModal({ ...saleModal, note: e.target.value })}
                disabled={saleSaving}
                placeholder={language === "MN" ? "Тэмдэглэл..." : "Note..."}
              />
            </label>

            {/* Total row */}
            <div className="sale-modal-total-row">
              <span>{language === "MN" ? "Нийт дүн" : "Total"}</span>
              <strong className="sale-modal-total-amount">
                {formatStorePrice(saleModal.quantity * saleModal.unitPrice)}
              </strong>
            </div>

            {saleError && <p className="sale-modal-error">{saleError}</p>}

            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setSaleModal(null)} disabled={saleSaving}>
                {language === "MN" ? "Болих" : "Cancel"}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaleSubmit} disabled={saleSaving}>
                {saleSaving
                  ? (language === "MN" ? "Хадгалж байна..." : "Saving...")
                  : (language === "MN" ? "Зарах" : "Record sale")}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {editSaleModal && (
        <AdminModal
          title={language === "MN" ? "Борлуулалт засах" : "Edit sale"}
          onClose={() => !editSaleSaving && setEditSaleModal(null)}
          disableClose={editSaleSaving}
        >
          <form
            className="admin-modal-form"
            onSubmit={(e) => { e.preventDefault(); handleEditSaleSave(); }}
          >
            <div className="sale-modal-product-card">
              {editSaleModal.sale.productImage ? (
                <img className="sale-modal-product-img" src={editSaleModal.sale.productImage} alt={editSaleModal.sale.productName} />
              ) : (
                <div className="sale-modal-product-img sale-modal-product-img-placeholder">
                  {editSaleModal.sale.productName.slice(0, 1)}
                </div>
              )}
              <div className="sale-modal-product-info">
                <strong>{getProductLabel(editSaleModal.sale.productId, editSaleModal.sale.productName)}</strong>
                <span>{editSaleModal.sale.variant ? `Variant: ${editSaleModal.sale.variant}` : (language === "MN" ? "Variant байхгүй" : "No variant")}</span>
                <span style={{ fontSize: "0.8rem", color: "#888" }}>{editSaleModal.sale.saleNumber}</span>
              </div>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{language === "MN" ? "Тоо ширхэг" : "Quantity"}</span>
                <input
                  type="number"
                  min="1"
                  value={editSaleModal.quantity}
                  onChange={(e) => setEditSaleModal({ ...editSaleModal, quantity: Number(e.target.value) || 0 })}
                  required
                  disabled={editSaleSaving}
                />
              </label>
              <label className="admin-field">
                <span>{language === "MN" ? "Зарсан үнэ (нэгж)" : "Sale price (unit)"}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editSaleModal.unitPrice}
                  onChange={(e) => setEditSaleModal({ ...editSaleModal, unitPrice: Number(e.target.value) || 0 })}
                  required
                  disabled={editSaleSaving}
                />
              </label>
            </div>

            <label className="admin-field">
              <span>{language === "MN" ? "Тэмдэглэл" : "Note"}</span>
              <input
                type="text"
                value={editSaleModal.note}
                onChange={(e) => setEditSaleModal({ ...editSaleModal, note: e.target.value })}
                disabled={editSaleSaving}
              />
            </label>

            <div className="sale-modal-total-row">
              <span>{language === "MN" ? "Нийт дүн" : "Total"}</span>
              <span className="sale-modal-total-amount">
                {formatStorePrice(editSaleModal.quantity * editSaleModal.unitPrice)}
              </span>
            </div>

            {editSaleError && <p className="sale-modal-error">{editSaleError}</p>}

            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setEditSaleModal(null)} disabled={editSaleSaving}>
                {language === "MN" ? "Цуцлах" : "Cancel"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={editSaleSaving}>
                {editSaleSaving ? (language === "MN" ? "Хадгалж байна..." : "Saving...") : (language === "MN" ? "Хадгалах" : "Save")}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  );
}
