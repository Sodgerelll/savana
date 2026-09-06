// Tool declarations the assistant may invoke, and the SAVANA-side handlers
// that fulfil them.
//
// The model is the decision-maker: given the customer's free text it either
// answers in prose or calls exactly one of these. Keep the descriptions written
// for the model, not for a developer — they are the only spec it sees.

import { findCatalogueProduct } from './catalogueMatch.js';
import {
  discountedPrice,
  formatTugrik,
  type PromptProduct,
  type StorefrontContext,
} from './buildPrompt.js';
import type { CarouselCard, QuickReply } from './facebook.js';

export const TOOL_NAMES = {
  SHOW_PRODUCTS: 'show_products',
  SHOW_PROMOTIONS: 'show_promotions',
  CHECK_ORDER: 'check_order',
  START_ORDER: 'start_order',
  CONFIRM_ORDER: 'confirm_order',
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
          'Захиалгын төлөв шалгана. Хэрэглэгч захиалгынхаа явцыг асуувал дууд. ' +
          'Дугаар хэлсэн бол дугаарыг нь дамжуул; хэлээгүй бол дугааргүй дууд — ' +
          'энэ ярианаас өгсөн захиалгуудыг нь өөрөө олж харуулна.',
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
          'ЗАХИАЛГЫН 1-Р АЛХАМ. Захиалах бүтээгдэхүүн, тоо ширхгийг бүртгэнэ. ' +
          'Хэрэглэгч тодорхой бүтээгдэхүүн авахыг хүссэн үед л ажиллана. ' +
          'Нэг захиалгад нэг удаа ажиллана: хэрэглэгчийн сүүлийн мессежид нэр, ' +
          'утас, хаяг байвал 1-р алхам аль хэдийн дууссан бөгөөд 2-р алхам ' +
          '(confirm_order) ажиллах ёстой.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              description:
                'Захиалах бүтээгдэхүүнүүд. Хэрэглэгч нэг мессежид хэд хэдэн бараа нэрлэсэн бол ' +
                'БҮГДИЙГ энэ жагсаалтад оруулна — тус бүрд тусад нь дуудахгүй. ' +
                'quantity нь тухайн бараанаас хэрэглэгчийн авах НИЙТ тоо — нэмж байгаа тоо биш. ' +
                'Сагсанд 1 байхад "бас нэг" гэвэл quantity=2.',
              items: {
                type: 'object',
                properties: {
                  productName: { type: 'string', description: 'Захиалах бүтээгдэхүүний нэр.' },
                  quantity: { type: 'number', description: 'Тоо ширхэг. Тодорхойгүй бол 1.' },
                  variant: {
                    type: 'string',
                    description:
                      'Сонгосон хэмжээ, каталогт бичигдсэн нэрээр яг таг. Хэмжээ бүр өөр үнэтэй ' +
                      'тул хоёроос олон хэмжээтэй бүтээгдэхүүнд аль болохыг нь асууна.',
                  },
                },
                required: ['productName'],
              },
            },
          },
          required: ['items'],
        },
      },
      {
        name: TOOL_NAMES.CONFIRM_ORDER,
        description:
          'ЗАХИАЛГЫН 2-Р АЛХАМ. Захиалгыг үүсгэж, төлбөрийн холбоос гаргана. ' +
          'Нэр, утасны дугаар, хүргэлтийн хаяг гурвуулаа мэдэгдсэн бол ЗАЙЛШГҮЙ ' +
          'энэ алхам ажиллана — гурав нэг мессежээр ирсэн ч, тус тусдаа ирсэн ч адил. ' +
          'Гурвын аль нэг нь дутуу үед л ажиллахгүй.',
        parameters: {
          type: 'object',
          properties: {
            customerName: { type: 'string', description: 'Захиалагчийн бүтэн нэр.' },
            phone: { type: 'string', description: '8 оронтой утасны дугаар.' },
            address: {
              type: 'string',
              description: 'Хүргэлтийн хаяг бүтнээрээ: дүүрэг, хороо, байр, тоот.',
            },
            note: {
              type: 'string',
              description:
                'Жолоочид өгөх нэмэлт заавар, байхгүй бол хоосон (жишээ: "Үдээс хойш авах боломжтой").',
            },
          },
          required: ['customerName', 'phone', 'address'],
        },
      },
      {
        name: TOOL_NAMES.TRANSFER_TO_STAFF,
        description:
          'Ажилтан руу шилжүүлнэ. Хэрэглэгч хүнтэй ярихыг хүсэх, гомдол мэдүүлэх, эсвэл асуултын хариу ' +
          'өгөгдсөн мэдээлэлд байхгүй үед дууд. Хариултыг нь ХАГАСХАН мэдэж байгаа бол ч дууд — ' +
          'мэдэх хэсгээ хэлээд үлдсэнийг нь шилжүүлэх нь таамаглахаас дээр. ' +
          'Каталог, найрлага, үнэ, хүргэлтийн нөхцөл зэрэг доор БИЧИГДСЭН зүйлд бүү дууд — өөрөө хариул.',
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
  /**
   * The turn added something to an order and still needs the customer's
   * details. Set rather than said, because two products named in one message
   * produce two of these and the question is asked once.
   */
  needsOrderDetails?: boolean;
  /** Buttons under the text — so far, the one that opens the payment page. */
  buttons?: Array<{ title: string; url: string }>;
  /** An order was created; the webhook records it against the conversation. */
  orderId?: string;
  /**
   * Lines the customer added to an order. A list because one message can name
   * several products, and reading only the first quietly got the order wrong.
   */
  leads?: Array<{
    productName: string;
    /** Null when the model named a product that is not in the catalogue. */
    productId: number | null;
    /** Chosen size, when the product is sold in more than one. */
    variant: string | null;
    quantity: number;
  }>;
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
  productUrlFor?: (product: PromptProduct) => string | undefined,
): CarouselCard[] {
  return products.map((product) => {
    const url = productUrlFor?.(product) || undefined;
    const buttons: CarouselCard['buttons'] = [];

    if (product.inStock) {
      buttons.push({ title: 'Захиалах', payload: `ORDER_PRODUCT_${product.id}` });
    }
    // Second so ordering — the thing we want them to do — stays leftmost. A
    // sold-out product still gets the link: the page is where they see when it
    // is back.
    if (url) {
      buttons.push({ title: 'Дэлгэрэнгүй', url });
    }

    return {
      title: product.name,
      subtitle: product.inStock
        ? `${formatTugrik(product.price)}${product.sizeLabel ? ` · ${product.sizeLabel}` : ''}`
        : `${formatTugrik(product.price)} · Дууссан`,
      imageUrl: imageUrlFor(product),
      url,
      buttons: buttons.length > 0 ? buttons : undefined,
    };
  });
}

