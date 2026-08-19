import { describe, it, expect, vi } from "vitest";

vi.mock("../../../api/bonum/_client", () => ({ bonumPost: vi.fn() }));

import { orderNumberFromId, shippingFeeFor, vatFor } from "../../../api/chat/_lib/chatOrder";

describe("orderNumberFromId", () => {
  it("matches the series the storefront checkout writes", () => {
    // Same shape as documentNumberFromId in src/lib/documentNumbers.ts, so an
    // order taken in Messenger is indistinguishable from one taken on the site.
    const number = orderNumberFromId("abc123XYZ789", new Date("2026-08-19T04:00:00.000Z"));

    expect(number).toMatch(/^ORD-\d{6}-[A-Z0-9]{6}$/);
    expect(number.endsWith("XYZ789")).toBe(true);
  });

  it("dates the number in Ulaanbaatar, not UTC", () => {
    // 23:30 UTC is already the next day in Ulaanbaatar (UTC+8), and the number
    // has to agree with the day the shop thinks it is.
    const late = orderNumberFromId("aaaaaa", new Date("2026-08-19T23:30:00.000Z"));

    expect(late).toBe("ORD-260820-AAAAAA");
  });

  it("survives a document id shorter than the suffix", () => {
    expect(orderNumberFromId("ab", new Date("2026-08-19T04:00:00.000Z"))).toBe("ORD-260819-AB");
  });
});

describe("shippingFeeFor", () => {
  it("charges the fee below the threshold", () => {
    expect(shippingFeeFor(79_000, 8000, 80_000)).toBe(8000);
  });

  it("waives it at the threshold, not just above it", () => {
    // "80,000₮-өөс дээш" reads as inclusive to a customer, and the cheaper
    // reading is the one that does not turn a promise into a complaint.
    expect(shippingFeeFor(80_000, 8000, 80_000)).toBe(0);
    expect(shippingFeeFor(120_000, 8000, 80_000)).toBe(0);
  });

  it("keeps charging when no threshold is configured", () => {
    // 0 means the shop never promised free delivery, so nothing is given away.
    expect(shippingFeeFor(500_000, 8000, 0)).toBe(8000);
  });
});

describe("vatFor", () => {
  it("adds the tax on top when the shop bills it separately", () => {
    expect(vatFor(100_000, "added")).toBe(10_000);
  });

  it("finds the tax already inside the price when it is included", () => {
    // 110,000 gross carries 10,000 of tax, not 11,000 — the base is what the
    // tax was charged on, and getting this backwards misstates the ledger.
    expect(vatFor(110_000, "included")).toBe(10_000);
  });

  it("is nothing when the shop charges no VAT", () => {
    expect(vatFor(100_000, "none")).toBe(0);
  });

  it("is nothing on an empty or negative base", () => {
    expect(vatFor(0, "added")).toBe(0);
    expect(vatFor(-500, "added")).toBe(0);
  });
});
