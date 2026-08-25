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
