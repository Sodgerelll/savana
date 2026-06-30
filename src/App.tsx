import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { CartProvider } from "./context/CartContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { StorefrontProvider } from "./context/StorefrontContext";
import { LanguageProvider } from "./context/LanguageContext";
import { useStorefront } from "./context/StorefrontContext";
import "./App.css";
import ProtectedRoute from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import CustomCursor from "./components/CustomCursor";
import SoapBubbles from "./components/SoapBubbles";
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

const CustomerListPage = lazy(() => import("./pages/admin/CustomerListPage"));
const CustomerProfilePage = lazy(() => import("./pages/admin/CustomerProfilePage"));

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
  const { user, isPrivilegedUser } = useAuth();
  const isAdminPath = pathname.startsWith("/account") || pathname.startsWith("/admin");
  const hideHeader = isAdminPath && isPrivilegedUser;
  const hideFooter = (isAdminPath && isPrivilegedUser) || pathname === "/checkout";
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
      {!(isAdminPath && user) && <CustomCursor />}
      <SoapBubbles />
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
          <Route
            path="/account/:section"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <ProtectedRoute>
                <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div>}>
                  <CustomerListPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/customers/:id"
            element={
              <ProtectedRoute>
                <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div>}>
                  <CustomerProfilePage />
                </Suspense>
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
    <ErrorBoundary>
      <Router>
        <LanguageProvider>
          <AuthProvider>
            <StorefrontProvider>
              <CartProvider>
                <ErrorBoundary>
                  <AppShell />
                </ErrorBoundary>
              </CartProvider>
            </StorefrontProvider>
          </AuthProvider>
        </LanguageProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
