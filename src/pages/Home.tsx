import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import { useStorefront } from "../context/StorefrontContext";
import type { Collection, Product } from "../data/products";
import {
  formatStorePrice,
  getActiveCollections,
  getActiveHeroBanners,
  getActiveProducts,
  getActiveTestimonials,
  getCategoryGradient,
  getCollectionPrimaryImage,
  getProductPrimaryImage,
  getRenderableSettings,
  SYSTEM_COLLECTION_SLUG,
} from "../lib/storefrontHelpers";
import "./Home.css";

const HERO_ROTATION_INTERVAL = 5000;

function ProductCardHome({ product, gradient }: { product: Product; gradient: string }) {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  const primaryImage = getProductPrimaryImage(product);

  return (
    <div
      className={`home-product-card ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="home-product-image-wrap">
        <div className="home-product-image-bg" style={{ background: gradient }}>
          {primaryImage ? (
            <img src={primaryImage} alt={product.name} className="home-product-photo" loading="lazy" />
          ) : (
            <div className="home-product-icon">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="28" cy="32" rx="18" ry="12" fill="rgba(255,255,255,0.25)" />
                <rect x="14" y="16" width="28" height="20" rx="10" fill="rgba(255,255,255,0.35)" />
                <path d="M22 16 Q28 8 34 16" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
              </svg>
            </div>
          )}
        </div>
        {product.badge && <span className="home-product-badge">{product.badge}</span>}
        <div className="home-product-overlay">
          <button
            className="home-quick-add"
            onClick={(event) => {
              event.preventDefault();
              addItem(product);
            }}
          >
            {t.addToCart}
          </button>
        </div>
      </Link>
      <div className="home-product-info">
        <Link to={`/product/${product.id}`}>
          <h3 className="home-product-title">{product.name}</h3>
        </Link>
        <p className="home-product-price">{formatStorePrice(product.price)}</p>
      </div>
    </div>
  );
}

function resolveCollectionImage(collection: Collection, products: Product[]) {
  const previewProduct = products.find((product) => product.category === collection.slug);
  return getCollectionPrimaryImage(collection) || (previewProduct ? getProductPrimaryImage(previewProduct) : "");
}

export default function Home() {
  const { language, t } = useLanguage();
  const { collections, heroBanners, products, settings, testimonials } = useStorefront();
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);

  const visibleSettings = getRenderableSettings(settings);
  const activeCollections = getActiveCollections(collections);
  const activeProducts = getActiveProducts(products, collections);
  const activeHeroBanners = getActiveHeroBanners(heroBanners, collections);
  const activeTestimonials = getActiveTestimonials(testimonials);
  const bestSellersVisible = activeCollections.some((collection) => collection.slug === SYSTEM_COLLECTION_SLUG);
  const featuredCollections = activeCollections.filter((collection) => collection.slug !== SYSTEM_COLLECTION_SLUG);
  const bestSellerProducts = activeProducts.filter((product) => product.bestSeller).slice(0, 4);
  const collectionBySlug = new Map(activeCollections.map((collection) => [collection.slug, collection]));

  const heroSlides = (() => {
    const slides = activeHeroBanners
      .map((heroBanner) => {
        const collection = collectionBySlug.get(heroBanner.collectionSlug);

        if (!collection) {
          return null;
        }

        const fallbackImage = resolveCollectionImage(collection, activeProducts);

        return {
          id: heroBanner.id,
          collectionSlug: heroBanner.collectionSlug,
          title: collection.name || visibleSettings.brandName,
          description: collection.description || visibleSettings.heroSubtext,
          image: heroBanner.image || fallbackImage,
        };
      })
      .filter((slide): slide is NonNullable<typeof slide> => slide !== null);

    if (slides.length > 0) {
      return slides;
    }

    const fallbackCollection = featuredCollections[0] ?? activeCollections[0];

    if (!fallbackCollection) {
      return [
        {
          id: 0,
          collectionSlug: "",
          title: visibleSettings.heroHeading,
          description: visibleSettings.heroSubtext,
          image: "",
        },
      ];
    }

    return [
      {
        id: fallbackCollection.id,
        collectionSlug: fallbackCollection.slug,
        title: fallbackCollection.name,
        description: fallbackCollection.description || visibleSettings.heroSubtext,
        image: resolveCollectionImage(fallbackCollection, activeProducts),
      },
    ];
  })();

  useEffect(() => {
    if (heroSlides.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveHeroIndex((currentIndex) => (currentIndex + 1) % heroSlides.length);
    }, HERO_ROTATION_INTERVAL);

    return () => window.clearInterval(interval);
  }, [heroSlides.length]);

  const resolvedHeroIndex = heroSlides.length > 0 ? activeHeroIndex % heroSlides.length : 0;
  const currentHero = heroSlides[resolvedHeroIndex] ?? heroSlides[0];
  if (!currentHero) {
    return null;
  }

  const heroEyebrow = language === "MN" ? "Онцлох төрөл" : "Featured collection";
  const heroSecondaryAction = language === "MN" ? "Бүх бүтээгдэхүүн" : "All products";

  return (
    <div className="home">
      <section className="hero hero-showcase">
        <div className="hero-slide-stack">
          {heroSlides.map((heroSlide, index) => (
            <div
              key={heroSlide.id}
              className={`hero-slide ${index === activeHeroIndex ? "active" : ""}`}
              style={heroSlide.image ? { backgroundImage: `url(${heroSlide.image})` } : undefined}
            />
          ))}
        </div>
        <div className="hero-overlay" />
          <div className="hero-shell container">
          <div className="hero-stage">
            <div key={currentHero.id} className="hero-content hero-content-card">
              <h1 className="hero-heading">{currentHero.title}</h1>
              <p className="hero-subtext">{currentHero.description}</p>
              <div className="hero-actions">
                <Link to="/collections" className="btn btn-outline-white">
                  {heroSecondaryAction}
                </Link>
              </div>
            </div>
            <div className="hero-meta">
              <span>{heroEyebrow}</span>
              <strong>
                {String(resolvedHeroIndex + 1).padStart(2, "0")} / {String(heroSlides.length).padStart(2, "0")}
              </strong>
            </div>
            {heroSlides.length > 1 && (
              <div className="hero-controls">
                <div className="hero-progress-track">
                  <div
                    className="hero-progress-bar"
                    style={{
                      width: `${((resolvedHeroIndex + 1) / heroSlides.length) * 100}%`,
                    }}
                  />
                </div>
                <div className="hero-dot-row">
                  {heroSlides.map((heroSlide, index) => (
                    <button
                      key={heroSlide.id}
                      type="button"
                      className={`hero-dot ${index === resolvedHeroIndex ? "active" : ""}`}
                      aria-label={heroSlide.title}
                      onClick={() => setActiveHeroIndex(index)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="categories-section section">
        <div className="container">
          <div className="section-header">
            <h2>{t.categoriesHeading}</h2>
          </div>
          <div className="categories-row">
            {featuredCollections.map((collection) => {
              const previewImage = resolveCollectionImage(collection, activeProducts);

              return (
                <Link key={collection.id} to={`/collections/${collection.slug}`} className="category-tile">
                  <div className="category-tile-bg" style={{ background: collection.gradient }}>
                    {previewImage ? (
                      <img
                        src={previewImage}
                        alt={collection.name}
                        className="category-tile-photo"
                        loading="lazy"
                      />
                    ) : (
                      <div className="category-tile-icon">
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                          <ellipse cx="20" cy="24" rx="13" ry="8" fill="rgba(255,255,255,0.2)" />
                          <rect x="8" y="12" width="24" height="14" rx="7" fill="rgba(255,255,255,0.3)" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="category-tile-info">
                    <p className="category-tile-name">{collection.name}</p>
                    <span className="category-tile-link">
                      {t.shopNow} <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {bestSellersVisible && bestSellerProducts.length > 0 && (
        <section className="best-sellers-section section">
          <div className="container">
            <div className="best-sellers-header">
              <h2>{t.bestSellersHeading}</h2>
              <Link to={`/collections/${SYSTEM_COLLECTION_SLUG}`} className="view-all-link">
                {t.viewAll} <ArrowRight size={14} />
              </Link>
            </div>
            <div className="product-grid">
              {bestSellerProducts.map((product) => (
                <ProductCardHome
                  key={product.id}
                  product={product}
                  gradient={getCategoryGradient(collections, product.category)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="brand-story-section">
        <div className="brand-story-image">
          <div
            className="brand-story-image-bg"
            style={{ background: "linear-gradient(135deg, #e8e0d0 0%, #d4c9b0 50%, #c8bfa8 100%)" }}
          >
            <div className="brand-story-overlay-decor">
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="50" fill="rgba(255,255,255,0.08)" />
                <circle cx="60" cy="60" r="35" fill="rgba(255,255,255,0.1)" />
                <ellipse cx="60" cy="70" rx="30" ry="20" fill="rgba(255,255,255,0.15)" />
                <rect x="35" y="42" width="50" height="34" rx="17" fill="rgba(255,255,255,0.2)" />
                <path d="M48 42 Q60 28 72 42" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" fill="none" />
              </svg>
            </div>
          </div>
        </div>
        <div className="brand-story-content">
          <div className="brand-story-text">
            <h2>{t.brandStoryHeading}</h2>
            <p>{t.brandStoryBody1}</p>
            <p>{t.brandStoryBody2}</p>
            <Link to="/about" className="btn btn-outline">
              {t.learnOurStory}
            </Link>
          </div>
        </div>
      </section>

      <section className="collections-grid-section section">
        <div className="container">
          <div className="section-header">
            <h2>{t.collectionsHeading}</h2>
          </div>
          <div className="collections-grid">
            {activeCollections.map((collection) => {
              const previewProduct =
                collection.slug === SYSTEM_COLLECTION_SLUG
                  ? activeProducts.find((product) => product.bestSeller)
                  : activeProducts.find((product) => product.category === collection.slug);
              const previewImage =
                getCollectionPrimaryImage(collection) ||
                (previewProduct ? getProductPrimaryImage(previewProduct) : "");

              return (
                <Link key={collection.id} to={`/collections/${collection.slug}`} className="collections-grid-card">
                  <div className="collections-grid-bg" style={{ background: collection.gradient }}>
                    {previewImage ? (
                      <img
                        src={previewImage}
                        alt={collection.name}
                        className="collections-grid-photo"
                        loading="lazy"
                      />
                    ) : (
                      <div className="collections-grid-icon">
                        <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
                          <ellipse cx="25" cy="30" rx="16" ry="10" fill="rgba(255,255,255,0.2)" />
                          <rect x="12" y="17" width="26" height="17" rx="9" fill="rgba(255,255,255,0.28)" />
                          <path d="M19 17 Q25 10 31 17" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="collections-grid-info">
                    <h3>{collection.name}</h3>
                    <span className="collections-grid-link">
                      {t.shopNow} <ArrowRight size={12} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {activeTestimonials.length > 0 && (
        <section className="testimonials-section section">
          <div className="container">
            <div className="section-header">
              <h2>{t.testimonialsHeading}</h2>
            </div>
            <div className="testimonials-grid">
              {activeTestimonials.map((testimonial, index) => (
                <div key={index} className="testimonial-card">
                  <div className="testimonial-stars">★★★★★</div>
                  <p className="testimonial-text">"{testimonial.text}"</p>
                  <div className="testimonial-author">
                    <strong>{testimonial.author}</strong>
                    <span>{testimonial.location}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
