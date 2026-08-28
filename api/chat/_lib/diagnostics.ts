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
import { probeGemini } from './gemini.js';

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

/**
 * How long a model is left out of the chain, lengthening each time it fails again.
 *
 * A single bad turn says almost nothing, so the first wait is short — the
 * preferred model is preferred for a reason and deserves another try. But a
 * model that is genuinely down stays down, and asking it again every ninety
 * seconds means one customer in every batch waits out the full timeout for a
 * model nobody expects to answer. Each consecutive failure lengthens the wait;
 * one success clears the record entirely.
 *
 * The tail runs to six hours because this shop is quiet. Half an hour was the
 * old ceiling and it protected nobody: messages arrive further apart than that,
 * so nearly every customer landed after the wait had expired and paid the full
 * timeout anyway. The ceiling has to outlast the gaps between customers before
 * it means anything.
 */
const BACKOFF_MS = [
  90 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];
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
  const id = `${MODEL_PREFIX}${model}`;
  let strikes = 0;

  try {
    const previous = await db.collection(COLLECTION).doc(id).get();
    // Counted from the last failure, not from the last success: a note that has
    // aged out of the longest wait is a fresh start either way.
    strikes = Number(previous.data()?.strikes ?? 0);
  } catch {
    // No history to read is the same as no history.
  }

  // Asked the smallest question there is, right after it failed a real one.
  // A model that answers "hi" in a moment but not a catalogue prompt in
  // eighteen seconds is telling us the size of the request is the problem; one
  // that answers neither is telling us it is simply not serving us.
  const probe = await probeGemini(model);

  // The probe is evidence and it has just said this model answers. A turn can
  // fail for reasons that are not the model's — a spike, a long prompt, one bad
  // patch — and letting the strike count climb on a model that is plainly alive
  // is how the wait grows to hours for the one model still working. Note it,
  // wait the shortest step, and try again soon.
  const strikesNow = probe.ok ? strikes : strikes + 1;
  const wait = probe.ok ? BACKOFF_MS[0] : BACKOFF_MS[Math.min(strikes, BACKOFF_MS.length - 1)];
  const reason = probe.ok
    ? 'timed out on a real turn, but answered a small prompt straight after'
    : `timed out (${strikesNow} in a row)`;

  await recordChatFailure(db, id, reason, {
    strikes: strikesNow,
    probe: probe.detail,
    unhealthyUntil: new Date(Date.now() + wait),
  });
}

/**
 * Forgets a model's failures once it answers again.
 *
 * Without this the strike count only ever climbs, and a model that recovered
 * hours ago is still being skipped for half an hour at a time.
 */
export async function markModelHealthy(db: any, model: string): Promise<void> {
  try {
    await db.collection(COLLECTION).doc(`${MODEL_PREFIX}${model}`).delete();
  } catch {
    // Nothing to forget, or Firestore is unhappy; neither is worth a failed reply.
  }
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
