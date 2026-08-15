// Shared Firebase Admin accessors for the serverless routes. Despite living
// under bonum/, this is the single admin entry point for every /api route
// (orders/*, chat/*) — they all share one initialized app.
//
// Both accessors return null when FIREBASE_SERVICE_ACCOUNT_JSON is not
// configured so callers can degrade gracefully (e.g. fall back to in-memory
// caching) rather than crashing a cold start.

/* eslint-disable @typescript-eslint/no-explicit-any */

let _dbPromise: Promise<any> | null = null;
let _authPromise: Promise<any> | null = null;

async function ensureApp(serviceAccountJson: string): Promise<void> {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson) as object) });
  }
}

export function getAdminFirestore(): Promise<any> | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return null;
  }

  if (!_dbPromise) {
    _dbPromise = (async () => {
      await ensureApp(serviceAccountJson);
      const { getFirestore } = await import('firebase-admin/firestore');
      return getFirestore();
    })();
  }

  return _dbPromise;
}

/** Admin Auth, used by the chat routes to verify caller ID tokens. */
export function getAdminAuth(): Promise<any> | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return null;
  }

  if (!_authPromise) {
    _authPromise = (async () => {
      await ensureApp(serviceAccountJson);
      const { getAuth } = await import('firebase-admin/auth');
      return getAuth();
    })();
  }

  return _authPromise;
}
