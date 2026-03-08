import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Minus, Plus, Truck, Leaf, RotateCcw } from "lucide-react";
import { useCart } from "../context/CartContext";
import ProductCard from "../components/ProductCard";
import { products } from "../data/products";
import "./ProductDetail.css";

export default function ProductDetail() {
  const { id } = useParams();
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();

  const product = products.find((p) => p.id === Number(id));

  if (!product) {
    return (
      <div className="container section" style={{ textAlign: "center" }}>
        <h1>Product not found</h1>
        <Link to="/collections" className="btn btn-outline" style={{ marginTop: "1rem" }}>
          Back to Shop
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

  return (
    <div className="product-detail">
      <div className="container">
        <div className="breadcrumb" style={{ padding: "1.5rem 0" }}>
          <Link to="/">Home</Link> / <Link to="/collections">Shop</Link> /{" "}
          <span>{product.name}</span>
        </div>

        <div className="product-detail-grid">
          <div className="product-detail-images">
            <div className="product-main-image">
              <img src={product.images[0]} alt={product.name} />
              {product.badge && <span className="product-badge">{product.badge}</span>}
            </div>
          </div>

          <div className="product-detail-info">
            <h1>{product.name}</h1>
            <p className="product-detail-price">${currentPrice.toFixed(2)} CAD</p>

            <div className="product-detail-description">
              <p>{product.description}</p>
            </div>

            {product.variants && (
              <div className="product-variants">
                <label>Option</label>
                <div className="variant-buttons">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.name}
                      className={`variant-btn ${selectedVariant === variant.name ? "active" : ""}`}
                      onClick={() => setSelectedVariant(variant.name)}
                    >
                      {variant.name} - ${variant.price.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="product-quantity">
              <label>Quantity</label>
              <div className="quantity-selector">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  <Minus size={16} />
                </button>
                <span>{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary add-to-cart-btn"
              onClick={() => addItem(product, quantity, selectedVariant)}
            >
              Add to Cart
            </button>

            <div className="product-features">
              <div className="feature-item">
                <Truck size={18} strokeWidth={1.5} />
                <span>Free shipping over $85 CAD</span>
              </div>
              <div className="feature-item">
                <Leaf size={18} strokeWidth={1.5} />
                <span>100% Natural Ingredients</span>
              </div>
              <div className="feature-item">
                <RotateCcw size={18} strokeWidth={1.5} />
                <span>30-day satisfaction guarantee</span>
              </div>
            </div>

            <div className="product-accordion">
              <details>
                <summary>Ingredients</summary>
                <p>
                  Saponified oils of olive, coconut, and sustainably sourced palm,
                  shea butter, essential oils, natural botanicals, and love.
                </p>
              </details>
              <details>
                <summary>How to Use</summary>
                <p>
                  Lather between wet hands or with a washcloth. Apply to body, face,
                  or hands. Rinse thoroughly. Store on a well-draining soap dish
                  between uses.
                </p>
              </details>
              <details>
                <summary>Shipping & Returns</summary>
                <p>
                  Free shipping on orders over $85 CAD. Standard shipping within Canada
                  is $12 flat rate. We offer a 30-day satisfaction guarantee on all products.
                </p>
              </details>
            </div>
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div className="related-products section">
            <div className="section-header">
              <h2>You May Also Like</h2>
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
