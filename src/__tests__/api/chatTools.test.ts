import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  buildProductCards,
  CHAT_TOOLS,
  BelowDeliveryMinimumError,
  normalizeOrderNumber,
  NotEnoughStockError,
  NothingToOrderError,
  ORDER_DETAILS_ASK,
  SoldOutError,
  runTool,
  TOOL_NAMES,
  type ToolContext,
} from "../../../api/chat/_lib/tools";
import type { PromptProduct, StorefrontContext } from "../../../api/chat/_lib/buildPrompt";

function product(overrides: Partial<PromptProduct> = {}): PromptProduct {
  return {
    id: 1,
    sortOrder: 10,
    name: "Хужирт саван",
    price: 25000,
    category: "soap",
    description: "Байгалийн гар саван",
    ingredients: "",
    howToUse: "",
    sizeLabel: "100 гр",
    variants: [],
    inStock: true,
    // -1 is "tracks no stock", which is not the same as sold out.
    stock: -1,
    bestSeller: false,
    ...overrides,
  };
}

function storefront(overrides: Partial<StorefrontContext> = {}): StorefrontContext {
  return {
    shop: {
      brandName: "SAVANA",
      brandDescription: "",
      contactPhone: "",
      contactEmail: "",
      location: "",
      storeHoursText: "",
      facebookUrl: "",
      instagramHandle: "",
    },
    collections: [],
    products: [product()],
    discounts: [],
    faqs: [],
    basePrompt: "",
    knowledgePoints: [],
    botName: "",
    ...overrides,
  };
}

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    storefront: storefront(),
    imageUrlFor: (p) => `https://savana.mn/img/${p.id}.jpg`,
    lookupOrder: async () => null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** A placeOrder that succeeds, standing in for Firestore plus Bonum. */
function placedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "ORD-260819-ABC123",
    subtotal: 17_600,
    shippingFee: 8000,
    grandTotal: 25_600,
    payUrl: "https://ecommerce.bonum.mn/ecommerce?invoiceId=abc",
    ...overrides,
  };
}

describe("start_order with several products", () => {
  const catalogue = {
    storefront: storefront({
      products: [
        product({ id: 1, name: "Хужирт саван", price: 8800 }),
        product({ id: 2, name: "Ванны сүү", price: 13200 }),
      ],
    }),
  };

  it("records every product named in one message", async () => {
    // The model used to be relied on to call the tool once per product, and it
    // did not always: the second product vanished without anyone being told,
    // which is a wrong order rather than a missing feature.
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      {
        items: [
          { productName: "Хужирт саван", quantity: 3 },
          { productName: "Ванны сүү", quantity: 2 },
        ],
      },
      context(catalogue),
    );

    expect(result.leads).toEqual([
      { productName: "Хужирт саван", productId: 1, variant: null, quantity: 3 },
      { productName: "Ванны сүү", productId: 2, variant: null, quantity: 2 },
    ]);
    // Priced and totalled, because a shop with a delivery minimum has to let
    // the customer see how close they are while they can still act on it.
    expect(result.text).toContain("Хужирт саван — 3ш");
    expect(result.text).toContain("Ванны сүү — 2ш");
    expect(result.text).toContain("Нийт:");
  });

  it("still accepts the single product a carousel button names", async () => {
    // The "Захиалах" button sends a product id and no list at all.
    const result = await runTool(TOOL_NAMES.START_ORDER, { productId: 2 }, context(catalogue));

    expect(result.leads).toEqual([
      { productName: "Ванны сүү", productId: 2, variant: null, quantity: 1 },
    ]);
  });

  it("keeps the products that are available when one of them is gone", async () => {
    const ctx = context({
      storefront: storefront({
        products: [
          product({ id: 1, name: "Байгаа", inStock: true }),
          product({ id: 2, name: "Дууссан", inStock: false }),
        ],
      }),
    });

    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { items: [{ productName: "Байгаа" }, { productName: "Дууссан" }] },
      ctx,
    );

    expect(result.leads).toHaveLength(1);
    expect(result.leads?.[0].productName).toBe("Байгаа");
    expect(result.text).toContain("дууссан");
  });

  it("caps how many products one message can add", async () => {
    const items = Array.from({ length: 12 }, () => ({ productName: "Хужирт саван" }));

    const result = await runTool(TOOL_NAMES.START_ORDER, { items }, context(catalogue));

    expect(result.leads?.length).toBeLessThanOrEqual(6);
  });
});

