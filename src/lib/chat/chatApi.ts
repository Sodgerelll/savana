import { auth } from "../firebase";
import { CHAT_LIMITS, type ChatMessageRole } from "./types";

/**
 * The history import reads a year of Messenger threads before it answers, so
 * it gets its own budget — the 40s an ordinary reply is allowed would abort a
 * run that is working perfectly well. Stays under the route's own 240s cap.
 */
const HISTORY_TIMEOUT_MS = 230_000;

/** A turn as the assistant route expects it — only user/assistant reach the model. */
export interface ChatApiHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface SendAssistantMessageInput {
  message: string;
  history?: ChatApiHistoryEntry[];
  /** Ignored when `useStorefrontPrompt` is true. */
  systemPrompt?: string;
  /**
   * Build the real customer-facing prompt on the server from live catalog data.
   * The test chat sets this so an admin tries exactly what a customer gets.
   */
  useStorefrontPrompt?: boolean;
  /** Base64 without the `data:` prefix. */
  imageBase64?: string;
  imageMimeType?: string;
  model?: string;
  temperature?: number;
  /** Raise above 800 for bulk work such as generating a batch of FAQs. */
  maxOutputTokens?: number;
}

export interface AssistantReply {
  reply: string;
  latencyMs: number;
}

/**
 * Thrown for every non-2xx answer. `message` is already the Mongolian sentence
 * the server chose, so callers can surface it directly.
 */
export class ChatApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

/** Drops `admin`/`system` turns, which the model must not see as its own voice. */
export function toApiHistory(
  messages: Array<{ role: ChatMessageRole; content: string }>,
): ChatApiHistoryEntry[] {
  return messages
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .map((entry) => ({ role: entry.role as "user" | "assistant", content: entry.content }))
    .slice(-CHAT_LIMITS.MAX_HISTORY_MESSAGES);
}

async function authorizationHeader(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ChatApiError("Нэвтэрсэн байх шаардлагатай.", 401);
  }

  try {
    return `Bearer ${await currentUser.getIdToken()}`;
  } catch {
    throw new ChatApiError("Нэвтрэлт хугацаа дууссан. Дахин нэвтэрнэ үү.", 401);
  }
}

/**
 * Authenticated POST to a chat route. Aborts on the client after
 * {@link CHAT_LIMITS.REQUEST_TIMEOUT_MS} so a hung request cannot leave a form
 * disabled forever, and turns every non-2xx into a {@link ChatApiError}
 * carrying the server's own Mongolian message.
 */
async function postToChatApi(
  path: string,
  input: unknown,
  timeoutMs: number = CHAT_LIMITS.REQUEST_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const authorization = await authorizationHeader();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new ChatApiError(
      aborted ? "Хариу хэт удлаа. Дахин оролдоно уу." : "Сүлжээний алдаа гарлаа.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Хариу авч чадсангүй.";
    throw new ChatApiError(message, response.status);
  }

  return payload;
}

export async function sendAssistantMessage(
  input: SendAssistantMessageInput,
): Promise<AssistantReply> {
  const payload = await postToChatApi("/api/chat/assistant", input);

  return {
    reply: typeof payload.reply === "string" ? payload.reply : "",
    latencyMs: typeof payload.latencyMs === "number" ? payload.latencyMs : 0,
  };
}

/** Delivers an admin's reply on the channel the conversation came in on. */
export async function sendAdminReply(conversationId: string, message: string): Promise<void> {
  await postToChatApi("/api/chat/reply", { conversationId, message });
}

/** Installs the greeting and persistent menu on the connected Facebook page. */
export async function applyFacebookSetup(): Promise<string> {
  const payload = await postToChatApi("/api/chat/setup", {});
  return typeof payload.message === "string" ? payload.message : "Амжилттай.";
}

export interface HistoryImportResult {
  created: number;
  conversationsScanned: number;
  pairs: number;
  message: string;
}

/**
 * Builds FAQs out of what the page actually answered on Messenger in `year`.
 *
 * Slower than the catalog generator — it reads a year of conversations before
 * it writes anything — so callers should expect to wait rather than assume the
 * request has hung.
 */
export async function importFaqsFromHistory(year: string): Promise<HistoryImportResult> {
  const payload = await postToChatApi("/api/chat/importHistory", { year }, HISTORY_TIMEOUT_MS);

  return {
    created: typeof payload.created === "number" ? payload.created : 0,
    conversationsScanned:
      typeof payload.conversationsScanned === "number" ? payload.conversationsScanned : 0,
    pairs: typeof payload.pairs === "number" ? payload.pairs : 0,
    message: typeof payload.message === "string" ? payload.message : "Дууслаа.",
  };
}

export interface FacebookStatus {
  /** A page token is configured on the server. */
  connected: boolean;
  /** The page Meta returned for that token — null means Meta refused it. */
  pageName: string | null;
  instagram: boolean;
  comments: boolean;
}

/**
 * Reports the Facebook connection without ever handing the token to the
 * browser. The settings screen has no fields for these — they are set in the
 * deployment environment — so this read-only view is all the admin needs.
 */
export async function fetchFacebookStatus(): Promise<FacebookStatus> {
  const authorization = await authorizationHeader();
  const response = await fetch("/api/chat/setup", { headers: { Authorization: authorization } });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Төлөв авч чадсангүй.";
    throw new ChatApiError(message, response.status);
  }

  return {
    connected: payload.connected === true,
    pageName: typeof payload.pageName === "string" ? payload.pageName : null,
    instagram: payload.instagram === true,
    comments: payload.comments === true,
  };
}
