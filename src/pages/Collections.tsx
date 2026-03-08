import { useParams, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useLanguage } from "../context/LanguageContext";
import { products, collections } from "../data/products";
import "./Collections.css";

export default function Collections() {
  const { slug } = useParams();
  const { t } = useLanguage();

  const currentCollection = slug
    ? collections.find((c) => c.slug === slug)
    : null;

  // For best-sellers slug, show bestSeller products
  const filteredProducts = slug === "best-sellers"
    ? products.filter((p) => p.bestSeller)
    : slug
    ? products.filter((p) => p.category === slug)
    : products;

  const collectionNameMap: Record<string, string> = {
    soap: t.allNaturalSoap,
    "skin-care": t.skinCare,
    "body-care": t.bodyCare,
    hair: t.hair,
    "lip-care": t.lipCare,
    "best-sellers": t.bestSellers,
  };

  const title = slug ? (collectionNameMap[slug] || currentCollection?.name || slug) : t.allProducts;
  const description = currentCollection
    ? currentCollection.description
    : "Browse our complete collection of handcrafted natural products.";

  return (
    <div className="collections-page">
      <div className="collections-hero">
        <div className="collections-hero-inner container">
          <div className="breadcrumb">
            <Link to="/">Home</Link> / <span>{title}</span>
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="collections-body container">
        {/* Category filters */}
        <div className="category-filters">
          <Link
            to="/collections"
            className={`filter-btn ${!slug ? "active" : ""}`}
          >
            {t.allProducts}
          </Link>
          {collections.map((c) => (
            <Link
              to={`/collections/${c.slug}`}
              key={c.id}
              className={`filter-btn ${c.slug === slug ? "active" : ""}`}
            >
              {collectionNameMap[c.slug] || c.name}
            </Link>
          ))}
        </div>

        <p className="results-count">
          {filteredProducts.length} {t.productsCount}
        </p>

        <div className="product-grid">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="no-products">
            <p>{t.noProducts}</p>
            <Link to="/collections" className="btn btn-outline" style={{ marginTop: "1.5rem" }}>
              {t.viewAllProducts}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
