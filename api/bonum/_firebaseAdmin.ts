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
      const { getFirestore } = await import('firebase-admin/firestore');

      // gRPC, the default. REST was tried here on the theory that loading the
      // gRPC stack was what made a cold turn slow; measured across three cold
      // starts it changed nothing, and it cannot multiplex the seven reads the
      // prompt needs the way one HTTP/2 channel does. The cold cost is the
      // first round trip to Firestore — the handshake and the token — and it is
      // paid whichever transport asks.
      return getFirestore(app);
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
