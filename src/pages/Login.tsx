import { ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage, type Language } from "../context/LanguageContext";
import "./Auth.css";

type AuthMode = "login" | "register";

function getAuthErrorMessage(code: string | undefined, language: Language) {
  const messages = {
    EN: {
      "auth/email-already-in-use": "This email is already registered.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/missing-password": "Please enter your password.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please wait and try again.",
      generic: "Authentication failed. Please try again.",
      passwordMismatch: "Passwords do not match.",
    },
    MN: {
      "auth/email-already-in-use": "Энэ и-мэйл хаяг аль хэдийн бүртгэлтэй байна.",
      "auth/invalid-credential": "И-мэйл эсвэл нууц үг буруу байна.",
      "auth/invalid-email": "Зөв и-мэйл хаяг оруулна уу.",
      "auth/missing-password": "Нууц үгээ оруулна уу.",
      "auth/weak-password": "Нууц үг хамгийн багадаа 6 тэмдэгттэй байх ёстой.",
      "auth/too-many-requests": "Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу.",
      generic: "Нэвтрэх үйлдэл амжилтгүй боллоо. Дахин оролдоно уу.",
      passwordMismatch: "Нууц үгүүд таарахгүй байна.",
    },
  };

  return messages[language][code as keyof (typeof messages)[Language]] ?? messages[language].generic;
}

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath =
    ((location.state as { from?: string } | null)?.from && (location.state as { from?: string }).from) ||
    "/account";

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      navigate(redirectPath, { replace: true });
    }
  }, [loading, navigate, redirectPath, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (mode === "register" && password !== confirmPassword) {
      setError(getAuthErrorMessage("passwordMismatch", language));
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }

      navigate(redirectPath, { replace: true });
    } catch (authError) {
      const code =
        typeof authError === "object" &&
        authError !== null &&
        "code" in authError &&
        typeof authError.code === "string"
          ? authError.code
          : undefined;

      setError(getAuthErrorMessage(code, language));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-visual">
          <span className="auth-kicker">Savana Access</span>
          <h1>{t.loginHeading}</h1>
          <p>{t.loginSubtext}</p>
          <div className="auth-benefits">
            <div className="auth-benefit">
              <ShieldCheck size={18} />
              <span>{language === "MN" ? "Firebase Auth-аар хамгаалагдсан нэвтрэлт" : "Secure email authentication with Firebase"}</span>
            </div>
            <div className="auth-benefit">
              <ShoppingBag size={18} />
              <span>{language === "MN" ? "Сагс болон захиалгын дараагийн алхамд бэлэн болно" : "Continue from cart to account-ready checkout flow"}</span>
            </div>
            <div className="auth-benefit">
              <Sparkles size={18} />
              <span>{language === "MN" ? "Нэг бүртгэлээр бүх төхөөрөмжөөс нэвтрэх боломжтой" : "Use the same account across sessions and devices"}</span>
            </div>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <h2>{mode === "login" ? t.signIn : t.createAccount}</h2>
            <p>{t.accountSubtext}</p>

            <div className="auth-toggle">
              <button
                type="button"
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                {t.signIn}
              </button>
              <button
                type="button"
                className={mode === "register" ? "active" : ""}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                {t.createAccount}
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="email">{t.email}</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">{t.password}</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={t.passwordPlaceholder}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {mode === "register" && (
                <div className="auth-field">
                  <label htmlFor="confirm-password">{t.confirmPassword}</label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t.confirmPasswordPlaceholder}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>
              )}

              {error && <div className="auth-error">{error}</div>}

              <button type="submit" className="btn btn-primary" disabled={submitting || loading}>
                {submitting ? t.authLoading : mode === "login" ? t.signIn : t.createAccount}
              </button>
            </form>

            <div className="auth-switch">
              {mode === "login" ? t.noAccount : t.haveAccount}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {mode === "login" ? t.createAccount : t.signIn}
              </button>
            </div>

            <div className="auth-switch">
              <Link to="/collections">{t.continueShopping}</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
