import { Link } from "react-router-dom";
import { Instagram, Facebook, Mail } from "lucide-react";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-newsletter">
        <div className="container">
          <div className="newsletter-content">
            <h2>Join the Prairie Family</h2>
            <p>Subscribe for exclusive offers, skincare tips, and new product announcements.</p>
            <form className="newsletter-form" onSubmit={(e) => e.preventDefault()}>
              <input type="email" placeholder="Your email address" className="newsletter-input" />
              <button type="submit" className="btn btn-primary">Subscribe</button>
            </form>
          </div>
        </div>
      </div>

      <div className="footer-main">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-col">
              <h3>Prairie Soap Shack</h3>
              <p className="footer-about">
                Handcrafted natural skin and body care products made with love on the Canadian prairies.
                We believe in simple, honest ingredients that nourish your skin and respect the earth.
              </p>
              <div className="social-links">
                <a href="#" aria-label="Instagram"><Instagram size={20} /></a>
                <a href="#" aria-label="Facebook"><Facebook size={20} /></a>
                <a href="#" aria-label="Email"><Mail size={20} /></a>
              </div>
            </div>

            <div className="footer-col">
              <h4>Shop</h4>
              <ul>
                <li><Link to="/collections">All Products</Link></li>
                <li><Link to="/collections/bar-soaps">Bar Soaps</Link></li>
                <li><Link to="/collections/body-butters">Body Butters</Link></li>
                <li><Link to="/collections/body-sprays">Body Sprays</Link></li>
                <li><Link to="/collections/hair-care">Hair Care</Link></li>
                <li><Link to="/collections/skincare-sets">Skincare Sets</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Information</h4>
              <ul>
                <li><Link to="/about">About Us</Link></li>
                <li><Link to="/contact">Contact</Link></li>
                <li><Link to="/shipping">Shipping & Returns</Link></li>
                <li><Link to="/wholesale">Wholesale</Link></li>
                <li><Link to="/faq">FAQ</Link></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Contact</h4>
              <ul className="contact-info">
                <li>Alberta, Canada</li>
                <li>
                  <a href="mailto:hello@prairiesoapshack.com">hello@prairiesoapshack.com</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} Prairie Soap Shack. All rights reserved.</p>
          <div className="footer-bottom-links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
