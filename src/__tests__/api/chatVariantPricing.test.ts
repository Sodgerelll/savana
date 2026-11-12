import { describe, it, expect, vi, beforeEach } from "vitest";

import { priceChatLines } from "../../../api/chat/_lib/chatOrder";
import { resolveVariant } from "../../../api/chat/_lib/catalogueMatch";
import { runTool, TOOL_NAMES, VariantRequiredError, type ToolContext } from "../../../api/chat/_lib/tools";
import type { PromptProduct, StorefrontContext } from "../../../api/chat/_lib/buildPrompt";

function product(overrides: Partial<PromptProduct> = {}): PromptProduct {
  return {
    id: 1,
    sortOrder: 10,
    name: "Хужирт саван",
    price: 8800,
    category: "soap",
    description: "",
    ingredients: "",
    howToUse: "",
    sizeLabel: "",
    variants: [],
    inStock: true,
    stock: -1,
    bestSeller: false,
    ...overrides,
  };
}

// Base prices deliberately differ from every size's, as they do in the live catalogue.
const bathSalt = product({
  id: 2,
  name: "Ванны давс",
  price: 13200,
  variants: [
    { name: "70 гр", price: 4400, inStock: true, stock: 10 },
    { name: "1500 гр", price: 66000, inStock: true, stock: 3 },
  ],
});
const chaga = product({
  id: 3,
  name: "Чага мөөгтэй саван",
  price: 8800,
  variants: [{ name: "95 гр /хайрцагтай/", price: 12800, inStock: true, stock: 5 }],
});
const towel = product({
  id: 4,
  name: "Алчуур",
  price: 9000,
  variants: [
    { name: "Жижиг", price: 0, inStock: true, stock: 5 },
    { name: "Том", price: 15000, inStock: true, stock: 5 },
  ],
});

function storefront(products: PromptProduct[]): StorefrontContext {
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
    products,
    discounts: [],
    faqs: [],
    basePrompt: "",
    knowledgePoints: [],
    botName: "",
  } as StorefrontContext;
}

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    storefront: storefront([product(), bathSalt, chaga, towel]),
    imageUrlFor: (p) => `https://savana.mn/img/${p.id}.jpg`,
    lookupOrder: async () => null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolveVariant", () => {
  it("takes the named size, the only size, or asks", () => {
    expect(resolveVariant(bathSalt.variants, "1500 ГР").variant?.name).toBe("1500 гр");
    expect(resolveVariant(chaga.variants, undefined)).toMatchObject({ variant: chaga.variants[0], needsChoice: false });
    expect(resolveVariant(bathSalt.variants, "3 кг")).toEqual({ variant: undefined, needsChoice: true });
    expect(resolveVariant([], "")).toEqual({ variant: undefined, needsChoice: false });
  });
});

describe("priceChatLines", () => {
  const shop = storefront([product(), bathSalt, chaga, towel]);

  it("invoices every line at its own size's price, never the base price", () => {
    const { items, unmatched } = priceChatLines(
      [
        { productId: 1, name: "Хужирт саван", quantity: 2 },
        { productId: 2, name: "Ванны давс", variant: "1500 гр", quantity: 1 },
        // One size and none named: that size, at its own 12,800₮ rather than the 8,800₮ base.
        { productId: 3, name: "Чага мөөгтэй саван", variant: null, quantity: 1 },
      ],
      shop,
    );

    expect(unmatched).toEqual([]);
    expect(items.map(({ variant, unitPrice, lineTotal }) => ({ variant, unitPrice, lineTotal }))).toEqual([
      { variant: null, unitPrice: 8800, lineTotal: 17600 },
      { variant: "1500 гр", unitPrice: 66000, lineTotal: 66000 },
      { variant: "95 гр /хайрцагтай/", unitPrice: 12800, lineTotal: 12800 },
    ]);
  });

  it("asks which size instead of billing a sized product's base price", () => {
    expect(() => priceChatLines([{ productId: 2, name: "Ванны давс", quantity: 1 }], shop)).toThrow(
      VariantRequiredError,
    );
  });

  it("leaves out a size that has no price rather than billing it at 0₮", () => {
    const { items, unmatched } = priceChatLines(
      [
        { productId: 4, name: "Алчуур", variant: "Жижиг", quantity: 1 },
        { productId: 1, name: "Хужирт саван", quantity: 1 },
      ],
      shop,
    );

    expect(items).toHaveLength(1);
    expect(unmatched).toEqual(["Алчуур (Жижиг)"]);
  });
});

describe("start_order with sized products", () => {
  it("asks for the size and holds back the contact details instead of quoting the base price", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, { items: [{ productName: "Ванны давс" }] }, context());

    expect(result.text).toContain("аль хэмжээгээр");
    expect(result.text).toContain("70 гр");
    expect(result.text).not.toContain("13,200");
    expect(result.needsOrderDetails).toBe(false);
  });

  it("records the only size of a one-size product, so the total quoted is that size's", async () => {
    const result = await runTool(TOOL_NAMES.START_ORDER, { items: [{ productName: "Чага мөөгтэй саван" }] }, context());

    expect(result.leads?.[0].variant).toBe("95 гр /хайрцагтай/");
    expect(result.text).toContain("12,800");
  });

  it("lets the size the customer then names replace the line that had none", async () => {
    const result = await runTool(
      TOOL_NAMES.START_ORDER,
      { items: [{ productName: "Ванны давс", variant: "70 гр", quantity: 2 }] },
      context({
        basket: async () => [{ productId: 2, name: "Ванны давс", variant: null, quantity: 2 }],
      }),
    );

    expect(result.leads).toEqual([{ productName: "Ванны давс", productId: 2, variant: "70 гр", quantity: 2 }]);
    expect(result.needsOrderDetails).toBe(true);
  });
});

describe("confirm_order with a size still open", () => {
  it("asks which size rather than handing the customer to staff", async () => {
    const result = await runTool(
      TOOL_NAMES.CONFIRM_ORDER,
      { customerName: "Бат", phone: "99112233", address: "БЗД 1-р хороо" },
      context({
        placeOrder: async () => {
          throw new VariantRequiredError("Ванны давс", ["70 гр", "1500 гр"]);
        },
      }),
    );

    expect(result.text).toContain("Ванны давс");
    expect(result.text).toContain("1500 гр");
    expect(result.handoverReason).toBeUndefined();
  });
});
