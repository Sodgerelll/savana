// POST /api/chat/importHistory
//
// Builds the knowledge base out of the page's own Messenger history: what
// customers actually asked, and what the shop actually answered. Admin-only,
// and it never touches the FAQs already in place — the generated entries land
// alongside them for review.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { requirePrivilegedCaller } from './_lib/auth.js';
import { callGemini, GeminiError, geminiErrorToUserMessage } from './_lib/gemini.js';
import {
  FAQ_FROM_HISTORY_INSTRUCTION,
  formatPairsForModel,
  parseFaqJson,
  scanPageHistory,
} from './_lib/history.js';
import { loadChatSettings } from './_lib/settings.js';

// Reading a year of conversations is many round trips to Graph plus one long
// model call. Fluid compute allows up to 300s; this leaves headroom.
export const config = { maxDuration: 240 };

const FAQ_COLLECTION = 'chat_faqs';
const MAX_GENERATED = 25;

/** Only years the page could plausibly have. Keeps a typo from scanning nothing. */
function parseYear(value: unknown): string | null {
  const year = String(value ?? '').trim();
  return /^20\d{2}$/.test(year) ? year : null;
}

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

  const year = parseYear(req.body?.year);
  if (!year) {
    res.status(400).json({ error: 'Он буруу байна (жишээ: 2026).' });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'Сервер тохируулагдаагүй байна.' });
    return;
  }

  try {
    const db = await dbPromise;
    const settings = await loadChatSettings(db);
    const token = settings.facebook.pageAccessToken;

    if (!token) {
      res.status(409).json({ error: 'Facebook холбогдоогүй байна. FB_PAGE_ACCESS_TOKEN тохируулна уу.' });
      return;
    }

    const scan = await scanPageHistory(token, {
      year,
      maxConversations: Number(req.body?.maxConversations) || undefined,
    });

    if (scan.pairs.length === 0) {
      res.status(200).json({
        ok: true,
        created: 0,
        ...scan,
        pairs: 0,
        message: `${year} онд боловсруулах асуулт-хариулт олдсонгүй (${scan.conversationsScanned} яриа шалгасан).`,
      });
      return;
    }

    const reply = await callGemini({
      systemPrompt: FAQ_FROM_HISTORY_INSTRUCTION,
      message: formatPairsForModel(scan.pairs),
      // The transcript is long and the answer is a list, so both ends need room.
      maxOutputTokens: 4000,
      temperature: 0.3,
    });

    const generated = parseFaqJson(reply).slice(0, MAX_GENERATED);

    if (generated.length === 0) {
      res.status(502).json({ error: 'Загвар FAQ гаргаж чадсангүй. Дахин оролдоно уу.' });
      return;
    }

    // Appended after whatever is already there, so an import never reorders or
    // overwrites FAQs an admin wrote by hand.
    const existing = await db.collection(FAQ_COLLECTION).get();
    const startOrder = existing.size;
    const now = new Date().toISOString();

    const batch = db.batch();
    generated.forEach((faq, index) => {
      batch.set(db.collection(FAQ_COLLECTION).doc(), {
        question: faq.question,
        answer: faq.answer,
        topic: faq.topic || `Messenger ${year}`,
        order: startOrder + index,
        // Off until a human has read them: these are drawn from real replies
        // and a stale price in an old answer must not reach a customer unseen.
        isActive: false,
        source: `messenger:${year}`,
        createdAt: now,
        updatedAt: now,
      });
    });
    await batch.commit();

    res.status(200).json({
      ok: true,
      created: generated.length,
      conversationsScanned: scan.conversationsScanned,
      messagesInYear: scan.messagesInYear,
      pairs: scan.pairs.length,
      message:
        `${scan.conversationsScanned} яриа шалгаж, ${year} оны ${scan.pairs.length} асуулт-хариултаас ` +
        `${generated.length} FAQ үүсгэлээ. Бүгд УНТРААЛТТАЙ — уншаад асаана уу.`,
    });
  } catch (err) {
    const detail = (err as Error).message;
    console.error('[chat/importHistory] failed:', detail);
    // A Graph refusal ("requires pages_read_engagement") is the one message an
    // admin can actually act on, so it is passed through rather than flattened
    // into the generic Gemini wording.
    res
      .status(502)
      .json({ error: err instanceof GeminiError ? geminiErrorToUserMessage(err) : detail });
  }
}
