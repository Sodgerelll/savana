import { Link } from "react-router-dom";
import { Leaf, Heart, Sun, Sprout } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getRenderableSettings } from "../lib/storefrontHelpers";
import "./About.css";

export default function About() {
  const { t } = useLanguage();
  const { settings } = useStorefront();
  const visibleSettings = getRenderableSettings(settings);
  const aboutParagraphs = visibleSettings.aboutIntroBody.split("\n\n").filter(Boolean);

  return (
    <div className="about-page">
      <div className="about-hero">
        <div className="container">
          <h1>{t.aboutHeroHeading}</h1>
          <p>{t.aboutHeroSub}</p>
        </div>
      </div>

      <section className="about-intro section">
        <div className="container">
          <div className="about-intro-grid">
            <div className="about-intro-image">
              <div
                className="about-image-placeholder"
                style={{ background: "linear-gradient(135deg, #e8e0d0 0%, #c8bfa8 100%)" }}
              >
                <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
                  <ellipse cx="50" cy="60" rx="32" ry="22" fill="rgba(255,255,255,0.2)" />
                  <rect x="20" y="32" width="60" height="38" rx="19" fill="rgba(255,255,255,0.28)" />
                  <path d="M34 32 Q50 14 66 32" stroke="rgba(255,255,255,0.45)" strokeWidth="3" fill="none" />
                </svg>
              </div>
            </div>
            <div className="about-intro-content">
              <h2>{visibleSettings.aboutIntroTitle}</h2>
              {aboutParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="about-values section">
        <div className="container">
          <div className="section-header">
            <h2>What We Believe In</h2>
          </div>
          <div className="about-values-grid">
            <div className="about-value">
              <div className="about-value-icon">
                <Leaf size={32} strokeWidth={1.2} />
              </div>
              <h3>Natural Ingredients</h3>
              <p>
                We use only plant-based oils, butters, and pure essential oils.
                No synthetic fragrances, no parabens, no sulfates, no artificial
                colors. Just honest, natural ingredients you can trust.
              </p>
            </div>
            <div className="about-value">
              <div className="about-value-icon">
                <Heart size={32} strokeWidth={1.2} />
              </div>
              <h3>Small Batch</h3>
              <p>
                Every product is handcrafted in small batches, ensuring exceptional
                quality and consistency. We believe that the best products are made
                with patience and attention to detail.
              </p>
            </div>
            <div className="about-value">
              <div className="about-value-icon">
                <Sun size={32} strokeWidth={1.2} />
              </div>
              <h3>Mongolia Inspired</h3>
              <p>
                Our recipes are inspired by local ingredients, practical daily care,
                and the clean aesthetic that defines SAVANA. We focus on products
                that feel simple, useful, and intentional.
              </p>
            </div>
            <div className="about-value">
              <div className="about-value-icon">
                <Sprout size={32} strokeWidth={1.2} />
              </div>
              <h3>Sustainable</h3>
              <p>
                We're committed to reducing our environmental footprint. From
                minimal packaging to biodegradable formulas, we strive to make
                choices that are kind to the planet.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-banner">
        <div
          className="about-banner-bg"
          style={{ background: "linear-gradient(135deg, #e8e0d0 0%, #d4c9b0 50%, #c8bfa8 100%)" }}
        />
        <div className="about-banner-content container">
          <h2>Nourish Your Skin, Naturally</h2>
          <p>
            Every bar tells a story of simple, honest ingredients working together
            to nourish and protect your skin.
          </p>
          <Link to="/collections" className="btn btn-outline">
            Shop Our Products
          </Link>
        </div>
      </section>

      <section className="about-process section">
        <div className="container">
          <div className="section-header">
            <h2>Our Process</h2>
            <p>From ingredient to finished product, every step is done with care.</p>
          </div>
          <div className="process-steps">
            <div className="process-step">
              <span className="step-number">01</span>
              <h3>Source</h3>
              <p>We carefully select natural ingredients from trusted suppliers, prioritizing local and organic sources.</p>
            </div>
            <div className="process-step">
              <span className="step-number">02</span>
              <h3>Craft</h3>
              <p>Each batch is handcrafted using time-tested recipes and traditional cold-process methods.</p>
            </div>
            <div className="process-step">
              <span className="step-number">03</span>
              <h3>Cure</h3>
              <p>Our soaps are cured for 4–6 weeks, allowing them to develop their optimal hardness and mildness.</p>
            </div>
            <div className="process-step">
              <span className="step-number">04</span>
              <h3>Share</h3>
              <p>Each product is packaged with care and shipped to you, ready to bring natural goodness to your routine.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
