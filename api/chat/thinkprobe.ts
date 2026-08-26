// TEMPORARY diagnostic — delete after use.
// Asks one model the same tiny question several ways, one at a time, to find
// out where the time goes. No shop data, no secrets.

/* eslint-disable @typescript-eslint/no-explicit-any */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GUARD = '7b765372c331bd4f0172faccb745981c3b43';
const PROBE_MS = 40_000;

const VARIANTS: Record<string, Record<string, unknown>> = {
  bare: {},
  'nested.low': { thinkingConfig: { thinkingLevel: 'low' } },
  'nested.minimal': { thinkingConfig: { thinkingLevel: 'minimal' } },
};

async function tryOnce(
  apiKey: string,
  model: string,
  generationConfig: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say OK.' }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ms, http: res.status, error: String(json?.error?.message ?? '').slice(0, 120) };
    }
    const usage = json?.usageMetadata ?? {};
    return { ms, http: 200, thoughts: usage.thoughtsTokenCount ?? 0, output: usage.candidatesTokenCount ?? 0 };
  } catch (err) {
    return { ms: Date.now() - started, error: (err as Error).name };
  } finally {
    clearTimeout(timer);
  }
}

export const config = { maxDuration: 300 };

export default async function handler(req: any, res: any): Promise<void> {
  if (String(req.query?.key ?? '') !== GUARD) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'no api key' });
    return;
  }

  const model = String(req.query?.model ?? 'gemini-3.7-flash');
  const variant = String(req.query?.variant ?? 'nested.low');
  const n = Math.min(Number(req.query?.n ?? 3) || 3, 6);
  const generationConfig = VARIANTS[variant];
  if (!generationConfig) {
    res.status(400).json({ error: `unknown variant; try ${Object.keys(VARIANTS).join(', ')}` });
    return;
  }

  // Sequential on purpose: six at once queue against each other and the
  // numbers stop meaning anything.
  const runs: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i += 1) {
    runs.push(await tryOnce(apiKey, model, generationConfig));
  }
  res.status(200).json({ model, variant, runs });
}
