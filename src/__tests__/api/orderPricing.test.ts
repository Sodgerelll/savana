import { describe, it, expect } from "vitest";
import {
  OrderPricingError,
  discountedUnitPrice,
  priceWebOrder,
  ulaanbaatarDateKey,
  type OrderPricingInputs,
} from "../../../api/_lib/orderPricing";

function inputs(overrides: Partial<OrderPricingInputs> = {}): OrderPricingInputs {
  return {
    products: new Map<number, Record<string, unknown> | null>([
      [1, { name: "Саван", category: "soap", price: 10000 }],
      [
        2,
        {
          name: "Шампунь",
          category: "hair",
          price: 15000,
          variants: [
            { name: "250 мл", price: 15000 },
            { name: "500 мл", price: 25000 },
          ],
        },
      ],
      [3, { name: "Хуучин", category: "soap", price: 9000, status: "inactive" }],
      [4, { name: "Үнэгүй", category: "soap", price: 0 }],
      // Base price deliberately not the size's: the base figure must never be charged.
      [5, { name: "Чага саван", category: "soap", price: 8800, variants: [{ name: "95 гр", price: 12800 }] }],
    ]),
    discounts: [],
    settings: { shippingFee: 8000, freeShippingThreshold: 0, vatMode: "none" },
    today: "2026-09-28",
    ...overrides,
  };
}

