// Names for Facebook threads that were stored without one.
//
// Until the webhook learned to fall back on the page's inbox, a Messenger
// thread whose profile lookup was refused kept customerName null for good —
// the webhook only ever filled it at the moment a message arrived. This walks
// those threads once and asks the inbox for each customer's name.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CONVERSATIONS_COLLECTION, fillConversationContact } from './conversation.js';
import { getParticipantName, getUserName } from './facebook.js';

/** Parallel Graph lookups. Enough to be quick, few enough not to trip Meta's rate limit. */
const CONCURRENCY = 5;

export interface NameBackfillResult {
  /** Facebook threads that had no name when the run started. */
  missing: number;
  /** Threads that got a name. */
  updated: number;
  /** Threads Graph had no name for (deleted accounts, blocked pages). */
  unresolved: number;
  /** Left for another run because the time budget ran out. */
  remaining: number;
}

export async function backfillFacebookNames(
  db: any,
  token: string,
  options: { deadline: number },
): Promise<NameBackfillResult> {
  const snapshot = await db.collection(CONVERSATIONS_COLLECTION).where('channel', '==', 'facebook').get();

  const queue = snapshot.docs
    .map((doc: any) => ({ id: String(doc.id), data: doc.data() ?? {} }))
    .filter(({ data }: any) => !String(data.customerName ?? '').trim())
    .map(({ id, data }: any) => ({
      id,
      pageId: String(data.pageId ?? ''),
      psid: String(data.externalUserId ?? ''),
    }))
    .filter((thread: any) => thread.pageId && thread.psid);

  const result: NameBackfillResult = { missing: queue.length, updated: 0, unresolved: 0, remaining: 0 };
  let next = 0;

  async function worker(): Promise<void> {
    while (next < queue.length) {
      if (Date.now() > options.deadline) {
        return;
      }
      const thread = queue[next++];
      // The inbox first: it is the lookup that works without the extra Meta
      // permission, which is why these threads are nameless in the first place.
      const name =
        (await getParticipantName(token, thread.pageId, thread.psid)) ??
        (await getUserName(token, thread.psid, 'facebook'));

      if (name) {
        await fillConversationContact(db, thread.id, { customerName: name });
        result.updated += 1;
      } else {
        result.unresolved += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  result.remaining = queue.length - result.updated - result.unresolved;
  return result;
}
