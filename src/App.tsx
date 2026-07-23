import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom";
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
import { getPageBannerNavigationItem, getRenderableSettings } from "./lib/storefrontHelpers";

const Home = lazy(() => import("./pages/Home"));
const Collections = lazy(() => import("./pages/Collections"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Journal = lazy(() => import("./pages/Journal"));
const Login = lazy(() => import("./pages/Login"));
const Account = lazy(() => import("./pages/Account"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Partnerships = lazy(() => import("./pages/Partnerships"));
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
        <Suspense fallback={<div className="app-route-loading" aria-live="polite" />}>
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
                  <CustomerListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/customers/:id"
              element={
                <ProtectedRoute>
                  <CustomerProfilePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
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