describe("start_order and stock", () => {
  it("says a sold-out product is gone before asking for any details", async () => {
    // Collecting a name, a phone and an address and only then saying the
    // product is gone is a worse conversation than saying so at the start.
    const ctx = context({
      storefront: storefront({ products: [product({ id: 3, name: "Дууссан саван", inStock: false })] }),
    });

    const result = await runTool(TOOL_NAMES.START_ORDER, { productId: 3 }, ctx);

    expect(result.text).toContain("дууссан");
    expect(result.leads ?? []).toHaveLength(0);
  });

  it("still starts an order for a product that is in stock", async () => {
    const ctx = context({
      storefront: storefront({ products: [product({ id: 3, name: "Байгаа саван", inStock: true })] }),
    });

    const result = await runTool(TOOL_NAMES.START_ORDER, { productId: 3 }, ctx);

    expect(result.leads?.[0]).toMatchObject({ productName: "Байгаа саван", productId: 3 });
  });
});

describe("check_order without a number", () => {
  it("lists the orders this conversation placed", async () => {
    // Scoped to the thread rather than to a phone or a name: order numbers run
    // in sequence, so any lookup a stranger could type would leak someone else's.
    const ownOrders = vi.fn(async () => [
      { orderNumber: "ORD-260819-AAA111", status: "paid", grandTotal: 21_200 },
      { orderNumber: "ORD-260818-BBB222", status: "delivered", grandTotal: 8_800 },
    ]);

    const result = await runTool(TOOL_NAMES.CHECK_ORDER, {}, context({ ownOrders }));

    expect(result.text).toContain("ORD-260819-AAA111");
    expect(result.text).toContain("ORD-260818-BBB222");
    expect(result.text).toContain("21,200₮");
  });

  it("asks for the number when this conversation has ordered nothing", async () => {
    const ownOrders = vi.fn(async () => []);

    const result = await runTool(TOOL_NAMES.CHECK_ORDER, {}, context({ ownOrders }));

    expect(result.text).toContain("дугаараа");
  });

  it("asks for the number on a channel that cannot list them", async () => {
    const result = await runTool(TOOL_NAMES.CHECK_ORDER, {}, context());

    expect(result.text).toContain("дугаараа");
  });
});

