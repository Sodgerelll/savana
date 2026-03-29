import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Minus, Plus, Truck, Leaf, RotateCcw, FlaskConical, Sparkles, BookOpen, AlertTriangle, Clock } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import ProductCard from "../components/ProductCard";
import { formatStorePrice, getActiveProducts, getCategoryGradient } from "../lib/storefrontHelpers";
import "./ProductDetail.css";

export default function ProductDetail() {
  const { id } = useParams();
  const { addItem } = useCart();
  const { language, t } = useLanguage();
  const { products, collections } = useStorefront();
  const visibleProducts = getActiveProducts(products, collections);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();

  const product = visibleProducts.find((p) => p.id === Number(id));

  if (!product) {
    return (
      <div className="container section" style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: "1rem" }}>{t.productNotFound}</h1>
        <Link to="/collections" className="btn btn-outline">
          {t.backToShop}
        </Link>
      </div>
    );
  }

  const relatedProducts = visibleProducts
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const currentPrice = selectedVariant
    ? product.variants?.find((v) => v.name === selectedVariant)?.price ?? product.price
    : product.price;

  const gradient = getCategoryGradient(collections, product.category);
  const allImages = product.images.filter(Boolean);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const activeImage = allImages[activeImageIndex] || allImages[0] || "";

  useEffect(() => {
    if (allImages.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setActiveImageIndex((i) => (i + 1) % allImages.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [allImages.length]);

  return (
    <div className="product-detail">
      <div className="container">
        <div className="breadcrumb pd-breadcrumb">
          <Link to="/">Home</Link> / <Link to="/collections">{t.shop}</Link> /{" "}
          <span>{product.name}</span>
        </div>

        <div className="product-detail-grid">
          {/* Image area */}
          <div className="product-detail-images">
            <div className="product-main-image" style={{ background: gradient }}>
              {activeImage ? (
                <img src={activeImage} alt={product.name} className="product-main-photo" />
              ) : (
                <div className="product-main-icon">
                  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                    <ellipse cx="60" cy="72" rx="38" ry="26" fill="rgba(255,255,255,0.2)" />
                    <rect x="24" y="36" width="72" height="46" rx="23" fill="rgba(255,255,255,0.28)" />
                    <path d="M44 36 Q60 18 76 36" stroke="rgba(255,255,255,0.45)" strokeWidth="3.5" fill="none" />
                  </svg>
                </div>
              )}
              {product.badge && (
                <span className="pd-badge">{product.badge}</span>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="product-thumbnails">
                {allImages.map((image, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`product-thumbnail ${index === activeImageIndex ? "active" : ""}`}
                    onClick={() => setActiveImageIndex(index)}
                    style={{ background: gradient }}
                  >
                    <img src={image} alt={`${product.name} ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="product-detail-info">
            <h1>{product.name}</h1>
            <p className="pd-price">{formatStorePrice(currentPrice)}</p>
            {(() => {
              const stock = product.variants?.length
                ? product.variants.reduce((s, v) => s + (v.quantity || 0), 0)
                : (product.totalStock ?? 0);
              const sold = product.soldCount ?? 0;
              const remaining = stock - sold;
              if (stock <= 0) return null;
              return (
                <p className={`pd-stock ${remaining <= 0 ? "pd-stock-out" : remaining <= 5 ? "pd-stock-low" : ""}`}>
                  {remaining > 0
                    ? (language === "MN" ? `Үлдэгдэл: ${remaining} ширхэг` : `${remaining} in stock`)
                    : (language === "MN" ? "Дууссан" : "Out of stock")}
                </p>
              );
            })()}

            <div className="pd-description">
              <p>{product.description}</p>
            </div>

            {product.variants && product.variants.length > 0 ? (
              <div className="pd-variants">
                <label className="pd-label">Option</label>
                <div className="variant-buttons">
                  {product.variants.map((variant) => {
                    const remaining = variant.quantity - (variant.soldCount ?? 0);
                    return (
                      <button
                        key={variant.name}
                        className={`variant-btn ${selectedVariant === variant.name ? "active" : ""} ${remaining <= 0 ? "variant-btn-out" : ""}`}
                        onClick={() => setSelectedVariant(variant.name)}
                        disabled={remaining <= 0}
                      >
                        <span>{variant.name} — {formatStorePrice(variant.price)}</span>
                        {variant.quantity > 0 && (
                          <span className={`variant-stock ${remaining <= 0 ? "variant-stock-out" : remaining <= 5 ? "variant-stock-low" : ""}`}>
                            {remaining > 0
                              ? (language === "MN" ? `${remaining} ширхэг` : `${remaining} left`)
                              : (language === "MN" ? "Дууссан" : "Sold out")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : product.sizeLabel ? (
              <div className="pd-size-label">
                <span className="pd-label">{language === "MN" ? "Хэмжээ" : "Size"}</span>
                <span className="pd-size-value">{product.sizeLabel}</span>
              </div>
            ) : null}

            <div className="pd-quantity">
              <label className="pd-label">{t.quantity}</label>
              <div className="pd-quantity-row">
                <div className="quantity-selector">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                    <Minus size={14} />
                  </button>
                  <span>{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)}>
                    <Plus size={14} />
                  </button>
                </div>
                {quantity > 1 && (
                  <span className="pd-quantity-total">
                    = {formatStorePrice(currentPrice * quantity)}
                  </span>
                )}
              </div>
            </div>

            <button
              className="btn btn-primary pd-add-btn"
              onClick={() => addItem(product, quantity, selectedVariant)}
            >
              {t.addToCart}
            </button>

            <div className="pd-features">
              <div className="pd-feature">
                <Truck size={16} strokeWidth={1.5} />
                <span>Nationwide delivery available</span>
              </div>
              <div className="pd-feature">
                <Leaf size={16} strokeWidth={1.5} />
                <span>100% Natural Ingredients</span>
              </div>
              <div className="pd-feature">
                <RotateCcw size={16} strokeWidth={1.5} />
                <span>Made in Mongolia</span>
              </div>
            </div>

            <div className="pd-accordion">
              {product.ingredients && (
                <details>
                  <summary><FlaskConical size={16} strokeWidth={1.5} /> {t.ingredients}</summary>
                  <p>{product.ingredients}</p>
                </details>
              )}
              {product.usage && (
                <details>
                  <summary><Sparkles size={16} strokeWidth={1.5} /> {t.usage}</summary>
                  <p>{product.usage}</p>
                </details>
              )}
              {product.howToUse && (
                <details>
                  <summary><BookOpen size={16} strokeWidth={1.5} /> {t.howToUse}</summary>
                  <p>{product.howToUse}</p>
                </details>
              )}
              {product.caution && (
                <details>
                  <summary><AlertTriangle size={16} strokeWidth={1.5} /> {t.caution}</summary>
                  <p>{product.caution}</p>
                </details>
              )}
              {product.shelfLife && (
                <details>
                  <summary><Clock size={16} strokeWidth={1.5} /> {t.shelfLife}</summary>
                  <p>{product.shelfLife}</p>
                </details>
              )}
              <details>
                <summary><Truck size={16} strokeWidth={1.5} /> {t.shippingReturns}</summary>
                <p>
                  Delivery timing and fees depend on your location. Please review checkout details
                  before confirming your order.
                </p>
              </details>
            </div>
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="related-products section">
            <div className="section-header">
              <h2>{t.youMayAlsoLike}</h2>
            </div>
            <div className="product-grid">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
