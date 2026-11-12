// POST /api/errorlog/report
// Body: { source, action, message, stack?, url?, severity?, context? }
// Header (optional): Authorization: Bearer <Firebase ID token>
//
// How the browser gets a failure into the admin error log. /errorLogs is closed to every
// client in firestore.rules, so a shopper's checkout that fails, a sign-in that is refused
// or a page that crashes is reported here and written by the Admin SDK (api/_lib/errorLog.ts).
//
// Open to guests on purpose — most checkout failures are a guest's — so it is built to be
// harmless when abused: only known sources are accepted, every field is clipped, the
// caller's identity is recorded only when a token verifies, and each address is limited to a
// few reports a minute. Identical reports are merged into one row by the logger, so noise
// cannot grow the collection by repetition either. It always answers 204: a failing report
// is never something the shopper's page should react to.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminAuth } from '../bonum/_firebaseAdmin.js';
import { readBearerToken } from '../_lib/callerIdentity.js';
import { logError, sanitizeContext, ERROR_LOG_SOURCES, type ErrorLogSource } from '../_lib/errorLog.js';

/** The browser reports what it can see; the rest of the sources are the server's own. */
const CLIENT_SOURCES = new Set<string>(
  ERROR_LOG_SOURCES.filter((source) => source !== 'payment' && source !== 'system'),
);

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, { windowStart: number; count: number }>();

function clientAddress(req: any): string {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return first || String(req?.socket?.remoteAddress ?? 'unknown');
}

function overLimit(address: string, now: number): boolean {
  const entry = hits.get(address);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(address, { windowStart: now, count: 1 });
    if (hits.size > 2000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

async function verifiedUid(req: any): Promise<string | null> {
  const token = readBearerToken(req);
  const authPromise = getAdminAuth();
  if (!token || !authPromise) return null;
  try {
    const auth = await authPromise;
    return String((await auth.verifyIdToken(token)).uid);
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
  const source = text(body.source, 20);
  const action = text(body.action, 80).trim();
  const message = text(body.message, 400).trim();

  if (!CLIENT_SOURCES.has(source) || !action || !message) {
    res.status(400).json({ error: 'source, action and message are required' });
    return;
  }

  if (overLimit(clientAddress(req), Date.now())) {
    res.status(429).json({ error: 'Too many reports' });
    return;
  }

  await logError({
    source: source as ErrorLogSource,
    action,
    message,
    stack: text(body.stack, 1500),
    url: text(body.url, 300),
    userAgent: text(req.headers?.['user-agent'], 200),
    severity: body.severity === 'warning' ? 'warning' : 'error',
    context: sanitizeContext(body.context) ?? undefined,
    origin: 'client',
    actorUid: await verifiedUid(req),
  });

  res.status(204).end();
}
