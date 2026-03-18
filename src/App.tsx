import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import { StorefrontProvider } from "./context/StorefrontContext";
import { LanguageProvider } from "./context/LanguageContext";
import { useStorefront } from "./context/StorefrontContext";
import "./App.css";
import ProtectedRoute from "./components/ProtectedRoute";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import Home from "./pages/Home";
import Collections from "./pages/Collections";
import ProductDetail from "./pages/ProductDetail";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Journal from "./pages/Journal";
import Login from "./pages/Login";
import Account from "./pages/Account";
import Checkout from "./pages/Checkout";
import Partnerships from "./pages/Partnerships";
import { getPageBannerNavigationItem, getRenderableSettings } from "./lib/storefrontHelpers";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppShell() {
  const { pathname } = useLocation();
  const { settings } = useStorefront();
  const hideHeader = pathname === "/account";
  const hideFooter = pathname === "/account" || pathname === "/checkout";
  const visibleSettings = getRenderableSettings(settings);
  const pageBanner = getPageBannerNavigationItem(visibleSettings.navigationItems, pathname);
  const hasHeroHeaderOffset = pathname === "/" || Boolean(pageBanner?.pageBannerImage.trim());
  const mainClasses = [
    "app-main",
    hideHeader ? "no-header" : "",
    !hideHeader && hasHeroHeaderOffset ? "home-header-offset" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <ScrollToTop />
      {!hideHeader && <Header />}
      <main className={mainClasses}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:slug" element={<Collections />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/partnerships" element={<Partnerships />} />
          <Route path="/find-us" element={<Navigate to="/contact" replace />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/login" element={<Login />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      {!hideFooter && <Footer />}
      <CartDrawer />
    </>
  );
}

function App() {
  return (
    <Router>
      <LanguageProvider>
        <AuthProvider>
          <StorefrontProvider>
            <CartProvider>
              <AppShell />
            </CartProvider>
          </StorefrontProvider>
        </AuthProvider>
      </LanguageProvider>
    </Router>
  );
}

export default App;
