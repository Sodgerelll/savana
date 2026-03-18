import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShoppingBag, Search, User, Menu, X } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import {
  getActiveSiteNavigation,
  getPageBannerNavigationItem,
  getRenderableSettings,
  getSiteNavigationPath,
} from "../lib/storefrontHelpers";
import logoBlack from "../assets/logoBlack.png";
import logoWhite from "../assets/logoWhite.png";
import "./Header.css";

export default function Header() {
  const { pathname } = useLocation();
  const { totalItems, setIsCartOpen } = useCart();
  const { language, setLanguage, t } = useLanguage();
  const { settings } = useStorefront();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const visibleSettings = getRenderableSettings(settings);
  const navigationItems = getActiveSiteNavigation(visibleSettings.navigationItems);
  const primaryLinks = navigationItems.filter((item) => item.group === "left");
  const secondaryLinks = navigationItems.filter((item) => item.group === "right");
  const pageBanner = getPageBannerNavigationItem(visibleSettings.navigationItems, pathname);
  const useTransparentHeader =
    pathname === "/" || Boolean(pageBanner?.pageBannerImage.trim());
  const nextLanguage = language === "EN" ? "MN" : "EN";
  const nextLanguageLabel = nextLanguage === "EN" ? "English" : "Монгол";
  const headerClasses = [
    "site-header-wrap",
    scrolled ? "scrolled" : "",
    useTransparentHeader && !scrolled ? "home-transparent" : "",
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
                  aria-label={`Switch language to ${nextLanguageLabel}`}
                >
                  {nextLanguage}
                </button>
              </div>

              <div className="header-menu-group header-menu-group-left">
                {primaryLinks.map((link) => (
                  <Link key={link.id} to={getSiteNavigationPath(link.id)} className="nav-link">
                    {language === "MN" ? link.labelMn : link.labelEn}
                  </Link>
                ))}
              </div>
            </div>

            <Link to="/" className="site-logo" aria-label="SAVANA">
              <img src={logoBlack} alt="SAVANA" className="site-logo-img site-logo-default" />
              <img src={logoWhite} alt="" aria-hidden="true" className="site-logo-img site-logo-white" />
            </Link>

            <div className="h-right">
              <div className="header-menu-group header-menu-group-right">
                {secondaryLinks.map((link) => (
                  <Link key={link.id} to={getSiteNavigationPath(link.id)} className="nav-link">
                    {language === "MN" ? link.labelMn : link.labelEn}
                  </Link>
                ))}
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
          {primaryLinks.map((link) => (
            <Link
              key={link.id}
              to={getSiteNavigationPath(link.id)}
              className="mobile-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              {language === "MN" ? link.labelMn : link.labelEn}
            </Link>
          ))}
          <div className="mobile-divider" />
          {secondaryLinks.map((link) => (
            <Link
              key={link.id}
              to={getSiteNavigationPath(link.id)}
              className="mobile-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              {language === "MN" ? link.labelMn : link.labelEn}
            </Link>
          ))}
          <div className="mobile-divider" />
          <div className="mobile-lang">
            <button
              className="mobile-lang-btn"
              onClick={() => {
                setLanguage(nextLanguage);
                setMobileMenuOpen(false);
              }}
            >
              {nextLanguage}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
