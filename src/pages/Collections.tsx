import { useParams, Link, useSearchParams } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import type { Discount, Product } from "../data/products";
import {
  applyDiscount,
  getActiveDiscount,
  getActiveProducts,
  getCollectionsWithProducts,
  getPageBannerNavigationItem,
  getPageBannerStyle,
  getRenderableSettings,
  isProductSoldOut,
  SYSTEM_COLLECTION_SLUG,
} from "../lib/storefrontHelpers";
import { useDocumentMeta } from "../lib/seo";
import "./Collections.css";

type SortKey = "featured" | "newest" | "price-asc" | "price-desc" | "popular";

const SORT_KEYS: SortKey[] = ["featured", "newest", "price-asc", "price-desc", "popular"];

const SORT_LABELS: Record<SortKey, { mn: string; en: string }> = {
  featured: { mn: "Санал болгох", en: "Featured" },
  newest: { mn: "Шинэ нь эхэндээ", en: "Newest" },
  "price-asc": { mn: "Үнэ: багаас их", en: "Price: low to high" },
  "price-desc": { mn: "Үнэ: ихээс бага", en: "Price: high to low" },
  popular: { mn: "Эрэлттэй нь эхэндээ", en: "Best selling" },
};

/** What the shopper actually pays for the cheapest option, discounts included. */
function getShopperPrice(product: Product, discounts: Discount[]) {
  const base = product.variants?.length ? Math.min(...product.variants.map((v) => v.price)) : product.price;
  const discount = getActiveDiscount(discounts, product.id, base);
  return discount ? applyDiscount(base, discount) : base;
}

function getUnitsSold(product: Product) {
  return product.variants?.length
    ? product.variants.reduce((sum, v) => sum + Number(v.soldCount ?? 0), 0)
    : Number(product.soldCount ?? 0);
}

