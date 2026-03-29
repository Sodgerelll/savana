import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Palette, UserCircle2, X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import { useStorefront } from "../context/StorefrontContext";
import type { Collection, Product } from "../data/products";
import type { JournalEntry } from "../data/storefront";
import {
  formatStorePrice,
  getActiveCollections,
  getActiveHeroBanners,
  getActiveJournalEntries,
  getActiveProducts,
  getActiveTestimonials,
  getCategoryGradient,
  getCollectionPrimaryImage,
  getProductPrimaryImage,
  getRenderableSettings,
  SYSTEM_COLLECTION_SLUG,
} from "../lib/storefrontHelpers";
import brandStorySoapImage from "../assets/brand-story-soap.jpg";
import "./Home.css";
import "./Journal.css";

const HERO_ROTATION_INTERVAL = 5000;
const PRODUCT_IMAGE_ROTATION_INTERVAL = 3000;

function ProductCardHome({ product, gradient }: { product: Product; gradient: string }) {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  const allImages = product.images.filter(Boolean);
  const hasMultiple = allImages.length > 1;
  const imageIndexRef = useRef(0);
  const [activeImage, setActiveImage] = useState(allImages[0] || "");

  useEffect(() => {
    if (!hasMultiple) return undefined;
    const interval = window.setInterval(() => {
      imageIndexRef.current = (imageIndexRef.current + 1) % allImages.length;
      setActiveImage(allImages[imageIndexRef.current]);
    }, PRODUCT_IMAGE_ROTATION_INTERVAL);
    return () => window.clearInterval(interval);
  }, [hasMultiple, allImages.length]);

  return (
    <div
      className={`home-product-card ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="home-product-image-wrap">
        <div className="home-product-image-bg" style={{ background: gradient }}>
          {activeImage ? (
            <img src={activeImage} alt={product.name} className="home-product-photo" loading="lazy" />
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
        <p className="home-product-price-bar">{formatStorePrice(product.price)}</p>
        <div className="home-product-overlay">
          <h3 className="home-product-title">{product.name}</h3>
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
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<JournalEntry | null>(null);

  const visibleSettings = getRenderableSettings(settings);
  const latestJournalEntries = getActiveJournalEntries(visibleSettings.journalEntries).slice(0, 3);
  const activeCollections = getActiveCollections(collections);

  const collectionsViewportRef = useRef<HTMLDivElement>(null);
  const [collectionSlide, setCollectionSlide] = useState(0);

  function goToCollectionSlide(index: number) {
    const clamped = Math.max(0, Math.min(index, activeCollections.length - 1));
    setCollectionSlide(clamped);
    const card = collectionsViewportRef.current?.children[clamped] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  const testimonialsViewportRef = useRef<HTMLDivElement>(null);
  const [testimonialSlide, setTestimonialSlide] = useState(0);

  function goToTestimonialSlide(index: number, total: number) {
    const clamped = Math.max(0, Math.min(index, total - 1));
    setTestimonialSlide(clamped);
    const card = testimonialsViewportRef.current?.children[clamped] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }
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
  const partnershipCopy =
    language === "MN"
      ? {
          kicker: "Brand Collaboration",
          title: "Хамтрал",
          body:
            "Байгууллага, хувь хүн, event, бэлгийн цуглуулгад зориулж өөрийн нэр, лого, өнгө төрхөөр шийдсэн бүтээгдэхүүн захиалах боломжтой.",
          pointOneTitle: "Private label",
          pointOneBody: "Өөрийн брэндийн нэр, лого, шошготой бүтээгдэхүүн.",
          pointTwoTitle: "Visual direction",
          pointTwoBody: "Өнгө, савлагаа, бэлгийн presentation-ийг брэндэд тань нийцүүлнэ.",
          pointThreeTitle: "Flexible volume",
          pointThreeBody: "Жижиг batch-аас байгууллагын захиалга хүртэл уян хатан ажиллана.",
          primaryCta: "Хамтралын дэлгэрэнгүй",
          secondaryCta: "Холбоо барих",
        }
      : {
          kicker: "Brand Collaboration",
          title: "Partnerships",
          body:
            "Order products tailored to your own name, logo, and color direction for organizations, personal brands, events, and custom gifting.",
          pointOneTitle: "Private label",
          pointOneBody: "Products developed with your own brand name, logo, and labeling.",
          pointTwoTitle: "Visual direction",
          pointTwoBody: "Packaging palette, presentation, and gifting direction aligned to your brand.",
          pointThreeTitle: "Flexible volume",
          pointThreeBody: "From smaller pilot batches to larger branded orders.",
          primaryCta: "Explore Partnerships",
          secondaryCta: "Contact Us",
        };

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
                    <div className="category-tile-title-bar">
                      <p className="category-tile-name">{collection.name}</p>
                    </div>
                    <div className="category-tile-overlay">
                      <p className="category-tile-name">{collection.name}</p>
                      <span className="category-tile-overlay-btn">
                        {t.shopNow} <ArrowRight size={12} />
                      </span>
                    </div>
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
          <div className="brand-story-image-bg">
            <img src={brandStorySoapImage} alt={t.brandStoryHeading} className="brand-story-photo" loading="lazy" />
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

      <section className="collections-slider-section section">
        <div className="container">
          <div className="collections-slider-header">
            <h2>{t.collectionsHeading}</h2>
            <div className="collections-slider-nav">
              <button
                type="button"
                className="collections-slider-btn"
                aria-label="Previous"
                disabled={collectionSlide === 0}
                onClick={() => goToCollectionSlide(collectionSlide - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="collections-slider-btn"
                aria-label="Next"
                disabled={collectionSlide >= activeCollections.length - 1}
                onClick={() => goToCollectionSlide(collectionSlide + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="collections-slider-viewport" ref={collectionsViewportRef}>
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
                    <div className="collections-grid-overlay">
                      <h3 className="collections-grid-overlay-name">{collection.name}</h3>
                      <span className="collections-grid-overlay-btn">
                        {t.shopNow} <ArrowRight size={13} />
                      </span>
                    </div>
                    <div className="collections-grid-title-bar">
                      <h3 className="collections-grid-overlay-name">{collection.name}</h3>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {latestJournalEntries.length > 0 && (
        <section className="home-journal-section section">
          <div className="container">
            <div className="best-sellers-header">
              <h2>{t.journal}</h2>
              <Link to="/journal" className="view-all-link">
                {t.viewAll} <ArrowRight size={14} />
              </Link>
            </div>
            <div className="home-journal-grid">
              {latestJournalEntries.map((entry) => {
                const title = language === "MN" ? entry.titleMn || entry.titleEn : entry.titleEn || entry.titleMn;
                const category = language === "MN" ? entry.categoryMn || entry.categoryEn : entry.categoryEn || entry.categoryMn;
                const excerpt = language === "MN" ? entry.excerptMn || entry.excerptEn : entry.excerptEn || entry.excerptMn;
                const date = new Date(entry.publishedAt);
                const formattedDate = Number.isNaN(date.getTime())
                  ? entry.publishedAt
                  : date.toLocaleDateString(language === "MN" ? "mn-MN" : "en-US", { year: "numeric", month: "long", day: "numeric" });

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="home-journal-card"
                    onClick={() => setSelectedJournalEntry(entry)}
                  >
                    <div className="home-journal-image">
                      {entry.image && <img src={entry.image} alt={title} loading="lazy" />}
                      <div className="home-journal-image-meta">
                        {category && <span className="home-journal-category">{category}</span>}
                        <span className="home-journal-date">{formattedDate}</span>
                      </div>
                    </div>
                    <div className="home-journal-body">
                      <h3 className="home-journal-title">{title}</h3>
                      <p className="home-journal-excerpt">{excerpt}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="home-partnership-section section">
        <div className="container">
          <div className="home-partnership-shell">
            <div className="home-partnership-copy">
              <span>{partnershipCopy.kicker}</span>
              <h2>{partnershipCopy.title}</h2>
              <p>{partnershipCopy.body}</p>
              <div className="home-partnership-actions">
                <Link to="/partnerships" className="btn btn-primary">
                  {partnershipCopy.primaryCta}
                </Link>
                <Link to="/contact" className="btn btn-outline">
                  {partnershipCopy.secondaryCta}
                </Link>
              </div>
            </div>

            <div className="home-partnership-grid">
              <article className="home-partnership-card">
                <div className="home-partnership-icon">
                  <BadgeCheck size={20} strokeWidth={1.5} />
                </div>
                <strong>{partnershipCopy.pointOneTitle}</strong>
                <p>{partnershipCopy.pointOneBody}</p>
              </article>
              <article className="home-partnership-card">
                <div className="home-partnership-icon">
                  <Palette size={20} strokeWidth={1.5} />
                </div>
                <strong>{partnershipCopy.pointTwoTitle}</strong>
                <p>{partnershipCopy.pointTwoBody}</p>
              </article>
              <article className="home-partnership-card">
                <div className="home-partnership-icon">
                  <BriefcaseBusiness size={20} strokeWidth={1.5} />
                </div>
                <strong>{partnershipCopy.pointThreeTitle}</strong>
                <p>{partnershipCopy.pointThreeBody}</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      {selectedJournalEntry && (() => {
        const modalTitle = language === "MN" ? selectedJournalEntry.titleMn || selectedJournalEntry.titleEn : selectedJournalEntry.titleEn || selectedJournalEntry.titleMn;
        const modalCategory = language === "MN" ? selectedJournalEntry.categoryMn || selectedJournalEntry.categoryEn : selectedJournalEntry.categoryEn || selectedJournalEntry.categoryMn;
        const modalExcerpt = language === "MN" ? selectedJournalEntry.excerptMn || selectedJournalEntry.excerptEn : selectedJournalEntry.excerptEn || selectedJournalEntry.excerptMn;
        const modalDate = new Date(selectedJournalEntry.publishedAt);
        const modalFormattedDate = Number.isNaN(modalDate.getTime())
          ? selectedJournalEntry.publishedAt
          : modalDate.toLocaleDateString(language === "MN" ? "mn-MN" : "en-US", { year: "numeric", month: "long", day: "numeric" });
        const paragraphs = modalExcerpt.split(/\n\s*\n/g).map((p) => p.trim()).filter(Boolean);

        return (
          <div className="journal-modal-backdrop" onClick={() => setSelectedJournalEntry(null)}>
            <div
              className="journal-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="home-journal-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="journal-modal-close"
                onClick={() => setSelectedJournalEntry(null)}
                aria-label={language === "MN" ? "Нийтлэл хаах" : "Close article"}
              >
                <X size={18} />
              </button>
              <div className="journal-modal-media">
                {selectedJournalEntry.image.trim() ? (
                  <img src={selectedJournalEntry.image} alt={modalTitle} />
                ) : (
                  <div className="journal-card-media-fallback">{modalCategory.slice(0, 1) || "J"}</div>
                )}
              </div>
              <div className="journal-modal-body">
                {modalCategory && <span className="journal-card-category">{modalCategory}</span>}
                <h3 id="home-journal-modal-title">{modalTitle}</h3>
                <div className="journal-card-meta journal-modal-meta">
                  <span><CalendarDays size={15} />{modalFormattedDate}</span>
                  {selectedJournalEntry.author && <span><UserCircle2 size={15} />{selectedJournalEntry.author}</span>}
                </div>
                <div className="journal-modal-content">
                  {(paragraphs.length > 0 ? paragraphs : [modalExcerpt]).map((p, i) => (
                    <p key={`${selectedJournalEntry.id}-${i}`}>{p}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {activeTestimonials.length > 0 && (
        <section className="testimonials-section section">
          <div className="container">
            <div className="collections-slider-header">
              <h2>{t.testimonialsHeading}</h2>
              <div className="collections-slider-nav">
                <button
                  type="button"
                  className="collections-slider-btn"
                  aria-label="Previous"
                  disabled={testimonialSlide === 0}
                  onClick={() => goToTestimonialSlide(testimonialSlide - 1, activeTestimonials.length)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="collections-slider-btn"
                  aria-label="Next"
                  disabled={testimonialSlide >= activeTestimonials.length - 1}
                  onClick={() => goToTestimonialSlide(testimonialSlide + 1, activeTestimonials.length)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="testimonials-slider-viewport" ref={testimonialsViewportRef}>
              {activeTestimonials.map((testimonial, index) => (
                <div key={index} className="testimonial-card">
                  <div className="testimonial-stars">♥♥♥♥♥</div>
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
