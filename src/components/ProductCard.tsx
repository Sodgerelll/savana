import { useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import type { Product } from "../data/products";
import "./ProductCard.css";

interface ProductCardProps {
  product: Product;
}

const categoryGradients: Record<string, string> = {
  soap: "linear-gradient(135deg, #c8bfa8 0%, #b5a98e 100%)",
  "skin-care": "linear-gradient(135deg, #d4c9b0 0%, #c2b49a 100%)",
  "body-care": "linear-gradient(135deg, #bfc8aa 0%, #aab592 100%)",
  hair: "linear-gradient(135deg, #c4bda8 0%, #b0a890 100%)",
  "lip-care": "linear-gradient(135deg, #d0c0b0 0%, #bda898 100%)",
  "best-sellers": "linear-gradient(135deg, #c8c0a0 0%, #b5aa88 100%)",
};

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);

  const formatPrice = (price: number) => `$${price.toFixed(2)} CAD`;
  const gradient = categoryGradients[product.category] || categoryGradients.soap;

  return (
    <div
      className={`product-card ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="product-card-image">
        <div className="product-card-bg" style={{ background: gradient }}>
          <div className="product-card-icon">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <ellipse cx="26" cy="30" rx="16" ry="11" fill="rgba(255,255,255,0.22)" />
              <rect x="12" y="16" width="28" height="18" rx="9" fill="rgba(255,255,255,0.3)" />
              <path d="M19 16 Q26 8 33 16" stroke="rgba(255,255,255,0.45)" strokeWidth="2" fill="none" />
            </svg>
          </div>
        </div>
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <div className="product-card-overlay">
          <button
            className="quick-add-btn"
            onClick={(e) => {
              e.preventDefault();
              addItem(product);
            }}
          >
            {t.addToCart}
          </button>
        </div>
      </Link>
      <div className="product-card-info">
        <Link to={`/product/${product.id}`}>
          <h3 className="product-card-title">{product.name}</h3>
        </Link>
        <div className="product-card-price">
          {product.variants ? (
            <span>
              {t.from} {formatPrice(Math.min(...product.variants.map((v) => v.price)))}
            </span>
          ) : (
            <>
              <span>{formatPrice(product.price)}</span>
              {product.compareAtPrice && (
                <span className="compare-price">{formatPrice(product.compareAtPrice)}</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
