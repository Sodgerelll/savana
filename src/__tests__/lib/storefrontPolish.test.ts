import { describe, it, expect } from "vitest";
import type { Product } from "../../data/products";
import { normalizeShopSettings } from "../../data/storefront";
import {
  formatStoreDate,
  getRemainingStock,
  isProductSoldOut,
} from "../../lib/storefrontHelpers";

const product = (overrides: Partial<Product>): Product => ({
  id: 1,
  name: "Календула саван",
  price: 5500,
  description: "",
  category: "soap",
  images: [],
  status: "active",
  ...overrides,
});

describe("stock on the storefront", () => {
  it("counts what is left of a plain product", () => {
    expect(getRemainingStock(product({ totalStock: 10, soldCount: 4 }))).toBe(6);
    expect(isProductSoldOut(product({ totalStock: 10, soldCount: 10 }))).toBe(true);
  });

  it("counts each variant on its own, so one oversold size cannot hide another in stock", () => {
    const soap = product({
      soldCount: 50,
      variants: [
        { name: "85 гр", price: 8800, quantity: 10, soldCount: 15 },
        { name: "35 гр", price: 3300, quantity: 5, soldCount: 0 },
      ],
    });
    expect(getRemainingStock(soap)).toBe(5);
    expect(isProductSoldOut(soap)).toBe(false);
  });

  it("treats a product whose every variant is gone as sold out", () => {
    expect(
      isProductSoldOut(product({ variants: [{ name: "85 гр", price: 8800, quantity: 3, soldCount: 3 }] })),
    ).toBe(true);
  });
});

describe("formatStoreDate", () => {
  it("spells the date out in Mongolian instead of falling back to English", () => {
    expect(formatStoreDate("2026-03-10", "MN")).toBe("2026 оны 3-р сарын 10");
  });

  it("keeps the English long form for English", () => {
    expect(formatStoreDate("2026-03-10T12:00:00", "EN")).toBe("March 10, 2026");
  });

  it("returns an unparseable value as written", () => {
    expect(formatStoreDate("удахгүй", "MN")).toBe("удахгүй");
  });
});

describe("journal placeholders", () => {
  it("swaps a stored launch placeholder for the matching real article, keeping its id and status", () => {
    const { journalEntries } = normalizeShopSettings({
      journalEntries: [
        {
          id: 7,
          titleEn: "Designing a storefront that feels tactile and slow",
          titleMn: "Мэдрэмжтэй, тайван хэмнэлтэй storefront хэрхэн бүрддэг вэ",
          status: "inactive",
        },
      ],
    });
    expect(journalEntries[0].id).toBe(7);
    expect(journalEntries[0].status).toBe("inactive");
    expect(journalEntries[0].titleMn).not.toContain("storefront");
  });

  it("leaves an article the shop wrote itself alone", () => {
    const { journalEntries } = normalizeShopSettings({
      journalEntries: [{ id: 1, titleEn: "Our new honey soap", titleMn: "Шинэ зөгийн балтай саван" }],
    });
    expect(journalEntries[0].titleMn).toBe("Шинэ зөгийн балтай саван");
  });
});
