// Gemini client for the SAVANA AI assistant — runs server-side in Vercel
// serverless functions only. Never import this from src/; GEMINI_API_KEY must
// not reach the browser bundle.
//
// Required environment variables (set in the Vercel dashboard, never commit):
//   GEMINI_API_KEY   — from https://aistudio.google.com/app/apikey
//   GEMINI_MODELS    — (optional) comma-separated fallback chain override

/* eslint-disable @typescript-eslint/no-explicit-any */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Fallback chain — a 4xx/5xx from one model moves on to the next. Ordered
// cheapest-and-fastest first; every entry must support function calling because
// the assistant drives carousels and handover through tools.
//
// Every entry is an explicit version rather than a moving alias such as
// `gemini-flash-latest`: Gemini 3 changed the request format (see
// `configForModel`), so the body has to be shaped for the generation it is
// going to, and an alias does not say which generation that is.
//
// No 2.5 anywhere. Those models answer 404 to keys issued after their
// deprecation, so a chain that fell back to them fell back to nothing — and a
// freshly issued key is exactly the case where the old fallback was already
// dead on arrival.
const DEFAULT_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash'];

// Models the caller is allowed to request explicitly (admin model picker). An
// unknown value is ignored rather than rejected so a stale saved setting cannot
// break the assistant — which is also what stops a settings document still
// naming "gemini-2.5-flash" from pinning the bot to a model it cannot reach.
const ALLOWED_REQUESTED = ['gemini-3.7-flash', 'gemini-3.6-flash'];

const TIMEOUT_MS = 25_000;

/**
 * How long the whole chain may take, retries and fallbacks included.
 *
 * Two models, two attempts each, twenty-five seconds apiece is a hundred
 * seconds — and the function it runs in is cut off at sixty, so the slow path
 * did not fail slowly, it failed with nothing at all. The budget is what keeps
 * the arithmetic honest: attempts get whatever is left, and once too little is
 * left to be worth starting, the last error is reported instead.
 */
const TOTAL_BUDGET_MS = 40_000;

/** Below this there is not enough time left for a call to be worth starting. */
const MIN_ATTEMPT_MS = 5_000;
const MAX_ATTEMPTS_PER_MODEL = 2;
const RETRY_BACKOFF_MS = 400;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;
const MAX_OUTPUT_TOKENS_CEILING = 4000;
/** Reply hard-cap in characters. Raised for bulk generation (FAQ import) only. */
const REPLY_CHAR_CAP = 2000;
const REPLY_CHAR_CAP_BULK = 12_000;
const MAX_HISTORY_TURNS = 20;

// BLOCK_ONLY_HIGH rather than the stricter defaults: this is a soap shop, and
// the default thresholds flag ordinary Mongolian skincare wording (irritation,
// wounds, "устгах") often enough to swallow legitimate replies.
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
];

export type GeminiRole = 'user' | 'assistant';

export interface GeminiMessage {
  role: GeminiRole;
  content: string;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiCallOptions {
  systemPrompt?: string;
  history?: GeminiMessage[];
  message: string;
  /** Base64 image payload for vision turns (admin "describe this photo" flows). */
  imageBase64?: string;
  imageMimeType?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tools?: GeminiTool[];
  /**
   * A cachedContents handle covering the system prompt and tools. Applied
   * only to the model it was built for — a cache is tied to one model — and
   * dropped silently the moment the API stops honouring it.
   */
  cache?: { name: string; model: string } | null;
  /** Called when the API rejects the handle, so the caller can rebuild it. */
  onCacheRejected?: () => void;
  /**
   * Names the one tool the model is allowed to call this turn.
   *
   * Choosing between two ordered steps turned out to be something the model
   * does most of the time, and "most of the time" is a customer repeating their
   * name, phone and address to a bot that keeps asking again. Where the
   * conversation itself already says which step is next, the caller decides and
   * leaves the model the part it is reliable at: reading the details out of the
   * sentence.
   */
  forceTool?: string;
}

/** Either the model answered in prose, or it decided to call one of the tools. */
export interface GeminiAgentResult {
  text: string | null;
  /** First call, kept for callers that only ever act on one. */
  functionCall: GeminiFunctionCall | null;
  /**
   * Every call the model made this turn, in order.
   *
   * "Хоёр саван, нэг шампунь авъя" is one message and two products. Reading
   * only the first call recorded the soap and dropped the shampoo without
   * telling anybody, which is a wrong order rather than a missing feature.
   */
  functionCalls: GeminiFunctionCall[];
}

/**
 * Thrown when every model in the chain failed. `message` is safe to log — it
 * never carries the API key, because the key travels in a header and request
 * URLs are never interpolated into error text.
 */
export class GeminiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveModelChain(requested?: string): string[] {
  const configured = (process.env.GEMINI_MODELS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const base = configured.length > 0 ? configured : DEFAULT_MODELS;

  if (requested && ALLOWED_REQUESTED.includes(requested)) {
    return [requested, ...base.filter((model) => model !== requested)];
  }

  return base;
}

function clampTemperature(value: unknown): number {
  return typeof value === 'number' && value >= 0 && value <= 2 ? value : 0.7;
}

function clampMaxOutputTokens(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= DEFAULT_MAX_OUTPUT_TOKENS) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }
  return Math.min(Math.floor(value), MAX_OUTPUT_TOKENS_CEILING);
}

