// One-time nudge for a customer who started an order and then went quiet.
//
// The common loss looks like: "2 саван авъя" → bot asks for a name and phone →
// silence. The order never lands and nobody notices. A single reminder recovers
// a good share of those without becoming spam.
//
// Scheduling note: Vercel's Hobby plan only allows a once-a-day cron, which is
// far too coarse for a 20-minute nudge. So the sweep is driven by traffic —
// every inbound webhook triggers it, throttled globally so it runs at most once
// every few minutes. `api/chat/follow-up.ts` exposes the same sweep for a real
// scheduler on plans that have one.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { sendText } from './facebook.js';
import { checkRateLimit } from './guards.js';
import { LEADS_COLLECTION } from './leads.js';

/** How long a lead may sit without a phone number before we nudge. */
export const NUDGE_AFTER_MS = 20 * 60 * 1000;
/** Past this age the moment has gone; nudging then is just noise. */
export const NUDGE_GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;
/** Cap per sweep so one run cannot fan out into hundreds of sends. */
const MAX_NUDGES_PER_SWEEP = 20;
/** Candidate leads to examine per sweep. */
const SCAN_LIMIT = 60;

/**
 * Global throttle. `checkRateLimit` doubles as a distributed "has this run
 * recently" lock, so the traffic-driven sweep costs one read per webhook
 * instead of a full query.
 */
const SWEEP_THROTTLE = { max: 1, windowMs: 5 * 60 * 1000 };

/**
 * Asks for a name and a number, and stops there.
 *
 * It used to ask for a delivery address too and promise the order was being
 * prepared. This sweep does not know what is in the basket or what it comes to,
 * and the shop does not deliver below a minimum — so for a customer who set
 * aside one 9,900₮ shampoo, that was an address collected for a delivery that
 * cannot happen and a promise that cannot be kept.
 *
 * A phone number is worth having either way: it is what turns a lead nobody can
 * reach into one somebody can ring.
 */
const NUDGE_MESSAGE =
  'Сайн байна уу 🌿 Сонирхсон бараагаа захиалах уу? Нэр, утасны дугаараа ' +
  'үлдээвэл бид тодруулж холбогдоё.';

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export interface SweepResult {
  scanned: number;
  nudged: number;
  skipped: number;
}

/**
 * Decides whether a lead is due a nudge. Pure, so the timing rules can be
 * tested without Firestore.
 */
export function isDueForNudge(lead: Record<string, any>, now: number): boolean {
  if (lead.status !== 'new') return false;
  // A phone number means the lead is actionable; nothing to chase.
  if (String(lead.customerPhone ?? '').trim()) return false;
  // Exactly one nudge, ever.
  if (lead.followUpSentAt) return false;

  const age = now - toMillis(lead.createdAt);
  return age >= NUDGE_AFTER_MS && age <= NUDGE_GIVE_UP_AFTER_MS;
}

/**
 * Sends the nudge to every lead that is due one.
 *
 * `force` skips the throttle; the cron route sets it, the webhook does not.
 */
export async function sweepStaleLeads(
  db: any,
  options: { token: string; now?: number; force?: boolean },
): Promise<SweepResult> {
  const now = options.now ?? Date.now();
  const result: SweepResult = { scanned: 0, nudged: 0, skipped: 0 };

  if (!options.force) {
    const mayRun = await checkRateLimit(db, 'followup:sweep', SWEEP_THROTTLE);
    if (!mayRun) {
      return result;
    }
  }

  let candidates: any[];
  try {
    // Uses the chat_leads (status, createdAt) index. The "no followUpSentAt yet"
    // part is filtered in memory — Firestore cannot query for a missing field.
    const snapshot = await db
      .collection(LEADS_COLLECTION)
      .where('status', '==', 'new')
      .orderBy('createdAt', 'desc')
      .limit(SCAN_LIMIT)
      .get();
    candidates = snapshot.docs ?? [];
  } catch (err) {
    console.error('[chat/followUp] scan failed:', (err as Error).message);
    return result;
  }

  result.scanned = candidates.length;

  for (const doc of candidates) {
    if (result.nudged >= MAX_NUDGES_PER_SWEEP) {
      break;
    }

    const lead = doc.data() ?? {};
    if (!isDueForNudge(lead, now)) {
      continue;
    }

    const conversationId = String(lead.conversationId ?? '');
    if (!conversationId) {
      result.skipped += 1;
      continue;
    }

    try {
      const sent = await nudgeConversation(db, conversationId, options.token, String(lead.channel ?? ''));
      // Stamped whether or not the send worked, so a permanently unreachable
      // customer is not retried on every sweep for the next 24 hours.
      await doc.ref.set({ followUpSentAt: new Date(), updatedAt: new Date() }, { merge: true });
      if (sent) {
        result.nudged += 1;
      } else {
        result.skipped += 1;
      }
    } catch (err) {
      console.warn('[chat/followUp] nudge failed:', (err as Error).message);
      result.skipped += 1;
    }
  }

  return result;
}

/** Delivers the nudge on the channel the conversation belongs to. */
async function nudgeConversation(
  db: any,
  conversationId: string,
  token: string,
  channel: string,
): Promise<boolean> {
  // The widget has no outbound push — a visitor who closed the tab cannot be
  // reached, so those leads are left for an admin to phone.
  if (channel !== 'facebook' && channel !== 'instagram') {
    return false;
  }

  const snapshot = await db.collection('chat_conversations').doc(conversationId).get();
  if (!snapshot.exists) {
    return false;
  }

  const conversation = snapshot.data() ?? {};
  const externalUserId = String(conversation.externalUserId ?? '');
  // Never nudge a thread that is with a person. `admin_active` is one they are
  // answering; `handover` is one the bot just told them a person would answer,
  // and following that with "shall we carry on with your order?" reads as the
  // shop not knowing what it told them a moment ago.
  if (!externalUserId || conversation.status === 'admin_active' || conversation.status === 'handover') {
    return false;
  }

  await sendText(token, externalUserId, NUDGE_MESSAGE);

  const now = new Date();
  const messageRef = db
    .collection('chat_conversations')
    .doc(conversationId)
    .collection('messages')
    .doc();

  await messageRef.set({
    role: 'assistant',
    content: NUDGE_MESSAGE,
    toolName: 'follow_up',
    authorName: null,
    createdAt: now,
  });

  return true;
}