describe("priceWebOrder", () => {
  it("prices every line from the catalogue, ignoring what the browser claimed", () => {
    const { items, totals } = priceWebOrder(
      // The browser says 1₮ a piece; the catalogue says 10000.
      [{ productId: 1, quantity: 2, unitPrice: 1, lineTotal: 2 } as never],
      inputs(),
    );

    expect(items[0]).toMatchObject({ productId: 1, unitPrice: 10000, lineTotal: 20000, name: "Саван" });
    expect(totals).toEqual({
      subtotal: 20000,
      shippingFee: 8000,
      grandTotal: 28000,
      discountTotal: 0,
      vatMode: "none",
      vatAmount: 0,
    });
  });

  it("uses the named variant's own price", () => {
    const { items } = priceWebOrder([{ productId: 2, variant: "500 мл", quantity: 1 }], inputs());

    expect(items[0]).toMatchObject({ unitPrice: 25000, variant: "500 мл" });
  });

  it("never charges a sized product's base price for a line without a size", () => {
    // One size: that size, at its own price, named on the line so the paid step moves its stock.
    const single = priceWebOrder([{ productId: 5, quantity: 2 }], inputs());
    expect(single.items[0]).toMatchObject({ variant: "95 гр", unitPrice: 12800, lineTotal: 25600 });
    expect(single.totals.grandTotal).toBe(25600 + 8000);

    // Several sizes: the shopper has to choose.
    expect(() => priceWebOrder([{ productId: 2, quantity: 1 }], inputs())).toThrow(
      expect.objectContaining({ code: "VARIANT_REQUIRED" }),
    );
  });

  it("invoices a mixed basket for the sum of every line's own price", () => {
    const { items, totals } = priceWebOrder(
      [
        { productId: 1, quantity: 3 },
        { productId: 2, variant: "250 мл", quantity: 1 },
        { productId: 2, variant: "500 мл", quantity: 2 },
        { productId: 5, variant: "95 гр", quantity: 1 },
      ],
      inputs(),
    );

    expect(items.map((item) => item.lineTotal)).toEqual([30000, 15000, 50000, 12800]);
    expect(totals).toMatchObject({ subtotal: 107800, shippingFee: 8000, grandTotal: 115800 });
  });

  it("applies the live discount and records what it saved", () => {
    const { items, totals } = priceWebOrder(
      [{ productId: 1, quantity: 2 }],
      inputs({
        discounts: [
          { productId: 1, status: "active", type: "percent", value: 20, startAt: "2026-09-01", endAt: "2026-09-30" },
        ],
      }),
    );

    expect(items[0]).toMatchObject({ unitPrice: 8000, originalUnitPrice: 10000 });
    expect(totals.discountTotal).toBe(4000);
  });

  it("ignores a discount that is inactive or outside its dates", () => {
    const { items } = priceWebOrder(
      [{ productId: 1, quantity: 1 }],
      inputs({
        discounts: [
          { productId: 1, status: "inactive", type: "percent", value: 50, startAt: "2026-09-01", endAt: "2026-09-30" },
          { productId: 1, status: "active", type: "amount", value: 3000, startAt: "2026-10-01", endAt: "2026-10-30" },
        ],
      }),
    );

    expect(items[0].unitPrice).toBe(10000);
  });

  it("waives delivery above the free-shipping threshold", () => {
    const { totals } = priceWebOrder(
      [{ productId: 1, quantity: 5 }],
      inputs({ settings: { shippingFee: 8000, freeShippingThreshold: 50000, vatMode: "none" } }),
    );

    expect(totals).toMatchObject({ subtotal: 50000, shippingFee: 0, grandTotal: 50000 });
  });

  it("charges the fee the settings name, not a fixed 8000", () => {
    const { totals } = priceWebOrder([{ productId: 1, quantity: 1 }], inputs({ settings: { shippingFee: 5000 } }));

    expect(totals).toMatchObject({ shippingFee: 5000, grandTotal: 15000 });
  });

  it("bills НӨАТ on top in 'added' mode and only records it in 'included' mode", () => {
    const added = priceWebOrder([{ productId: 1, quantity: 1 }], inputs({ settings: { shippingFee: 0, vatMode: "added" } }));
    expect(added.totals).toMatchObject({ vatAmount: 1000, grandTotal: 11000 });

    const included = priceWebOrder(
      [{ productId: 1, quantity: 1 }],
      inputs({ settings: { shippingFee: 0, vatMode: "included" } }),
    );
    expect(included.totals).toMatchObject({ vatAmount: 909, grandTotal: 10000 });
  });

  it("refuses an order below the shop's delivery minimum", () => {
    expect(() =>
      priceWebOrder([{ productId: 1, quantity: 1 }], inputs({ settings: { minOrderForDelivery: 20000 } })),
    ).toThrow(expect.objectContaining({ code: "BELOW_MINIMUM" }));
  });

  describe("pickup", () => {
    const shop = { shippingFee: 8000, minOrderForDelivery: 40000 };

    it("lets an order below the delivery minimum be collected, with no delivery fee", () => {
      const { totals } = priceWebOrder([{ productId: 1, quantity: 1 }], inputs({ settings: shop }), "pickup");

      expect(totals).toMatchObject({ subtotal: 10000, shippingFee: 0, grandTotal: 10000 });
    });

    it("charges no delivery fee on a collected order above the minimum either", () => {
      const { totals } = priceWebOrder([{ productId: 1, quantity: 5 }], inputs({ settings: shop }), "pickup");

      expect(totals).toMatchObject({ subtotal: 50000, shippingFee: 0, grandTotal: 50000 });
    });

    it("delivers from the minimum on, for the fee", () => {
      const { totals } = priceWebOrder([{ productId: 1, quantity: 4 }], inputs({ settings: shop }), "delivery");

      expect(totals).toMatchObject({ subtotal: 40000, shippingFee: 8000, grandTotal: 48000 });
    });
  });

  it("refuses unknown, inactive and unpriced products, unknown variants and bad quantities", () => {
    const attempt = (item: Record<string, unknown>) => () => priceWebOrder([item], inputs());

    expect(attempt({ productId: 99, quantity: 1 })).toThrow(OrderPricingError);
    expect(attempt({ productId: 3, quantity: 1 })).toThrow(OrderPricingError);
    expect(attempt({ productId: 4, quantity: 1 })).toThrow(OrderPricingError);
    expect(attempt({ productId: 2, variant: "1 л", quantity: 1 })).toThrow(OrderPricingError);
    expect(attempt({ productId: 1, quantity: 0 })).toThrow(OrderPricingError);
    expect(attempt({ productId: 1, quantity: 1.5 })).toThrow(OrderPricingError);
    expect(attempt({ productId: 1, quantity: 5000 })).toThrow(OrderPricingError);
  });

  it("refuses an empty basket", () => {
    expect(() => priceWebOrder([], inputs())).toThrow(OrderPricingError);
  });
});

describe("discountedUnitPrice", () => {
  it("takes the discount that leaves the lower price when two overlap", () => {
    const discounts = [
      { productId: 1, status: "active", type: "amount", value: 1000, startAt: "2026-09-01", endAt: "2026-09-30" },
      { productId: 1, status: "active", type: "percent", value: 20, startAt: "2026-09-01", endAt: "2026-09-30" },
    ];

    expect(discountedUnitPrice(10000, 1, discounts, "2026-09-28")).toBe(8000);
  });
});

describe("ulaanbaatarDateKey", () => {
  it("is already the next day in Ulaanbaatar late in the UTC evening", () => {
    expect(ulaanbaatarDateKey(new Date("2026-09-27T17:30:00.000Z"))).toBe("2026-09-28");
  });
});
