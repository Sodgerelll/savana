import { ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage, type Language } from "../context/LanguageContext";
import "./Auth.css";

type AuthMode = "login" | "register";
type PhoneAccessMode = "code" | "password";

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
    signIn,
    signUp,
    signInWithGoogle,
    signInWithFacebook,
    signInAsGuest,
    signInWithPhonePassword,
    requestPhoneCode,
    confirmPhoneCode,
    resetPhoneSignIn,
    logout,
  } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const locationState = location.state as { from?: string } | null;
  const redirectPath = locationState?.from ?? "/account";

  const [mode, setMode] = useState<AuthMode>("login");
  const [phoneAccessMode, setPhoneAccessMode] = useState<PhoneAccessMode>("code");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phonePassword, setPhonePassword] = useState("");
  const [confirmPhonePassword, setConfirmPhonePassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!loading && user && !user.isAnonymous) {
      navigate(redirectPath, { replace: true });
    }
  }, [loading, navigate, redirectPath, user]);

  const isBusy = pendingAction !== null || loading;
  const isGuestSession = Boolean(user?.isAnonymous);
  const showPhonePasswordLogin = mode === "login" && phoneAccessMode === "password";
  const phoneMethodLabel =
    language === "MN"
      ? {
          code: "SMS код",
          password: "Нууц үг",
          loginHelp: "Утасны дугаараар код эсвэл нууц үгээр нэвтэрнэ.",
          registerHelp: "Утасны дугаараа баталгаажуулаад нууц үгтэй бүртгэл үүсгэнэ.",
          typeLabel: "Бүртгэлийн төрөл",
        }
      : {
          code: "SMS Code",
          password: "Password",
          loginHelp: "Sign in with your phone number using an SMS code or password.",
          registerHelp: "Verify your phone number and create a password-protected account.",
          typeLabel: "Registration Type",
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
    setNotice("");

    try {
      await callback();
    } catch (authError) {
      handleAuthFailure(authError);
    } finally {
      setPendingAction(null);
    }
  };

  const resetPhoneFlow = (options: { clearPassword?: boolean } = {}) => {
    resetPhoneSignIn();
    setPhoneCodeSent(false);
    setVerificationCode("");

    if (options.clearPassword) {
      setPhonePassword("");
      setConfirmPhonePassword("");
    }
  };

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPhoneAccessMode("code");
    resetPhoneFlow();
    setError("");
    setNotice("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === "register" && password !== confirmPassword) {
      setError(getAuthErrorMessage("passwordMismatch", language));
      return;
    }

    await runAuthAction("email", async () => {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }

      navigate(redirectPath, { replace: true });
    });
  };

  const validatePhoneRegistrationPassword = () => {
    if (!phonePassword.trim()) {
      setError(getAuthErrorMessage("phonePasswordRequired", language));
      return false;
    }

    if (phonePassword !== confirmPhonePassword) {
      setError(getAuthErrorMessage("passwordMismatch", language));
      return false;
    }

    return true;
  };

  const handlePhonePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await runAuthAction("phone-password", async () => {
      await signInWithPhonePassword(phoneNumber.trim(), phonePassword);
      navigate(redirectPath, { replace: true });
    });
  };

  const handlePhoneCodeFlow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!phoneNumber.trim()) {
      setError(getAuthErrorMessage("auth/missing-phone-number", language));
      return;
    }

    if (mode === "register" && !phoneCodeSent && !validatePhoneRegistrationPassword()) {
      return;
    }

    await runAuthAction(phoneCodeSent ? "phone-verify" : "phone-code", async () => {
      if (phoneCodeSent) {
        await confirmPhoneCode(
          verificationCode.trim(),
          mode === "register" ? { registrationPassword: phonePassword } : undefined,
        );
        navigate(redirectPath, { replace: true });
        return;
      }

      if (!recaptchaContainerRef.current) {
        throw new Error("reCAPTCHA container is not ready.");
      }

      await requestPhoneCode(phoneNumber.trim(), recaptchaContainerRef.current);
      setPhoneCodeSent(true);
      setVerificationCode("");
      setNotice(`${t.phoneCodeSent} ${t.phoneCodeSentHelp}`);
    });
  };

  const handleResendCode = async () => {
    if (mode === "register" && !validatePhoneRegistrationPassword()) {
      return;
    }

    await runAuthAction("phone-resend", async () => {
      resetPhoneFlow();

      if (!recaptchaContainerRef.current) {
        throw new Error("reCAPTCHA container is not ready.");
      }

      await requestPhoneCode(phoneNumber.trim(), recaptchaContainerRef.current);
      setPhoneCodeSent(true);
      setNotice(`${t.phoneCodeSent} ${t.phoneCodeSentHelp}`);
    });
  };

  const handleGuestSignIn = async () => {
    await runAuthAction("guest", async () => {
      resetPhoneFlow();
      await signInAsGuest();
      navigate("/collections", { replace: true });
    });
  };

  const handleGuestLogout = async () => {
    await runAuthAction("logout", async () => {
      resetPhoneFlow({ clearPassword: true });
      await logout();
      setNotice("");
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
                  ? "Утас, Gmail, Facebook, и-мэйл бүртгэл бүгд нэг нэвтрэх дэлгэцэнд"
                  : "Phone, Gmail, Facebook, and email flows are available from one screen"}
              </span>
            </div>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
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

            {notice && <div className="auth-notice">{notice}</div>}
            {error && <div className="auth-error">{error}</div>}

            <div className="auth-provider-grid">
              <button
                type="button"
                className="auth-provider-btn"
                onClick={() =>
                  void runAuthAction("google", async () => {
                    resetPhoneFlow();
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

              <button
                type="button"
                className="auth-provider-btn"
                onClick={() =>
                  void runAuthAction("facebook", async () => {
                    resetPhoneFlow();
                    await signInWithFacebook();
                    navigate(redirectPath, { replace: true });
                  })
                }
                disabled={isBusy}
              >
                <span className="auth-provider-badge">f</span>
                <span className="auth-provider-copy">
                  <strong>{t.signInWithFacebook}</strong>
                  <small>{providerActionLabel}</small>
                </span>
              </button>

              <button
                type="button"
                className="auth-provider-btn auth-provider-btn-guest"
                onClick={handleGuestSignIn}
                disabled={isBusy}
              >
                <span className="auth-provider-badge">+</span>
                <span className="auth-provider-copy">
                  <strong>{pendingAction === "guest" ? t.authLoading : t.continueAsGuest}</strong>
                  <small>{language === "MN" ? "түр сешн эхлүүлнэ" : "starts a temporary session"}</small>
                </span>
              </button>
            </div>

            <div className="auth-divider">
              <span>{t.orContinueWith}</span>
            </div>

            <div className="auth-toggle">
              <button type="button" className={mode === "login" ? "active" : ""} onClick={() => handleModeChange("login")}>
                {t.signIn}
              </button>
              <button
                type="button"
                className={mode === "register" ? "active" : ""}
                onClick={() => handleModeChange("register")}
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

              <button type="submit" className="btn btn-primary" disabled={isBusy}>
                {pendingAction === "email" ? t.authLoading : mode === "login" ? t.signIn : t.createAccount}
              </button>
            </form>

            <div className="auth-switch">
              {mode === "login" ? t.noAccount : t.haveAccount}
              <button type="button" onClick={() => handleModeChange(mode === "login" ? "register" : "login")}>
                {mode === "login" ? t.createAccount : t.signIn}
              </button>
            </div>

            <div className="auth-divider">
              <span>{t.orContinueWithPhone}</span>
            </div>

            <div className="auth-phone-intro">
              <p>{mode === "register" ? phoneMethodLabel.registerHelp : phoneMethodLabel.loginHelp}</p>

              {mode === "login" && (
                <div className="auth-toggle auth-toggle-compact">
                  <button
                    type="button"
                    className={phoneAccessMode === "code" ? "active" : ""}
                    onClick={() => {
                      setPhoneAccessMode("code");
                      resetPhoneFlow();
                      setError("");
                      setNotice("");
                    }}
                  >
                    {phoneMethodLabel.code}
                  </button>
                  <button
                    type="button"
                    className={phoneAccessMode === "password" ? "active" : ""}
                    onClick={() => {
                      setPhoneAccessMode("password");
                      resetPhoneFlow();
                      setError("");
                      setNotice("");
                    }}
                  >
                    {phoneMethodLabel.password}
                  </button>
                </div>
              )}
            </div>

            {showPhonePasswordLogin ? (
              <form className="auth-form auth-phone-form" onSubmit={handlePhonePasswordLogin}>
                <div className="auth-field">
                  <label htmlFor="phone-password-login">{t.phoneNumber}</label>
                  <input
                    id="phone-password-login"
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
                    autoComplete="current-password"
                    placeholder={t.passwordPlaceholder}
                    value={phonePassword}
                    onChange={(event) => setPhonePassword(event.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={isBusy}>
                  {pendingAction === "phone-password" ? t.authLoading : t.signIn}
                </button>
              </form>
            ) : (
              <form className="auth-form auth-phone-form" onSubmit={handlePhoneCodeFlow}>
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
                    disabled={phoneCodeSent}
                    required
                  />
                </div>

                {mode === "register" && (
                  <>
                    <div className="auth-field">
                      <label htmlFor="register-phone-password">{t.password}</label>
                      <input
                        id="register-phone-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder={t.passwordPlaceholder}
                        value={phonePassword}
                        onChange={(event) => setPhonePassword(event.target.value)}
                        disabled={phoneCodeSent}
                        required
                      />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="register-phone-password-confirm">{t.confirmPassword}</label>
                      <input
                        id="register-phone-password-confirm"
                        type="password"
                        autoComplete="new-password"
                        placeholder={t.confirmPasswordPlaceholder}
                        value={confirmPhonePassword}
                        onChange={(event) => setConfirmPhonePassword(event.target.value)}
                        disabled={phoneCodeSent}
                        required
                      />
                    </div>
                  </>
                )}

                {phoneCodeSent && (
                  <div className="auth-field">
                    <label htmlFor="verification-code">{t.verificationCode}</label>
                    <input
                      id="verification-code"
                      type="text"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder={t.verificationCodePlaceholder}
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="auth-inline-actions">
                  <button type="submit" className="btn btn-primary" disabled={isBusy}>
                    {pendingAction === "phone-code" || pendingAction === "phone-verify" || pendingAction === "phone-resend"
                      ? t.authLoading
                      : phoneCodeSent
                        ? mode === "register"
                          ? t.createAccount
                          : t.verifyCode
                        : t.sendVerificationCode}
                  </button>

                  {phoneCodeSent && (
                    <>
                      <button type="button" className="btn btn-outline" onClick={handleResendCode} disabled={isBusy}>
                        {t.resendCode}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          resetPhoneFlow();
                          setError("");
                          setNotice("");
                        }}
                        disabled={isBusy}
                      >
                        {t.useDifferentPhone}
                      </button>
                    </>
                  )}
                </div>

                <div ref={recaptchaContainerRef} className="auth-recaptcha" />
              </form>
            )}

            <div className="auth-switch">
              <Link to="/collections">{t.continueShopping}</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
