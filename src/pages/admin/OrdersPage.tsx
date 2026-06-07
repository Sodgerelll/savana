/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pencil } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";
import { getProductLabel } from "./adminHelpers";

export default function OrdersPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    orders,
    ordersError,
    paidOrdersCount,
    deliveringOrdersCount,
    deliveredOrdersCount,
    guestOrdersCount,
    openOrderModal,
    formatAdminDateTime,
    formatStorePrice,
    getOrderStatusLabel,
    getOrderStatusClassName,
    getOrderPaymentStatusLabel,
    getOrderTotalQuantity,
    getAuthMethodLabel,
  } = ctx;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.orders}</p>
          <h1>{copy.ordersTitle}</h1>
          <p>{copy.ordersText}</p>
        </div>
      </div>

      {ordersError && <div className="admin-sync-error">{ordersError}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.totalOrders}</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.paidOrders}</span>
          <strong>{paidOrdersCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.deliveringOrders}</span>
          <strong>{deliveringOrdersCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.deliveredOrders}</span>
          <strong>{deliveredOrdersCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.guestOrders}</span>
          <strong>{guestOrdersCount}</strong>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.orders}</h2>
            <p>
              {language === "MN"
                ? "Захиалгын дугаар дээр дарж төлөв болон хүргэлтийн мэдээллийг засна."
                : "Click an order number to edit the status and delivery details."}
            </p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table admin-orders-table">
            <thead>
              <tr>
                <th>{language === "MN" ? "Захиалга" : "Order"}</th>
                <th>{language === "MN" ? "Үүссэн хугацаа" : "Created"}</th>
                <th>{copy.status}</th>
                <th>{language === "MN" ? "Бараа" : "Items"}</th>
                <th>{copy.paymentLabel}</th>
                <th>{language === "MN" ? "Нийт дүн" : "Total"}</th>
                <th>{language === "MN" ? "Эх сурвалж" : "Source"}</th>
                <th>{language === "MN" ? "Хүлээн авагч" : "Recipient"}</th>
                <th>{language === "MN" ? "Утас" : "Phone"}</th>
                <th>{language === "MN" ? "Дүүрэг" : "District"}</th>
                <th>{language === "MN" ? "Баг" : "Bag"}</th>
                <th>{language === "MN" ? "Нэмэлт" : "Additional"}</th>
                <th className="admin-table-sticky-action">{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="admin-table-empty">
                    {copy.emptyOrders}
                  </td>
                </tr>
              ) : (
                orders.map((order: any) => (
                  <tr key={order.id}>
                    <td>
                      <button type="button" className="admin-table-link" onClick={() => openOrderModal(order)}>
                        <div className="admin-table-primary">
                          <strong>{order.orderNumber}</strong>
                          <small>{language === "MN" ? "Дарж засварлана" : "Click to edit"}</small>
                        </div>
                      </button>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatAdminDateTime(order.createdAt, language)}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <span className={getOrderStatusClassName(order.status)}>
                          {getOrderStatusLabel(order.status, language)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-order-table-items admin-table-cell-wrap">
                        <div className="admin-order-table-item-names">
                          {order.items.map((item: any, itemIndex: number) => (
                            <span key={`${order.id}-${item.productId}-${item.variant ?? "default"}-${itemIndex}`}>
                              {getProductLabel(item.productId, item.name)}
                              {item.variant ? ` / ${item.variant}` : ""}
                              {` × ${item.quantity}`}
                            </span>
                          ))}
                        </div>
                        <small>
                          {language === "MN"
                            ? `Нийт ${getOrderTotalQuantity(order)} ширхэг`
                            : `Total ${getOrderTotalQuantity(order)} pcs`}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>
                          {order.payment.method === "cash"
                            ? language === "MN" ? "Бэлэн мөнгө" : "Cash"
                            : order.payment.method === "bank_transfer"
                            ? language === "MN" ? "Банкны шилжүүлэг" : "Bank transfer"
                            : "Bonum"}
                        </strong>
                        <small>{getOrderPaymentStatusLabel(order.payment.status, language)}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatStorePrice(order.totals.grandTotal)}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="admin-table-code">
                        {order.auth.isAnonymous
                          ? language === "MN"
                            ? "Зочин"
                            : "Guest"
                          : getAuthMethodLabel(order.auth.method, language)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{order.customer.fullName || order.customer.phoneNumber || "-"}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{order.customer.phoneNumber}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{order.address.districtOrSoum || "-"}</strong>
                        <small>{order.address.region || "-"}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{order.address.khorooOrBag || "-"}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>{order.address.streetAddress || "-"}</strong>
                        <small>
                          {[order.address.additionalAddress, order.customer.note].filter(Boolean).join(" • ") || "-"}
                        </small>
                      </div>
                    </td>
                    <td className="admin-table-sticky-action">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={() => openOrderModal(order)}
                          aria-label={`${copy.edit} ${order.orderNumber}`}
                        >
                          <Pencil size={15} />
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
