// Order push notifications, browser side.
//
// The server half is api/push/subscription.ts (who is subscribed) and
// api/_lib/pushNotify.ts (sending). The handlers that show the notification live in
// public/push-sw.js, pulled into the generated service worker.
//
// iOS only offers Push to a PWA that has been added to the Home Screen; in a plain Safari
// tab `PushManager` does not exist, which is what "unsupported" reports here.

import { auth } from "./firebase";

export type PushState = "unsupported" | "denied" | "off" | "on";

const ENDPOINT = "/api/push/subscription";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Running as an installed app rather than a browser tab. */
export function isInstalledApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("Нэвтрэх шаардлагатай.");
  }
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function send(method: "POST" | "DELETE", body: unknown): Promise<void> {
  const response = await fetch(ENDPOINT, { method, headers: await authHeaders(), body: JSON.stringify(body) });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
}

function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    return (await currentSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * Asks for permission, subscribes this device and registers it with the server. Must be
 * called from a click: browsers refuse a permission prompt that is not.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const keyResponse = await fetch(ENDPOINT);
  if (!keyResponse.ok) {
    throw new Error("Push мэдэгдэл серверт тохируулагдаагүй байна.");
  }
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(publicKey),
    }));

  try {
    await send("POST", { subscription: subscription.toJSON() });
  } catch (err) {
    // A subscription the server never heard of would look "on" and never ring.
    await subscription.unsubscribe().catch(() => undefined);
    throw err;
  }
  return "on";
}

/** Stops notifications on this device: unsubscribes the browser and tells the server. */
export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const subscription = await currentSubscription();
  if (subscription) {
    await send("DELETE", { endpoint: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  }
  return Notification.permission === "denied" ? "denied" : "off";
}

/**
 * Re-registers this device's existing subscription for whoever is signed in. Cheap and
 * idempotent, so the toggle runs it on every mount: it covers a subscription the browser
 * rotated, and a device that was forgotten at sign-out (see forgetPushOnServer).
 */
export async function syncPushRegistration(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (subscription) {
    await send("POST", { subscription: subscription.toJSON() });
  }
}

/**
 * Called before signing out. The browser keeps its subscription — so signing back in as an
 * admin restores notifications with no further taps — but the server stops sending to this
 * device, so a shared phone does not keep showing order amounts to a signed-out screen.
 */
export async function forgetPushOnServer(): Promise<void> {
  try {
    if (!pushSupported()) return;
    const subscription = await currentSubscription();
    if (subscription) {
      await send("DELETE", { endpoint: subscription.endpoint });
    }
  } catch {
    // Signing out must never wait on, or fail because of, a notification setting.
  }
}
