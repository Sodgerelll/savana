import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShoppingBag, Search, User, Menu, X } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useStorefront } from "../context/StorefrontContext";
import { useLanguage } from "../context/LanguageContext";
import { getActiveCollections, getRenderableSettings } from "../lib/storefrontHelpers";
import "./Header.css";

const SCROLL_THRESHOLD = 10; // px before we consider "scrolled"

export default function Header() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const { totalItems, setIsCartOpen } = useCart();
  const { user, logout } = useAuth();
  const { collections, settings } = useStorefront();
  const { language, setLanguage, t } = useLanguage();
  const visibleSettings = getRenderableSettings(settings);
  const activeCollections = getActiveCollections(collections);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);

  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  // Scroll behavior: hide on scroll-down, show on scroll-up with solid bg
  useEffect(() => {
    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;

        // Determine if we've scrolled past the threshold
        const isScrolled = currentScrollY > SCROLL_THRESHOLD;
        setScrolled(isScrolled);

        // Only hide/show header after scrolling a bit
        if (currentScrollY > 150) {
          // Scrolling DOWN → hide header
          if (currentScrollY > lastScrollY.current + 5) {
            setHeaderHidden(true);
          }
          // Scrolling UP → show header (with solid bg)
          else if (currentScrollY < lastScrollY.current - 5) {
            setHeaderHidden(false);
          }
        } else {
          // Near the top: always show header
          setHeaderHidden(false);
        }

        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const shopLinks = [
    ...activeCollections.map((collection) => ({
      label: collection.name,
      to: `/collections/${collection.slug}`,
    })),
  ];

  const headerClasses = [
    "site-header-wrap",
    !isHome ? "subpage-sticky" : "",
    !isHome ? "solid" : "",
    scrolled ? "scrolled" : "",
    isHome && headerHidden ? "header-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const accountHref = user ? "/account" : "/login";

  const handleMobileLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* ── STICKY HEADER BLOCK ── */}
      <div className={headerClasses}>

        {/* Header */}
        <div className="header-inner">

          {/* Row 1: left controls | logo | right icons */}
          <div className="header-row header-row-top container">

            <div className="h-left">
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

            <Link to="/" className="site-logo">{visibleSettings.brandName}</Link>

            <div className="h-right">
              <button className="icon-btn" onClick={() => setSearchOpen(true)} aria-label="Search">
                <Search size={20} />
              </button>
              <Link to={accountHref} className="icon-btn account-link-btn" aria-label={user ? t.account : t.login}>
                <span className="account-icon-wrap">
                  <User size={20} />
                  {user && <span className="account-status-dot" />}
                </span>
                <span className="account-link-label">{user ? t.account : t.login}</span>
              </Link>
              <button className="icon-btn cart-icon-btn" onClick={() => setIsCartOpen(true)} aria-label="Cart">
                <ShoppingBag size={20} />
                {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
              </button>
            </div>
          </div>

          {/* Row 2: navigation */}
          <nav className="header-nav">
            <div className="header-row container">

              {/* Shop with pure-CSS dropdown */}
              <div className="nav-has-dropdown">
                <span className="nav-link nav-shop-trigger">
                  {t.shop} <span className="nav-caret">▾</span>
                </span>
                <div className="nav-dropdown">
                  <div className="nav-dropdown-inner">
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

              <Link to="/about" className="nav-link">{t.aboutUs}</Link>
              <Link to="/find-us" className="nav-link">{t.findUs}</Link>
              <Link to="/contact" className="nav-link">{t.contact}</Link>
            </div>
          </nav>

        </div>
      </div>

      {/* ── SEARCH OVERLAY ── */}
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

      {/* ── MOBILE DRAWER ── */}
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
          {shopLinks.map((lnk) => (
            <Link key={lnk.to} to={lnk.to} className="mobile-link" onClick={() => setMobileMenuOpen(false)}>
              {lnk.label}
            </Link>
          ))}
          <div className="mobile-divider" />
          <Link to="/about" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>{t.aboutUs}</Link>
          <Link to="/find-us" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>{t.findUs}</Link>
          <Link to="/contact" className="mobile-link" onClick={() => setMobileMenuOpen(false)}>{t.contact}</Link>
          <div className="mobile-divider" />
          <Link to={accountHref} className="mobile-link" onClick={() => setMobileMenuOpen(false)}>
            {user ? t.account : t.login}
          </Link>
          {user && (
            <button type="button" className="mobile-link mobile-link-btn" onClick={handleMobileLogout}>
              {t.logout}
            </button>
          )}
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
