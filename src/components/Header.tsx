import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Search, User, Menu, X, ChevronDown } from "lucide-react";
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
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShopDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      {/* Announcement Bar */}
      <div className="announcement-bar">
        <span
          className={`announcement-text ${announcementVisible ? "visible" : "hidden"}`}
        >
          {announcements[announcementIndex]}
        </span>
      </div>

      {/* Header */}
      <header className={`header ${scrolled ? "scrolled" : ""}`}>
        {/* Top row: logo centered, icons right */}
        <div className="header-top container">
          {/* Left side: mobile hamburger + language toggle */}
          <div className="header-left">
            <button
              className="header-icon mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <button
              className="lang-toggle"
              onClick={() => setLanguage(language === "EN" ? "MN" : "EN")}
              aria-label="Toggle language"
            >
              <span className={language === "EN" ? "lang-active" : ""}>EN</span>
              <span className="lang-sep">|</span>
              <span className={language === "MN" ? "lang-active" : ""}>MN</span>
            </button>
          </div>

          {/* Center: Logo */}
          <Link to="/" className="logo">
            <span className="logo-text">Prairie Soap Shack</span>
          </Link>

          {/* Right: Icons */}
          <div className="header-actions">
            <button
              className="header-icon"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Search"
            >
              <Search size={18} />
            </button>
            <Link to="/account" className="header-icon" aria-label="Account">
              <User size={18} />
            </Link>
            <button
              className="header-icon cart-btn"
              onClick={() => setIsCartOpen(true)}
              aria-label="Cart"
            >
              <ShoppingBag size={18} />
              {totalItems > 0 && <span className="cart-count">{totalItems}</span>}
            </button>
          </div>
        </div>

        {/* Nav row */}
        <nav className="main-nav-bar">
          <div className="main-nav container">
            {/* Shop dropdown */}
            <div className="nav-item dropdown-parent" ref={dropdownRef}>
              <button
                className="nav-link dropdown-trigger"
                onClick={() => setShopDropdownOpen(!shopDropdownOpen)}
                aria-expanded={shopDropdownOpen}
              >
                {t.shop} <ChevronDown size={12} className={`chevron ${shopDropdownOpen ? "open" : ""}`} />
              </button>
              {shopDropdownOpen && (
                <div className="dropdown-menu">
                  {shopLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="dropdown-item"
                      onClick={() => setShopDropdownOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link to="/about" className="nav-link">{t.aboutUs}</Link>
            <Link to="/find-us" className="nav-link">{t.findUs}</Link>
            <Link to="/contact" className="nav-link">{t.contact}</Link>
          </div>
        </nav>
      </header>

      {/* Search Overlay */}
      {searchOpen && (
        <div className="search-overlay">
          <div className="search-container container">
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className="search-input"
              autoFocus
            />
            <button className="search-close" onClick={() => setSearchOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Nav */}
      <div className={`mobile-nav ${mobileMenuOpen ? "open" : ""}`}>
        <div className="mobile-nav-inner">
          <div className="mobile-nav-section">
            <p className="mobile-nav-label">{t.shop}</p>
            {shopLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="mobile-nav-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="mobile-nav-section">
            <Link to="/about" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              {t.aboutUs}
            </Link>
            <Link to="/find-us" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              {t.findUs}
            </Link>
            <Link to="/contact" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>
              {t.contact}
            </Link>
          </div>
          <div className="mobile-lang-toggle">
            <button
              className={`mobile-lang-btn ${language === "EN" ? "active" : ""}`}
              onClick={() => { setLanguage("EN"); setMobileMenuOpen(false); }}
            >
              English
            </button>
            <button
              className={`mobile-lang-btn ${language === "MN" ? "active" : ""}`}
              onClick={() => { setLanguage("MN"); setMobileMenuOpen(false); }}
            >
              Монгол
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}
    </>
  );
}
