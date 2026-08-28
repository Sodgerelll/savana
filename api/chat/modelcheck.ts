// TEMPORARY diagnostic — delete after use.
// Sends the real turn — full storefront prompt, real tools — to one named
// model, several times, and reports what came back. A four-word probe is not
// enough: a model can answer that and still refuse the request the shop makes.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { buildStorefrontPrompt, loadStorefrontContext } from './_lib/buildPrompt.js';
import { getRecentPosts } from './_lib/facebook.js';
import { loadChatSettings } from './_lib/settings.js';
import { CHAT_TOOLS } from './_lib/tools.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GUARD = '26d19dd41b88599b84e021f6b2abb8543715';
const ATTEMPT_MS = 30_000;

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any): Promise<void> {
  if (String(req.query?.key ?? '') !== GUARD) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  const dbPromise = getAdminFirestore();
  if (!apiKey || !dbPromise) {
    res.status(503).json({ error: 'not configured' });
    return;
  }

  const db = await dbPromise;
  const settings = await loadChatSettings(db);
  const storefront = await loadStorefrontContext(db, new Date());
  const posts = await getRecentPosts(settings.facebook.pageAccessToken);
  const systemPrompt = buildStorefrontPrompt({ ...storefront, posts }, new Date());

  const body = {
    contents: [{ role: 'user', parts: [{ text: 'Сайн байна уу, ямар саван байна вэ?' }] }],
    system_instruction: { parts: [{ text: systemPrompt }] },
    tools: CHAT_TOOLS,
    generationConfig: {
      maxOutputTokens: 800,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  const model = String(req.query?.model ?? 'gemini-3.7-flash');
  const n = Math.min(Number(req.query?.n ?? 5) || 5, 8);

  const runs: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i += 1) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_MS);
    try {
      const graph = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const ms = Date.now() - started;
      const data: any = await graph.json().catch(() => ({}));
      if (!graph.ok) {
        runs.push({ ms, http: graph.status, error: String(data?.error?.message ?? '').slice(0, 90) });
      } else {
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        runs.push({
          ms,
          http: 200,
          parts: parts.length,
          tool: parts.find((p: any) => p?.functionCall)?.functionCall?.name ?? null,
          promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
        });
      }
    } catch (err) {
      runs.push({ ms: Date.now() - started, error: (err as Error).name });
    } finally {
      clearTimeout(timer);
    }
  }

  res.status(200).json({ model, promptChars: systemPrompt.length, runs });
}
