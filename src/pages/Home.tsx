import { Link } from "react-router-dom";
import { ArrowRight, Leaf, Heart, Droplets } from "lucide-react";
import ProductCard from "../components/ProductCard";
import { products, collections } from "../data/products";
import "./Home.css";

const featuredProducts = products.filter((p) =>
  [2, 7, 9, 12, 14, 19, 8, 20].includes(p.id)
);

const testimonials = [
  {
    text: "I've been using Prairie Soap Shack soaps for over a year now and my skin has never been happier. The Dandelion & Honey is my absolute favourite!",
    author: "Sarah M.",
    location: "Calgary, AB",
    rating: 5,
  },
  {
    text: "Finally found natural products that actually work. The body butter is incredibly moisturizing without feeling greasy. Will never go back to store-bought.",
    author: "Jennifer K.",
    location: "Edmonton, AB",
    rating: 5,
  },
  {
    text: "The Forest Bath soap is like bringing the outdoors into my shower every morning. Beautiful products made with so much care. Highly recommend!",
    author: "Michael R.",
    location: "Red Deer, AB",
    rating: 5,
  },
];

export default function Home() {
  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg">
          <img
            src="https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=1600&h=900&fit=crop"
            alt="Natural handmade soaps"
          />
        </div>
        <div className="hero-content">
          <p className="hero-subtitle">Handcrafted in Alberta</p>
          <h1>Natural Skin &amp; Body Care</h1>
          <p className="hero-description">
            Simple, honest ingredients that nourish your skin and respect the earth.
          </p>
          <div className="hero-actions">
            <Link to="/collections" className="btn btn-light">
              Shop All Products
            </Link>
            <Link to="/about" className="btn btn-light" style={{ background: 'transparent', borderColor: '#fff', color: '#fff' }}>
              Our Story
            </Link>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="values section">
        <div className="container">
          <div className="values-grid">
            <div className="value-item">
              <Leaf size={32} strokeWidth={1.2} />
              <h3>All Natural</h3>
              <p>Made with plant-based oils, butters, and essential oils. No synthetic fragrances or harsh chemicals.</p>
            </div>
            <div className="value-item">
              <Heart size={32} strokeWidth={1.2} />
              <h3>Handcrafted with Love</h3>
              <p>Every bar is carefully handcrafted in small batches on the Canadian prairies with attention to detail.</p>
            </div>
            <div className="value-item">
              <Droplets size={32} strokeWidth={1.2} />
              <h3>Gentle on Skin</h3>
              <p>Our recipes are formulated to be gentle and moisturizing, suitable for even the most sensitive skin.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <h2>Our Products</h2>
            <p>Handcrafted with natural ingredients for healthy, happy skin.</p>
          </div>
          <div className="product-grid">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="section-cta">
            <Link to="/collections" className="btn btn-outline">
              View All Products <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Split Banner */}
      <section className="split-banner">
        <div className="split-left">
          <img
            src="https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=800&h=600&fit=crop"
            alt="Handmade soap bars"
          />
        </div>
        <div className="split-right">
          <div className="split-content">
            <h2>From Our Prairie to Your Home</h2>
            <p>
              Every product we create starts with carefully sourced, natural ingredients.
              We believe that what you put on your skin matters, which is why we use only
              plant-based oils, locally harvested botanicals, and pure essential oils.
            </p>
            <p>
              Our small-batch process ensures that each bar receives the attention it
              deserves, resulting in products that are as beautiful as they are effective.
            </p>
            <Link to="/about" className="btn btn-outline">
              Learn More About Us
            </Link>
          </div>
        </div>
      </section>

      {/* Collections */}
      <section className="section collections-section">
        <div className="container">
          <div className="section-header">
            <h2>Shop by Category</h2>
            <p>Find exactly what you're looking for.</p>
          </div>
          <div className="collections-grid">
            {collections.slice(0, 4).map((collection) => (
              <Link
                to={`/collections/${collection.slug}`}
                key={collection.id}
                className="collection-card"
              >
                <img src={collection.image} alt={collection.name} />
                <div className="collection-overlay">
                  <h3>{collection.name}</h3>
                  <span className="collection-link">
                    Shop Now <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials section">
        <div className="container">
          <div className="section-header">
            <h2>What Our Customers Say</h2>
          </div>
          <div className="testimonials-grid">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="testimonial-card">
                <div className="testimonial-stars">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <span key={i}>&#9733;</span>
                  ))}
                </div>
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

      {/* CTA Banner */}
      <section className="cta-banner">
        <div className="cta-bg">
          <img
            src="https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=1600&h=500&fit=crop"
            alt="Skincare products"
          />
        </div>
        <div className="cta-content">
          <h2>The Essential Skincare Set</h2>
          <p>Everything you need for a complete natural skincare routine, beautifully packaged and ready to gift.</p>
          <Link to="/product/8" className="btn btn-light">
            Shop Now
          </Link>
        </div>
      </section>
    </div>
  );
}
