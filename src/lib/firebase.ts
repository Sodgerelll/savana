import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// The auth helper must be served from the app's own origin for redirect-based
// sign-in to survive third-party storage partitioning on Safari/iOS — with the
// stock firebaseapp.com authDomain the installed PWA dies with "missing
// initial state" after returning from Google. vercel.json proxies /__/auth and
// /__/firebase to the Firebase-hosted helper, so any deployed (https,
// non-local) hostname can serve the helper first-party. Local dev has no such
// proxy and keeps the configured/stock domain, where the popup flow works.
function resolveAuthDomain(): string {
  const configured = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const fallback =
    configured && configured.length > 0 ? configured : "savana-3f45a.firebaseapp.com";

  if (typeof window === "undefined") {
    return fallback;
  }

  const host = window.location.hostname;
  const isLocalHost =
    host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");

  if (!isLocalHost && window.location.protocol === "https:") {
    return host;
  }

  return fallback;
}

const firebaseConfig = {
  apiKey: "AIzaSyCBiNJtQBZdVs4INEL_hI_-1S1x_yZkzII",
  authDomain: resolveAuthDomain(),
  projectId: "savana-3f45a",
  storageBucket: "savana-3f45a.firebasestorage.app",
  messagingSenderId: "596547804022",
  appId: "1:596547804022:web:ec42a071568c21397f3857",
  measurementId: "G-RR4XF4DTST",
};

const configuredFirestoreDatabaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID?.trim();

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);
export const firestoreDatabaseId =
  configuredFirestoreDatabaseId && configuredFirestoreDatabaseId.length > 0
    ? configuredFirestoreDatabaseId
    : "(default)";
export const db = getFirestore(firebaseApp, firestoreDatabaseId);

if (typeof window !== "undefined") {
  void isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(firebaseApp);
      }
    })
    .catch(() => {
      // Analytics is optional; auth should continue to work even when unsupported.
    });
}
