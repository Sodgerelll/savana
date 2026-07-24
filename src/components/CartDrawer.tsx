import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import {
  applyDiscount,
  formatStorePrice,
  getActiveDiscount,
  getCategoryGradient,
  getProductPrimaryImage,
} from "../lib/storefrontHelpers";
import "./CartDrawer.css";

export default function CartDrawer() {
  const navigate = useNavigate();
  const { items, removeItem, updateQuantity, totalPrice, isCartOpen, setIsCartOpen } = useCart();
  const { t, language } = useLanguage();
  const { collections, discounts } = useStorefront();

  // Cart items store the list price; active discounts are applied at display
  // time (the same way Checkout prices the order).
  const effectiveUnitPrice = (item: { product: { id: number }; unitPrice: number }) => {
    const discount = getActiveDiscount(discounts, item.product.id);
    return discount ? applyDiscount(item.unitPrice, discount) : item.unitPrice;
  };
  const discountSavings = items.reduce(
    (sum, item) => sum + (item.unitPrice - effectiveUnitPrice(item)) * item.quantity,
    0,
  );
  const discountedTotal = totalPrice - discountSavings;

  const handleCheckout = () => {
    setIsCartOpen(false);
    navigate("/checkout");
  };

  return (
    <>
      {isCartOpen && <div className="cart-overlay" onClick={() => setIsCartOpen(false)} />}
      <div className={`cart-drawer ${isCartOpen ? "open" : ""}`}>
        <div className="cart-drawer-header">
          <h2>{t.cartTitle}</h2>
          <button className="cart-close" onClick={() => setIsCartOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="cart-empty">
            <ShoppingBag size={44} strokeWidth={1} />
            <p>{t.cartEmpty}</p>
            <button className="btn btn-outline" onClick={() => setIsCartOpen(false)}>
              {t.continueShopping}
            </button>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {items.map((item) => (
                <div key={`${item.product.id}-${item.variant}`} className="cart-item">
                  <div
                    className="cart-item-image"
                    style={{
                      background: getCategoryGradient(collections, item.product.category),
                    }}
                  >
                    {getProductPrimaryImage(item.product) ? (
                      <img
                        src={getProductPrimaryImage(item.product)}
                        alt={item.product.name}
                        className="cart-item-photo"
                      />
                    ) : (
                      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                        <ellipse cx="18" cy="22" rx="11" ry="7" fill="rgba(255,255,255,0.25)" />
                        <rect x="8" y="12" width="20" height="13" rx="7" fill="rgba(255,255,255,0.32)" />
                      </svg>
                    )}
                  </div>
                  <div className="cart-item-info">
                    <h4>{item.product.name}</h4>
                    {item.variant && <p className="cart-item-variant">{item.variant}</p>}
                    {(() => {
                      const discount = getActiveDiscount(discounts, item.product.id);
                      const effective = effectiveUnitPrice(item);
                      if (!discount || effective >= item.unitPrice) {
                        return <p className="cart-item-price">{formatStorePrice(item.unitPrice)}</p>;
                      }
                      return (
                        <p className="cart-item-price">
                          <s className="cart-item-price-original">{formatStorePrice(item.unitPrice)}</s>
                          <span className="cart-item-price-discounted">{formatStorePrice(effective)}</span>
                          <span className="cart-item-discount-badge">
                            {discount.type === "percent"
                              ? `-${discount.value}%`
                              : `-${formatStorePrice(discount.value)}`}
                          </span>
                        </p>
                      );
                    })()}
                    <div className="cart-item-quantity">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.variant)}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={12} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1, item.variant)}
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="cart-item-remove"
                    onClick={() => removeItem(item.product.id, item.variant)}
                    aria-label="Remove item"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="cart-footer">
              {discountSavings > 0 && (
                <div className="cart-discount-row">
                  <span>{language === "MN" ? "Хямдрал" : "Discount"}</span>
                  <span>-{formatStorePrice(discountSavings)}</span>
                </div>
              )}
              <div className="cart-subtotal">
                <span>{t.cartSubtotal}</span>
                <span>{formatStorePrice(discountedTotal)}</span>
              </div>
              <p className="cart-note">{t.cartNote}</p>
              <button className="btn btn-primary cart-checkout-btn" onClick={handleCheckout}>
                {t.checkout}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
