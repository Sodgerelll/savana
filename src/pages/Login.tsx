import { ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage, type Language } from "../context/LanguageContext";
import "./Auth.css";

type AuthMode = "login" | "register";
type CredentialTab = "google" | "phone" | "guest";

function getAuthErrorMessage(code: string | undefined, language: Language) {
  const messages = {
    EN: {
      "auth/email-already-in-use": "This email is already registered.",
      "auth/invalid-credential": "The credentials are incorrect.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/missing-password": "Please enter your password.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please wait and try again.",
      "auth/account-exists-with-different-credential": "This email is already linked to another sign-in method.",
      "auth/cancelled-popup-request": "Another sign-in window was already opened. Please try again.",
      "auth/code-expired": "The verification code has expired. Request a new code.",
      "auth/captcha-check-failed": "reCAPTCHA validation failed. Please try again.",
      "auth/invalid-phone-number": "Enter a valid phone number in international format.",
      "auth/invalid-verification-code": "The verification code is invalid.",
      "auth/missing-phone-number": "Please enter your phone number.",
      "auth/missing-verification-id": "Request a verification code first.",
      "auth/network-request-failed": "Network error. Check your connection and try again.",
      "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase yet.",
      "auth/phone-already-in-use": "This phone number is already registered.",
      "auth/phone-password-not-enabled": "This phone number does not have password login enabled.",
      "auth/popup-blocked": "The popup was blocked by the browser.",
      "auth/popup-closed-by-user": "The sign-in window was closed before completion.",
      "auth/quota-exceeded": "SMS quota exceeded. Try again later.",
      "auth/unauthorized-domain": "This domain is not authorized for Firebase sign-in.",
      generic: "Authentication failed. Please try again.",
      passwordMismatch: "Passwords do not match.",
      phonePasswordRequired: "Enter a password for this phone account.",
    },
    MN: {
      "auth/email-already-in-use": "Энэ и-мэйл хаяг аль хэдийн бүртгэлтэй байна.",
      "auth/invalid-credential": "Нэвтрэх мэдээлэл буруу байна.",
      "auth/invalid-email": "Зөв и-мэйл хаяг оруулна уу.",
      "auth/missing-password": "Нууц үгээ оруулна уу.",
      "auth/weak-password": "Нууц үг хамгийн багадаа 6 тэмдэгттэй байх ёстой.",
      "auth/too-many-requests": "Хэт олон оролдлого хийлээ. Түр хүлээгээд дахин оролдоно уу.",
      "auth/account-exists-with-different-credential": "Энэ и-мэйл өөр нэвтрэх аргатай холбогдсон байна.",
      "auth/cancelled-popup-request": "Өмнөх нэвтрэх цонх нээлттэй байна. Дахин оролдоно уу.",
      "auth/code-expired": "Баталгаажуулах кодын хугацаа дууссан байна. Шинэ код авна уу.",
      "auth/captcha-check-failed": "reCAPTCHA шалгалт амжилтгүй боллоо. Дахин оролдоно уу.",
      "auth/invalid-phone-number": "Утасны дугаараа олон улсын форматаар зөв оруулна уу.",
      "auth/invalid-verification-code": "Баталгаажуулах код буруу байна.",
      "auth/missing-phone-number": "Утасны дугаараа оруулна уу.",
      "auth/missing-verification-id": "Эхлээд баталгаажуулах код хүснэ үү.",
      "auth/network-request-failed": "Сүлжээний алдаа гарлаа. Холболтоо шалгаад дахин оролдоно уу.",
      "auth/operation-not-allowed": "Энэ нэвтрэх арга Firebase дээр хараахан идэвхжээгүй байна.",
      "auth/phone-already-in-use": "Энэ утасны дугаар аль хэдийн бүртгэлтэй байна.",
      "auth/phone-password-not-enabled": "Энэ утасны дугаарт password нэвтрэлт тохируулагдаагүй байна.",
      "auth/popup-blocked": "Хөтөч popup цонхыг блоклосон байна.",
      "auth/popup-closed-by-user": "Нэвтрэх цонх дуусахаас өмнө хаагдлаа.",
      "auth/quota-exceeded": "SMS квот дууссан байна. Дараа дахин оролдоно уу.",
      "auth/unauthorized-domain": "Энэ домэйн Firebase нэвтрэлтэд зөвшөөрөгдөөгүй байна.",
      generic: "Нэвтрэх үйлдэл амжилтгүй боллоо. Дахин оролдоно уу.",
      passwordMismatch: "Нууц үгүүд таарахгүй байна.",
      phonePasswordRequired: "Энэ утасны бүртгэлд нууц үг оруулна уу.",
    },
  };

  return messages[language][code as keyof (typeof messages)[Language]] ?? messages[language].generic;
}

function getAuthMethodLabel(method: string, language: Language) {
  const dictionary = {
    EN: {
      email: "Email",
      google: "Google",
      facebook: "Facebook",
      phone: "Phone",
      guest: "Guest",
      unknown: "Unknown",
    },
    MN: {
      email: "И-мэйл",
      google: "Google",
      facebook: "Facebook",
      phone: "Утас",
      guest: "Зочин",
      unknown: "Тодорхойгүй",
    },
  };

  return dictionary[language][method as keyof (typeof dictionary)[Language]] ?? dictionary[language].unknown;
}

