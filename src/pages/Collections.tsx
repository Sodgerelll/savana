import { useParams, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getActiveCollections, getActiveProducts, SYSTEM_COLLECTION_SLUG } from "../lib/storefrontHelpers";
import "./Collections.css";

export default function Collections() {
  const { slug } = useParams();
  const { t } = useLanguage();
  const { products, collections } = useStorefront();
  const activeCollections = getActiveCollections(collections);
  const visibleProducts = getActiveProducts(products, collections);
  const bestSellersVisible = activeCollections.some((collection) => collection.slug === SYSTEM_COLLECTION_SLUG);

  const currentCollection = slug
    ? activeCollections.find((c) => c.slug === slug)
    : null;

  const filteredProducts = slug === SYSTEM_COLLECTION_SLUG
    ? bestSellersVisible
      ? visibleProducts.filter((p) => p.bestSeller)
      : []
    : slug
      ? visibleProducts.filter((p) => p.category === slug)
      : visibleProducts;

  const title = slug
    ? currentCollection?.name || (slug === SYSTEM_COLLECTION_SLUG ? t.bestSellers : slug)
    : t.allProducts;
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
          {activeCollections.map((c) => (
            <Link
              to={`/collections/${c.slug}`}
              key={c.id}
              className={`filter-btn ${c.slug === slug ? "active" : ""}`}
            >
              {c.name}
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
