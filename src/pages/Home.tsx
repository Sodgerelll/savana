import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import { products, bestSellerProducts } from "../data/products";
import "./Home.css";

const testimonials = [
  {
    text: "I've been using Prairie Soap Shack soaps for over a year now and my skin has never been happier. The Dandelion & Honey is my absolute favourite!",
    author: "Sarah M.",
    location: "Calgary, AB",
  },
  {
    text: "Finally found natural products that actually work. The body butter is incredibly moisturizing without feeling greasy. Will never go back to store-bought.",
    author: "Jennifer K.",
    location: "Edmonton, AB",
  },
  {
    text: "The Forest Bath soap is like bringing the outdoors into my shower every morning. Beautiful products made with so much care. Highly recommend!",
    author: "Michael R.",
    location: "Red Deer, AB",
  },
];

const categoryTiles = [
  { slug: "soap", gradient: "linear-gradient(135deg, #c8bfa8 0%, #b5a98e 100%)" },
  { slug: "skin-care", gradient: "linear-gradient(135deg, #d4c9b0 0%, #c2b49a 100%)" },
  { slug: "body-care", gradient: "linear-gradient(135deg, #bfc8aa 0%, #aab592 100%)" },
  { slug: "hair", gradient: "linear-gradient(135deg, #c4bda8 0%, #b0a890 100%)" },
  { slug: "lip-care", gradient: "linear-gradient(135deg, #d0c0b0 0%, #bda898 100%)" },
];

