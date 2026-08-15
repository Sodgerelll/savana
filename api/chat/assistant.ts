// POST /api/chat/assistant
//
// Backs every admin-side AI feature: the test chat, "polish this text", bulk FAQ
// generation, and describing an uploaded product photo. Admin-only — the public
// storefront widget has its own, far more restricted route.
//
// Required env vars: GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { requirePrivilegedCaller } from './_lib/auth.js';
import { buildStorefrontPrompt, loadStorefrontContext } from './_lib/buildPrompt.js';
import {
  callGemini,
  geminiErrorToUserMessage,
  type GeminiMessage,
  type GeminiRole,
} from './_lib/gemini.js';

// Gemini itself gives up at 25s; leave headroom for auth and cold start.
export const config = { maxDuration: 60 };

const MAX_MESSAGE_LENGTH = 4000;
const MAX_SYSTEM_PROMPT_LENGTH = 20_000;
const MAX_HISTORY_ENTRIES = 40;
/** ~4 MB base64 — Vercel rejects request bodies over 4.5 MB anyway. */
const MAX_IMAGE_BASE64_LENGTH = 4_000_000;
const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic'];

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Keeps only well-formed {role, content} pairs, newest-last, capped in length. */
function sanitizeHistory(value: unknown): GeminiMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(-MAX_HISTORY_ENTRIES)
    .map((entry) => {
      const role: GeminiRole = (entry as any)?.role === 'assistant' ? 'assistant' : 'user';
      const content = asString((entry as any)?.content).slice(0, MAX_MESSAGE_LENGTH);
      return { role, content };
    })
    .filter((entry) => entry.content.length > 0);
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

  const body = (req.body ?? {}) as Record<string, unknown>;
  const message = asString(body.message).trim();
  const imageBase64 = asString(body.imageBase64);
  const imageMimeType = asString(body.imageMimeType);
  const hasImage = imageBase64.length > 0 && imageMimeType.length > 0;

  if (!hasImage && message.length === 0) {
    res.status(400).json({ error: 'Мессеж эсвэл зураг шаардлагатай.' });
    return;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Мессеж ${MAX_MESSAGE_LENGTH} тэмдэгтээс хэтрэх ёсгүй.` });
    return;
  }
  if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    res.status(413).json({ error: 'Зураг хэт том байна.' });
    return;
  }
  // Reject rather than silently drop: an admin who attached a photo should be
  // told it was not used, not left wondering why the answer ignored it.
  if (imageBase64.length > 0 && !ALLOWED_IMAGE_MIME_TYPES.includes(imageMimeType)) {
    res.status(400).json({
      error: imageMimeType
        ? 'Зөвшөөрөгдөөгүй зургийн формат.'
        : 'Зургийн формат (mimeType) заагаагүй байна.',
    });
    return;
  }

  const startedAt = Date.now();

  // The test chat asks for the real prompt so an admin is trying exactly what a
  // customer will get. Other callers (AI polish, FAQ generation) pass their own
  // narrow prompt instead and never want the catalog attached.
  let systemPrompt = asString(body.systemPrompt).slice(0, MAX_SYSTEM_PROMPT_LENGTH);
  if (body.useStorefrontPrompt === true) {
    const dbPromise = getAdminFirestore();
    if (!dbPromise) {
      res.status(503).json({ error: 'Сервер тохируулагдаагүй байна.' });
      return;
    }
    try {
      const context = await loadStorefrontContext(await dbPromise, new Date());
      systemPrompt = buildStorefrontPrompt(context, new Date());
    } catch (err) {
      console.error('[chat/assistant] prompt build failed:', (err as Error).message);
      res.status(503).json({ error: 'Каталогийг уншиж чадсангүй. Дахин оролдоно уу.' });
      return;
    }
  }

  try {
    const reply = await callGemini({
      systemPrompt,
      history: sanitizeHistory(body.history),
      message,
      imageBase64: hasImage ? imageBase64 : undefined,
      imageMimeType: hasImage ? imageMimeType : undefined,
      model: asString(body.model) || undefined,
      temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
      maxOutputTokens: typeof body.maxOutputTokens === 'number' ? body.maxOutputTokens : undefined,
    });

    res.status(200).json({ reply, latencyMs: Date.now() - startedAt });
  } catch (err) {
    // The provider message can carry request detail, so it is logged but never
    // returned; the caller gets a translated, provider-agnostic sentence.
    console.error('[chat/assistant] generation failed:', (err as Error).message);
    res.status(502).json({ error: geminiErrorToUserMessage(err) });
  }
}
