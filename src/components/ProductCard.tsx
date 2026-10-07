import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import type { Product } from "../data/products";
import {
  applyDiscount,
  formatStorePrice,
  getActiveDiscount,
  getCategoryGradient,
  isProductSoldOut,
} from "../lib/storefrontHelpers";
import "./ProductCard.css";

const IMAGE_ROTATION_INTERVAL = 3000;

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const { collections, discounts } = useStorefront();
  const [hovered, setHovered] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const basePrice = product.variants
    ? Math.min(...product.variants.map((v) => v.price))
    : product.price;
  const activeDiscount = getActiveDiscount(discounts, product.id, basePrice);
  const discountedPrice = activeDiscount ? applyDiscount(basePrice, activeDiscount) : null;

  const soldOut = isProductSoldOut(product);
  const needsOption = (product.variants?.length ?? 0) > 0;

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
      className={`product-card ${hovered ? "hovered" : ""}${soldOut ? " sold-out" : ""}`}
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
        {soldOut ? (
          <span className="product-badge product-badge-soldout">{t.outOfStock}</span>
        ) : (
          product.badge && <span className="product-badge">{product.badge}</span>
        )}
        {activeDiscount && (
          <span className="product-discount-badge">
            {activeDiscount.type === "percent" ? `-${activeDiscount.value}%` : `-${formatStorePrice(activeDiscount.value)}`}
          </span>
        )}
        <div className="product-card-overlay">
          {soldOut ? (
            <span className="quick-add-btn quick-add-btn-disabled">{t.outOfStock}</span>
          ) : needsOption ? (
            // A variant has to be picked on the product page; the link takes them there.
            <span className="quick-add-btn">{t.option}</span>
          ) : (
            <button
              className="quick-add-btn"
              onClick={(e) => {
                e.preventDefault();
                addItem(product);
              }}
            >
              {t.addToCart}
            </button>
          )}
        </div>
      </Link>
      {/* Name and price stay visible under the photo, not only on hover. */}
      <Link to={`/product/${product.id}`} className="product-card-info">
        <h3 className="product-card-title">{product.name}</h3>
        <p className="product-card-price">
          {discountedPrice !== null ? (
            <>
              <span className="product-price-original">{formatStorePrice(basePrice)}</span>
              <span className="product-price-sale">{formatStorePrice(discountedPrice)}</span>
            </>
          ) : (
            formatStorePrice(basePrice)
          )}
        </p>
      </Link>
    </div>
  );
}
