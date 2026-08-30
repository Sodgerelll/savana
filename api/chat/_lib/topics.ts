// What a conversation turned out to be about.
//
// Read off signals the turn already produced rather than by asking the model a
// second time: the tool it chose says most of it, and the customer's own words
// say the rest. A classifier that cost an extra Gemini call would add a second
// or two to every reply and a second failure mode to a chain that already has
// enough — for a label on an admin screen.
//
// Deliberately independent of where the text came from, so the same call
// classifies a Facebook comment once comment replies are switched on.

/** The labels an admin filters by. Kept few on purpose: a long list is noise. */
export type ChatTopic =
  | 'order'
  | 'delivery'
  | 'payment'
  | 'price'
  | 'product'
  | 'complaint'
  | 'other';

export const TOPIC_LABELS: Record<ChatTopic, string> = {
  order: 'Захиалга',
  delivery: 'Хүргэлт',
  payment: 'Төлбөр',
  price: 'Үнэ',
  product: 'Бүтээгдэхүүн',
  complaint: 'Гомдол',
  other: 'Бусад',
};

/**
 * Matched on the customer's words, lowercased.
 *
 * Stems rather than whole words, because Mongolian suffixes attach: "хүргэлт",
 * "хүргэлтийн", "хүргэлтэд" are one idea and one entry.
 */
const KEYWORDS: Array<{ topic: ChatTopic; stems: string[] }> = [
  // First, because it is the one that wants a person rather than an answer.
  {
    topic: 'complaint',
    stems: ['гомдол', 'буцаа', 'солиул', 'эвдэр', 'гэмтэ', 'алдаа гарс', 'сэтгэл дундуур', 'муу байн'],
  },
  { topic: 'payment', stems: ['төлбөр', 'төлөх', 'төллөө', 'шилжүүл', 'данс', 'картаар', 'qpay', 'bonum'] },
  { topic: 'delivery', stems: ['хүргэлт', 'хүргэж', 'хүргэн', 'хэзээ ирэх', 'хэдэн хоног', 'хаяг'] },
  { topic: 'price', stems: ['үнэ', 'хэд вэ', 'хэдэн төгрөг', 'хямдрал', 'хямд', 'урамшуулал'] },
  { topic: 'order', stems: ['захиалга', 'захиалъя', 'захиалмаар', 'авмаар', 'авъя', 'захиал'] },
  { topic: 'product', stems: ['саван', 'тос', 'крем', 'шампунь', 'найрлага', 'орц', 'бүтээгдэхүүн', 'арчилгаа'] },
];

/** The tool the bot reached for, when that settles it on its own. */
const TOOL_TOPICS: Record<string, ChatTopic> = {
  start_order: 'order',
  confirm_order: 'order',
  check_order: 'order',
  show_promotions: 'price',
  show_products: 'product',
};

/**
 * The topic of one turn.
 *
 * A complaint outranks everything, including the tool: someone who says a soap
 * arrived broken while the bot is showing them a carousel is not browsing.
 * Otherwise the tool wins where it has an opinion, because choosing it was an
 * act of understanding, and the words decide the rest.
 */
export function classifyTopic(input: { toolName?: string | null; message?: string }): ChatTopic {
  const text = String(input.message ?? '').toLowerCase();
  const spoken = KEYWORDS.find((entry) => entry.stems.some((stem) => text.includes(stem)));

  if (spoken?.topic === 'complaint') {
    return 'complaint';
  }

  const fromTool = input.toolName ? TOOL_TOPICS[input.toolName] : undefined;
  return fromTool ?? spoken?.topic ?? 'other';
}

/**
 * The label to keep on a conversation that already had one.
 *
 * A thread drifts — "what soaps do you have" becomes "I'll take three" — and
 * the later, more committed topic is the one an admin scanning the list wants
 * to see. But a turn that classified as nothing must not erase what the thread
 * was already known to be about.
 */
export function mergeTopic(previous: ChatTopic | null, next: ChatTopic): ChatTopic {
  if (next === 'other') {
    return previous ?? 'other';
  }
  return next;
}
