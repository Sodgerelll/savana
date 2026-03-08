import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Search, User, Menu, X } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import "./Header.css";

const ANNOUNCEMENT_INTERVAL = 4000;

export default function Header() {
  const { totalItems, setIsCartOpen } = useCart();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [announcementVisible, setAnnouncementVisible] = useState(true);

  const announcements = [t.announcement1, t.announcement2, t.announcement3];

  useEffect(() => {
    const interval = setInterval(() => {
      setAnnouncementVisible(false);
      setTimeout(() => {
        setAnnouncementIndex((prev) => (prev + 1) % announcements.length);
        setAnnouncementVisible(true);
      }, 400);
    }, ANNOUNCEMENT_INTERVAL);
    return () => clearInterval(interval);
  }, [announcements.length]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const shopLinks = [
    { label: t.allNaturalSoap, to: "/collections/soap" },
    { label: t.skinCare, to: "/collections/skin-care" },
    { label: t.bodyCare, to: "/collections/body-care" },
    { label: t.hair, to: "/collections/hair" },
    { label: t.lipCare, to: "/collections/lip-care" },
    { label: t.bestSellers, to: "/collections/best-sellers" },
  ];

  return (
    <>
      {/* ── STICKY HEADER BLOCK (announcement + header together) ── */}
      <div className={`site-header-wrap${scrolled ? " scrolled" : ""}`}>

        {/* Announcement bar */}
        <div className="announcement-bar">
          <span className={`announcement-text${announcementVisible ? " visible" : " hidden"}`}>
            {announcements[announcementIndex]}
          </span>
        </div>

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

            <Link to="/" className="site-logo">Prairie Soap Shack</Link>

            <div className="h-right">
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

              <Link to="/about"   className="nav-link">{t.aboutUs}</Link>
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
          <Link to="/about"   className="mobile-link" onClick={() => setMobileMenuOpen(false)}>{t.aboutUs}</Link>
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
