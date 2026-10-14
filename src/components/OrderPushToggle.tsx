import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import {
  disablePush,
  enablePush,
  getPushState,
  isInstalledApp,
  syncPushRegistration,
  type PushState,
} from "../lib/pushNotifications";

/**
 * Lets an admin choose whether this device is told when an order comes in. Sits in the
 * admin sidebar, so the choice is per device — the phone with the installed PWA, typically.
 */
export default function OrderPushToggle() {
  const { language } = useLanguage();
  const mn = language === "MN";
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPushState().then((next) => {
      if (cancelled) return;
      setState(next);
      if (next === "on") {
        void syncPushRegistration().catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setState(state === "on" ? await disablePush() : await enablePush());
    } catch (err) {
      setError(err instanceof Error ? err.message : mn ? "Алдаа гарлаа." : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [state, mn]);

  if (state === null) return null;

  const hint =
    state === "unsupported"
      ? isInstalledApp()
        ? mn
          ? "Энэ төхөөрөмж push мэдэгдэл дэмжихгүй байна."
          : "This device does not support push notifications."
        : mn
          ? "Push мэдэгдэл авахын тулд аппыг нүүр дэлгэцэндээ нэмж (Add to Home Screen), тэндээс нээнэ үү."
          : "To get push notifications, add the app to your Home Screen and open it from there."
      : state === "denied"
        ? mn
          ? "Мэдэгдэл хориглогдсон байна. Төхөөрөмжийн тохиргооноос SAVANA-д зөвшөөрнө үү."
          : "Notifications are blocked. Allow them for SAVANA in your device settings."
        : state === "on"
          ? mn
            ? "Шинэ захиалга, төлбөр төлөгдөхөд энэ төхөөрөмжид мэдэгдэнэ."
            : "This device is notified of new orders and payments."
          : mn
            ? "Шинэ захиалга ирэхэд утсандаа мэдэгдэл аваарай."
            : "Get a notification on this device when an order comes in.";

  const canToggle = state === "on" || state === "off";

  return (
    <div className="admin-push-toggle">
      <button
        type="button"
        className="btn btn-outline admin-logout-btn"
        onClick={() => void toggle()}
        disabled={busy || !canToggle}
      >
        {state === "on" ? <BellOff size={16} /> : <Bell size={16} />}
        {state === "on"
          ? mn
            ? "Захиалгын мэдэгдлийг унтраах"
            : "Turn off order alerts"
          : mn
            ? "Захиалгын мэдэгдэл асаах"
            : "Turn on order alerts"}
      </button>
      <small className="admin-push-hint">{error ?? hint}</small>
    </div>
  );
}