export interface ToolContext {
  storefront: StorefrontContext;
  /**
   * What the customer has already put aside in this conversation.
   *
   * Needed at the moment a product is added, not at the end: a shop with a
   * delivery minimum has to say "you are 31,200₮ short" while there is still
   * something the customer can do about it, rather than after they have handed
   * over a name, a phone number and an address for an order that cannot ship.
   */
  basket?: () => Promise<
    Array<{ productId: number | null; name: string; variant: string | null; quantity: number }>
  >;
  /** Resolves a product's primary image to an absolute, publicly reachable URL. */
  imageUrlFor: (product: PromptProduct) => string | undefined;
  /** Storefront page for a product. Omitted when the site address is unknown. */
  productUrlFor?: (product: PromptProduct) => string | undefined;
  /** Looks an order up by number; returns null when it does not exist. */
  lookupOrder: (orderNumber: string) => Promise<{
    orderNumber: string;
    status: string;
    grandTotal: number;
  } | null>;
  /**
   * Turns what the customer has asked for into a real order with a payment
   * link. Injected rather than done here, the same way lookupOrder is, so this
   * module stays a pure translation of tool call to reply.
   */
  placeOrder?: (details: {
    customerName: string;
    phone: string;
    address: string;
    note: string;
  }) => Promise<PlacedOrder>;
  /**
   * Orders placed from this conversation, newest first. Scoped to the thread
   * rather than looked up by name or phone, so one customer can never be shown
   * another's orders by typing their number.
   */
  ownOrders?: () => Promise<Array<{ orderNumber: string; status: string; grandTotal: number }>>;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
  payUrl: string;
  /**
   * Lines the catalogue had nothing for, left out of the order.
   *
   * Said to the customer rather than swallowed: a line disappearing from an
   * order without a word is how somebody pays for four things and waits for
   * five.
   */
  unmatched?: string[];
}

