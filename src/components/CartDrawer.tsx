import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import "./CartDrawer.css";

export default function CartDrawer() {
  const { items, removeItem, updateQuantity, totalPrice, isCartOpen, setIsCartOpen } = useCart();
  const { t } = useLanguage();

  const formatPrice = (price: number) => `$${price.toFixed(2)} CAD`;

  const categoryGradients: Record<string, string> = {
    soap: "linear-gradient(135deg, #c8bfa8 0%, #b5a98e 100%)",
    "skin-care": "linear-gradient(135deg, #d4c9b0 0%, #c2b49a 100%)",
    "body-care": "linear-gradient(135deg, #bfc8aa 0%, #aab592 100%)",
    hair: "linear-gradient(135deg, #c4bda8 0%, #b0a890 100%)",
    "lip-care": "linear-gradient(135deg, #d0c0b0 0%, #bda898 100%)",
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
                      background: categoryGradients[item.product.category] || categoryGradients.soap,
                    }}
                  >
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                      <ellipse cx="18" cy="22" rx="11" ry="7" fill="rgba(255,255,255,0.25)" />
                      <rect x="8" y="12" width="20" height="13" rx="7" fill="rgba(255,255,255,0.32)" />
                    </svg>
                  </div>
                  <div className="cart-item-info">
                    <h4>{item.product.name}</h4>
                    {item.variant && <p className="cart-item-variant">{item.variant}</p>}
                    <p className="cart-item-price">{formatPrice(item.product.price)}</p>
                    <div className="cart-item-quantity">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={12} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="cart-item-remove"
                    onClick={() => removeItem(item.product.id)}
                    aria-label="Remove item"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="cart-footer">
              <div className="cart-subtotal">
                <span>{t.cartSubtotal}</span>
                <span>{formatPrice(totalPrice)}</span>
              </div>
              <p className="cart-note">{t.cartNote}</p>
              <button className="btn btn-primary cart-checkout-btn">
                {t.checkout}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