describe("confirm_order", () => {
  const details = {
    customerName: "Ганбат",
    phone: "99119911",
    address: "СБД, 5-р хороо, 41-р байр 12 тоот",
  };

  it("passes a delivery instruction through when the customer gave one", async () => {
    const placeOrder = vi.fn(async () => placedOrder());

    await runTool(
      TOOL_NAMES.CONFIRM_ORDER,
      { ...details, note: "Үдээс хойш авах боломжтой" },
      context({ placeOrder }),
    );

    expect(placeOrder.mock.calls[0][0].note).toBe("Үдээс хойш авах боломжтой");
  });

  it("creates the order and hands back a payment button", async () => {
    const placeOrder = vi.fn(async () => placedOrder());

    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context({ placeOrder }));

    expect(placeOrder).toHaveBeenCalledWith({ ...details, note: "" });
    expect(result.text).toContain("ORD-260819-ABC123");
    expect(result.text).toContain("25,600₮");
    expect(result.buttons).toEqual([
      { title: "Төлбөр төлөх", url: "https://ecommerce.bonum.mn/ecommerce?invoiceId=abc" },
    ]);
    expect(result.orderId).toBe("order-1");
  });

  it("says delivery is free rather than printing 0₮", async () => {
    const placeOrder = vi.fn(async () => placedOrder({ shippingFee: 0, grandTotal: 96_000 }));

    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context({ placeOrder }));

    expect(result.text).toContain("Хүргэлт: Үнэгүй");
    expect(result.text).not.toContain("Хүргэлт: 0₮");
  });

  it("accepts a number the customer spaced out or prefixed", async () => {
    // The same leniency the phone rule in the prompt promises; refusing a
    // perfectly good number over punctuation is how an order gets abandoned.
    const placeOrder = vi.fn(async () => placedOrder());

    await runTool(
      TOOL_NAMES.CONFIRM_ORDER,
      { ...details, phone: "+976 9911 9911" },
      context({ placeOrder }),
    );

    expect(placeOrder.mock.calls[0][0].phone).toBe("99119911");
  });

  it("asks again rather than ordering on a number that cannot be one", async () => {
    const placeOrder = vi.fn(async () => placedOrder());

    const result = await runTool(
      TOOL_NAMES.CONFIRM_ORDER,
      { ...details, phone: "12345" },
      context({ placeOrder }),
    );

    expect(placeOrder).not.toHaveBeenCalled();
    expect(result.text).toContain("8 оронтой");
  });

  it("will not order without an address", async () => {
    const placeOrder = vi.fn(async () => placedOrder());

    const result = await runTool(
      TOOL_NAMES.CONFIRM_ORDER,
      { ...details, address: "   " },
      context({ placeOrder }),
    );

    expect(placeOrder).not.toHaveBeenCalled();
    expect(result.text).toContain("хаяг");
  });

  it("asks what to order when the model skipped straight to the details", async () => {
    // A missing question, not a fault — nobody should be paged for it.
    const placeOrder = vi.fn(async () => {
      throw new NothingToOrderError("no items");
    });

    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context({ placeOrder }));

    expect(result.text).toContain("Аль бүтээгдэхүүнийг");
    expect(result.handoverReason).toBeUndefined();
  });

  it("says a product is gone without saying how many are left", async () => {
    // The shop's rule is "байгаа" or "дууссан" — a stock figure is the shop's
    // business, and a bot that volunteers one has leaked it to every customer.
    const placeOrder = vi.fn(async () => {
      throw new SoldOutError("Хужирт саван");
    });

    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context({ placeOrder }));

    expect(result.text).toContain("дууссан");
    expect(result.text).toContain("Хужирт саван");
    expect(result.text).not.toMatch(/d/);
    expect(result.handoverReason).toBeUndefined();
  });

  it("refuses more than exists without naming the number that exists", async () => {
    const placeOrder = vi.fn(async () => {
      throw new NotEnoughStockError("Хужирт саван");
    });

    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context({ placeOrder }));

    expect(result.text).toContain("хүрэлцэхгүй");
    expect(result.text).not.toMatch(/d/);
    expect(result.buttons).toBeUndefined();
  });

  it("quotes the shop's delivery minimum instead of raising an order it will not fulfil", async () => {
    // The shop's page says it delivers above a figure. An order below it is a
    // rule the customer has not been told yet, not a fault worth paging anyone.
    const placeOrder = vi.fn(async () => {
      throw new BelowDeliveryMinimumError("40000");
    });

    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context({ placeOrder }));

    expect(result.text).toContain("40,000₮");
    expect(result.handoverReason).toBeUndefined();
    expect(result.buttons).toBeUndefined();
  });

  it("escalates when the order genuinely could not be created", async () => {
    const placeOrder = vi.fn(async () => {
      throw new Error("Bonum unreachable");
    });

    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context({ placeOrder }));

    expect(result.handoverReason).toContain("Bonum unreachable");
    expect(result.buttons).toBeUndefined();
  });

  it("says so plainly on a channel that cannot take orders", async () => {
    const result = await runTool(TOOL_NAMES.CONFIRM_ORDER, details, context());

    expect(result.text).toContain("боломжгүй");
  });
});

