import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";
import type { Discount } from "../../data/products";
import { getProductLabel } from "./adminHelpers";
import { formatStorePrice, isDiscountActive, localDateKey } from "../../lib/storefrontHelpers";

export default function DiscountsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    products,
    discounts,
    openDiscountModal,
    handleDiscountDeleteRequest,
  } = ctx;

  function getProductName(productId: number) {
    return products.find((p: { id: number; name: string }) => p.id === productId)?.name ?? `#${productId}`;
  }

  function getProductPrice(productId: number) {
    return products.find((p: { id: number; price: number }) => p.id === productId)?.price ?? 0;
  }

  function getDiscountedPrice(discount: Discount) {
    const price = getProductPrice(discount.productId);
    if (discount.type === "percent") {
      return Math.round(price * (1 - discount.value / 100));
    }
    return Math.max(0, price - discount.value);
  }

  const today = localDateKey();
  const activeDiscounts = discounts.filter((d: Discount) => isDiscountActive(d, today));
  const inactiveCount = discounts.length - activeDiscounts.length;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.discountsMenu}</p>
          <h1>{copy.discountsTitle}</h1>
          <p>{copy.discountsText}</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-primary" onClick={() => openDiscountModal()}>
            <Plus size={16} />
            {copy.addDiscount}
          </button>
        </div>
      </div>

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span>{copy.discountsMenu}</span>
          <strong>{discounts.length}</strong>
          <small>{copy.discountsText}</small>
        </div>
        <div className="admin-summary-card">
          <span>{copy.activeCount}</span>
          <strong>{activeDiscounts.length}</strong>
          <small>{copy.activeOnWebsite}</small>
        </div>
        <div className="admin-summary-card">
          <span>{copy.inactiveCount}</span>
          <strong>{inactiveCount}</strong>
          <small>{copy.statusSummary}</small>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.discountsMenu}</h2>
            <p>{copy.discountsText}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.discountProduct}</th>
                <th>{copy.discountType}</th>
                <th>{copy.discountValue}</th>
                <th>{copy.discountStartAt}</th>
                <th>{copy.discountEndAt}</th>
                <th>{copy.status}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {discounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    {copy.discountEmpty}
                  </td>
                </tr>
              ) : (
                discounts.map((discount: Discount) => (
                  <tr key={discount.id}>
                    <td>
                      <div className="admin-table-primary-row">
                        <div className="admin-product-thumb" style={{ width: 30, height: 30, flexShrink: 0 }}>
                          <Tag size={14} />
                        </div>
                        <div className="admin-table-primary">
                          <strong>{getProductLabel(discount.productId, getProductName(discount.productId))}</strong>
                          <small style={{ opacity: 0.55 }}>
                            ID: {discount.productId}
                            {" · "}
                            {formatStorePrice(getProductPrice(discount.productId))} → {formatStorePrice(getDiscountedPrice(discount))}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {discount.type === "percent" ? copy.discountTypePercent : copy.discountTypeAmount}
                    </td>
                    <td>
                      {discount.type === "percent"
                        ? `${discount.value}%`
                        : formatStorePrice(discount.value)}
                    </td>
                    <td>{discount.startAt}</td>
                    <td>{discount.endAt}</td>
                    <td>
                      <StatusBadge
                        status={discount.status}
                        activeLabel={copy.active}
                        inactiveLabel={copy.inactive}
                      />
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={() => openDiscountModal(discount)}
                          aria-label={`${copy.edit}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleDiscountDeleteRequest(discount)}
                          aria-label={`${copy.delete}`}
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
