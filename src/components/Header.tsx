import { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Search, User, Menu, X } from "lucide-react";
import { useCart } from "../context/CartContext";
import "./Header.css";

export default function Header() {
  const { totalItems, setIsCartOpen } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <div className="announcement-bar">
        Free shipping on orders over $85 CAD
      </div>
      <header className="header">
        <div className="header-inner container">
          <button
            className="header-icon mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <nav className={`main-nav ${mobileMenuOpen ? "open" : ""}`}>
            <Link to="/collections" onClick={() => setMobileMenuOpen(false)}>Shop</Link>
            <Link to="/collections/bar-soaps" onClick={() => setMobileMenuOpen(false)}>Bar Soaps</Link>
            <Link to="/collections/body-butters" onClick={() => setMobileMenuOpen(false)}>Body Care</Link>
            <Link to="/collections/hair-care" onClick={() => setMobileMenuOpen(false)}>Hair Care</Link>
            <Link to="/about" onClick={() => setMobileMenuOpen(false)}>About</Link>
          </nav>

          <Link to="/" className="logo">
            <h1>Prairie Soap Shack</h1>
          </Link>

          <div className="header-actions">
            <button
              className="header-icon"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Search"
            >
              <Search size={20} />
            </button>
            <Link to="/account" className="header-icon" aria-label="Account">
              <User size={20} />
            </Link>
            <button
              className="header-icon cart-btn"
              onClick={() => setIsCartOpen(true)}
              aria-label="Cart"
            >
              <ShoppingBag size={20} />
              {totalItems > 0 && <span className="cart-count">{totalItems}</span>}
            </button>
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-container container">
            <input
              type="text"
              placeholder="Search our store..."
              className="search-input"
              autoFocus
            />
            <button className="search-close" onClick={() => setSearchOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}
    </>
  );
}