describe("CHAT_TOOLS declarations", () => {
  const declarations = CHAT_TOOLS[0].functionDeclarations;

  it("declares exactly the tools the webhook implements", () => {
    expect(declarations.map((d) => d.name).sort()).toEqual(
      Object.values(TOOL_NAMES).slice().sort(),
    );
  });

  it("gives every tool a description written for the model", () => {
    for (const declaration of declarations) {
      expect(declaration.description.length).toBeGreaterThan(40);
    }
  });

  it("requires an order number for check_order", () => {
    const checkOrder = declarations.find((d) => d.name === TOOL_NAMES.CHECK_ORDER);
    expect(checkOrder?.parameters?.required).toEqual(["orderNumber"]);
  });

  it("requires a list of products for start_order", () => {
    const startOrder = declarations.find((d) => d.name === TOOL_NAMES.START_ORDER);
    // One call carries every product the customer named, so the list is what is
    // required; a name lives on each entry inside it.
    expect(startOrder?.parameters?.required).toEqual(["items"]);
    expect(startOrder?.parameters?.properties?.items?.items?.required).toEqual(["productName"]);
  });

  it("tells the model not to call show_products for a single-product question", () => {
    const showProducts = declarations.find((d) => d.name === TOOL_NAMES.SHOW_PRODUCTS);
    expect(showProducts?.description).toContain("бүү дууд");
  });
});

describe("normalizeOrderNumber", () => {
  it("uppercases and trims", () => {
    expect(normalizeOrderNumber("  ord-2026-00123 ")).toBe("ORD-2026-00123");
  });

  it("returns an empty string for nothing", () => {
    expect(normalizeOrderNumber(undefined)).toBe("");
    expect(normalizeOrderNumber(null)).toBe("");
  });
});

describe("buildProductCards", () => {
  it("shows price and size on an in-stock product, with an order button", () => {
    const [card] = buildProductCards([product()], () => "https://img/1.jpg");

    expect(card.title).toBe("Хужирт саван");
    expect(card.subtitle).toBe("25,000₮ · 100 гр");
    expect(card.imageUrl).toBe("https://img/1.jpg");
    expect(card.buttons).toEqual([{ title: "Захиалах", payload: "ORDER_PRODUCT_1" }]);
  });

  it("marks a sold-out product and offers no order button", () => {
    const [card] = buildProductCards([product({ inStock: false })], () => undefined);

    expect(card.subtitle).toContain("Дууссан");
    expect(card.buttons).toBeUndefined();
  });

  it("omits the size when the product has none", () => {
    const [card] = buildProductCards([product({ sizeLabel: "" })], () => undefined);

    expect(card.subtitle).toBe("25,000₮");
  });
});

describe("show_products", () => {
  it("returns cards for the whole catalog when no query is given", async () => {
    const result = await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, context());

    expect(result.cards).toHaveLength(1);
    expect(result.text).toContain("бүтээгдэхүүн");
  });

  it("filters by name", async () => {
    const ctx = context({
      storefront: storefront({
        products: [product({ id: 1, name: "Хужирт саван" }), product({ id: 2, name: "Үсний тос" })],
      }),
    });

    const result = await runTool(TOOL_NAMES.SHOW_PRODUCTS, { query: "үсний" }, ctx);

    expect(result.cards?.map((c) => c.title)).toEqual(["Үсний тос"]);
  });

  it("filters by category and description too", async () => {
    const ctx = context({
      storefront: storefront({
        products: [
          product({ id: 1, name: "А", category: "hair", description: "" }),
          product({ id: 2, name: "Б", category: "soap", description: "ванны давс" }),
        ],
      }),
    });

    expect((await runTool(TOOL_NAMES.SHOW_PRODUCTS, { query: "hair" }, ctx)).cards).toHaveLength(1);
    expect((await runTool(TOOL_NAMES.SHOW_PRODUCTS, { query: "ванн" }, ctx)).cards).toHaveLength(1);
  });

  it("suggests trying another word when nothing matches", async () => {
    const result = await runTool(TOOL_NAMES.SHOW_PRODUCTS, { query: "телевизор" }, context());

    expect(result.cards).toBeUndefined();
    expect(result.text).toContain("олдсонгүй");
  });

  it("says the catalog is empty when there are no products at all", async () => {
    const ctx = context({ storefront: storefront({ products: [] }) });

    expect((await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, ctx)).text).toContain("хоосон");
  });

  it("leads with in-stock products so a truncated carousel stays useful", async () => {
    const ctx = context({
      storefront: storefront({
        products: [
          product({ id: 1, name: "Дууссан", inStock: false, sortOrder: 1 }),
          product({ id: 2, name: "Байгаа", inStock: true, sortOrder: 99 }),
        ],
      }),
    });

    const result = await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, ctx);

    expect(result.cards?.[0].title).toBe("Байгаа");
  });

  it("ranks best sellers ahead of ordinary in-stock products", async () => {
    const ctx = context({
      storefront: storefront({
        products: [
          product({ id: 1, name: "Энгийн", sortOrder: 1 }),
          product({ id: 2, name: "Эрэлттэй", bestSeller: true, sortOrder: 50 }),
        ],
      }),
    });

    const result = await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, ctx);

    expect(result.cards?.[0].title).toBe("Эрэлттэй");
  });

  it("caps the carousel at 10 cards", async () => {
    const ctx = context({
      storefront: storefront({
        products: Array.from({ length: 25 }, (_, i) => product({ id: i, name: `Бараа ${i}` })),
      }),
    });

    expect((await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, ctx)).cards).toHaveLength(10);
  });
});

