// Answers a repeated question from the knowledge base without calling the model.
//
// The shop's FAQ list already goes into the prompt on every turn; serving a hit
// straight from it costs nothing at all and answers in the shop's own approved
// wording rather than the model's paraphrase of it.
//
// The bar for a hit is deliberately high. Answering the wrong question is worse
// than paying for a model call: the customer reads a confident reply to
// something they did not ask. Everything here is tuned to refuse rather than
// guess, and anything that does not clear the bar falls through to Gemini.

/** Question particles and fillers that carry no meaning on their own. */
const STOPWORDS = new Set([
  'юу',
  'вэ',
  'бэ',
  'уу',
  'үү',
  'ээ',
  'аа',
  'бол',
  'нь',
  'ба',
  'болон',
  'байна',
  'байгаа',
  'тэр',
  'энэ',
  'та',
  'би',
  'сайн',
  'мөн',
  'юм',
  'гэж',
]);

/** A near-identical rewording still has to share most of its content words. */
const MIN_SIMILARITY = 0.75;
/** Two words in common is coincidence; three is a question. */
const MIN_SHARED_TOKENS = 3;
/**
 * Longer than this and the message is carrying context — an order, a
 * complaint, a story — that a canned answer would talk straight past.
 */
const MAX_MESSAGE_LENGTH = 120;

/** Mongolian mobile numbers, and order numbers, mean a flow is in progress. */
const PHONE_PATTERN = /(?:^|\D)[6-9]\d{7}(?:\D|$)/;
const ORDER_PATTERN = /\b(?:ORD|SAL)[-\s]?\d/i;

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface FaqMatch {
  answer: string;
  question: string;
  /** 1 for an exact match; otherwise the token overlap that cleared the bar. */
  similarity: number;
}

/** Lowercase, ё→е, punctuation stripped, whitespace collapsed. */
export function normalise(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Content words only — the particles that end every Mongolian question go. */
export function contentTokens(text: string): Set<string> {
  return new Set(
    normalise(text)
      .split(' ')
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
  );
}

function similarity(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) {
    return { score: 0, shared: 0 };
  }

  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }

  return { score: shared / (a.size + b.size - shared), shared };
}

/**
 * The best FAQ answer for this message, or null to let the model handle it.
 *
 * `isFirstTurn` suppresses the shortcut on the opening message: that reply sets
 * the tone and carries the one greeting the bot is allowed, and a canned answer
 * would skip it. From the second message on, the greeting has already happened.
 */
export function matchFaq(
  message: string,
  faqs: FaqEntry[],
  options: { isFirstTurn?: boolean } = {},
): FaqMatch | null {
  const text = String(message ?? '').trim();

  if (options.isFirstTurn || !text || text.length > MAX_MESSAGE_LENGTH) {
    return null;
  }

  // A phone number or an order reference means the customer is mid-flow and is
  // answering the bot, not asking a fresh question.
  if (PHONE_PATTERN.test(text) || ORDER_PATTERN.test(text)) {
    return null;
  }

  const usable = (faqs ?? []).filter(
    (faq) => faq && faq.question?.trim() && faq.answer?.trim(),
  );
  if (usable.length === 0) {
    return null;
  }

  const asked = normalise(text);
  const askedTokens = contentTokens(text);

  let best: FaqMatch | null = null;

  for (const faq of usable) {
    if (normalise(faq.question) === asked) {
      return { answer: faq.answer.trim(), question: faq.question, similarity: 1 };
    }

    const { score, shared } = similarity(askedTokens, contentTokens(faq.question));
    if (score >= MIN_SIMILARITY && shared >= MIN_SHARED_TOKENS && score > (best?.similarity ?? 0)) {
      best = { answer: faq.answer.trim(), question: faq.question, similarity: score };
    }
  }

  return best;
}
