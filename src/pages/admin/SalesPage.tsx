/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
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
  } = ctx;

  const mn = language === "MN";
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>("all");

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
                ? "Борлуулалтын дугаар дээр дарж мэдээллийг засна."
                : "Click a sale number to edit its details."}
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
                <th>{mn ? "Хаяг" : "Address"}</th>
                <th>{mn ? "Нэмэлт" : "Additional"}</th>
                <th className="admin-table-sticky-action">{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleSales.length === 0 ? (
                <tr>
                  <td colSpan={13} className="admin-table-empty">
                    {mn ? "Борлуулалт бүртгэгдээгүй байна." : "No sales registered yet."}
                  </td>
                </tr>
              ) : (
                visibleSales.map((sale: any) => (
                  <tr key={sale.id}>
                    <td>
                      <button type="button" className="admin-table-link" onClick={() => openSaleModal(sale)}>
                        <div className="admin-table-primary">
                          <strong>{sale.saleNumber}</strong>
                          <small>{mn ? "Дарж засварлана" : "Click to edit"}</small>
                        </div>
                      </button>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatAdminDateTime(sale.createdAt, language)}</strong>
                        {sale.createdByName && <small>{sale.createdByName}</small>}
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
                      <div className="admin-table-primary admin-order-table-items admin-table-cell-wrap">
                        <div className="admin-order-table-item-names">
                          {sale.items.map((item: any, itemIndex: number) => (
                            <span key={`${sale.id}-${item.productId}-${item.variant ?? "default"}-${itemIndex}`}>
                              {getProductLabel(item.productId, item.name)}
                              {item.variant ? ` / ${item.variant}` : ""}
                              {` × ${item.quantity}`}
                            </span>
                          ))}
                        </div>
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
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>{getSaleCustomerName(sale) || "-"}</strong>
                        {sale.customer.type === "organization" && sale.customer.fullName && (
                          <small>{sale.customer.fullName}</small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{sale.customer.phoneNumber || "-"}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>
                          {[sale.address.districtOrSoum, sale.address.khorooOrBag].filter(Boolean).join(", ") || "-"}
                        </strong>
                        <small>{sale.address.streetAddress || sale.address.region || "-"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>
                          {[sale.address.additionalAddress, sale.customer.note].filter(Boolean).join(" • ") || "-"}
                        </strong>
                      </div>
                    </td>
                    <td className="admin-table-sticky-action">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={() => openSaleModal(sale)}
                          aria-label={`${copy.edit} ${sale.saleNumber}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleSaleDeleteRequest(sale)}
                          aria-label={`${copy.delete} ${sale.saleNumber}`}
                        >
                          <Trash2 size={15} />
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
