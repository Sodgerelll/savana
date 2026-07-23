import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isRecentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Shows an install invitation when the app is running in a plain browser tab:
 * - Chromium (Android/desktop): captures `beforeinstallprompt` and offers a
 *   one-tap install button.
 * - iOS Safari (no install API): shows the manual Share → "Add to Home Screen"
 *   steps.
 * Hidden when already installed (standalone display mode) or dismissed within
 * the last 7 days.
 */
export default function PwaInstallPrompt() {
  const { language } = useLanguage();
  const mn = language === "MN";
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (isStandalone() || isRecentlyDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt — show the manual steps banner after
    // a short delay so it doesn't compete with the initial page render.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      iosTimer = setTimeout(() => setVisible(true), 3000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer !== undefined) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage unavailable (private mode) — banner simply reappears next visit
    }
  };

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
    setInstallEvent(null);
  };

  if (!visible) return null;

  return (
    <div className="pwa-install-banner" role="dialog" aria-label={mn ? "Апп суулгах" : "Install app"}>
      <button type="button" className="pwa-install-close" onClick={dismiss} aria-label={mn ? "Хаах" : "Close"}>
        <X size={16} />
      </button>

      <div className="pwa-install-body">
        <div className="pwa-install-icon">
          <Download size={20} />
        </div>
        <div className="pwa-install-text">
          <strong>{mn ? "SAVANA аппыг суулгаарай" : "Install the SAVANA app"}</strong>
          <span>
            {mn
              ? "Нүүр дэлгэцээсээ шууд нээж, апп шиг ашиглаарай."
              : "Launch straight from your home screen, just like a native app."}
          </span>
        </div>
      </div>

      {installEvent ? (
        <button type="button" className="btn btn-primary pwa-install-btn" onClick={handleInstall}>
          <Download size={16} />
          {mn ? "Суулгах" : "Install"}
        </button>
      ) : showIosSteps ? (
        <ol className="pwa-install-steps">
          <li>
            <Share size={14} />
            {mn ? "Доод цэснээс Share товчийг дарна" : "Tap the Share button in the toolbar"}
          </li>
          <li>
            <SquarePlus size={14} />
            {mn ? "“Add to Home Screen” сонгоно" : "Choose “Add to Home Screen”"}
          </li>
          <li>{mn ? "“Add” дарж баталгаажуулна" : "Confirm with “Add”"}</li>
        </ol>
      ) : (
        <button type="button" className="btn btn-outline pwa-install-btn" onClick={() => setShowIosSteps(true)}>
          {mn ? "Хэрхэн суулгах вэ?" : "How do I install?"}
        </button>
      )}
    </div>
  );
}
