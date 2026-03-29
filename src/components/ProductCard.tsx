import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import type { Product } from "../data/products";
import { formatStorePrice, getCategoryGradient } from "../lib/storefrontHelpers";
import "./ProductCard.css";

const IMAGE_ROTATION_INTERVAL = 3000;

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const { collections } = useStorefront();
  const [hovered, setHovered] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const gradient = getCategoryGradient(collections, product.category);
  const allImages = product.images.filter(Boolean);
  const hasMultiple = allImages.length > 1;

  useEffect(() => {
    if (!hasMultiple) return undefined;
    const interval = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % allImages.length);
    }, IMAGE_ROTATION_INTERVAL);
    return () => window.clearInterval(interval);
  }, [hasMultiple, allImages.length]);

  const currentImage = allImages[activeIndex] || allImages[0] || "";

  return (
    <div
      className={`product-card ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="product-card-image">
        <div className="product-card-bg" style={{ background: gradient }}>
          {currentImage ? (
            <img src={currentImage} alt={product.name} className="product-card-photo" loading="lazy" />
          ) : (
            <div className="product-card-icon">
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <ellipse cx="26" cy="30" rx="16" ry="11" fill="rgba(255,255,255,0.22)" />
                <rect x="12" y="16" width="28" height="18" rx="9" fill="rgba(255,255,255,0.3)" />
                <path d="M19 16 Q26 8 33 16" stroke="rgba(255,255,255,0.45)" strokeWidth="2" fill="none" />
              </svg>
            </div>
          )}
        </div>
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <p className="product-card-price-badge">
          {product.variants
            ? `${t.from} ${formatStorePrice(Math.min(...product.variants.map((v) => v.price)))}`
            : formatStorePrice(product.price)}
        </p>
        <div className="product-card-overlay">
          <h3 className="product-card-title">{product.name}</h3>
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
    </div>
  );
}
