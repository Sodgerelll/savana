import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShoppingBag, Search, User, Menu, X, Package } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import {
  getActiveSiteNavigation,
  getActiveProducts,
  getPageBannerNavigationItem,
  getProductPrimaryImage,
  formatStorePrice,
  getRenderableSettings,
  getSiteNavigationPath,
} from "../lib/storefrontHelpers";
import { searchOrderByNumber, type OrderRecord, type OrderStatus } from "../lib/orders";
import type { Product } from "../data/products";
import logoBlack from "../assets/logoBlack.png";
import logoWhite from "../assets/logoWhite.png";
import "./Header.css";

const ORDER_STATUS_LABELS: Record<OrderStatus, { mn: string; en: string; color: string }> = {
  new:        { mn: "Шинэ захиалга",        en: "New order",    color: "#6b7280" },
  paid:       { mn: "Төлбөр хийгдсэн",      en: "Paid",         color: "#16a34a" },
  delivering: { mn: "Хүргэлтэнд гарсан",    en: "Delivering",   color: "#d97706" },
  delivered:  { mn: "Хүргэгдсэн",           en: "Delivered",    color: "#2563eb" },
};

export default function Header() {
  const { pathname } = useLocation();
  const { totalItems, setIsCartOpen } = useCart();
  const { language, setLanguage, t } = useLanguage();
  const { settings, products, collections } = useStorefront();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [orderResult, setOrderResult] = useState<OrderRecord | "not-found" | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  const activeProducts = getActiveProducts(products, collections);
  const isOrderQuery = /^ORD-/i.test(searchQuery.trim());
  const isPriceQuery = /^\d[\d,. ]*$/.test(searchQuery.trim()) && searchQuery.trim().length >= 3;

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setProductResults([]);
      setOrderResult(null);
      return;
    }

    if (isOrderQuery) {
      setProductResults([]);
      const timer = setTimeout(async () => {
        setOrderLoading(true);
        try {
          const result = await searchOrderByNumber(q);
          setOrderResult(result ?? "not-found");
        } catch {
          setOrderResult("not-found");
        } finally {
          setOrderLoading(false);
        }
      }, 450);
      return () => clearTimeout(timer);
    }

    if (isPriceQuery) {
      const target = Number(q.replace(/[,. ]/g, ""));
      const filtered = activeProducts
        .filter((p) => {
          const base = p.variants?.length
            ? Math.min(...p.variants.map((v) => v.price))
            : p.price;
          return base >= target * 0.9 && base <= target * 1.1;
        })
        .slice(0, 6);
      setProductResults(filtered);
      setOrderResult(null);
      return;
    }

    const filtered = activeProducts
      .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 6);
    setProductResults(filtered);
    setOrderResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setProductResults([]);
    setOrderResult(null);
    setOrderLoading(false);
  }

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
        <div className="search-overlay" onClick={closeSearch}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="search-inner">
              <Search size={18} className="search-icon-left" />
              <input
                autoFocus
                type="text"
                placeholder={t.searchPlaceholder}
                className="search-field"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="icon-btn" onClick={closeSearch}>
                <X size={20} />
              </button>
            </div>

            {searchQuery.trim() && (
              <div className="search-results">
                {/* Order search */}
                {isOrderQuery && (
                  <>
                    {orderLoading && (
                      <div className="search-empty">
                        {language === "MN" ? "Хайж байна..." : "Searching..."}
                      </div>
                    )}
                    {!orderLoading && orderResult === "not-found" && (
                      <div className="search-empty">
                        {language === "MN" ? "Захиалга олдсонгүй" : "Order not found"}
                      </div>
                    )}
                    {!orderLoading && orderResult && orderResult !== "not-found" && (
                      <div className="search-order-card">
                        <div className="search-order-head">
                          <div className="search-order-meta">
                            <Package size={16} />
                            <strong>{orderResult.orderNumber}</strong>
                          </div>
                          <span
                            className="search-order-status"
                            style={{ color: ORDER_STATUS_LABELS[orderResult.status].color }}
                          >
                            {language === "MN"
                              ? ORDER_STATUS_LABELS[orderResult.status].mn
                              : ORDER_STATUS_LABELS[orderResult.status].en}
                          </span>
                        </div>
                        <div className="search-order-items">
                          {orderResult.items.map((item) => (
                            <div key={`${item.productId}-${item.variant}`} className="search-order-item">
                              {item.image && (
                                <img src={item.image} alt={item.name} className="search-order-item-img" />
                              )}
                              <span className="search-order-item-name">{item.name}</span>
                              {item.variant && (
                                <span className="search-order-item-variant">{item.variant}</span>
                              )}
                              <span className="search-order-item-qty">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Product search */}
                {!isOrderQuery && productResults.length > 0 && (
                  <div className="search-product-list">
                    {productResults.map((product) => {
                      const img = getProductPrimaryImage(product);
                      const price = product.variants?.length
                        ? Math.min(...product.variants.map((v) => v.price))
                        : product.price;
                      return (
                        <Link
                          key={product.id}
                          to={`/product/${product.id}`}
                          className="search-result-item"
                          onClick={closeSearch}
                        >
                          <div className="search-result-img-wrap">
                            {img
                              ? <img src={img} alt={product.name} className="search-result-img" />
                              : <div className="search-result-img-placeholder" />
                            }
                          </div>
                          <div className="search-result-info">
                            <span className="search-result-name">{product.name}</span>
                            <span className="search-result-price">{formatStorePrice(price)}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}

                {!isOrderQuery && productResults.length === 0 && searchQuery.trim().length > 1 && (
                  <div className="search-empty">
                    {language === "MN" ? "Бараа олдсонгүй" : "No products found"}
                  </div>
                )}
              </div>
            )}
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
