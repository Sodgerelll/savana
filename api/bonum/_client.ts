// Bonum PSP API client — runs server-side in Vercel serverless functions only.
// Required environment variables (set in Vercel dashboard, never commit):
//   BONUM_APP_SECRET      — AppSecret from Bonum merchant portal
//   BONUM_TERMINAL_ID     — Terminal ID from Bonum merchant portal
//   BONUM_BASE_URL        — (optional) defaults to production: https://apis.bonum.mn
//   FIREBASE_SERVICE_ACCOUNT_JSON — (optional) enables a cross-instance token
//                                   cache in Firestore so cold starts don't
//                                   re-auth on every request (avoids 429s).

import { getAdminFirestore } from './_firebaseAdmin.js';

const BASE_URL = process.env.BONUM_BASE_URL ?? 'https://apis.bonum.mn';

// Bonum heavily rate-limits auth/create, so we cache the token aggressively.
interface TokenEntry {
  token: string;
  expiresAt: number;
}

// In-memory cache — only survives within a warm Vercel function instance.
let _tokenCache: TokenEntry | null = null;

// Firestore-backed cache — shared across all serverless instances and cold starts.
const TOKEN_CACHE_COLLECTION = '_system';
const TOKEN_CACHE_DOC = 'bonumToken';
const AUTH_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPersistedToken(): Promise<TokenEntry | null> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) return null;
  try {
    const db = await dbPromise;
    const snap = await db.collection(TOKEN_CACHE_COLLECTION).doc(TOKEN_CACHE_DOC).get();
    if (!snap.exists) return null;
    const data = snap.data() as Partial<TokenEntry>;
    if (!data.token || !data.expiresAt) return null;
    return { token: data.token, expiresAt: data.expiresAt };
  } catch {
    return null; // best-effort — fall back to fetching a fresh token
  }
}

async function writePersistedToken(entry: TokenEntry): Promise<void> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    await db.collection(TOKEN_CACHE_COLLECTION).doc(TOKEN_CACHE_DOC).set(entry);
  } catch {
    // best-effort — ignore persistence failures
  }
}

async function fetchFreshToken(): Promise<TokenEntry> {
  const appSecret = process.env.BONUM_APP_SECRET;
  const terminalId = process.env.BONUM_TERMINAL_ID;

  if (!appSecret || !terminalId) {
    throw new Error(
      'Bonum credentials are not configured. Set BONUM_APP_SECRET and BONUM_TERMINAL_ID in the Vercel project environment variables.',
    );
  }

  let lastError: Error = new Error('Bonum auth failed');

  for (let attempt = 1; attempt <= AUTH_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${BASE_URL}/bonum-gateway/ecommerce/auth/create`, {
      method: 'GET',
      headers: {
        Authorization: `AppSecret ${appSecret}`,
        'X-TERMINAL-ID': terminalId,
        'Accept-Language': 'mn',
      },
    });

    if (res.status === 429) {
      lastError = new Error('Bonum auth rate-limited (429)');
      if (attempt < AUTH_MAX_ATTEMPTS) {
        await sleep(attempt * 2000); // 2s, then 4s backoff
        continue;
      }
      throw lastError;
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new Error(String(body['message'] ?? `Bonum auth failed: ${res.status}`));
    }

    const data = (await res.json()) as { accessToken: string; expiresIn: number };
    // Refresh 5 min before expiry; never cache under 60s (guards tiny/odd expiresIn values).
    const ttlSeconds = Math.max((data.expiresIn ?? 0) - 300, 60);
    return {
      token: data.accessToken,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
  }

  throw lastError;
}

export async function getAccessToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  // Cross-instance cache avoids re-authing on every cold start — the usual
  // cause of Bonum auth rate-limiting on serverless.
  const persisted = await readPersistedToken();
  if (persisted && Date.now() < persisted.expiresAt) {
    _tokenCache = persisted;
    return persisted.token;
  }

  try {
    const fresh = await fetchFreshToken();
    _tokenCache = fresh;
    await writePersistedToken(fresh);
    return fresh.token;
  } catch (err) {
    // If we're rate-limited but still hold a token (cached 5 min before its real
    // expiry, so likely still valid), reuse it rather than failing the request.
    if (_tokenCache) return _tokenCache.token;
    if (persisted) return persisted.token;
    throw err;
  }
}

export async function bonumPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept-Language': 'mn',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(err['message'] ?? `Bonum POST ${path} failed: ${res.status}`));
  }
  return res.json() as Promise<T>;
}

export async function bonumGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'mn',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(err['message'] ?? `Bonum GET ${path} failed: ${res.status}`));
  }
  return res.json() as Promise<T>;
}