describe("show_promotions", () => {
  it("lists every active discount", async () => {
    const ctx = context({
      storefront: storefront({
        discounts: [
          { productName: "Саван", label: "-20%", endAt: "2026-08-31" },
          { productName: "Тос", label: "-5,000₮", endAt: "2026-09-15" },
        ],
      }),
    });

    const result = await runTool(TOOL_NAMES.SHOW_PROMOTIONS, {}, ctx);

    expect(result.text).toContain("Саван — -20%");
    expect(result.text).toContain("Тос — -5,000₮");
  });

  it("says so plainly when nothing is on sale", async () => {
    const result = await runTool(TOOL_NAMES.SHOW_PROMOTIONS, {}, context());

    expect(result.text).toContain("идэвхтэй хямдрал байхгүй");
  });
});

describe("product cards", () => {
  it("adds a storefront link beside the order button", async () => {
    const ctx = context({ productUrlFor: (p) => `https://savana.mn/product/${p.id}` });

    const [card] = (await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, ctx)).cards ?? [];

    // Ordering stays leftmost; the link is the second button.
    expect(card.buttons?.map((b) => b.title)).toEqual(["Захиалах", "Дэлгэрэнгүй"]);
    expect(card.buttons?.[1]).toMatchObject({ url: "https://savana.mn/product/1" });
    // Tapping the picture goes to the same place.
    expect(card.url).toBe("https://savana.mn/product/1");
  });

  it("leaves the link off entirely when the site address is unknown", async () => {
    // A button that leads nowhere is worse than no button.
    const [card] = (await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, context())).cards ?? [];

    expect(card.buttons?.map((b) => b.title)).toEqual(["Захиалах"]);
    expect(card.url).toBeUndefined();
  });

  it("still links a sold-out product, which is where its return shows up", async () => {
    const ctx = context({
      storefront: { ...storefront(), products: [{ ...storefront().products[0], inStock: false }] },
      productUrlFor: (p) => `https://savana.mn/product/${p.id}`,
    });

    const [card] = (await runTool(TOOL_NAMES.SHOW_PRODUCTS, {}, ctx)).cards ?? [];

    expect(card.buttons?.map((b) => b.title)).toEqual(["Дэлгэрэнгүй"]);
    expect(card.subtitle).toContain("Дууссан");
  });
});

