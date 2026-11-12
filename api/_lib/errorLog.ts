// The system's error log: one place every failed action is recorded, for the admin "Лог" page.
//
// A record is a distinct error for one day, not one occurrence. Two hundred identical
// Messenger failures are one row with count 200, so a bad hour cannot bury everything else
// and a retry loop cannot run up the Firestore bill. The id is `<day>_<fingerprint>`, where
// the fingerprint is the source, the action and the message with ids and numbers taken out.
//
// Writing a log must never be the thing that breaks the action being logged, and it must
// never hold a customer's response up: `logError` swallows every failure and gives up after
// a couple of seconds. Callers should still `await` it where they can — a serverless
// function may be frozen the moment its response is sent, and an un-awaited write is lost.
//
// The browser reports through api/logs/report.ts, which ends up here. Nothing but the Admin
// SDK writes /errorLogs (firestore.rules), so a shopper cannot plant or erase a row.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';

export const ERROR_LOGS_COLLECTION = 'errorLogs';

/**
 * Where the failure happened, in the words an admin thinks in. Mirrored by
 * ERROR_LOG_SOURCES in src/lib/errorLogs.ts.
 */
export const ERROR_LOG_SOURCES = [
  'chat', // the AI assistant: Messenger, Instagram, the website widget
  'order', // placing, looking up and settling orders
  'payment', // Bonum invoices and webhooks
  'account', // sign-up details, profiles, customer records
  'auth', // signing in and out
  'notification', // push notifications
  'storefront', // the public site's own runtime errors
  'admin', // actions taken in the admin panel
  'system', // configuration, analytics, anything else
] as const;

export type ErrorLogSource = (typeof ERROR_LOG_SOURCES)[number];
export type ErrorLogSeverity = 'error' | 'warning';

export interface ErrorLogInput {
  source: ErrorLogSource;
  /** Short, stable name of the step that failed — `chat/webhook`, `order/invoice`. */
  action: string;
  message: string;
  /** The thrown value, when there is one. Its message and stack are recorded. */
  error?: unknown;
  severity?: ErrorLogSeverity;
  /** Ids and flags that help find the cause. Never customer text, contact details or secrets. */
  context?: Record<string, unknown>;
  origin?: 'server' | 'client';
  actorUid?: string | null;
  url?: string;
  userAgent?: string;
  /** A stack the browser captured; a server error's own stack is taken from `error`. */
  stack?: string;
}

const MESSAGE_LIMIT = 400;
const DETAIL_LIMIT = 1500;
const CONTEXT_LIMIT = 3000;
const RETENTION_DAYS = 90;
const WRITE_TIMEOUT_MS = 2500;
/** An identical error inside this window is counted, not written again. */
const COALESCE_MS = 1000;

const SECRET_KEY = /token|secret|password|passwd|authorization|cookie|api[-_]?key|signature|credential|private/i;

/** Text that must never reach the log, whatever produced it. */
export function redact(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:access_token|token|key|secret|signature)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(/"?(?:access_token|authorization|password|private_key|client_secret)"?\s*[:=]\s*"[^"]*"/gi, '[redacted]')
    // An eight-digit Mongolian mobile number, so a name or a phone in a provider's error
    // text does not turn the log into a customer list.
    .replace(/(?<![0-9])[6-9][0-9]{7}(?![0-9])/g, '********')
    // A long unbroken run of key characters is a credential, not a sentence.
    .replace(/[A-Za-z0-9_-]{48,}/g, '[redacted]');
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Plain, bounded data only: no secrets, no nesting past three levels, no unbounded strings. */
function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return clip(redact(value), 300);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (depth >= 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[key.slice(0, 60)] = SECRET_KEY.test(key) ? '[redacted]' : sanitizeValue(entry, depth + 1);
    }
    return out;
  }
  return null;
}

export function sanitizeContext(context: unknown): Record<string, unknown> | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const cleaned = sanitizeValue(context, 0) as Record<string, unknown>;
  const size = JSON.stringify(cleaned).length;
  return size > CONTEXT_LIMIT ? { truncated: clip(JSON.stringify(cleaned), CONTEXT_LIMIT) } : cleaned;
}

