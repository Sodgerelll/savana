// Tool declarations the assistant may invoke, and the SAVANA-side handlers
// that fulfil them.
//
// The model is the decision-maker: given the customer's free text it either
// answers in prose or calls exactly one of these. Keep the descriptions written
// for the model, not for a developer — they are the only spec it sees.

import { formatTugrik, type PromptProduct, type StorefrontContext } from './buildPrompt.js';
import type { CarouselCard, QuickReply } from './facebook.js';

export const TOOL_NAMES = {
  SHOW_PRODUCTS: 'show_products',
  SHOW_PROMOTIONS: 'show_promotions',
  CHECK_ORDER: 'check_order',
  START_ORDER: 'start_order',
  TRANSFER_TO_STAFF: 'transfer_to_staff',
} as const;

export const CHAT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: TOOL_NAMES.SHOW_PRODUCTS,
        description:
          'Бүтээгдэхүүнийг ЗУРАГТАЙ карт хэлбэрээр үзүүлнэ. Хэрэглэгч "юу байна", "саван үзүүлээч", ' +
          '"ямар бүтээгдэхүүнтэй вэ", "зураг харъя" гэх мэтээр КАТАЛОГ харахыг хүсвэл дууд. ' +
          'Ганц бүтээгдэхүүний найрлага/хэрэглээг асуувал бүү дууд — өөрөө текстээр хариул.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Хайх түлхүүр үг эсвэл ангилал (жишээ: "саван", "үсний", "ванн"). Бүгдийг үзүүлэх бол хоосон.',
            },
          },
        },
      },
      {
        name: TOOL_NAMES.SHOW_PROMOTIONS,
        description:
          'Идэвхтэй хямдрал, урамшууллыг үзүүлнэ. "Хямдрал байна уу", "урамшуулал", "хямдарсан юу байна" гэх мэт асуувал дууд.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: TOOL_NAMES.CHECK_ORDER,
        description:
          'Захиалгын төлөв шалгана. Хэрэглэгч захиалгынхаа явцыг асууж, захиалгын дугаараа хэлсэн үед дууд. ' +
          'Дугаар хэлээгүй бол эхлээд дугаарыг нь асуу — дуудахгүй.',
        parameters: {
          type: 'object',
          properties: {
            orderNumber: {
              type: 'string',
              description: 'Захиалгын дугаар, жишээ ORD-2026-00123.',
            },
          },
          required: ['orderNumber'],
        },
      },
      {
        name: TOOL_NAMES.START_ORDER,
        description:
          'Захиалга авах урсгалыг эхлүүлнэ. Хэрэглэгч тодорхой бүтээгдэхүүн ЗАХИАЛАХ/АВАХ хүсэлтэй бол дууд. ' +
          'Зөвхөн үнэ асуувал бүү дууд.',
        parameters: {
          type: 'object',
          properties: {
            productName: { type: 'string', description: 'Захиалах бүтээгдэхүүний нэр.' },
            quantity: { type: 'number', description: 'Тоо ширхэг. Тодорхойгүй бол 1.' },
          },
          required: ['productName'],
        },
      },
      {
        name: TOOL_NAMES.TRANSFER_TO_STAFF,
        description:
          'Ажилтан руу шилжүүлнэ. Хэрэглэгч хүнтэй ярихыг хүсэх, гомдол мэдүүлэх, эсвэл асуултын хариу ' +
          'мэдээлэлд ҮНЭХЭЭР байхгүй үед л дууд. Жирийн асуултад бүү дууд.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Шилжүүлж буй богино шалтгаан (админд харагдана).' },
          },
        },
      },
    ],
  },
];

/** What a tool call produced, ready for the webhook to deliver. */
export interface ToolOutcome {
  /** Text to send before the cards, if any. */
  text?: string;
  cards?: CarouselCard[];
  quickReplies?: QuickReply[];
  /** Set when the bot handed the thread to a human. */
  handoverReason?: string;
  /** Set when the customer started an order the admin must follow up. */
  lead?: {
    productName: string;
    quantity: number;
  };
}

function matchesQuery(product: PromptProduct, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    product.name.toLowerCase().includes(needle) ||
    product.category.toLowerCase().includes(needle) ||
    product.description.toLowerCase().includes(needle)
  );
}

/**
 * Ranks matches so a carousel that has to be cut still leads with the products
 * worth showing: in stock first, then best sellers, then catalog order.
 */
function rankProducts(products: PromptProduct[]): PromptProduct[] {
  return [...products].sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (a.bestSeller !== b.bestSeller) return a.bestSeller ? -1 : 1;
    return a.sortOrder - b.sortOrder || a.id - b.id;
  });
}