describe("check_order", () => {
  it("reports the status of an existing order", async () => {
    const ctx = context({
      lookupOrder: async () => ({ orderNumber: "ORD-1", status: "delivering", grandTotal: 58000 }),
    });

    const result = await runTool(TOOL_NAMES.CHECK_ORDER, { orderNumber: "ord-1" }, ctx);

    expect(result.text).toContain("Хүргэлтэд гарсан");
  });

  it("withholds the amount, which order numbers are too guessable to hand out", async () => {
    // ORD-2026-00123 is one keystroke from ORD-2026-00124. Status is a nudge;
    // what somebody paid is not something a stranger should be able to type in.
    const ctx = context({
      lookupOrder: async () => ({ orderNumber: "ORD-1", status: "delivering", grandTotal: 58000 }),
    });

    const result = await runTool(TOOL_NAMES.CHECK_ORDER, { orderNumber: "ORD-1" }, ctx);

    expect(result.text).not.toContain("58,000");
    expect(result.text).not.toContain("58000");
  });

  it("normalizes the number before looking it up", async () => {
    const seen: string[] = [];
    const ctx = context({
      lookupOrder: async (orderNumber) => {
        seen.push(orderNumber);
        return null;
      },
    });

    await runTool(TOOL_NAMES.CHECK_ORDER, { orderNumber: " ord-2026-1 " }, ctx);

    expect(seen).toEqual(["ORD-2026-1"]);
  });

  it("asks for the number when it is missing", async () => {
    const result = await runTool(TOOL_NAMES.CHECK_ORDER, {}, context());

    expect(result.text).toContain("дугаараа");
  });

  it("says the order was not found rather than inventing a status", async () => {
    const result = await runTool(TOOL_NAMES.CHECK_ORDER, { orderNumber: "ORD-404" }, context());

    expect(result.text).toContain("олдсонгүй");
  });

  it("falls back to the raw status for an unmapped value", async () => {
    const ctx = context({
      lookupOrder: async () => ({ orderNumber: "ORD-1", status: "weird", grandTotal: 1000 }),
    });

    expect((await runTool(TOOL_NAMES.CHECK_ORDER, { orderNumber: "ORD-1" }, ctx)).text).toContain(
      "weird",
    );
  });
});

