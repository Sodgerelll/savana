import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShoppingBag, Search, User, Menu, X } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getActiveCollections } from "../lib/storefrontHelpers";
import logoBlack from "../assets/logoBlack.png";
import logoWhite from "../assets/logoWhite.png";
import "./Header.css";

export default function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const { totalItems, setIsCartOpen } = useCart();
  const { language, setLanguage, t } = useLanguage();
  const { collections } = useStorefront();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const shopLinks = getActiveCollections(collections).map((collection) => ({
    label: collection.name,
    to: `/collections/${collection.slug}`,
  }));
  const headerClasses = [
    "site-header-wrap",
    scrolled ? "scrolled" : "",
    isHome && !scrolled ? "home-transparent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {/* ── STICKY HEADER BLOCK ── */}
      <div className={headerClasses}>
        <div className="header-inner">
          <div className="header-row header-row-top container">
            <div className="h-left">
              <div className="header-controls">
                <button
                  className="icon-btn mobile-toggle"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu size={22} />
                </button>
                <button
                  className="lang-btn"
                  onClick={() => setLanguage(language === "EN" ? "MN" : "EN")}
                >
                  <span className={language === "EN" ? "lang-on" : ""}>EN</span>
                  <span className="lang-div">|</span>
                  <span className={language === "MN" ? "lang-on" : ""}>MN</span>
                </button>
              </div>

              <div className="header-menu-group header-menu-group-left">
                <div className="nav-has-dropdown">
                  <span className="nav-link nav-shop-trigger">
                    {t.shop} <span className="nav-caret">▾</span>
                  </span>
                  <div className="nav-dropdown">
                    <div className="nav-dropdown-inner">
                      <Link to="/collections" className="nav-dropdown-item">
                        {t.allProducts}
                      </Link>
                      {shopLinks.map((lnk) => (
                        <Link
                          key={lnk.to}
                          to={lnk.to}
                          className="nav-dropdown-item"
                        >
                          {lnk.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                <Link to="/about" className="nav-link">
                  {t.aboutUs}
                </Link>
              </div>
            </div>

            <Link to="/" className="site-logo" aria-label="SAVANA">
              <img src={logoBlack} alt="SAVANA" className="site-logo-img site-logo-default" />
              <img src={logoWhite} alt="" aria-hidden="true" className="site-logo-img site-logo-white" />
            </Link>

            <div className="h-right">
              <div className="header-menu-group header-menu-group-right">
                <Link to="/find-us" className="nav-link">
                  {t.findUs}
                </Link>
                <Link to="/contact" className="nav-link">
                  {t.contact}
                </Link>
              </div>

              <div className="header-actions">
                <button className="icon-btn" onClick={() => setSearchOpen(true)} aria-label="Search">
                  <Search size={20} />
                </button>
                <Link to="/account" className="icon-btn" aria-label="Account">
                  <User size={20} />
                </Link>
                <button className="icon-btn cart-icon-btn" onClick={() => setIsCartOpen(true)} aria-label="Cart">
                  <ShoppingBag size={20} />
                  {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-inner container" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              type="text"
              placeholder={t.searchPlaceholder}
              className="search-field"
            />
            <button className="icon-btn" onClick={() => setSearchOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {mobileMenuOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}
      <div className={`mobile-drawer${mobileMenuOpen ? " open" : ""}`}>
        <div className="mobile-drawer-head">
          <button className="icon-btn" onClick={() => setMobileMenuOpen(false)}>
            <X size={22} />
          </button>
        </div>
        <div className="mobile-drawer-body">
          <p className="mobile-section-label">{t.shop}</p>
          <Link to="/collections" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>
            {t.allProducts}
          </Link>
          {shopLinks.map((lnk) => (
            <Link key={lnk.to} to={lnk.to} className="mobile-link" onClick={() => setMobileMenuOpen(false)}>
              {lnk.label}
            </Link>
          ))}
          <div className="mobile-divider" />
          <Link to="/about" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>
            {t.aboutUs}
          </Link>
          <Link to="/find-us" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>{t.findUs}</Link>
          <Link to="/contact" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>{t.contact}</Link>
          <div className="mobile-divider" />
          <div className="mobile-lang">
            <button
              className={`mobile-lang-btn${language === "EN" ? " active" : ""}`}
              onClick={() => { setLanguage("EN"); setMobileMenuOpen(false); }}
            >English</button>
            <button
              className={`mobile-lang-btn${language === "MN" ? " active" : ""}`}
              onClick={() => { setLanguage("MN"); setMobileMenuOpen(false); }}
            >Монгол</button>
          </div>
        </div>
      </div>
    </>
  );
}
