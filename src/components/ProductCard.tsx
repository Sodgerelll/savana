import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import type { Product } from "../data/products";
import "./ProductCard.css";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();

  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)} CAD`;
  };

  return (
    <div className="product-card">
      <Link to={`/product/${product.id}`} className="product-card-image">
        <img src={product.images[0]} alt={product.name} loading="lazy" />
        {product.badge && <span className="product-badge">{product.badge}</span>}
        <div className="product-card-overlay">
          <button
            className="quick-add-btn"
            onClick={(e) => {
              e.preventDefault();
              addItem(product);
            }}
          >
            Quick Add
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
              From {formatPrice(Math.min(...product.variants.map((v) => v.price)))}
            </span>
          ) : (
            <>
              <span>{formatPrice(product.price)}</span>
              {product.compareAtPrice && (
                <span className="compare-price">
                  {formatPrice(product.compareAtPrice)}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
