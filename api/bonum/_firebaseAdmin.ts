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

async function ensureApp(serviceAccountJson: string): Promise<any> {
  const { initializeApp, getApps, getApp, cert } = await import('firebase-admin/app');
  if (!getApps().length) {
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson) as object) });
  }
  return getApp();
}

export function getAdminFirestore(): Promise<any> | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return null;
  }

  if (!_dbPromise) {
    _dbPromise = (async () => {
      const app = await ensureApp(serviceAccountJson);
      const { getFirestore, initializeFirestore } = await import('firebase-admin/firestore');

      // REST rather than gRPC. The default transport loads the gRPC stack and
      // opens a channel before it can ask for a single document, and on a cold
      // function that showed up as two and a half seconds in front of the first
      // read — on a shop this quiet, most customers are the cold one. The SDK
      // documents onSnapshot() as the only operation that still needs gRPC, and
      // nothing under api/ subscribes to anything; transactions and batched
      // writes go over REST unchanged.
      try {
        return initializeFirestore(app, { preferRest: true });
      } catch {
        // Something in this instance got there first. Its settings stand.
        return getFirestore(app);
      }
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
      const app = await ensureApp(serviceAccountJson);
      const { getAuth } = await import('firebase-admin/auth');
      return getAuth(app);
    })();
  }

  return _authPromise;
}
