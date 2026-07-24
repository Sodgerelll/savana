import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// The auth helper must be served from the app's own origin for redirect-based
// sign-in to survive third-party storage partitioning on mobile browsers.
// Set VITE_FIREBASE_AUTH_DOMAIN to the production hostname (with the /__/auth
// proxy rewrite in vercel.json) to enable that; the default keeps the stock
// Firebase-hosted helper.
const configuredAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();

const firebaseConfig = {
  apiKey: "AIzaSyCBiNJtQBZdVs4INEL_hI_-1S1x_yZkzII",
  authDomain:
    configuredAuthDomain && configuredAuthDomain.length > 0
      ? configuredAuthDomain
      : "savana-3f45a.firebaseapp.com",
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
