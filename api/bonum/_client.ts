// Bonum PSP API client — runs server-side in Vercel serverless functions only.
// Required environment variables (set in Vercel dashboard, never commit):
//   BONUM_APP_SECRET      — AppSecret from Bonum merchant portal
//   BONUM_TERMINAL_ID     — Terminal ID from Bonum merchant portal
//   BONUM_BASE_URL        — (optional) defaults to production: https://apis.bonum.mn

const BASE_URL = process.env.BONUM_BASE_URL ?? 'https://apis.bonum.mn';

// Token cache — persists within a warm Vercel function instance (not across cold starts).
let _tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.token;
  }

  const res = await fetch(`${BASE_URL}/bonum-gateway/ecommerce/auth/create`, {
    method: 'GET',
    headers: {
      Authorization: `AppSecret ${process.env.BONUM_APP_SECRET ?? ''}`,
      'X-TERMINAL-ID': process.env.BONUM_TERMINAL_ID ?? '',
      'Accept-Language': 'mn',
    },
  });

  // 429 = rate-limited; reuse the cached token if we still have one
  if (res.status === 429) {
    if (_tokenCache) return _tokenCache.token;
    throw new Error('Bonum: rate-limited and no cached token available');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(body['message'] ?? `Bonum auth failed: ${res.status}`));
  }

  const data = await res.json() as { accessToken: string; expiresIn: number };
  // Refresh 5 minutes before actual expiry to avoid using an expired token
  _tokenCache = {
    token: data.accessToken,
    expiresAt: Date.now() + (data.expiresIn - 300) * 1000,
  };
  return _tokenCache.token;
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