/**
 * Thrown when confirm_order is reached without the conversation ever having
 * established what is being bought — the model skipping straight to the
 * contact details. That is a missing question, not a failure worth waking a
 * human for, so it is distinguished from every other way an order can fail.
 */
/** Products one message may add to an order. More than this is a confused model. */
const MAX_ORDER_LINES = 6;

/** Asked once per turn, however many products the customer just named. */
export const ORDER_DETAILS_ASK =
  'Захиалгыг баталгаажуулахын тулд дараах гурвыг бичиж өгнө үү 📝\n' +
  '• Нэр\n• Утасны дугаар\n• Хүргэлтийн хаяг (дүүрэг, хороо, байр/тоот)';

export class NothingToOrderError extends Error {}

/**
 * Thrown when a basket is below the value the shop will deliver. Carries the
 * figure as its message, so the reply can quote the shop's own rule.
 */
export class BelowDeliveryMinimumError extends Error {}

/** Thrown when the product, or the chosen size, has none left. */
export class SoldOutError extends Error {}

/**
 * Thrown when the order asks for more than exists. Carries the product name and
 * never the figure: the shop's rule is that stock counts stay inside the shop.
 */
export class NotEnoughStockError extends Error {}

/** Mongolian mobile numbers are eight digits starting 6, 7, 8 or 9. */
const PHONE_PATTERN = /^[6-9][0-9]{7}$/;

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
        cards: buildProductCards(matches.slice(0, 10), context.imageUrlFor, context.productUrlFor),
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

      // No number: show what this conversation itself ordered. Scoped to the
      // thread on purpose — order numbers run in sequence and a lookup by name
      // or phone would hand one customer another's business.
      if (!orderNumber) {
        const mine = context.ownOrders ? await context.ownOrders() : [];

        if (mine.length === 0) {
          return { text: 'Захиалгын дугаараа бичиж өгнө үү (жишээ: ORD-260819-AB12CD).' };
        }

        const lines = mine.map((order) => {
          const label = ORDER_STATUS_LABELS[order.status] ?? order.status;
          return `• ${order.orderNumber} — ${label} · ${formatTugrik(order.grandTotal)}`;
        });
        return { text: `Таны захиалга:\n${lines.join('\n')}` };
      }

      const order = await context.lookupOrder(orderNumber);
      if (!order) {
        return {
          text: `${orderNumber} дугаартай захиалга олдсонгүй. Дугаараа шалгаад дахин илгээнэ үү.`,
        };
      }

      // Status only. Order numbers run in sequence, so anyone can guess one
      // that is not theirs — the total is the customer's own business and is
      // not worth handing to whoever types the number.
      const label = ORDER_STATUS_LABELS[order.status] ?? order.status;
      return { text: `${order.orderNumber} — ${label}.` };
    }

    case TOOL_NAMES.START_ORDER: {
      // A carousel "Захиалах" button names one product by id; the model sends a
      // list, because one message can name several. Both arrive here.
      const requested = Array.isArray(args.items) && args.items.length > 0
        ? (args.items as Array<Record<string, unknown>>)
        : [{ productName: args.productName, quantity: args.quantity, variant: args.variant }];

      /** Only what went wrong. What went right is shown as the basket below. */
      const notices: string[] = [];
      const leads: NonNullable<ToolOutcome['leads']> = [];

      for (const entry of requested.slice(0, MAX_ORDER_LINES)) {
        const rawQuantity = Number(entry?.quantity);
        const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? Math.floor(rawQuantity) : 1;

        let productName = String(entry?.productName ?? '').trim();
        // Matched back to the catalogue here rather than at confirmation: a
        // line that carries only a name makes an admin find the product by
        // hand, and one the catalogue cannot place at all used to reach the
        // order and kill it.
        const product = findCatalogueProduct(
          context.storefront.products,
          productName,
          args.productId,
        );
        if (product) {
          productName = product.name;
        }

        if (!productName) {
          continue;
        }

        // Caught here as well as at confirm_order: asking for a name, a phone
        // and an address and only then saying the product is gone is a worse
        // conversation than saying so now.
        if (product && !product.inStock) {
          notices.push(`Уучлаарай, "${product.name}" одоогоор дууссан байна 🌿`);
          continue;
        }

        leads.push({
          productName,
          productId: product?.id ?? null,
          // Matched against the catalogue rather than taken as typed, so a size
          // the model invented never reaches the order as though it were real.
          variant:
            product?.variants.find(
              (v) => v.name.toLowerCase() === String(entry?.variant ?? '').trim().toLowerCase(),
            )?.name ?? null,
          quantity,
        });
      }

      if (notices.length === 0 && leads.length === 0) {
        return { text: 'Аль бүтээгдэхүүнийг захиалах вэ?' };
      }

      // Everything set aside in this conversation, including what was just
      // added: the lead is written after this returns, so the two halves are
      // added up here rather than read back.
      const already = context.basket ? await context.basket() : [];
      // Merged by identity, not appended. The model re-lists what is already in
      // the basket as often as not — that is the natural way to answer "and one
      // of those too" — and appending turned a restatement into a second unit
      // the customer never asked for and would have been charged for.
      //
      // Quantity is the total wanted, which is what the tool now asks the model
      // for, so the larger figure wins: an item named again without a number
      // must not quietly reduce what was already set aside.
      const basket: Array<{
        productId: number | null;
        name: string;
        variant: string | null;
        quantity: number;
      }> = [];
      const seen = new Map<string, number>();
      for (const item of [
        ...already,
        ...leads.map((lead) => ({
          productId: lead.productId,
          name: lead.productName,
          variant: lead.variant,
          quantity: lead.quantity,
        })),
      ]) {
        const key = `${item.productId ?? item.name.toLowerCase()}|${(item.variant ?? '').toLowerCase()}`;
        const at = seen.get(key);
        if (at === undefined) {
          seen.set(key, basket.length);
          basket.push({ ...item });
        } else if (item.quantity > basket[at].quantity) {
          basket[at].quantity = item.quantity;
        }
      }

      // The whole basket goes back, not just this turn's additions: the caller
      // stores exactly what the customer was shown, so the two can never drift.
      const basketLeads = basket.map((item) => ({
        productName: item.name,
        productId: item.productId,
        variant: item.variant,
        quantity: item.quantity,
      }));

      // A line the catalogue no longer has cannot be priced, and showing it at
      // zero would understate the total and tell the customer they are closer to
      // the delivery minimum than they are. confirm_order refuses it outright,
      // so it is dropped here rather than carried as free.
      const priced = basket.flatMap((item) => {
        const product = findCatalogueProduct(context.storefront.products, item.name, item.productId);
        const variant = item.variant
          ? product?.variants.find(
              (entry) => entry.name.toLowerCase() === String(item.variant).toLowerCase(),
            )
          : undefined;
        if (!product) {
          return [];
        }

        const listPrice = variant ? variant.price : product.price;
        // Priced the way the storefront prices it, because the bot has been
        // quoting the discounted figure all along.
        const unitPrice = discountedPrice(listPrice, context.storefront.discounts, product.id);
        const label = variant ? `${item.name} (${variant.name})` : item.name;
        return [{ label, quantity: item.quantity, lineTotal: unitPrice * item.quantity }];
      });

      const subtotal = priced.reduce((sum, line) => sum + line.lineTotal, 0);
      const summary = priced
        .map((line) => `• ${line.label} — ${line.quantity}ш ${formatTugrik(line.lineTotal)}`)
        .join('\n');
      const running = `${summary}\n**Нийт: ${formatTugrik(subtotal)}**`;
      const shortBy = context.storefront.shop.minOrderForDelivery - subtotal;

      // Said now, while the customer can still act on it. Asking for a name, a
      // phone number and an address and only then refusing the order over a
      // minimum the shop never mentioned is the worst version of this.
      // Worded as the shop's rule rather than as a shortfall. "31,200₮ дутуу
      // байна" reads as something missing from the customer; what is true is
      // that the shop does not deliver below its minimum, and the running total
      // directly above already says where they stand.
      if (context.storefront.shop.minOrderForDelivery > 0 && shortBy > 0) {
        return {
          text: [
            ...notices,
            running,
            '',
            `${formatTugrik(context.storefront.shop.minOrderForDelivery)}-аас доош дүнтэй захиалгад хүргэлт хийгдэхгүй 📦`,
            'Өөр юу нэмэх вэ?',
          ].join('\n'),
          needsOrderDetails: false,
          leads: basketLeads,
        };
      }

      return {
        text: [...notices, running].join('\n'),
        needsOrderDetails: leads.length > 0,
        leads: basketLeads,
      };
    }

    case TOOL_NAMES.CONFIRM_ORDER: {
      const customerName = String(args.customerName ?? '').trim();
      const digits = String(args.phone ?? '').replace(/[^0-9]/g, '');
      // A country code only when the length says so: 97612345 is itself a
      // perfectly good eight-digit number, and slicing it would invent one.
      const phone = digits.length === 11 && digits.startsWith('976') ? digits.slice(3) : digits;
      const address = String(args.address ?? '').trim();
      const note = String(args.note ?? '').trim();

      if (!context.placeOrder) {
        return { text: 'Энэ сувгаар захиалга баталгаажуулах боломжгүй байна. Ажилтан руу холбоно уу ☎️' };
      }
      if (!customerName || !address) {
        return { text: 'Захиалга баталгаажуулахад нэр болон хүргэлтийн хаяг хэрэгтэй 📝' };
      }
      if (!PHONE_PATTERN.test(phone)) {
        // Said plainly, because the model will otherwise invent a reason.
        return { text: 'Утасны дугаар 8 оронтой байх ёстой. Дахин бичиж өгнө үү 📱' };
      }

      try {
        const order = await context.placeOrder({ customerName, phone, address, note });

        return {
          text:
            `Захиалга үүслээ ✅ Дугаар: ${order.orderNumber}

` +
            `Барааны дүн: ${formatTugrik(order.subtotal)}
` +
            `Хүргэлт: ${order.shippingFee === 0 ? 'Үнэгүй' : formatTugrik(order.shippingFee)}
` +
            `Нийт төлөх: ${formatTugrik(order.grandTotal)}

` +
            'Доорх товчоор төлбөрөө төлнө үү. Төлбөр орсон даруйд захиалга баталгаажна 📦' +
            (order.unmatched && order.unmatched.length > 0
              ? `\n\n⚠️ "${order.unmatched.join('", "')}" -г каталогоос олж чадсангүй тул ` +
                'энэ захиалгад ороогүй. Ажилтан тантай холбогдож тодруулна ☎️'
              : ''),
          buttons: [{ title: 'Төлбөр төлөх', url: order.payUrl }],
          orderId: order.id,
        };
      } catch (err) {
        if (err instanceof SoldOutError) {
          return { text: `Уучлаарай, "${err.message}" одоогоор дууссан байна 🌿 Өөр бүтээгдэхүүн санал болгох уу?` };
        }
        if (err instanceof NotEnoughStockError) {
          // Says that the quantity is not available without saying how many
          // there are — stock figures are the shop's business, not the buyer's.
          return {
            text: `"${err.message}" тэр тооны нөөц одоогоор хүрэлцэхгүй байна 🌿 Цөөн тоогоор захиалах уу?`,
          };
        }
        if (err instanceof BelowDeliveryMinimumError) {
          // The shop's own rule, said in the shop's own terms — not an error
          // and not something to wake a human for.
          return {
            text:
              `${formatTugrik(Number(err.message))}-аас доош дүнтэй захиалгад хүргэлт хийгдэхгүй 📦
` +
              'Өөр бүтээгдэхүүн нэмэх үү?',
          };
        }
        if (err instanceof NothingToOrderError) {
          return { text: 'Аль бүтээгдэхүүнийг захиалах вэ? Нэрийг нь хэлж өгөөч 🌿' };
        }

        console.error('[chat/tools] confirm_order failed:', (err as Error).message);
        return {
          text: 'Захиалга үүсгэж чадсангүй. Ажилтан руу холбоно уу ☎️',
          handoverReason: `Захиалга үүсгэхэд алдаа гарсан: ${(err as Error).message}`,
        };
      }
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