describe("start_order", () => {
  it("adds what is already set aside to what was just asked for", async () => {
    // The customer collects across several messages. A basket that only showed
    // the last thing named would tell them they are further from the delivery
    // minimum than they really are.
    const ctx = context({
      storefront: storefront({
        products: [
          product({ id: 1, name: "Хужирт саван", price: 25000 }),
          product({ id: 2, name: "Ванны сүү", price: 13200 }),
        ],
      }),
    });
    ctx.basket = async () => [
      { productId: 2, name: "Ванны сүү", variant: null, quantity: 1 },
    ];

    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Хужирт саван", quantity: 1 },
      ctx,
    );

    expect(result.text).toContain("Ванны сүү");
    expect(result.text).toContain("Хужирт саван");
    expect(result.text).toContain("Нийт: 38,200₮");
  });

  it("does not charge twice for an item the model lists again", async () => {
    // The model re-lists what is already in the basket as often as not — it is
    // the natural way to answer "and one of those too". Appending turned that
    // restatement into a second unit nobody asked for, on a real order, with a
    // payment link attached.
    const ctx = context();
    ctx.basket = async () => [
      { productId: 1, name: "Хужирт саван", variant: null, quantity: 1 },
    ];

    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Хужирт саван", quantity: 1 },
      ctx,
    );

    expect(result.leads).toEqual([
      { productName: "Хужирт саван", productId: 1, variant: null, quantity: 1 },
    ]);
    expect(result.text).toContain("Нийт: 25,000₮");
  });

  it("takes the larger figure when the model restates a total", async () => {
    // quantity is what the customer wants in all, so "бас нэг" on a basket of
    // one arrives as two. Naming it again without a number must not reduce it.
    const ctx = context();
    ctx.basket = async () => [
      { productId: 1, name: "Хужирт саван", variant: null, quantity: 3 },
    ];

    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Хужирт саван", quantity: 1 },
      ctx,
    );

    expect(result.leads?.[0]).toMatchObject({ quantity: 3 });
  });

  it("says how much is missing rather than asking for an address it cannot use", async () => {
    // Asking for a name, a phone number and an address and only then refusing
    // the order over a minimum the shop never mentioned is the worst version
    // of this conversation.
    const ctx = context();
    ctx.storefront.shop.minOrderForDelivery = 100_000;

    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Хужирт саван", quantity: 1 },
      ctx,
    );

    expect(result.needsOrderDetails).toBe(false);
    expect(result.text).toContain("дутуу байна");
    expect(result.text).toContain("Өөр юу нэмэх вэ?");
  });

  it("asks for the details once the basket clears the minimum", async () => {
    const ctx = context();
    ctx.storefront.shop.minOrderForDelivery = 10_000;

    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Хужирт саван", quantity: 1 },
      ctx,
    );

    expect(result.needsOrderDetails).toBe(true);
    expect(result.text).not.toContain("дутуу байна");
  });

  it("captures a lead with the product and quantity", async () => {
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Хужирт саван", quantity: 3 },
      context(),
    );

    // The id rides along so the admin turning the lead into an order does not
    // have to find the product by name a second time.
    expect(result.leads?.[0]).toEqual({
      productName: "Хужирт саван",
      productId: 1,
      variant: null,
      quantity: 3,
    });
    // The tool confirms the line and flags that details are still needed; the
    // question itself is added once per turn by the caller, so two products
    // named in one message are not asked for them twice.
    expect(result.text).toContain("Хужирт саван — 3ш");
    expect(result.needsOrderDetails).toBe(true);
    expect(ORDER_DETAILS_ASK).toContain("Утасны дугаар");
    expect(ORDER_DETAILS_ASK).toContain("Хүргэлтийн хаяг");
  });

  it("defaults the quantity to 1", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, { productName: "Саван" }, context());

    expect(result.leads?.[0]?.quantity).toBe(1);
  });

  it("ignores a zero, negative or non-numeric quantity", async () => {
    for (const quantity of [0, -5, "гурав", null]) {
      const result = await runTool(
        TOOL_NAMES.START_ORDER,
        { productName: "Саван", quantity },
        context(),
      );
      expect(result.leads?.[0]?.quantity).toBe(1);
    }
  });

  it("floors a fractional quantity", async () => {
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Саван", quantity: 2.7 },
      context(),
    );

    expect(result.leads?.[0]?.quantity).toBe(2);
  });

  it("asks which product when none was named, and captures no lead", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, {}, context());

    expect(result.leads ?? []).toHaveLength(0);
    expect(result.text).toContain("Аль бүтээгдэхүүн");
  });

  it("resolves a productId from a carousel button into the product's name", async () => {
    const ctx = context({
      storefront: storefront({
        products: [product({ id: 7, name: "Ванны давс" }), product({ id: 8, name: "Үсний тос" })],
      }),
    });

    const result = await runTool(TOOL_NAMES.START_ORDER, { productId: 8 }, ctx);

    expect(result.leads?.[0]).toEqual({
      productName: "Үсний тос",
      productId: 8,
      variant: null,
      quantity: 1,
    });
  });

  it("prefers a resolved productId over a name the model guessed", async () => {
    const ctx = context({
      storefront: storefront({ products: [product({ id: 7, name: "Ванны давс" })] }),
    });

    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productId: 7, productName: "Буруу нэр" },
      ctx,
    );

    expect(result.leads?.[0]?.productName).toBe("Ванны давс");
  });

  it("keeps the given name when the productId matches nothing", async () => {
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productId: 999, productName: "Хужирт саван" },
      context(),
    );

    expect(result.leads?.[0]?.productName).toBe("Хужирт саван");
  });

  it("asks which product when an unknown id arrives with no name", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, { productId: 999 }, context());

    expect(result.leads ?? []).toHaveLength(0);
  });
});

describe("transfer_to_staff", () => {
  it("returns a handover reason for the admin", async () => {
    const result = await runTool(
      TOOL_NAMES.TRANSFER_TO_STAFF,
      { reason: "Буцаалт хүсэж байна" },
      context(),
    );

    expect(result.handoverReason).toBe("Буцаалт хүсэж байна");
    expect(result.text).toContain("Ажилтан руу шилжүүллээ");
  });

  it("supplies a default reason when the model gave none", async () => {
    const result = await runTool(TOOL_NAMES.TRANSFER_TO_STAFF, {}, context());

    expect(result.handoverReason).toBe("Хэрэглэгч ажилтантай ярихыг хүссэн");
  });
});

describe("unknown tool", () => {
  it("returns an empty outcome instead of throwing", async () => {
    await expect(runTool("make_me_a_sandwich", {}, context())).resolves.toEqual({ text: "" });
  });
});