function buildRequestBody(options: GeminiCallOptions): Record<string, unknown> {
  const userParts: Array<Record<string, unknown>> = [];
  if (options.imageBase64 && options.imageMimeType) {
    userParts.push({ inline_data: { mime_type: options.imageMimeType, data: options.imageBase64 } });
  }
  // Always end on a text part: an image sent with no caption still needs an
  // instruction, otherwise the model has nothing to act on.
  userParts.push({ text: options.message || 'Энэ юу вэ?' });

  const history = Array.isArray(options.history) ? options.history : [];
  const contents = [
    ...history
      .filter((entry) => entry && typeof entry.content === 'string' && entry.content.length > 0)
      .slice(-MAX_HISTORY_TURNS)
      .map((entry) => ({
        role: entry.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: entry.content }],
      })),
    { role: 'user', parts: userParts },
  ];

  const body: Record<string, unknown> = {
    contents,
    // Generation-neutral. The per-model half is filled in by `configForModel`
    // once the chain has picked which model the request is actually going to.
    generationConfig: {
      maxOutputTokens: clampMaxOutputTokens(options.maxOutputTokens),
      temperature: clampTemperature(options.temperature),
    },
    safetySettings: SAFETY_SETTINGS,
  };

  if (options.systemPrompt) {
    body.system_instruction = { parts: [{ text: options.systemPrompt }] };
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }
  if (options.forceTool) {
    body.tool_config = {
      function_calling_config: { mode: 'ANY', allowed_function_names: [options.forceTool] },
    };
  }

  return body;
}

/** Gemini 3 and later. The `.` in `gemini-3.7-flash` is part of the version. */
function isGemini3OrLater(model: string): boolean {
  const generation = /^gemini-(\d+)/.exec(model);
  return generation ? Number(generation[1]) >= 3 : false;
}

/**
 * Shapes the request for the generation it is being sent to.
 *
 * Gemini 3 dropped `temperature`/`topP`/`topK` and replaced the numeric
 * thinking budget with a three-step level, so one body cannot serve both: sent
 * as-is, a 2.5-shaped request is rejected by 3.x and the chain silently falls
 * back to an older model. `low` is the level here for the same reason thinking
 * used to be off — a shop assistant wants short, quick answers, and a long
 * deliberation was what truncated replies on 2.5.
 */