export function buildProductCards(
  products: PromptProduct[],
  imageUrlFor: (product: PromptProduct) => string | undefined,
): CarouselCard[] {
  return products.map((product) => ({
    title: product.name,
    subtitle: product.inStock
      ? `${formatTugrik(product.price)}${product.sizeLabel ? ` · ${product.sizeLabel}` : ''}`
      : `${formatTugrik(product.price)} · Дууссан`,
    imageUrl: imageUrlFor(product),
    buttons: product.inStock
      ? [{ title: 'Захиалах', payload: `ORDER_PRODUCT_${product.id}` }]
      : undefined,
  }));
}

export interface ToolContext {
  storefront: StorefrontContext;
  /** Resolves a product's primary image to an absolute, publicly reachable URL. */
  imageUrlFor: (product: PromptProduct) => string | undefined;
  /** Looks an order up by number; returns null when it does not exist. */
  lookupOrder: (orderNumber: string) => Promise<{
    orderNumber: string;
    status: string;
    grandTotal: number;
  } | null>;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Хүлээн авсан, төлбөр хүлээгдэж байна',
  paid: 'Төлбөр төлөгдсөн, бэлтгэгдэж байна',
  delivering: 'Хүргэлтэд гарсан',
  delivered: 'Хүргэгдсэн',
};

/** Order numbers are printed uppercase; accept whatever case the customer typed. */
export function normalizeOrderNumber(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case TOOL_NAMES.SHOW_PRODUCTS: {
      const query = String(args.query ?? '').trim();
      const matches = rankProducts(context.storefront.products.filter((p) => matchesQuery(p, query)));

      if (matches.length === 0) {
        return {
          text: query
            ? `"${query}" гэсэн бүтээгдэхүүн олдсонгүй. Өөр нэрээр хайж үзэх үү?`
            : 'Одоогоор каталог хоосон байна.',
        };
      }

      return {
        text: query ? `"${query}" — ${matches.length} бүтээгдэхүүн олдлоо 🌿` : 'Манай бүтээгдэхүүнүүд 🌿',
        cards: buildProductCards(matches.slice(0, 10), context.imageUrlFor),
      };
    }

    case TOOL_NAMES.SHOW_PROMOTIONS: {
      const { discounts } = context.storefront;
      if (discounts.length === 0) {
        return { text: 'Одоогоор идэвхтэй хямдрал байхгүй байна. Шинэ урамшуулал гарвал зарлана 🎁' };
      }

      const lines = discounts.map((entry) => `• ${entry.productName} — ${entry.label} (${entry.endAt} хүртэл)`);
      return { text: `Идэвхтэй хямдрал 🎁\n${lines.join('\n')}` };
    }

    case TOOL_NAMES.CHECK_ORDER: {
      const orderNumber = normalizeOrderNumber(args.orderNumber);
      if (!orderNumber) {
        return { text: 'Захиалгын дугаараа бичиж өгнө үү (жишээ: ORD-2026-00123).' };
      }

      const order = await context.lookupOrder(orderNumber);
      if (!order) {
        return {
          text: `${orderNumber} дугаартай захиалга олдсонгүй. Дугаараа шалгаад дахин илгээнэ үү.`,
        };
      }

      const label = ORDER_STATUS_LABELS[order.status] ?? order.status;
      return { text: `${order.orderNumber} — ${label}.\nНийт дүн: ${formatTugrik(order.grandTotal)}` };
    }

    case TOOL_NAMES.START_ORDER: {
      const rawQuantity = Number(args.quantity);
      const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? Math.floor(rawQuantity) : 1;

      // A carousel "Захиалах" button sends the product id; the model sends a
      // name. Resolve the id first so the button path names a real product.
      let productName = String(args.productName ?? '').trim();
      if (args.productId !== undefined) {
        const matched = context.storefront.products.find(
          (entry) => entry.id === Number(args.productId),
        );
        if (matched) {
          productName = matched.name;
        }
      }

      if (!productName) {
        return { text: 'Аль бүтээгдэхүүнийг захиалах вэ?' };
      }

      return {
        text:
          `${productName} — ${quantity} ширхэг. Захиалгыг баталгаажуулахын тулд ` +
          'нэр болон утасны дугаараа бичиж өгнө үү 📝',
        lead: { productName, quantity },
      };
    }

    case TOOL_NAMES.TRANSFER_TO_STAFF: {
      const reason = String(args.reason ?? '').trim() || 'Хэрэглэгч ажилтантай ярихыг хүссэн';
      return {
        text: 'Ажилтан руу шилжүүллээ. Удахгүй хариу өгөх болно ☎️',
        handoverReason: reason,
      };
    }

    default:
      // An unknown tool name means the model invented one; answer in prose
      // rather than failing the turn.
      console.warn(`[chat/tools] unknown tool "${name}"`);
      return { text: '' };
  }
}
