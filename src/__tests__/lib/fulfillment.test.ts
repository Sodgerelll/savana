import { describe, it, expect } from "vitest";
import { resolveFulfillment } from "../../lib/fulfillment";

describe("resolveFulfillment", () => {
  it("only allows pickup below the 40,000₮ minimum, whatever was chosen", () => {
    expect(resolveFulfillment(10_000, 40_000, "delivery")).toEqual({
      deliveryAvailable: false,
      amountToDelivery: 30_000,
      fulfillment: "pickup",
    });
  });

  it("opens delivery from the minimum on, and keeps the shopper's choice", () => {
    expect(resolveFulfillment(40_000, 40_000, "delivery")).toMatchObject({ deliveryAvailable: true, fulfillment: "delivery" });
    expect(resolveFulfillment(52_000, 40_000, "pickup")).toMatchObject({ deliveryAvailable: true, fulfillment: "pickup" });
  });

  it("delivers any order when the shop sets no minimum (the setting at 0)", () => {
    expect(resolveFulfillment(10_000, 0, "delivery")).toMatchObject({ deliveryAvailable: true, fulfillment: "delivery" });
  });
});
