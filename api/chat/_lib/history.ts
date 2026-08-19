// Reads the page's own Messenger history and turns it into FAQ material.
//
// The shop answered these questions for real, in its own words, before the bot
// existed. That is a better knowledge base than anything invented from the
// catalog: it carries the questions customers actually ask and the phrasing the
// shop actually uses.

/* eslint-disable @typescript-eslint/no-explicit-any */

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const REQUEST_TIMEOUT_MS = 20_000;

/** Graph pages at 25 conversations by default; asking for more costs nothing. */
const CONVERSATIONS_PER_PAGE = 50;
const MESSAGES_PER_CONVERSATION = 100;

/** Anything shorter is a greeting, an emoji or a "za" — not a question. */
const MIN_QUESTION_LENGTH = 8;
const MIN_ANSWER_LENGTH = 12;

/** Long enough to be a real reply, short enough not to be a pasted essay. */
const MAX_ANSWER_LENGTH = 600;

export interface HistoryMessage {
  /** True when the shop wrote it, false when the customer did. */
  fromPage: boolean;
  text: string;
  createdAt: string;
}

export interface QaPair {
  question: string;
  answer: string;
}

export interface HistoryScan {
  conversationsScanned: number;
  messagesInYear: number;
  pairs: QaPair[];
}

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function graphGet(token: string, url: string): Promise<any> {
  const { signal, done } = withTimeout();

  try {
    const res = await fetch(url, {
      // Header rather than ?access_token= so the token cannot end up in a log
      // line that echoes the request URL.
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(String(detail));
    }

    return data;
  } finally {
    done();
  }
}

/** The page's own id, so a message can be attributed to shop or customer. */
export async function fetchPageId(token: string): Promise<string> {
  const data = await graphGet(token, `${GRAPH_URL}/me?fields=id`);
  const id = data?.id;

  if (!id) {
    throw new Error('Хуудасны ID-г тодорхойлж чадсангүй.');
  }

  return String(id);
}

/**
 * Normalises one conversation's messages into chronological order.
 *
 * Graph returns messages newest-first, which pairs a question with the answer
 * that came *before* it — so the order is reversed here rather than trusted.
 */
export function normaliseMessages(raw: any, pageId: string): HistoryMessage[] {
  const entries = Array.isArray(raw?.data) ? raw.data : [];

  return entries
    .map((entry: any) => ({
      fromPage: String(entry?.from?.id ?? '') === pageId,
      text: typeof entry?.message === 'string' ? entry.message.trim() : '',
      createdAt: typeof entry?.created_time === 'string' ? entry.created_time : '',
    }))
    .filter((message: HistoryMessage) => message.text.length > 0 && message.createdAt.length > 0)
    .sort((a: HistoryMessage, b: HistoryMessage) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Pairs each customer question with the reply the shop actually sent.
 *
 * A customer usually writes several lines before anyone answers, so the pair
 * keeps the *last* thing they said before the reply — that is the message the
 * answer is responding to. Consecutive replies are joined, because shops split
 * one thought across two or three bubbles.
 */
export function extractPairs(messages: HistoryMessage[], year: string): QaPair[] {
  const pairs: QaPair[] = [];
  let pendingQuestion = '';

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];

    if (!message.fromPage) {
      pendingQuestion = message.text;
      continue;
    }

    if (!pendingQuestion) {
      continue;
    }

    const answerParts: string[] = [];
    let cursor = index;
    while (cursor < messages.length && messages[cursor].fromPage) {
      answerParts.push(messages[cursor].text);
      cursor++;
    }
    index = cursor - 1;

    // Dated by the answer: that is when the shop committed to this wording, and
    // it is the side whose accuracy matters if prices or policies have moved.
    const answeredIn = messages[cursor - 1].createdAt.slice(0, 4);
    const answer = answerParts.join(' ').replace(/\s+/g, ' ').trim();

    if (
      answeredIn === year &&
      pendingQuestion.length >= MIN_QUESTION_LENGTH &&
      answer.length >= MIN_ANSWER_LENGTH &&
      answer.length <= MAX_ANSWER_LENGTH
    ) {
      pairs.push({ question: pendingQuestion, answer });
    }

    pendingQuestion = '';
  }

  return pairs;
}

/** Collapses case, punctuation and spacing so near-identical asks count once. */
function questionKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drops repeats, keeping the first of each question.
 *
 * "Хүргэлт хэд вэ?" arrives hundreds of times; sending every copy to the model
 * would blow the context window and bias the output towards whatever gets asked
 * most, rather than covering the range of things people ask.
 */
export function dedupePairs(pairs: QaPair[]): QaPair[] {
  const seen = new Set<string>();
  const unique: QaPair[] = [];

  for (const pair of pairs) {
    const key = questionKey(pair.question);
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(pair);
  }

  return unique;
}

/** One thread, as the conversations listing describes it before its contents. */
interface ThreadRef {
  id: string;
  /** The customer's page-scoped id — the handle a per-thread read needs. */
  psid: string;
}

/**
 * The page's threads, with the customer id on each.
 *
 * Deliberately asks for `participants` and nothing else. Requesting message
 * contents here turns the call into a mailbox read, which Meta answers with
 * `(#298) read_mailbox` — a permission that no longer exists to be granted.
 */
async function listThreads(
  token: string,
  pageId: string,
  limit: number,
): Promise<ThreadRef[]> {
  let url =
    `${GRAPH_URL}/${pageId}/conversations` +
    `?platform=messenger&limit=${CONVERSATIONS_PER_PAGE}&fields=participants`;

  const threads: ThreadRef[] = [];

  while (url && threads.length < limit) {
    const page = await graphGet(token, url);

    for (const conversation of Array.isArray(page?.data) ? page.data : []) {
      if (threads.length >= limit) break;

      const participants = conversation?.participants?.data;
      const customer = (Array.isArray(participants) ? participants : []).find(
        (person: any) => String(person?.id ?? '') !== pageId,
      );

      if (customer?.id) {
        threads.push({ id: String(conversation.id ?? ''), psid: String(customer.id) });
      }
    }

    url = typeof page?.paging?.next === 'string' ? page.paging.next : '';
  }

  return threads;
}

/**
 * One thread's messages, addressed by the customer rather than by browsing.
 *
 * Reading the whole mailbox is refused; reading the conversation with a named
 * person is not. Same endpoint, same permissions — the `user_id` filter is what
 * makes the difference.
 */
async function readThread(
  token: string,
  pageId: string,
  psid: string,
): Promise<any> {
  const url =
    `${GRAPH_URL}/${pageId}/conversations` +
    `?platform=messenger&user_id=${encodeURIComponent(psid)}` +
    `&fields=messages.limit(${MESSAGES_PER_CONVERSATION})%7Bmessage%2Cfrom%2Ccreated_time%7D`;

  const page = await graphGet(token, url);
  const conversation = Array.isArray(page?.data) ? page.data[0] : null;
  return conversation?.messages ?? null;
}

/**
 * Walks the page's conversations and collects the year's question/answer pairs.
 *
 * Two passes on purpose: list the threads without their contents, then fetch
 * each one by customer id. Asking for contents in the listing is a mailbox read
 * and is refused outright.
 *
 * `maxConversations` bounds the work — a busy page has thousands of threads and
 * the route has to answer inside its timeout. A thread that fails is skipped
 * rather than taking the whole import down with it.
 */
export async function scanPageHistory(
  token: string,
  options: { year: string; maxConversations?: number },
): Promise<HistoryScan> {
  const pageId = await fetchPageId(token);
  const limit = options.maxConversations ?? 200;
  const threads = await listThreads(token, pageId, limit);

  let conversationsScanned = 0;
  let messagesInYear = 0;
  const pairs: QaPair[] = [];

  for (const thread of threads) {
    conversationsScanned++;

    let raw: any;
    try {
      raw = await readThread(token, pageId, thread.psid);
    } catch (err) {
      console.warn(`[chat/history] thread ${thread.id} unreadable:`, (err as Error).message);
      continue;
    }

    const messages = normaliseMessages(raw, pageId);
    messagesInYear += messages.filter((m) => m.createdAt.startsWith(options.year)).length;
    pairs.push(...extractPairs(messages, options.year));
  }

  return { conversationsScanned, messagesInYear, pairs: dedupePairs(pairs) };
}

export const FAQ_FROM_HISTORY_INSTRUCTION = `Доор SAVANA дэлгүүрийн Messenger дээрх ЖИНХЭНЭ асуулт-хариултууд байна. Эдгээрийг уншаад давхардлыг нэгтгэж, мэдлэгийн сангийн FAQ болго.

ДҮРЭМ:
- Зөвхөн Монгол хэл (Кирилл). "Та" гэж хүндэтгэлтэй.
- Ижил утгатай асуултуудыг НЭГ болгож нэгтгэ. Хамгийн олон давтагдсан сэдвүүдийг эхэнд тавь.
- Хариултыг дэлгүүрийн өөрийнх нь хэлсэн агуулгаар бич — шинээр бүү зохио, тоо баримтыг бүү өөрчил.
- Хариулт 1-3 өгүүлбэр. Ярианы хэллэгийг цэгцтэй болго.
- Нэг удаагийн, тухайн хүнд л хамаатай зүйлийг (тодорхой захиалгын дугаар, хаяг, утас, нэр) огт БҮҮ оруул.
- Дотоод мэдээлэл (өртөг, ашиг, нийлүүлэгч, ажилтны нэр, үлдэгдлийн тоо) огт БҮҮ оруул.
- Эмчилгээний амлалт бүү бич ("эмчилнэ", "эдгээнэ" гэх мэт).
- Тодорхойгүй, зөрчилтэй, эсвэл хуучирсан мэдээлэлтэй хосыг ОРХИ.
- Хамгийн ихдээ 25 FAQ.

ГАРАЛТ: ЗӨВХӨН JSON массив буцаа, өөр ямар ч текст бүү бич.
Формат: [{"question":"...","answer":"...","topic":"..."}]`;

export interface GeneratedFaq {
  question: string;
  answer: string;
  topic: string;
}

/**
 * Extracts the JSON array from a model reply. Mirrors parseGeneratedFaqs in
 * src/lib/chat/faqGenerator.ts — the two runtimes do not share code.
 */
export function parseFaqJson(reply: string): GeneratedFaq[] {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        question: typeof row.question === 'string' ? row.question.trim() : '',
        answer: typeof row.answer === 'string' ? row.answer.trim() : '',
        topic: typeof row.topic === 'string' ? row.topic.trim() : '',
      };
    })
    .filter((entry) => entry.question.length > 0 && entry.answer.length > 0);
}

/** The transcript the model reads. Capped so a busy year still fits the window. */
export function formatPairsForModel(pairs: QaPair[], maxPairs = 150): string {
  return pairs
    .slice(0, maxPairs)
    .map((pair, index) => `${index + 1}. Хэрэглэгч: ${pair.question}\n   Дэлгүүр: ${pair.answer}`)
    .join('\n\n');
}
