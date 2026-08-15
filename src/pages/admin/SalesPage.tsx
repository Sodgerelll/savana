/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronDown, ChevronUp, Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import { getProductLabel } from "./adminHelpers";

export default function SalesPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    sales,
    salesError,
    paidSalesCount,
    deliveredSalesCount,
    individualSalesCount,
    organizationSalesCount,
    salesRevenueTotal,
    saleChannelOptions,
    saleCustomerTypeOptions,
    openSaleModal,
    openSaleCreateModal,
    handleSaleDeleteRequest,
    formatAdminDateTime,
    formatStorePrice,
    getOrderStatusLabel,
    getOrderStatusClassName,
    getSaleChannelLabel,
    getSaleCustomerTypeLabel,
    getSaleCustomerName,
    getOrderTotalQuantity,
    crmContacts,
  } = ctx;

  const mn = language === "MN";
  // Sales booked against a directory customer show that customer's code, so it is visible
  // at a glance which rows are tied to a registered харилцагч and which were typed by hand.
  const contactCodeById = useMemo(
    () => new Map((crmContacts as any[]).map((contact: any) => [contact.id, contact.code])),
    [crmContacts],
  );
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>("all");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const visibleSales = useMemo(
    () =>
      (sales as any[]).filter((sale: any) => {
        if (channelFilter !== "all" && sale.channel !== channelFilter) return false;
        if (customerTypeFilter !== "all" && sale.customer.type !== customerTypeFilter) return false;
        return true;
      }),
    [sales, channelFilter, customerTypeFilter],
  );

  const filtersActive = channelFilter !== "all" || customerTypeFilter !== "all";

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{mn ? "Борлуулалт" : "Sales"}</p>
          <h1>{mn ? "Борлуулалтын бүртгэл" : "Sales register"}</h1>
          <p>
            {mn
              ? "Дэлгүүр, мессенжер, утас гэх мэт онлайнаас бусад бүх сувгийн борлуулалт."
              : "Every sale made outside the online store — walk-in, Messenger, phone and more."}
          </p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-primary" onClick={openSaleCreateModal}>
            <Plus size={16} />
            {mn ? "Борлуулалт бүртгэх" : "Register a sale"}
          </button>
        </div>
      </div>

      {salesError && <div className="admin-sync-error">{salesError}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Нийт борлуулалт" : "Total sales"}</span>
          <strong>{sales.length}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Төлбөр төлөгдсөн" : "Paid"}</span>
          <strong>{paidSalesCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Хүргэгдсэн" : "Delivered"}</span>
          <strong>{deliveredSalesCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Хувь хүн" : "Individuals"}</span>
          <strong>{individualSalesCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Байгууллага" : "Organizations"}</span>
          <strong>{organizationSalesCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Нийт дүн" : "Revenue"}</span>
          <strong>{formatStorePrice(salesRevenueTotal)}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-group">
          <SlidersHorizontal size={14} className="admin-filter-group-icon" />
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            <option value="all">{mn ? "Бүх суваг" : "All channels"}</option>
            {(saleChannelOptions as any[]).map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <select value={customerTypeFilter} onChange={(event) => setCustomerTypeFilter(event.target.value)}>
            <option value="all">{mn ? "Бүх харилцагч" : "All customer types"}</option>
            {(saleCustomerTypeOptions as any[]).map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-meta">
          {filtersActive && (
            <button
              type="button"
              className="admin-filter-clear"
              onClick={() => {
                setChannelFilter("all");
                setCustomerTypeFilter("all");
              }}
            >
              <X size={14} />
              {mn ? "Цэвэрлэх" : "Clear"}
            </button>
          )}
          <span className="admin-filter-count">
            {visibleSales.length} / {sales.length} {mn ? "үр дүн" : "results"}
          </span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{mn ? "Борлуулалт" : "Sales"}</h2>
            <p>
              {mn
                ? "Мөр дээр дарж борлуулсан бүтээгдэхүүний жагсаалтыг харна."
                : "Click a row to see the products sold in that sale."}
            </p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table admin-orders-table">
            <thead>
              <tr>
                <th>{mn ? "Борлуулалт" : "Sale"}</th>
                <th>{mn ? "Үүссэн хугацаа" : "Created"}</th>
                <th>{mn ? "Суваг" : "Channel"}</th>
                <th>{mn ? "Харилцагчийн төрөл" : "Customer type"}</th>
                <th>{copy.status}</th>
                <th>{mn ? "Бараа" : "Items"}</th>
                <th>{copy.paymentLabel}</th>
                <th>{mn ? "Нийт дүн" : "Total"}</th>
                <th>{mn ? "Харилцагч" : "Customer"}</th>
                <th>{mn ? "Утас" : "Phone"}</th>
                <th style={{ width: "2.5rem" }}></th>
                <th className="admin-table-sticky-action">{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleSales.length === 0 ? (
                <tr>
                  <td colSpan={12} className="admin-table-empty">
                    {mn ? "Борлуулалт бүртгэгдээгүй байна." : "No sales registered yet."}
                  </td>
                </tr>
              ) : (
                visibleSales.map((sale: any) => {
                  const isExpanded = expandedSaleId === sale.id;
                  return (
                  <Fragment key={sale.id}>
                  <tr
                    className={`admin-product-row-clickable ${isExpanded ? "admin-product-row-expanded" : ""}`}
                    onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                  >
                    <td>
                      <div className="admin-table-primary">
                        <strong>{sale.saleNumber}</strong>
                        <small>{mn ? "Дарж дэлгэрэнгүйг харна" : "Click for details"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatAdminDateTime(sale.createdAt, language)}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{getSaleChannelLabel(sale.channel, language)}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{getSaleCustomerTypeLabel(sale.customer.type, language)}</strong>
                        {sale.customer.type === "organization" && sale.customer.registrationNumber && (
                          <small>
                            {mn ? "РД" : "Reg."}: {sale.customer.registrationNumber}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <span className={getOrderStatusClassName(sale.status)}>
                          {getOrderStatusLabel(sale.status, language)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>
                          {mn
                            ? `${sale.items.length} нэр төрөл`
                            : `${sale.items.length} ${sale.items.length === 1 ? "product" : "products"}`}
                        </strong>
                        <small>
                          {mn
                            ? `Нийт ${getOrderTotalQuantity(sale)} ширхэг`
                            : `Total ${getOrderTotalQuantity(sale)} pcs`}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>
                          {sale.paymentMethod === "cash"
                            ? mn ? "Бэлэн мөнгө" : "Cash"
                            : sale.paymentMethod === "bank_transfer"
                            ? mn ? "Банкны шилжүүлэг" : "Bank transfer"
                            : "Bonum"}
                        </strong>
                        <small>
                          {sale.status === "new"
                            ? mn ? "Хүлээгдэж буй" : "Pending"
                            : mn ? "Төлөгдсөн" : "Paid"}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatStorePrice(sale.totals.grandTotal)}</strong>
                        {sale.totals.discountTotal > 0 && (
                          <small>
                            {mn ? "Хямдрал" : "Discount"}: −{formatStorePrice(sale.totals.discountTotal)}
                          </small>
                        )}
                        {(sale.totals.vatAmount ?? 0) > 0 && (
                          <small>
                            {mn ? "НӨАТ" : "VAT"}: {formatStorePrice(sale.totals.vatAmount)}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>{getSaleCustomerName(sale) || "-"}</strong>
                        {sale.customer.type === "organization" && sale.customer.fullName && (
                          <small>{sale.customer.fullName}</small>
                        )}
                        {contactCodeById.get(sale.customer.contactId) && (
                          <small>{contactCodeById.get(sale.customer.contactId)}</small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{sale.customer.phoneNumber || "-"}</strong>
                      </div>
                    </td>
                    <td className="admin-td-center">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                    <td className="admin-table-sticky-action">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSaleModal(sale);
                          }}
                          aria-label={`${copy.edit} ${sale.saleNumber}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSaleDeleteRequest(sale);
                          }}
                          aria-label={`${copy.delete} ${sale.saleNumber}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="admin-product-expand-row">
                      <td colSpan={12}>
                        <div className="admin-product-expand">
                          <div className="admin-product-expand-section">
                            <div className="admin-expand-sales-table-wrap">
                              <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: "2rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>
                                      #
                                    </th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Бүтээгдэхүүн" : "Product"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Ангилал" : "Category"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Хэмжээ" : "Variant"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Тоо" : "Qty"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Нэгж үнэ" : "Unit price"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Хямдрал" : "Discount"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Нийт" : "Total"}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sale.items.map((item: any, itemIndex: number) => {
                                    const listPrice = item.originalUnitPrice ?? item.unitPrice;
                                    const lineDiscount = Math.max(0, listPrice - item.unitPrice) * item.quantity;
                                    return (
                                      <tr key={`${sale.id}-${item.productId}-${item.variant ?? "default"}-${itemIndex}`}>
                                        <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>
                                          {itemIndex + 1}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                          {getProductLabel(item.productId, item.name)}
                                        </td>
                                        <td style={{ textAlign: "center" }}>{item.category || "—"}</td>
                                        <td style={{ textAlign: "center" }}>{item.variant || "—"}</td>
                                        <td style={{ textAlign: "center" }}>{item.quantity}</td>
                                        <td style={{ textAlign: "center" }}>
                                          {lineDiscount > 0 ? (
                                            <div
                                              style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 2,
                                              }}
                                            >
                                              <s style={{ color: "#9ca3af", fontSize: "0.78rem" }}>
                                                {formatStorePrice(listPrice)}
                                              </s>
                                              <span style={{ color: "#dc2626" }}>{formatStorePrice(item.unitPrice)}</span>
                                            </div>
                                          ) : (
                                            formatStorePrice(item.unitPrice)
                                          )}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                          {lineDiscount > 0 ? (
                                            <span style={{ color: "#dc2626" }}>−{formatStorePrice(lineDiscount)}</span>
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                          <strong>{formatStorePrice(item.lineTotal)}</strong>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td></td>
                                    <td colSpan={3} style={{ textAlign: "center" }}>
                                      <strong>{mn ? "Нийт" : "Total"}</strong>
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                      <strong>{getOrderTotalQuantity(sale)}</strong>
                                    </td>
                                    <td></td>
                                    <td style={{ textAlign: "center" }}>
                                      {sale.totals.discountTotal > 0 ? (
                                        <strong style={{ color: "#dc2626" }}>
                                          −{formatStorePrice(sale.totals.discountTotal)}
                                        </strong>
                                      ) : (
                                        ""
                                      )}
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                      <strong>{formatStorePrice(sale.totals.subtotal)}</strong>
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>

                          <div className="admin-product-expand-stats">
                            <div className="admin-expand-stat">
                              <small>{mn ? "Барааны дүн" : "Subtotal"}</small>
                              <strong>{formatStorePrice(sale.totals.subtotal)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>
                                {mn ? "НӨАТ (10%)" : "VAT (10%)"}
                                {sale.totals.vatMode === "included"
                                  ? mn ? " · үнэд багтсан" : " · included"
                                  : sale.totals.vatMode === "added"
                                    ? mn ? " · нэмэгдсэн" : " · added"
                                    : ""}
                              </small>
                              <strong>{formatStorePrice(sale.totals.vatAmount ?? 0)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Хүргэлтийн үнэ" : "Shipping fee"}</small>
                              <strong>{formatStorePrice(sale.totals.shippingFee)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Нийт дүн" : "Grand total"}</small>
                              <strong>{formatStorePrice(sale.totals.grandTotal)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Хаяг" : "Address"}</small>
                              <strong>
                                {[
                                  sale.address.region,
                                  sale.address.districtOrSoum,
                                  sale.address.khorooOrBag,
                                  sale.address.streetAddress,
                                  sale.address.additionalAddress,
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                              </strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Тэмдэглэл" : "Note"}</small>
                              <strong>{sale.customer.note || "—"}</strong>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
