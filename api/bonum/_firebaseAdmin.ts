// Shared Firebase Admin Firestore accessor for the Bonum serverless routes.
// Returns null when FIREBASE_SERVICE_ACCOUNT_JSON is not configured so callers
// can degrade gracefully (e.g. fall back to in-memory caching).

/* eslint-disable @typescript-eslint/no-explicit-any */

let _dbPromise: Promise<any> | null = null;

export function getAdminFirestore(): Promise<any> | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return null;
  }

  if (!_dbPromise) {
    _dbPromise = (async () => {
      const { initializeApp, getApps, cert } = await import('firebase-admin/app');
      const { getFirestore } = await import('firebase-admin/firestore');
      if (!getApps().length) {
        initializeApp({ credential: cert(JSON.parse(serviceAccountJson) as object) });
      }
      return getFirestore();
    })();
  }

  return _dbPromise;
}