function ProductCardHome({ product }: { product: (typeof products)[0] }) {
  const { addItem } = useCart();
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);

  const formatPrice = (price: number) => `$${price.toFixed(2)} CAD`;

  // Generate a gradient for each product based on category
  const gradients: Record<string, string> = {
    soap: "linear-gradient(135deg, #c8bfa8 0%, #b5a98e 100%)",
    "skin-care": "linear-gradient(135deg, #d4c9b0 0%, #c2b49a 100%)",
    "body-care": "linear-gradient(135deg, #bfc8aa 0%, #aab592 100%)",
    hair: "linear-gradient(135deg, #c4bda8 0%, #b0a890 100%)",
    "lip-care": "linear-gradient(135deg, #d0c0b0 0%, #bda898 100%)",
    "best-sellers": "linear-gradient(135deg, #c8c0a0 0%, #b5aa88 100%)",
  };

  return (
    <div
      className={`home-product-card ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to={`/product/${product.id}`} className="home-product-image-wrap">
        <div
          className="home-product-image-bg"
          style={{ background: gradients[product.category] || gradients.soap }}
        >
          <div className="home-product-icon">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="28" cy="32" rx="18" ry="12" fill="rgba(255,255,255,0.25)" />
              <rect x="14" y="16" width="28" height="20" rx="10" fill="rgba(255,255,255,0.35)" />
              <path d="M22 16 Q28 8 34 16" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
            </svg>
          </div>
        </div>
        {product.badge && <span className="home-product-badge">{product.badge}</span>}
        <div className="home-product-overlay">
          <button
            className="home-quick-add"
            onClick={(e) => {
              e.preventDefault();
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
        <p className="home-product-price">{formatPrice(product.price)}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useLanguage();

  const categoryLabels: Record<string, string> = {
    soap: t.soap,
    "skin-care": t.skinCare,
    "body-care": t.bodyCare,
    hair: t.hair,
    "lip-care": t.lipCare,
  };

  // Collections grid: use all 6 collections
  const collectionsGridItems = [
    { slug: "soap", label: t.allNaturalSoap, gradient: "linear-gradient(135deg, #c8bfa8 0%, #b5a98e 100%)" },
    { slug: "skin-care", label: t.skinCare, gradient: "linear-gradient(135deg, #d4c9b0 0%, #c2b49a 100%)" },
    { slug: "body-care", label: t.bodyCare, gradient: "linear-gradient(135deg, #bfc8aa 0%, #aab592 100%)" },
    { slug: "hair", label: t.hair, gradient: "linear-gradient(135deg, #c4bda8 0%, #b0a890 100%)" },
    { slug: "lip-care", label: t.lipCare, gradient: "linear-gradient(135deg, #d0c0b0 0%, #bda898 100%)" },
    { slug: "best-sellers", label: t.bestSellers, gradient: "linear-gradient(135deg, #c8c0a0 0%, #b5aa88 100%)" },
  ];

  return (
    <div className="home">
      {/* 1. Hero Banner */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-content fade-in-up">
          <p className="hero-label">{t.handcraftedIn}</p>
          <h1 className="hero-heading">{t.heroHeading}</h1>
          <p className="hero-subtext">{t.heroSubtext}</p>
          <div className="hero-actions">
            <Link to="/collections" className="btn btn-primary">
              {t.shopNow}
            </Link>
            <Link to="/about" className="btn btn-outline-white">
              {t.ourStory}
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Featured Categories */}
      <section className="categories-section section">
        <div className="container">
          <div className="section-header">
            <h2>{t.categoriesHeading}</h2>
          </div>
          <div className="categories-row">
            {categoryTiles.map((cat) => (
              <Link
                key={cat.slug}
                to={`/collections/${cat.slug}`}
                className="category-tile"
              >
                <div
                  className="category-tile-bg"
                  style={{ background: cat.gradient }}
                >
                  <div className="category-tile-icon">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                      <ellipse cx="20" cy="24" rx="13" ry="8" fill="rgba(255,255,255,0.2)" />
                      <rect x="8" y="12" width="24" height="14" rx="7" fill="rgba(255,255,255,0.3)" />
                    </svg>
                  </div>
                </div>
                <div className="category-tile-info">
                  <p className="category-tile-name">{categoryLabels[cat.slug]}</p>
                  <span className="category-tile-link">
                    {t.shopNow} <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Best Sellers */}
      <section className="best-sellers-section section">
        <div className="container">
          <div className="best-sellers-header">
            <h2>{t.bestSellersHeading}</h2>
            <Link to="/collections/best-sellers" className="view-all-link">
              {t.viewAll} <ArrowRight size={14} />
            </Link>
          </div>
          <div className="product-grid">
            {bestSellerProducts.map((product) => (
              <ProductCardHome key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* 4. Brand Story / Split Section */}
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

      {/* 5. Collections Grid */}
      <section className="collections-grid-section section">
        <div className="container">
          <div className="section-header">
            <h2>{t.collectionsHeading}</h2>
          </div>
          <div className="collections-grid">
            {collectionsGridItems.map((item) => (
              <Link
                key={item.slug}
                to={`/collections/${item.slug}`}
                className="collections-grid-card"
              >
                <div
                  className="collections-grid-bg"
                  style={{ background: item.gradient }}
                >
                  <div className="collections-grid-icon">
                    <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
                      <ellipse cx="25" cy="30" rx="16" ry="10" fill="rgba(255,255,255,0.2)" />
                      <rect x="12" y="17" width="26" height="17" rx="9" fill="rgba(255,255,255,0.28)" />
                      <path d="M19 17 Q25 10 31 17" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
                    </svg>
                  </div>
                </div>
                <div className="collections-grid-info">
                  <h3>{item.label}</h3>
                  <span className="collections-grid-link">
                    {t.shopNow} <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Testimonials */}
      <section className="testimonials-section section">
        <div className="container">
          <div className="section-header">
            <h2>{t.testimonialsHeading}</h2>
          </div>
          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
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

      {/* 7. Newsletter */}
      <section className="newsletter-section">
        <div className="container">
          <div className="newsletter-content">
            <h2>{t.newsletterHeading}</h2>
            <p>{t.newsletterSubtext}</p>
            <form className="newsletter-form" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder={t.newsletterPlaceholder}
                className="newsletter-input"
              />
              <button type="submit" className="btn btn-primary newsletter-btn">
                {t.subscribe}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
