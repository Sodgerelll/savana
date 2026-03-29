import { Link } from "react-router-dom";
import { Instagram, Facebook, Mail } from "lucide-react";
import { useStorefront } from "../context/StorefrontContext";
import { useLanguage } from "../context/LanguageContext";
import { getActiveCollections, getRenderableSettings } from "../lib/storefrontHelpers";
import "./Footer.css";

export default function Footer() {
  const { t, language } = useLanguage();
  const { collections, settings } = useStorefront();
  const activeCollections = getActiveCollections(collections);
  const visibleSettings = getRenderableSettings(settings);
  const contactPhone = visibleSettings.contactPhone.trim();
  const contactPhoneHref = contactPhone.replace(/\s+/g, "");
  const partnershipLabel = language === "MN" ? "Хамтрал" : "Partnerships";

  return (
    <footer className="footer">
      {/* Main footer grid */}
      <div className="footer-main">
        <div className="container">
          <div className="footer-grid">
            {/* Col 1: Brand */}
            <div className="footer-col footer-col-brand">
              <Link to="/" className="footer-logo">{visibleSettings.brandName}</Link>
              <p className="footer-about">{t.footerBrandDesc}</p>
              <div className="social-links">
                <a href={visibleSettings.instagramUrl} aria-label="Instagram" rel="noopener noreferrer" target="_blank">
                  <Instagram size={18} />
                </a>
                <a href={visibleSettings.facebookUrl} aria-label="Facebook" rel="noopener noreferrer" target="_blank">
                  <Facebook size={18} />
                </a>
                <a href={`mailto:${visibleSettings.contactEmail}`} aria-label="Email">
                  <Mail size={18} />
                </a>
              </div>
            </div>

            {/* Col 2: Shop */}
            <div className="footer-col">
              <h4>{t.footerShop}</h4>
              <ul>
                <li><Link to="/collections">{t.allProducts}</Link></li>
                {activeCollections.map((collection) => (
                  <li key={collection.id}>
                    <Link to={`/collections/${collection.slug}`}>{collection.name}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3: Info */}
            <div className="footer-col">
              <h4>{t.footerInfo}</h4>
              <ul>
                <li><Link to="/about">{t.footerAbout}</Link></li>
                <li><Link to="/partnerships">{partnershipLabel}</Link></li>
                <li><Link to="/contact">{t.contact}</Link></li>
                <li><Link to="/faq">{t.footerFAQ}</Link></li>
              </ul>
            </div>

            {/* Col 4: Contact */}
            <div className="footer-col">
              <h4>{t.footerContact}</h4>
              <ul className="footer-contact-list">
                <li>{visibleSettings.location}</li>
                {contactPhone ? (
                  <li>
                    <a href={`tel:${contactPhoneHref}`}>{contactPhone}</a>
                  </li>
                ) : null}
                <li>
                  <a href={`mailto:${visibleSettings.contactEmail}`}>{visibleSettings.contactEmail}</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom">
        <div className="container">
          <p>&copy; 2019 - {new Date().getFullYear()} {t.footerCopyright}</p>
          <div className="footer-bottom-links">
            <Link to="/privacy">{t.footerPolicies}</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
