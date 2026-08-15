// Webhook safety rails: de-duplication and per-user rate limiting.
//
// Facebook retries a delivery whenever it does not see a fast 200, so the same
// message can arrive several times. Both collections here are server-only
// (see firestore.rules) and grow without bound, so each document carries an
// `expireAt` field for a Firestore TTL policy — configure both in the console:
//   Firestore → TTL → chat_processed_events.expireAt
//   Firestore → TTL → chat_rate_limits.expireAt

/* eslint-disable @typescript-eslint/no-explicit-any */

export const PROCESSED_EVENTS_COLLECTION = 'chat_processed_events';
export const RATE_LIMITS_COLLECTION = 'chat_rate_limits';

/** How long a processed-event marker is kept before the TTL policy reaps it. */
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_RATE_LIMIT = { max: 15, windowMs: 60_000 };

/**
 * Firestore document ids cannot contain `/` and must avoid `.`, `#`, `$`, `[`,
 * `]`; ids are also capped at 1500 bytes. Facebook ids and message ids are
 * plain enough, but payloads are concatenated into keys, so sanitise anyway.
 */
export function toDocumentId(rawKey: string): string {
  return String(rawKey).replace(/[/\\.#$[\]]/g, '_').slice(0, 400);
}

/**
 * Claims an event key. Returns true the first time and false for a replay.
 *
 * Uses `create`, which fails when the document already exists — that atomicity
 * is what makes the check safe against two concurrent deliveries of the same
 * event landing on different instances.
 */
export async function markEventProcessed(db: any, rawKey: string): Promise<boolean> {
  if (!rawKey) {
    // No key means we cannot tell a replay from a fresh event; processing a
    // possible duplicate beats dropping a real message.
    return true;
  }

  try {
    await db
      .collection(PROCESSED_EVENTS_COLLECTION)
      .doc(toDocumentId(rawKey))
      .create({ at: new Date(), expireAt: new Date(Date.now() + EVENT_TTL_MS) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Releases a claim after processing failed, so Facebook's retry is allowed to
 * run instead of being swallowed as a duplicate and losing the message.
 */
export async function releaseEvent(db: any, rawKey: string): Promise<void> {
  if (!rawKey) {
    return;
  }

  try {
    await db.collection(PROCESSED_EVENTS_COLLECTION).doc(toDocumentId(rawKey)).delete();
  } catch (err) {
    console.warn('[chat/guards] releaseEvent failed:', (err as Error).message);
  }
}

/**
 * Sliding-window counter, one window per key. Returns false once the caller has
 * used up `max` requests inside `windowMs`.
 *
 * Fails open: if the transaction itself errors we let the message through. A
 * broken counter must not silence the bot for every customer.
 */
export async function checkRateLimit(
  db: any,
  rawKey: string,
  options: { max?: number; windowMs?: number } = {},
): Promise<boolean> {
  if (!rawKey) {
    return true;
  }

  const max = options.max ?? DEFAULT_RATE_LIMIT.max;
  const windowMs = options.windowMs ?? DEFAULT_RATE_LIMIT.windowMs;
  const ref = db.collection(RATE_LIMITS_COLLECTION).doc(toDocumentId(rawKey));

  try {
    return await db.runTransaction(async (tx: any) => {
      const snapshot = await tx.get(ref);
      const now = Date.now();
      const data = snapshot.exists ? snapshot.data() : null;

      if (!data || now - (data.windowStart ?? 0) > windowMs) {
        tx.set(ref, {
          windowStart: now,
          count: 1,
          expireAt: new Date(now + 2 * windowMs),
        });
        return true;
      }

      if ((data.count ?? 0) >= max) {
        return false;
      }

      tx.update(ref, { count: (data.count ?? 0) + 1 });
      return true;
    });
  } catch (err) {
    console.warn('[chat/guards] checkRateLimit failed, allowing through:', (err as Error).message);
    return true;
  }
}
