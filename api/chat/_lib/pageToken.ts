// Turns whatever token the deployment was given into the page token the bot
// needs.
//
// Getting a permanent page token by hand is a four-step dance through Meta's
// tools, and the last two steps hand you two ~250-character strings that both
// begin `EAA…`: the long-lived *user* token, and the *page* token derived from
// it. Only the second one can send a message as the shop. Picking the wrong one
// costs a full rotate-and-redeploy cycle to discover, and it was picked wrong
// three times in a row during setup — which is a sign the shape of the task is
// wrong, not the person doing it.
//
// So the code no longer insists. Given a user token it exchanges it for the
// page token itself; given a page token it uses it as-is. Either paste works.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const COLLECTION = 'chat_page_tokens';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Page tokens derived from a long-lived user token do not expire, so this is a
 * re-check interval rather than a lifetime — long enough that the exchange
 * costs nothing per request, short enough that swapping the connected page is
 * noticed the same day.
 */
const RECHECK_MS = 24 * 60 * 60 * 1000;

export interface ResolvedPageToken {
  token: string;
  pageId: string;
  pageName: string;
  /** Whether the configured value was already a page token. */
  exchanged: boolean;
}

function cacheKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 32);
}

function readExpiry(value: any): number | null {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The pages this token can act for. A page token cannot list pages, so an empty
 * result is the signal that the caller already holds one.
 */
async function listPages(token: string): Promise<Array<{ id: string; name: string; token: string }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GRAPH_URL}/me/accounts?fields=access_token,name,id`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      return [];
    }

    const data: any = await res.json();
    return (Array.isArray(data?.data) ? data.data : [])
      .filter((page: any) => page?.access_token && page?.id)
      .map((page: any) => ({
        id: String(page.id),
        name: String(page.name ?? ''),
        token: String(page.access_token),
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the configured token to a page token, caching the answer.
 *
 * Falls back to the configured token on every failure path: an exchange that
 * cannot happen must leave the bot exactly as it was, not worse.
 */
export async function resolvePageToken(
  db: any,
  configured: string,
  options: { pageId?: string } = {},
): Promise<ResolvedPageToken | null> {
  const token = (configured ?? '').trim();
  if (!token) {
    return null;
  }

  const ref = db.collection(COLLECTION).doc(cacheKey(token));

  try {
    const snapshot = await ref.get();
    if (snapshot.exists) {
      const data = snapshot.data() ?? {};
      const expiresAt = readExpiry(data.expireAt);
      if (expiresAt !== null && expiresAt > Date.now() && data.token) {
        return {
          token: String(data.token),
          pageId: String(data.pageId ?? ''),
          pageName: String(data.pageName ?? ''),
          exchanged: data.exchanged === true,
        };
      }
    }
  } catch (err) {
    console.warn('[chat/pageToken] cache read failed:', (err as Error).message);
  }

  const pages = await listPages(token);
  // Prefer the configured page when the deployment names one; otherwise the
  // only page the token manages. Several pages with no FB_PAGE_ID set is
  // genuinely ambiguous, so the first is taken and the choice is logged.
  const wanted = options.pageId
    ? pages.find((page) => page.id === options.pageId)
    : pages[0];

  if (pages.length > 1 && !options.pageId) {
    console.warn(
      `[chat/pageToken] token manages ${pages.length} pages; using "${pages[0].name}". ` +
        'Set FB_PAGE_ID to choose.',
    );
  }

  const resolved: ResolvedPageToken = wanted
    ? { token: wanted.token, pageId: wanted.id, pageName: wanted.name, exchanged: true }
    : { token, pageId: options.pageId ?? '', pageName: '', exchanged: false };

  if (resolved.exchanged) {
    console.log(`[chat/pageToken] exchanged a user token for the "${resolved.pageName}" page token`);
  }

  try {
    await ref.set({
      token: resolved.token,
      pageId: resolved.pageId,
      pageName: resolved.pageName,
      exchanged: resolved.exchanged,
      // A Date, so the Firestore TTL policy on this collection can fire.
      expireAt: new Date(Date.now() + RECHECK_MS),
    });
  } catch (err) {
    console.warn('[chat/pageToken] cache write failed:', (err as Error).message);
  }

  return resolved;
}
