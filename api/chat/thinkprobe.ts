// TEMPORARY diagnostic — delete after use.
// Asks one model the same tiny question several ways, to find out which
// thinking-level spelling it actually honours. Returns latency and the
// thinking-token count for each; no shop data, no secrets.

/* eslint-disable @typescript-eslint/no-explicit-any */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GUARD = '7b765372c331bd4f0172faccb745981c3b43';
const PROBE_MS = 25_000;

const VARIANTS: Array<[string, Record<string, unknown>]> = [
  ['bare', {}],
  ['nested.low', { thinkingConfig: { thinkingLevel: 'low' } }],
  ['flat.low', { thinkingLevel: 'low' }],
  ['flat.minimal', { thinkingLevel: 'minimal' }],
  ['nested.minimal', { thinkingConfig: { thinkingLevel: 'minimal' } }],
  ['snake.low', { thinking_level: 'low' }],
];

async function tryVariant(
  apiKey: string,
  model: string,
  name: string,
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
      return { name, ms, http: res.status, error: String(json?.error?.message ?? '').slice(0, 200) };
    }
    const usage = json?.usageMetadata ?? {};
    return {
      name,
      ms,
      http: 200,
      thoughts: usage.thoughtsTokenCount ?? 0,
      output: usage.candidatesTokenCount ?? 0,
      prompt: usage.promptTokenCount ?? 0,
    };
  } catch (err) {
    return { name, ms: Date.now() - started, error: (err as Error).name };
  } finally {
    clearTimeout(timer);
  }
}

export const config = { maxDuration: 60 };

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

  if (req.query?.list === '1') {
    const listed = await fetch(`${API_BASE}?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
    const body: any = await listed.json().catch(() => ({}));
    res.status(200).json({
      http: listed.status,
      models: (body?.models ?? []).map((m: any) => m.name).filter((n: string) => /flash|pro/.test(n)),
    });
    return;
  }

  const results = await Promise.all(
    VARIANTS.map(([name, generationConfig]) => tryVariant(apiKey, model, name, generationConfig)),
  );
  res.status(200).json({ model, results });
}
