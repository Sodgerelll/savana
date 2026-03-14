import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Minus, Plus, Truck, Leaf, RotateCcw } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import ProductCard from "../components/ProductCard";
import { formatStorePrice, getActiveProducts, getCategoryGradient, getProductPrimaryImage } from "../lib/storefrontHelpers";
import "./ProductDetail.css";

export default function ProductDetail() {
  const { id } = useParams();
  const { addItem } = useCart();
  const { t } = useLanguage();
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
  const primaryImage = getProductPrimaryImage(product);

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
              {primaryImage ? (
                <img src={primaryImage} alt={product.name} className="product-main-photo" />
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
          </div>

          {/* Info */}
          <div className="product-detail-info">
            <h1>{product.name}</h1>
            <p className="pd-price">{formatStorePrice(currentPrice)}</p>

            <div className="pd-description">
              <p>{product.description}</p>
            </div>

            {product.variants && (
              <div className="pd-variants">
                <label className="pd-label">Option</label>
                <div className="variant-buttons">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.name}
                      className={`variant-btn ${selectedVariant === variant.name ? "active" : ""}`}
                      onClick={() => setSelectedVariant(variant.name)}
                    >
                      {variant.name} — {formatStorePrice(variant.price)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pd-quantity">
              <label className="pd-label">{t.quantity}</label>
              <div className="quantity-selector">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  <Minus size={14} />
                </button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)}>
                  <Plus size={14} />
                </button>
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
              <details>
                <summary>{t.ingredients}</summary>
                <p>
                  Saponified oils of olive, coconut, and sustainably sourced palm,
                  shea butter, essential oils, natural botanicals, and love.
                </p>
              </details>
              <details>
                <summary>{t.howToUse}</summary>
                <p>
                  Lather between wet hands or with a washcloth. Apply to body, face,
                  or hands. Rinse thoroughly. Store on a well-draining soap dish between uses.
                </p>
              </details>
              <details>
                <summary>{t.shippingReturns}</summary>
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
