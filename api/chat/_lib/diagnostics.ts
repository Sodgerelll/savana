// Why the bot last failed to answer, written where it can be read.
//
// A turn that fails tells the customer "Хариу авч чадсангүй" and tells the shop
// nothing. The reason is in a Vercel log, which nobody is watching at the
// moment it matters, so it may as well not exist — and the difference between
// "the model is rate limited", "the key is wrong" and "our request is malformed"
// is the difference between waiting and fixing.
//
// One document per kind, overwritten, so the record cannot grow.

/* eslint-disable @typescript-eslint/no-explicit-any */

const COLLECTION = 'chat_diagnostics';
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const REASON_LIMIT = 600;

export async function recordChatFailure(
  db: any,
  kind: string,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db
      .collection(COLLECTION)
      .doc(kind)
      .set({
        ...extra,
        reason: String(reason ?? '').slice(0, REASON_LIMIT),
        at: new Date(),
        // A Date, so the TTL policy on this collection can fire.
        expireAt: new Date(Date.now() + KEEP_MS),
      });
  } catch {
    // A diagnostic that fails is not worth failing a reply over.
  }
}

/** How long a model that stopped answering is left out of the chain. */
const UNHEALTHY_MS = 5 * 60 * 1000;
const MODEL_PREFIX = 'model:';

/**
 * Notes that a model did not answer in time.
 *
 * Its fallback works, so the shop keeps trading — but every turn pays the full
 * timeout on the way past, and twenty-five seconds of nothing in front of every
 * reply is its own outage. A few minutes is long enough to skip a bad patch and
 * short enough that a recovered model is tried again while anyone still cares.
 */
export async function markModelUnhealthy(db: any, model: string): Promise<void> {
  await recordChatFailure(db, `${MODEL_PREFIX}${model}`, 'timed out', {
    unhealthyUntil: new Date(Date.now() + UNHEALTHY_MS),
  });
}

/** Models to skip this turn. Any failure here returns none, never a wrong skip. */
export async function unhealthyModels(db: any): Promise<string[]> {
  try {
    const snapshot = await db.collection(COLLECTION).get();
    const now = Date.now();

    return (snapshot.docs ?? [])
      .filter((doc: any) => String(doc.id).startsWith(MODEL_PREFIX))
      .filter((doc: any) => {
        const until = doc.data()?.unhealthyUntil?.toDate?.()?.getTime?.() ?? 0;
        return until > now;
      })
      .map((doc: any) => String(doc.id).slice(MODEL_PREFIX.length));
  } catch {
    return [];
  }
}
