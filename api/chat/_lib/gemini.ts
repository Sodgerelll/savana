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
const DEFAULT_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest'];

// Models the caller is allowed to request explicitly (admin model picker). An
// unknown value is ignored rather than rejected so a stale saved setting cannot
// break the assistant.
const ALLOWED_REQUESTED = [
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
];

const TIMEOUT_MS = 25_000;
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
}

/** Either the model answered in prose, or it decided to call one of the tools. */
export interface GeminiAgentResult {
  text: string | null;
  functionCall: GeminiFunctionCall | null;
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
    generationConfig: {
      temperature: clampTemperature(options.temperature),
      maxOutputTokens: clampMaxOutputTokens(options.maxOutputTokens),
      topP: 0.9,
      // Thinking off: replies stay short, fast and cheap, and long thinking
      // budgets were the main cause of truncated answers on gemini-2.5+.
      thinkingConfig: { thinkingBudget: 0 },
    },
    safetySettings: SAFETY_SETTINGS,
  };

  if (options.systemPrompt) {
    body.system_instruction = { parts: [{ text: options.systemPrompt }] };
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  return body;
}

async function postToModel(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: any } | { ok: false; status: number | null; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
      return { ok: false, status: res.status, message: `Gemini ${model} ${res.status}` };
    }

    return { ok: true, data: await res.json() };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: null,
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
): Promise<any[]> {
  let lastError = new GeminiError('Gemini API дуудлага амжилтгүй');

  for (const model of resolveModelChain(requestedModel)) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const result = await postToModel(apiKey, model, body);

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
  const parts = await generateParts(apiKey, body, options.model);
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
  const parts = await generateParts(apiKey, body, options.model);

  const call = parts.find((entry) => entry?.functionCall)?.functionCall;
  if (call && typeof call.name === 'string') {
    return {
      functionCall: { name: call.name, args: (call.args ?? {}) as Record<string, unknown> },
      text: null,
    };
  }

  const text = firstText(parts);
  return { functionCall: null, text: text ? text.slice(0, REPLY_CHAR_CAP) : null };
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
