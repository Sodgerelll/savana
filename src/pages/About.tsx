import { Link } from "react-router-dom";
import { Leaf, Heart, Sun, Sprout } from "lucide-react";
import "./About.css";

export default function About() {
  return (
    <div className="about-page">
      <div className="about-hero">
        <h1>Our Story</h1>
        <p>From the heart of the Canadian prairies to your home.</p>
      </div>

      <section className="about-intro section">
        <div className="container">
          <div className="about-intro-grid">
            <div className="about-intro-image">
              <img
                src="https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=600&h=700&fit=crop"
                alt="Handcrafted soaps"
              />
            </div>
            <div className="about-intro-content">
              <h2>Where It All Began</h2>
              <p>
                Prairie Soap Shack started in a small kitchen in rural Alberta, born
                from a passion for natural living and a desire to create skincare
                products that are both effective and gentle on the earth.
              </p>
              <p>
                What began as a hobby of making soap for family and friends quickly
                grew into something more. Word spread about our handcrafted bars, and
                before we knew it, Prairie Soap Shack was born.
              </p>
              <p>
                Today, we continue to handcraft every product in small batches,
                ensuring the same quality and care that went into our very first bar
                of soap. We source our ingredients thoughtfully, prioritizing local
                and sustainable options whenever possible.
              </p>
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
              <Leaf size={36} strokeWidth={1.2} />
              <h3>Natural Ingredients</h3>
              <p>
                We use only plant-based oils, butters, and pure essential oils.
                No synthetic fragrances, no parabens, no sulfates, no artificial
                colors. Just honest, natural ingredients you can trust.
              </p>
            </div>
            <div className="about-value">
              <Heart size={36} strokeWidth={1.2} />
              <h3>Small Batch</h3>
              <p>
                Every product is handcrafted in small batches, ensuring exceptional
                quality and consistency. We believe that the best products are made
                with patience and attention to detail.
              </p>
            </div>
            <div className="about-value">
              <Sun size={36} strokeWidth={1.2} />
              <h3>Prairie Inspired</h3>
              <p>
                Our recipes are inspired by the beauty and bounty of the Canadian
                prairies. From wildflower-infused oils to locally harvested honey,
                we celebrate our prairie roots.
              </p>
            </div>
            <div className="about-value">
              <Sprout size={36} strokeWidth={1.2} />
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
        <div className="about-banner-bg">
          <img
            src="https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=1600&h=500&fit=crop"
            alt="Prairie landscape"
          />
        </div>
        <div className="about-banner-content">
          <h2>Nourish Your Skin, Naturally</h2>
          <p>
            Every bar tells a story of simple, honest ingredients working together
            to nourish and protect your skin.
          </p>
          <Link to="/collections" className="btn btn-light">
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
              <p>Our soaps are cured for 4-6 weeks, allowing them to develop their optimal hardness and mildness.</p>
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
