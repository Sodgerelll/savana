// POST /api/chat/reply
//
// An admin replying from the panel. The message is delivered on whichever
// channel the conversation came in on, then recorded with `role: "admin"` so
// the transcript shows a human answered — and so the bot never replays those
// words as its own.
//
// Sending also flips the conversation to `admin_active`, which silences the bot
// on that thread until an admin hands it back — which is what `handBack` does,
// and the only way back: chat_conversations is not writable from the browser.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { requirePrivilegedCaller } from './_lib/auth.js';
import { appendMessage, setConversationStatus } from './_lib/conversation.js';
import { sendText } from './_lib/facebook.js';
import { loadChatSettings } from './_lib/settings.js';

export const config = { maxDuration: 30 };

const MAX_REPLY_LENGTH = 2000;

/**
 * Meta requires a message tag to write outside the 24-hour window, and a human
 * answering a customer enquiry is exactly what HUMAN_AGENT covers. It is passed
 * as a fallback rather than as the send: the tag needs a permission granted
 * only by App Review, while almost every admin reply happens minutes after the
 * customer wrote and needs no tag at all.
 */
const HUMAN_AGENT_TAG = 'HUMAN_AGENT';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authorization = await requirePrivilegedCaller(req);
  if (!authorization.ok) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const conversationId = String(body.conversationId ?? '').trim();
  const message = String(body.message ?? '').trim();
  /** Returns the thread to the bot instead of sending anything. */
  const handBack = body.handBack === true;

  if (!conversationId) {
    res.status(400).json({ error: 'conversationId шаардлагатай.' });
    return;
  }
  if (!handBack && !message) {
    res.status(400).json({ error: 'Мессеж хоосон байна.' });
    return;
  }
  if (message.length > MAX_REPLY_LENGTH) {
    res.status(400).json({ error: `Мессеж ${MAX_REPLY_LENGTH} тэмдэгтээс хэтрэх ёсгүй.` });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'Сервер тохируулагдаагүй байна.' });
    return;
  }

  try {
    const db = await dbPromise;
    const snapshot = await db.collection('chat_conversations').doc(conversationId).get();

    if (!snapshot.exists) {
      res.status(404).json({ error: 'Яриа олдсонгүй.' });
      return;
    }

    const conversation = snapshot.data() ?? {};
    const channel = String(conversation.channel ?? 'facebook');
    const externalUserId = String(conversation.externalUserId ?? '');

    if (handBack) {
      // 'active' also clears the handover reason and timestamp, so the thread
      // reads as an ordinary bot conversation again rather than a stale escalation.
      await setConversationStatus(db, conversationId, 'active');
      res.status(200).json({ ok: true, status: 'active' });
      return;
    }

    if (channel === 'facebook' || channel === 'instagram') {
      if (!externalUserId) {
        res.status(409).json({ error: 'Энэ ярианд хүлээн авагчийн ID байхгүй байна.' });
        return;
      }

      const settings = await loadChatSettings(db);
      if (!settings.facebook.pageAccessToken) {
        res.status(409).json({ error: 'Facebook Page Access Token тохируулаагүй байна.' });
        return;
      }

      await sendText(settings.facebook.pageAccessToken, externalUserId, message, {
        fallbackTag: HUMAN_AGENT_TAG,
      });
    }

    // Recorded only after delivery succeeded, so the transcript never shows a
    // reply the customer did not receive.
    await appendMessage(db, conversationId, {
      role: 'admin',
      content: message,
      authorName: authorization.caller.displayName ?? authorization.caller.email ?? 'Админ',
    });

    await setConversationStatus(db, conversationId, 'admin_active');

    res.status(200).json({ ok: true });
  } catch (err) {
    // Facebook's own wording reaches the admin: "could not send" alone gave
    // nobody anything to act on, and this endpoint is already admin-only.
    const detail = (err as Error).message;
    console.error('[chat/reply] failed:', detail);
    res.status(502).json({ error: detail || 'Мессеж илгээж чадсангүй. Дахин оролдоно уу.' });
  }
}