function configForModel(body: Record<string, unknown>, model: string): Record<string, unknown> {
  const generationConfig = { ...((body.generationConfig ?? {}) as Record<string, unknown>) };

  if (isGemini3OrLater(model)) {
    delete generationConfig.temperature;
    delete generationConfig.topP;
    delete generationConfig.topK;
    // Still inside thinkingConfig — only the field within it changed. Putting
    // thinkingLevel directly on generationConfig is a 400, not an ignored field.
    // 'minimal' is rejected by 3.7; 'low' is as short as the model will go.
    generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  } else {
    generationConfig.topP = 0.9;
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  return { ...body, generationConfig };
}

/**
 * Replaces the system prompt and tools with the cache handle that already
 * holds them. A cache belongs to exactly one model, so a request going to a
 * fallback model keeps the full prompt — the alternative is a 400 from every
 * model after the first.
 */
function applyCache(
  body: Record<string, unknown>,
  model: string,
  cache: { name: string; model: string } | null | undefined,
): Record<string, unknown> {
  if (!cache || cache.model !== model) {
    return body;
  }

  // Both now live inside the cache; sending them alongside it is an error.
  const { system_instruction: _prompt, tools: _tools, ...rest } = body;
  return { ...rest, cachedContent: cache.name };
}

/** A handle the API no longer honours — expired, deleted, or from another key. */
function looksLikeCacheRejection(message: string): boolean {
  return /cachedcontent|cached_content|cache/i.test(message);
}

async function postToModel(
  apiKey: string,
  model: string,
  requestBody: Record<string, unknown>,
  timeoutMs = TIMEOUT_MS,
): Promise<
  { ok: true; data: any } | { ok: false; status: number | null; timedOut?: boolean; message: string }
> {
  const body = configForModel(requestBody, model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        // Header rather than a ?key= query param so the key can never leak
        // through an error that echoes the request URL.
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // The status alone does not say whether the model is gone, the key is
      // unauthorised, or a field in the body is wrong — and those need very
      // different fixes. Google puts the reason in the body, so it goes in the
      // message; the key is never echoed there.
      const detail = await res
        .json()
        .then((body: any) => body?.error?.message ?? '')
        .catch(() => '');

      return {
        ok: false,
        status: res.status,
        timedOut: false,
        message: `Gemini ${model} ${res.status}${detail ? `: ${detail}` : ''}`,
      };
    }

    return { ok: true, data: await res.json() };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: null,
      timedOut: aborted,
      message: aborted ? `Gemini ${model} timed out` : `Gemini ${model} request failed`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walks the model fallback chain and returns the winning candidate's parts.
 * A non-OK status moves straight to the next model — a deterministic 400 on one
 * model (typically a tools/thinking combination it does not support) must not
 * take down the whole chain. Transport failures retry once on the same model
 * first, since those are usually transient.
 */
async function generateParts(
  apiKey: string,
  body: Record<string, unknown>,
  requestedModel?: string,
  cache?: { name: string; model: string } | null,
  onCacheRejected?: () => void,
): Promise<any[]> {
  let lastError = new GeminiError('Gemini API дуудлага амжилтгүй');
  // Cleared the first time the API refuses the handle, so the rest of the
  // chain — and the retry on this very model — carries the full prompt.
  let liveCache = cache;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (const model of resolveModelChain(requestedModel)) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) {
        console.warn('[chat/gemini] out of time; reporting the last error rather than trying again');
        throw lastError;
      }

      const usedCache = Boolean(liveCache && liveCache.model === model);
      const result = await postToModel(
        apiKey,
        model,
        applyCache(body, model, liveCache),
        Math.min(TIMEOUT_MS, remaining),
      );

      // A rejected handle is not a broken model. Drop it and let the retry
      // below go out at full price rather than failing the customer's turn.
      if (!result.ok && usedCache && looksLikeCacheRejection(result.message)) {
        console.warn(`[chat/gemini] cache rejected, falling back: ${result.message}`);
        liveCache = null;
        onCacheRejected?.();
        continue;
      }

      if (result.ok) {
        const candidate = result.data?.candidates?.[0];
        const parts = candidate?.content?.parts;
        if (Array.isArray(parts) && parts.length > 0) {
          return parts;
        }

        // No parts: either the prompt/response tripped a safety filter or the
        // answer ran past the token budget. Both are terminal for this turn —
        // another model would reach the same verdict, so surface it as-is.
        const blockReason = result.data?.promptFeedback?.blockReason;
        const finishReason = candidate?.finishReason;
        if (blockReason || finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
          throw new GeminiError('BLOCKED');
        }
        if (finishReason === 'MAX_TOKENS') {
          throw new GeminiError('MAX_TOKENS');
        }

        lastError = new GeminiError(`Gemini ${model} returned no content`);
        break;
      }

      lastError = new GeminiError(result.message, result.status);

      // An HTTP-level rejection is deterministic for this model — move on.
      // Only transport errors (status null) are worth retrying in place.
      if (result.status !== null) {
        break;
      }

      // A model that did not answer in twenty-five seconds is unlikely to
      // answer in the next twenty-five, and the budget only stretches to two
      // attempts — so retrying in place spent the whole allowance on one model
      // and the fallback never got asked at all. A timeout moves on; a dropped
      // connection is still worth one more go on the same model.
      if (result.timedOut) {
        break;
      }
      if (attempt < MAX_ATTEMPTS_PER_MODEL - 1) {
        await sleep(RETRY_BACKOFF_MS * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function readApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError('GEMINI_API_KEY тохируулагдаагүй');
  }
  return apiKey;
}

function firstText(parts: any[]): string | null {
  const part = parts.find((entry) => typeof entry?.text === 'string' && entry.text.length > 0);
  return part ? String(part.text) : null;
}

/**
 * Plain-text completion. Used by the admin assistant (test chat, AI polish,
 * FAQ generation) and by comment auto-replies, which never call tools.
 */
export async function callGemini(options: GeminiCallOptions): Promise<string> {
  const apiKey = readApiKey();
  const body = buildRequestBody(options);
  const parts = await generateParts(apiKey, body, options.model, options.cache, options.onCacheRejected);
  const text = firstText(parts);

  if (!text) {
    throw new GeminiError('Хариу олдсонгүй');
  }

  const cap = clampMaxOutputTokens(options.maxOutputTokens) > DEFAULT_MAX_OUTPUT_TOKENS
    ? REPLY_CHAR_CAP_BULK
    : REPLY_CHAR_CAP;
  return text.slice(0, cap);
}

/**
 * Agent turn: given `tools`, the model decides for itself whether to answer in
 * prose or to invoke a tool (show products, start an order, hand over to a
 * human). Exactly one of `text` / `functionCall` is non-null.
 */
export async function callGeminiAgent(options: GeminiCallOptions): Promise<GeminiAgentResult> {
  const apiKey = readApiKey();
  const body = buildRequestBody(options);
  const parts = await generateParts(apiKey, body, options.model, options.cache, options.onCacheRejected);

  const calls = parts
    .map((entry) => entry?.functionCall)
    .filter((call): call is { name: string; args?: unknown } => Boolean(call) && typeof call.name === 'string')
    .map((call) => ({ name: call.name, args: (call.args ?? {}) as Record<string, unknown> }));

  if (calls.length > 0) {
    return { functionCall: calls[0], functionCalls: calls, text: null };
  }

  const text = firstText(parts);
  return { functionCall: null, functionCalls: [], text: text ? text.slice(0, REPLY_CHAR_CAP) : null };
}

/**
 * Maps a GeminiError onto the Mongolian sentence the end user should see.
 * Keeps provider wording out of the chat transcript.
 */
export function geminiErrorToUserMessage(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.message === 'BLOCKED') {
      return 'Энэ хүсэлтэд хариулах боломжгүй байна.';
    }
    if (err.message === 'MAX_TOKENS') {
      return 'Хариулт хэт урт боллоо. Асуултаа богиносгож дахин оролдоно уу.';
    }
    if (err.status === 429) {
      return 'Хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу.';
    }
  }
  return 'Хариу авч чадсангүй. Дахин оролдоно уу.';
}

/**
 * The model a request will actually be sent to first.
 *
 * A context cache belongs to one model, so the caller has to build it for the
 * head of the chain rather than guessing at the default.
 */
/**
 * Whether a reply is really a piece of our own instructions, read back.
 *
 * A model asked not to reveal its instructions will still occasionally emit one
 * — the reply that prompted this was a verbatim fragment of a tool description,
 * sent to a customer in the middle of placing an order. The shop's rule is that
 * internal material never reaches a customer, and a rule that depends only on
 * the model obeying it is not a rule. Verbatim echoes are what happens in
 * practice and are what this catches; a paraphrase would still get through.
 *
 * Short replies are exempt: "Тийм ээ" appears inside any long prompt by chance,
 * and refusing those would break ordinary answers to catch nothing.
 */
export function looksLikeOurOwnInstructions(reply: string, sources: string[]): boolean {
  const needle = normaliseForLeakCheck(reply);
  if (needle.length < 25) {
    return false;
  }
  return sources.some((source) => normaliseForLeakCheck(source).includes(needle));
}

function normaliseForLeakCheck(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function primaryModel(requested?: string): string {
  return resolveModelChain(requested)[0];
}