function describeError(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? '' };
  }
  if (typeof error === 'string') return { message: error, stack: '' };
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    try {
      return { message: typeof message === 'string' ? message : JSON.stringify(error), stack: '' };
    } catch {
      return { message: String(error), stack: '' };
    }
  }
  return { message: error === undefined ? '' : String(error), stack: '' };
}

/** `YYYY-MM-DD` in Ulaanbaatar, the day an admin there would file the error under. */
function dayKey(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The message with ids and numbers taken out, so the same fault groups together. */
function normalize(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, '#')
    .replace(/[0-9]+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function errorFingerprint(source: string, action: string, message: string): string {
  return createHash('sha1').update(`${source}|${action}|${normalize(message)}`).digest('hex').slice(0, 20);
}

const recentWrites = new Map<string, { at: number; skipped: number }>();

function isNotFound(err: any): boolean {
  return err?.code === 5 || err?.code === 'not-found';
}

function isAlreadyExists(err: any): boolean {
  return err?.code === 6 || err?.code === 'already-exists';
}

async function write(input: ErrorLogInput, message: string, stack: string, now: Date): Promise<void> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) return;

  const fingerprint = errorFingerprint(input.source, input.action, message);
  const id = `${dayKey(now)}_${fingerprint}`;

  const recent = recentWrites.get(id);
  if (recent && now.getTime() - recent.at < COALESCE_MS) {
    recent.skipped += 1;
    return;
  }
  const extra = recent?.skipped ?? 0;
  recentWrites.set(id, { at: now.getTime(), skipped: 0 });
  if (recentWrites.size > 500) recentWrites.clear();

  const db = await dbPromise;
  const { FieldValue, Timestamp } = await import('firebase-admin/firestore');
  const ref = db.collection(ERROR_LOGS_COLLECTION).doc(id);

  const context = sanitizeContext(input.context);
  const latest = {
    lastAt: Timestamp.fromDate(now),
    // A repeat of something already marked fixed is not fixed.
    status: 'open',
    resolvedAt: null,
    resolvedBy: null,
    ...(context ? { context } : {}),
    ...(input.actorUid ? { actorUid: input.actorUid } : {}),
  };

  try {
    await ref.update({ ...latest, count: FieldValue.increment(1 + extra) });
    return;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  try {
    await ref.create({
      ...latest,
      fingerprint,
      day: dayKey(now),
      source: input.source,
      action: clip(input.action, 80),
      severity: input.severity ?? 'error',
      origin: input.origin ?? 'server',
      message: clip(redact(message), MESSAGE_LIMIT),
      stack: clip(redact(stack), DETAIL_LIMIT),
      url: input.url ? clip(redact(input.url), 300) : null,
      userAgent: input.userAgent ? clip(input.userAgent, 200) : null,
      count: 1 + extra,
      createdAt: Timestamp.fromDate(now),
      // For a Firestore TTL policy on this field; harmless until one is switched on.
      expireAt: Timestamp.fromDate(new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)),
    });
  } catch (err) {
    // Two instances recorded the first occurrence at once; the second just counts.
    if (!isAlreadyExists(err)) throw err;
    await ref.update({ ...latest, count: FieldValue.increment(1 + extra) });
  }
}

/**
 * Records a failure, and still prints it to the function log as the old console calls did.
 * Never throws and never waits longer than a couple of seconds.
 */
export async function logError(input: ErrorLogInput): Promise<void> {
  const described = describeError(input.error);
  const message = input.message
    ? described.message && described.message !== input.message
      ? `${input.message}: ${described.message}`
      : input.message
    : described.message || 'Unknown error';
  const stack = input.stack || described.stack;

  const line = `[${input.action}] ${redact(message)}`;
  if (input.severity === 'warning') {
    console.warn(line);
  } else {
    console.error(line);
  }

  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, WRITE_TIMEOUT_MS);
    });
    try {
      await Promise.race([write(input, message, stack, new Date()), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (err) {
    // The log is down; the line above is all there will be.
    console.warn('[errorLog] could not record the error:', (err as Error)?.message);
  }
}
