import { Link } from "react-router-dom";
import { Instagram, Facebook, Mail } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import "./Footer.css";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="footer">
      {/* Newsletter */}
      <div className="footer-newsletter">
        <div className="container">
          <div className="footer-newsletter-inner">
            <h2>{t.newsletterHeading}</h2>
            <p>{t.newsletterSubtext}</p>
            <form className="newsletter-form-footer" onSubmit={(e) => e.preventDefault()}>
              <input type="email" placeholder={t.newsletterPlaceholder} className="newsletter-input-footer" />
              <button type="submit" className="btn btn-primary newsletter-submit">{t.subscribe}</button>
            </form>
          </div>
        </div>
      </div>

      {/* Main footer grid */}
      <div className="footer-main">
        <div className="container">
          <div className="footer-grid">
            {/* Col 1: Brand */}
            <div className="footer-col footer-col-brand">
              <Link to="/" className="footer-logo">Prairie Soap Shack</Link>
              <p className="footer-about">{t.footerBrandDesc}</p>
              <div className="social-links">
                <a href="#" aria-label="Instagram" rel="noopener noreferrer">
                  <Instagram size={18} />
                </a>
                <a href="#" aria-label="Facebook" rel="noopener noreferrer">
                  <Facebook size={18} />
                </a>
                <a href="mailto:hello@prairiesoapshack.com" aria-label="Email">
                  <Mail size={18} />
                </a>
              </div>
            </div>

            {/* Col 2: Shop */}
            <div className="footer-col">
              <h4>{t.footerShop}</h4>
              <ul>
                <li><Link to="/collections">{t.allProducts}</Link></li>
                <li><Link to="/collections/soap">{t.allNaturalSoap}</Link></li>
                <li><Link to="/collections/skin-care">{t.skinCare}</Link></li>
                <li><Link to="/collections/body-care">{t.bodyCare}</Link></li>
                <li><Link to="/collections/hair">{t.hair}</Link></li>
                <li><Link to="/collections/lip-care">{t.lipCare}</Link></li>
                <li><Link to="/collections/best-sellers">{t.bestSellers}</Link></li>
              </ul>
            </div>

            {/* Col 3: Info */}
            <div className="footer-col">
              <h4>{t.footerInfo}</h4>
              <ul>
                <li><Link to="/about">{t.footerAbout}</Link></li>
                <li><Link to="/find-us">{t.findUs}</Link></li>
                <li><Link to="/contact">{t.contact}</Link></li>
                <li><Link to="/shipping">{t.footerShippingReturns}</Link></li>
                <li><Link to="/wholesale">{t.footerWholesale}</Link></li>
                <li><Link to="/faq">{t.footerFAQ}</Link></li>
              </ul>
            </div>

            {/* Col 4: Contact */}
            <div className="footer-col">
              <h4>{t.footerContact}</h4>
              <ul className="footer-contact-list">
                <li>Alberta, Canada</li>
                <li>
                  <a href="mailto:hello@prairiesoapshack.com">hello@prairiesoapshack.com</a>
                </li>
                <li>
                  <a href="https://instagram.com/prairiesoapshack" target="_blank" rel="noopener noreferrer">
                    @prairiesoapshack
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom">
        <div className="container">
          <p>&copy; {new Date().getFullYear()} {t.footerCopyright}</p>
          <div className="footer-bottom-links">
            <Link to="/privacy">{t.footerPolicies}</Link>
            <Link to="/terms">Terms</Link>
            <div className="payment-icons">
              <span className="payment-icon">VISA</span>
              <span className="payment-icon">MC</span>
              <span className="payment-icon">AMEX</span>
              <span className="payment-icon">PP</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