function parsePriceParam(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function Collections() {
  const { slug } = useParams();
  const { t, language } = useLanguage();
  const { products, collections, settings, discounts } = useStorefront();
  const [searchParams, setSearchParams] = useSearchParams();
  const sortParam = searchParams.get("sort") as SortKey | null;
  const sort: SortKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : "featured";
  const inStockOnly = searchParams.get("stock") === "1";
  const minPrice = parsePriceParam(searchParams.get("min"));
  const maxPrice = parsePriceParam(searchParams.get("max"));
  const mn = language === "MN";

  // Filters live in the URL so a filtered list can be shared and survives Back.
  const updateParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };
  const visibleSettings = getRenderableSettings(settings);
  const activeCollections = getCollectionsWithProducts(collections, products);
  const visibleProducts = getActiveProducts(products, collections);
  const isBestSellersRoute = slug === SYSTEM_COLLECTION_SLUG;
  const pageBanner = getPageBannerNavigationItem(
    visibleSettings.navigationItems,
    isBestSellersRoute ? "/collections/best-sellers" : "/collections"
  );
  const hasPageBanner = Boolean(pageBanner?.pageBannerImage.trim());
  const pageBannerStyle = getPageBannerStyle(pageBanner?.pageBannerImage);
  const bestSellersVisible = activeCollections.some((collection) => collection.slug === SYSTEM_COLLECTION_SLUG);

  const currentCollection = slug
    ? activeCollections.find((c) => c.slug === slug)
    : null;

  const categoryProducts = isBestSellersRoute
    ? bestSellersVisible
      ? visibleProducts.filter((p) => p.bestSeller)
      : []
    : slug
      ? visibleProducts.filter((p) => p.category === slug)
      : visibleProducts;

  const filteredProducts = categoryProducts
    .filter((product) => !inStockOnly || !isProductSoldOut(product))
    .filter((product) => {
      const price = getShopperPrice(product, discounts);
      return (minPrice === null || price >= minPrice) && (maxPrice === null || price <= maxPrice);
    })
    .map((product, index) => ({ product, index }))
    .sort((left, right) => {
      // Whatever the order, a sold-out bar never sits ahead of one that can be bought.
      const stockOrder = Number(isProductSoldOut(left.product)) - Number(isProductSoldOut(right.product));
      if (stockOrder !== 0) return stockOrder;
      switch (sort) {
        case "newest":
          return right.product.id - left.product.id;
        case "price-asc":
          return getShopperPrice(left.product, discounts) - getShopperPrice(right.product, discounts);
        case "price-desc":
          return getShopperPrice(right.product, discounts) - getShopperPrice(left.product, discounts);
        case "popular":
          return getUnitsSold(right.product) - getUnitsSold(left.product);
        default:
          return left.index - right.index;
      }
    })
    .map(({ product }) => product);
  const hasActiveFilters = inStockOnly || minPrice !== null || maxPrice !== null;

  const title = isBestSellersRoute
    ? t.bestSellers
    : slug
    ? currentCollection?.name || slug
    : t.allProducts;
  const description = currentCollection
    ? currentCollection.description
    : "Байгальд ээлтэй, хог хаягдалгүй органик бүтээгдэхүүн.";

  useDocumentMeta({
    title,
    description: currentCollection?.description || undefined,
    path: slug ? `/collections/${slug}` : "/collections",
  });

  return (
    <div className="collections-page">
      <div
        className={`collections-hero${hasPageBanner ? " has-banner" : ""}`}
        style={pageBannerStyle}
      >
        <div className="collections-hero-inner container">
          <div className="breadcrumb">
            <Link to="/">{t.home}</Link> / <span>{title}</span>
          </div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="collections-body container">
        {/* Category filters */}
        <div className="category-filters">
          <Link
            to={{ pathname: "/collections", search: searchParams.toString() }}
            className={`filter-btn ${!slug ? "active" : ""}`}
          >
            {t.allProducts}
          </Link>
          {activeCollections.map((c) => (
            <Link
              to={{ pathname: `/collections/${c.slug}`, search: searchParams.toString() }}
              key={c.id}
              className={`filter-btn ${c.slug === slug ? "active" : ""}`}
            >
              {c.slug === SYSTEM_COLLECTION_SLUG ? t.bestSellers : c.name}
            </Link>
          ))}
        </div>

        <div className="collections-toolbar">
          <p className="results-count">
            {filteredProducts.length} {t.productsCount}
          </p>
          <div className="collections-toolbar-controls">
            <label className="collections-stock-toggle">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(event) => updateParam("stock", event.target.checked ? "1" : null)}
              />
              {mn ? "Зөвхөн бэлэн байгаа" : "In stock only"}
            </label>
            <div className="collections-price-range">
              <span>{mn ? "Үнэ" : "Price"}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                placeholder={mn ? "Доод" : "Min"}
                aria-label={mn ? "Доод үнэ" : "Minimum price"}
                value={minPrice ?? ""}
                onChange={(event) => updateParam("min", event.target.value)}
              />
              <span aria-hidden="true">–</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                placeholder={mn ? "Дээд" : "Max"}
                aria-label={mn ? "Дээд үнэ" : "Maximum price"}
                value={maxPrice ?? ""}
                onChange={(event) => updateParam("max", event.target.value)}
              />
              <span>₮</span>
            </div>
            <label className="collections-sort">
              <span>{mn ? "Эрэмбэлэх" : "Sort by"}</span>
              <select
                value={sort}
                onChange={(event) => updateParam("sort", event.target.value === "featured" ? null : event.target.value)}
              >
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {mn ? SORT_LABELS[key].mn : SORT_LABELS[key].en}
                  </option>
                ))}
              </select>
            </label>
            {hasActiveFilters && (
              <button
                type="button"
                className="collections-clear-filters"
                onClick={() =>
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      ["stock", "min", "max"].forEach((key) => next.delete(key));
                      return next;
                    },
                    { replace: true },
                  )
                }
              >
                {mn ? "Шүүлтүүр арилгах" : "Clear filters"}
              </button>
            )}
          </div>
        </div>

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
