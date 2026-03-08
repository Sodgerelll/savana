import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Minus, Plus, Truck, Leaf, RotateCcw } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import ProductCard from "../components/ProductCard";
import { products } from "../data/products";
import "./ProductDetail.css";

const categoryGradients: Record<string, string> = {
  soap: "linear-gradient(135deg, #c8bfa8 0%, #b5a98e 100%)",
  "skin-care": "linear-gradient(135deg, #d4c9b0 0%, #c2b49a 100%)",
  "body-care": "linear-gradient(135deg, #bfc8aa 0%, #aab592 100%)",
  hair: "linear-gradient(135deg, #c4bda8 0%, #b0a890 100%)",
  "lip-care": "linear-gradient(135deg, #d0c0b0 0%, #bda898 100%)",
  "best-sellers": "linear-gradient(135deg, #c8c0a0 0%, #b5aa88 100%)",
};

export default function ProductDetail() {
  const { id } = useParams();
  const { addItem } = useCart();
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();

  const product = products.find((p) => p.id === Number(id));

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

  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const currentPrice = selectedVariant
    ? product.variants?.find((v) => v.name === selectedVariant)?.price ?? product.price
    : product.price;

  const gradient = categoryGradients[product.category] || categoryGradients.soap;

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
              <div className="product-main-icon">
                <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                  <ellipse cx="60" cy="72" rx="38" ry="26" fill="rgba(255,255,255,0.2)" />
                  <rect x="24" y="36" width="72" height="46" rx="23" fill="rgba(255,255,255,0.28)" />
                  <path d="M44 36 Q60 18 76 36" stroke="rgba(255,255,255,0.45)" strokeWidth="3.5" fill="none" />
                </svg>
              </div>
              {product.badge && (
                <span className="pd-badge">{product.badge}</span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="product-detail-info">
            <h1>{product.name}</h1>
            <p className="pd-price">${currentPrice.toFixed(2)} CAD</p>

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
                      {variant.name} — ${variant.price.toFixed(2)}
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
                <span>Free shipping over $75 CAD</span>
              </div>
              <div className="pd-feature">
                <Leaf size={16} strokeWidth={1.5} />
                <span>100% Natural Ingredients</span>
              </div>
              <div className="pd-feature">
                <RotateCcw size={16} strokeWidth={1.5} />
                <span>30-day satisfaction guarantee</span>
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
                  Free shipping on orders over $75 CAD. Standard shipping within Canada
                  is $12 flat rate. We offer a 30-day satisfaction guarantee on all products.
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
