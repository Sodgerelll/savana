import { useParams, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { products, collections } from "../data/products";
import "./Collections.css";

export default function Collections() {
  const { slug } = useParams();

  const currentCollection = slug
    ? collections.find((c) => c.slug === slug)
    : null;

  const filteredProducts = slug
    ? products.filter((p) => p.category === slug)
    : products;

  const title = currentCollection ? currentCollection.name : "All Products";
  const description = currentCollection
    ? currentCollection.description
    : "Browse our complete collection of handcrafted natural products.";

  return (
    <div className="collections-page">
      <div className="collections-hero">
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="breadcrumb">
          <Link to="/">Home</Link> / <span>{title}</span>
        </div>
      </div>

      <div className="container section">
        {!slug && (
          <div className="category-filters">
            <Link to="/collections" className="filter-btn active">
              All
            </Link>
            {collections.map((c) => (
              <Link to={`/collections/${c.slug}`} key={c.id} className="filter-btn">
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {slug && (
          <div className="category-filters">
            <Link to="/collections" className="filter-btn">
              All
            </Link>
            {collections.map((c) => (
              <Link
                to={`/collections/${c.slug}`}
                key={c.id}
                className={`filter-btn ${c.slug === slug ? "active" : ""}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}

        <p className="results-count">{filteredProducts.length} products</p>

        <div className="product-grid">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="no-products">
            <p>No products found in this collection.</p>
            <Link to="/collections" className="btn btn-outline">
              View All Products
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