export default function Login() {
  const {
    user,
    profile,
    loading,
    signInWithGoogle,
    signInAsGuest,
    signInWithPhonePassword,
    signUpWithPhonePassword,
    logout,
  } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: string } | null;
  const redirectPath = locationState?.from ?? "/account";

  const [mode, setMode] = useState<AuthMode>("login");
  const [credentialTab, setCredentialTab] = useState<CredentialTab>("google");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [confirmPhonePassword, setConfirmPhonePassword] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user && !user.isAnonymous) {
      navigate(redirectPath, { replace: true });
    }
  }, [loading, navigate, redirectPath, user]);

  const isBusy = pendingAction !== null || loading;
  const isGuestSession = Boolean(user?.isAnonymous);
  const phoneMethodLabel =
    language === "MN"
      ? {
          loginHelp: "Утасны дугаар, нууц үгээр нэвтэрнэ.",
          registerHelp: "Утасны дугаар, нууц үгээр бүртгэл үүсгэнэ.",
          typeLabel: "Бүртгэлийн төрөл",
          tabLabel: "Утас",
        }
      : {
          loginHelp: "Sign in using your phone number and password.",
          registerHelp: "Create an account using your phone number and password.",
          typeLabel: "Registration Type",
          tabLabel: "Phone",
        };
  const googleMethodLabel =
    language === "MN"
      ? {
          help: mode === "register" ? "Gmail-ээр шууд бүртгэл үүсгэнэ." : "Gmail-ээр байгаа бүртгэлдээ нэвтэрнэ.",
          tabLabel: "Gmail",
        }
      : {
          help: mode === "register" ? "Create an account directly with Gmail." : "Sign in with your existing Gmail account.",
          tabLabel: "Gmail",
        };
  const guestMethodLabel =
    language === "MN"
      ? {
          help: "Зочин сешнээр шууд үргэлжлүүлнэ.",
          tabLabel: "Зочин",
          subtext: "түр сешн эхлүүлнэ",
        }
      : {
          help: "Continue immediately with a guest session.",
          tabLabel: "Guest",
          subtext: "starts a temporary session",
        };

  const handleAuthFailure = (authError: unknown) => {
    const code =
      typeof authError === "object" &&
      authError !== null &&
      "code" in authError &&
      typeof authError.code === "string"
        ? authError.code
        : undefined;

    setError(getAuthErrorMessage(code, language));
  };

  const runAuthAction = async (action: string, callback: () => Promise<void>) => {
    setPendingAction(action);
    setError("");

    try {
      await callback();
    } catch (authError) {
      handleAuthFailure(authError);
    } finally {
      setPendingAction(null);
    }
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setCredentialTab((current) => {
      if (nextMode === "register") {
        return current === "phone" ? "phone" : "google";
      }

      return current;
    });
    setError("");
  };

  const validatePhoneCredentials = () => {
    if (!phoneNumber.trim()) {
      setError(getAuthErrorMessage("auth/missing-phone-number", language));
      return false;
    }

    if (!phonePassword.trim()) {
      setError(getAuthErrorMessage("phonePasswordRequired", language));
      return false;
    }

    if (mode === "register" && phonePassword !== confirmPhonePassword) {
      setError(getAuthErrorMessage("passwordMismatch", language));
      return false;
    }

    return true;
  };

  const handlePhoneSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validatePhoneCredentials()) {
      return;
    }

    await runAuthAction("phone", async () => {
      if (mode === "login") {
        await signInWithPhonePassword(phoneNumber.trim(), phonePassword);
      } else {
        await signUpWithPhonePassword(phoneNumber.trim(), phonePassword);
      }

      navigate(redirectPath, { replace: true });
    });
  };

  const handleGuestSignIn = async () => {
    await runAuthAction("guest", async () => {
      await signInAsGuest();
      navigate(redirectPath, { replace: true });
    });
  };

  const handleGuestLogout = async () => {
    await runAuthAction("logout", async () => {
      await logout();
    });
  };

  const providerActionLabel =
    mode === "register"
      ? language === "MN"
        ? "анхны бүртгэл дээр аккаунт үүсгэнэ"
        : "creates an account on first use"
      : language === "MN"
        ? "байгаа аккаунтаар нэвтэрнэ"
        : "uses your existing account";
  const availableMethods: CredentialTab[] = mode === "login" ? ["google", "phone", "guest"] : ["google", "phone"];
  const tabAriaLabel = language === "MN" ? "Нэвтрэх арга" : "Sign-in method";

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
              <span>
                {language === "MN"
                  ? "Firebase Auth-аар хамгаалагдсан олон сувгийн нэвтрэлт"
                  : "Secure multi-provider authentication powered by Firebase"}
              </span>
            </div>
            <div className="auth-benefit">
              <ShoppingBag size={18} />
              <span>
                {language === "MN"
                  ? "Сагсаа үргэлжлүүлэхийн тулд guest эсвэл бүрэн бүртгэлээр нэвтрэх боломжтой"
                  : "Use guest access or a full account to keep moving through the storefront"}
              </span>
            </div>
            <div className="auth-benefit">
              <Sparkles size={18} />
              <span>
                {language === "MN"
                  ? "Утас, Gmail, guest, и-мэйл бүртгэл бүгд нэг нэвтрэх дэлгэцэнд"
                  : "Phone, Gmail, guest, and email flows are available from one screen"}
              </span>
            </div>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <div className="auth-mode-tabs" role="tablist" aria-label={language === "MN" ? "Сешний горим" : "Session mode"}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={`auth-mode-tab ${mode === "login" ? "active" : ""}`}
                onClick={() => handleModeChange("login")}
              >
                {t.signIn}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={`auth-mode-tab ${mode === "register" ? "active" : ""}`}
                onClick={() => handleModeChange("register")}
              >
                {t.createAccount}
              </button>
            </div>

            <h2>{mode === "login" ? t.signIn : t.createAccount}</h2>
            <p>{t.accountSubtext}</p>

            {profile && !user?.isAnonymous && (
              <div className="auth-session-meta">
                <span>{phoneMethodLabel.typeLabel}</span>
                <strong>{getAuthMethodLabel(profile.registrationMethod, language)}</strong>
              </div>
            )}

            {isGuestSession && (
              <div className="auth-notice auth-guest-notice">
                <span>{t.guestSessionActive}</span>
                <button type="button" className="btn btn-outline" onClick={handleGuestLogout} disabled={isBusy}>
                  {pendingAction === "logout" ? t.authLoading : t.logout}
                </button>
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            <div className={`auth-method-tabs ${availableMethods.length === 3 ? "three-up" : ""}`} role="tablist" aria-label={tabAriaLabel}>
              {availableMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  role="tab"
                  aria-selected={credentialTab === method}
                  className={`auth-method-tab ${credentialTab === method ? "active" : ""}`}
                  onClick={() => setCredentialTab(method)}
                >
                  {method === "google"
                    ? googleMethodLabel.tabLabel
                    : method === "phone"
                      ? phoneMethodLabel.tabLabel
                      : guestMethodLabel.tabLabel}
                </button>
              ))}
            </div>

            <div className="auth-tab-panel">
              <div className="auth-phone-intro">
                <p>
                  {credentialTab === "google"
                    ? googleMethodLabel.help
                    : credentialTab === "guest"
                      ? guestMethodLabel.help
                      : mode === "register"
                        ? phoneMethodLabel.registerHelp
                        : phoneMethodLabel.loginHelp}
                </p>
              </div>

              {credentialTab === "google" ? (
                <div className="auth-provider-panel">
                  <button
                    type="button"
                    className="auth-provider-btn"
                    onClick={() =>
                      void runAuthAction("google", async () => {
                        await signInWithGoogle();
                        navigate(redirectPath, { replace: true });
                      })
                    }
                    disabled={isBusy}
                  >
                    <span className="auth-provider-badge">G</span>
                    <span className="auth-provider-copy">
                      <strong>{t.signInWithGoogle}</strong>
                      <small>{providerActionLabel}</small>
                    </span>
                  </button>
                </div>
              ) : credentialTab === "guest" ? (
                <div className="auth-provider-panel">
                  <button
                    type="button"
                    className="auth-provider-btn auth-provider-btn-guest"
                    onClick={handleGuestSignIn}
                    disabled={isBusy}
                  >
                    <span className="auth-provider-badge">+</span>
                    <span className="auth-provider-copy">
                      <strong>{pendingAction === "guest" ? t.authLoading : t.continueAsGuest}</strong>
                      <small>{guestMethodLabel.subtext}</small>
                    </span>
                  </button>
                </div>
              ) : (
                <form className="auth-form auth-phone-form" onSubmit={handlePhoneSubmit}>
                  <div className="auth-field">
                    <label htmlFor="phone-number">{t.phoneNumber}</label>
                    <input
                      id="phone-number"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      placeholder={t.phoneNumberPlaceholder}
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      required
                    />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="phone-password">{t.password}</label>
                    <input
                      id="phone-password"
                      type="password"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      placeholder={t.passwordPlaceholder}
                      value={phonePassword}
                      onChange={(event) => setPhonePassword(event.target.value)}
                      required
                    />
                  </div>

                  {mode === "register" && (
                    <div className="auth-field">
                      <label htmlFor="phone-password-confirm">{t.confirmPassword}</label>
                      <input
                        id="phone-password-confirm"
                        type="password"
                        autoComplete="new-password"
                        placeholder={t.confirmPasswordPlaceholder}
                        value={confirmPhonePassword}
                        onChange={(event) => setConfirmPhonePassword(event.target.value)}
                        required
                      />
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={isBusy}>
                    {pendingAction === "phone" ? t.authLoading : mode === "login" ? t.signIn : t.createAccount}
                  </button>
                </form>
              )}
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
