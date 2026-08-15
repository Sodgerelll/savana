import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  buildProductCards,
  CHAT_TOOLS,
  normalizeOrderNumber,
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
});

describe("CHAT_TOOLS declarations", () => {
  const declarations = CHAT_TOOLS[0].functionDeclarations;

  it("declares exactly the five tools the webhook implements", () => {
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

  it("requires a product name for start_order", () => {
    const startOrder = declarations.find((d) => d.name === TOOL_NAMES.START_ORDER);
    expect(startOrder?.parameters?.required).toEqual(["productName"]);
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

describe("check_order", () => {
  it("reports the status and total of an existing order", async () => {
    const ctx = context({
      lookupOrder: async () => ({ orderNumber: "ORD-1", status: "delivering", grandTotal: 58000 }),
    });

    const result = await runTool(TOOL_NAMES.CHECK_ORDER, { orderNumber: "ord-1" }, ctx);

    expect(result.text).toContain("Хүргэлтэд гарсан");
    expect(result.text).toContain("58,000₮");
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
  it("captures a lead with the product and quantity", async () => {
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Хужирт саван", quantity: 3 },
      context(),
    );

    expect(result.lead).toEqual({ productName: "Хужирт саван", quantity: 3 });
    expect(result.text).toContain("утасны дугаараа");
  });

  it("defaults the quantity to 1", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, { productName: "Саван" }, context());

    expect(result.lead?.quantity).toBe(1);
  });

  it("ignores a zero, negative or non-numeric quantity", async () => {
    for (const quantity of [0, -5, "гурав", null]) {
      const result = await runTool(
        TOOL_NAMES.START_ORDER,
        { productName: "Саван", quantity },
        context(),
      );
      expect(result.lead?.quantity).toBe(1);
    }
  });

  it("floors a fractional quantity", async () => {
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productName: "Саван", quantity: 2.7 },
      context(),
    );

    expect(result.lead?.quantity).toBe(2);
  });

  it("asks which product when none was named, and captures no lead", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, {}, context());

    expect(result.lead).toBeUndefined();
    expect(result.text).toContain("Аль бүтээгдэхүүн");
  });

  it("resolves a productId from a carousel button into the product's name", async () => {
    const ctx = context({
      storefront: storefront({
        products: [product({ id: 7, name: "Ванны давс" }), product({ id: 8, name: "Үсний тос" })],
      }),
    });

    const result = await runTool(TOOL_NAMES.START_ORDER, { productId: 8 }, ctx);

    expect(result.lead).toEqual({ productName: "Үсний тос", quantity: 1 });
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

    expect(result.lead?.productName).toBe("Ванны давс");
  });

  it("keeps the given name when the productId matches nothing", async () => {
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { productId: 999, productName: "Хужирт саван" },
      context(),
    );

    expect(result.lead?.productName).toBe("Хужирт саван");
  });

  it("asks which product when an unknown id arrives with no name", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, { productId: 999 }, context());

    expect(result.lead).toBeUndefined();
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
