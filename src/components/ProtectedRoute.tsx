import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <div className="section">
        <div className="container" style={{ textAlign: "center" }}>
          <p>{t.authLoading}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
