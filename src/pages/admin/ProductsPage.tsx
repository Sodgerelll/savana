/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronDown, ChevronUp, Pencil, Plus, Search, SlidersHorizontal, Store, Trash2, X } from "lucide-react";
import React, { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";

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
  } = ctx;

  const [productTabs, setProductTabs] = useState<Map<number, string>>(new Map());
  const getProductTab = (id: number) => productTabs.get(id) ?? "sales";
  const setProductTab = (id: number, tab: string) =>
    setProductTabs((prev) => new Map(prev).set(id, tab));

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
                    ? variantStock + (product.totalStock ?? 0)
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
                              <strong>{product.name || "Product"}</strong>
                              <small>
                                #{product.id}
                                {product.bestSeller ? ` • ${copy.bestSeller}` : ""}
                              </small>
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
                                    {language === "MN" ? "Борлуулалтын түүх" : "Sales history"}
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
    </>
  );
}
