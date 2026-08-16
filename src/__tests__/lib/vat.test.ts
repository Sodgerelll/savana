import { describe, it, expect } from "vitest";
import { calculateVat, normalizeVatMode, VAT_RATE, vatCarriedBy } from "../../lib/vat";

describe("calculateVat", () => {
  it("carves the tax out of a price that already contains it", () => {
    // 11000 gross at 10% → 1000 of tax, 10000 net.
    expect(calculateVat(11000, "included")).toBe(1000);
  });

  it("charges the tax on top of a net price", () => {
    expect(calculateVat(10000, "added")).toBe(1000);
  });

  it("is zero when the sale carries no tax", () => {
    expect(calculateVat(10000, "none")).toBe(0);
  });

  it("is zero for a zero or negative base", () => {
    expect(calculateVat(0, "included")).toBe(0);
    expect(calculateVat(-500, "added")).toBe(0);
  });

  it("rounds to whole tugriks", () => {
    expect(Number.isInteger(calculateVat(3333, "included"))).toBe(true);
    expect(Number.isInteger(calculateVat(3333, "added"))).toBe(true);
  });

  it("uses the single Mongolian rate", () => {
    expect(VAT_RATE).toBe(0.1);
  });
});

describe("vatCarriedBy", () => {
  it("reads the same tax out of a gross total whichever mode produced it", () => {
    // `added`: 10000 net + 1000 tax = 11000 gross.
    // `included`: 11000 gross already contains the same 1000.
    // By the time a total is stored it is gross either way, so both must agree.
    expect(vatCarriedBy(11000, "added")).toBe(1000);
    expect(vatCarriedBy(11000, "included")).toBe(1000);
  });

  it("is zero for a VAT-free total", () => {
    expect(vatCarriedBy(11000, "none")).toBe(0);
  });
});

describe("normalizeVatMode", () => {
  it("keeps the two real modes", () => {
    expect(normalizeVatMode("included")).toBe("included");
    expect(normalizeVatMode("added")).toBe("added");
  });

  it("treats anything unrecognised as VAT-free, which is how untagged records behave", () => {
    expect(normalizeVatMode(undefined)).toBe("none");
    expect(normalizeVatMode(null)).toBe("none");
    expect(normalizeVatMode("vat")).toBe("none");
    expect(normalizeVatMode(10)).toBe("none");
  });
});
