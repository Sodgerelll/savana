import { describe, it, expect } from "vitest";
import { DEFAULT_SHIPPING_FEE, normalizeShopSettings } from "../../data/storefront";

/**
 * The shop's own answer to "how much is delivery" has always promised it free
 * above a figure, while the checkout charged the flat fee on every order. These
 * cover the setting that makes the promise true — and the default that leaves
 * an existing install charging exactly what it charged yesterday.
 */
describe("normalizeShopSettings — delivery", () => {
  it("starts with no free-delivery promise", () => {
    // 0 means "no rule", not "free from 0₮".
    expect(normalizeShopSettings(undefined).freeShippingThreshold).toBe(0);
    expect(normalizeShopSettings({}).freeShippingThreshold).toBe(0);
    expect(normalizeShopSettings({}).shippingFee).toBe(DEFAULT_SHIPPING_FEE);
  });

  it("keeps a threshold the shop configured", () => {
    expect(normalizeShopSettings({ freeShippingThreshold: 80_000 }).freeShippingThreshold).toBe(
      80_000,
    );
  });

  it("rounds a threshold typed with decimals", () => {
    expect(normalizeShopSettings({ freeShippingThreshold: 79_999.6 }).freeShippingThreshold).toBe(
      80_000,
    );
  });

  it("ignores a threshold that is not a usable number", () => {
    // A blank field, a word or a negative would otherwise reach the checkout and
    // either waive every fee or charge a nonsense one.
    for (const bad of [null, "", "олон", -5000, Number.NaN]) {
      expect(normalizeShopSettings({ freeShippingThreshold: bad }).freeShippingThreshold).toBe(0);
    }
  });
});
