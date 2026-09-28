import { describe, it, expect } from "vitest";
import { completesReturn, retailReturnMoney, type RetailReturnRecord } from "../../lib/returns";

function priorReturn(totalAmount: number, vatAmount = 0): RetailReturnRecord {
  return {
    id: "r",
    items: [],
    subtotal: totalAmount - vatAmount,
    vatAmount,
    totalAmount,
    reason: "",
    journalEntryId: null,
    createdByUid: "",
    createdByName: "",
    createdAt: null,
  };
}

describe("retailReturnMoney", () => {
  const base = { allLinesValue: 20000, priorReturns: [], completesReturn: false } as const;

  it("returns the face value when nothing was discounted and no НӨАТ applies", () => {
    expect(
      retailReturnMoney({ ...base, linesValue: 10000, chargedGoodsValue: 20000, chargedVat: 0, vatMode: "none" }),
    ).toEqual({ net: 10000, vat: 0, gross: 10000 });
  });

  it("carves the tax out in 'included' mode", () => {
    expect(
      retailReturnMoney({ ...base, linesValue: 11000, chargedGoodsValue: 20000, chargedVat: 1818, vatMode: "included" }),
    ).toEqual({ net: 10000, vat: 1000, gross: 11000 });
  });

  it("gives the tax back on top in 'added' mode", () => {
    expect(
      retailReturnMoney({ ...base, linesValue: 10000, chargedGoodsValue: 20000, chargedVat: 2000, vatMode: "added" }),
    ).toEqual({ net: 10000, vat: 1000, gross: 11000 });
  });

  it("scales lines by the whole-sale discount the buyer got", () => {
    expect(
      retailReturnMoney({ ...base, linesValue: 10000, chargedGoodsValue: 15000, chargedVat: 0, vatMode: "none" }),
    ).toEqual({ net: 7500, vat: 0, gross: 7500 });
  });

  it("takes exactly what is left on the return that brings the last units back", () => {
    expect(
      retailReturnMoney({
        linesValue: 6667,
        allLinesValue: 20000,
        chargedGoodsValue: 20000,
        chargedVat: 0,
        vatMode: "none",
        priorReturns: [priorReturn(6667), priorReturn(6667)],
        completesReturn: true,
      }),
    ).toEqual({ net: 6666, vat: 0, gross: 6666 });
  });

  it("never gives back more than is still outstanding", () => {
    expect(
      retailReturnMoney({
        linesValue: 10000,
        allLinesValue: 20000,
        chargedGoodsValue: 20000,
        chargedVat: 0,
        vatMode: "none",
        priorReturns: [priorReturn(15000)],
        completesReturn: false,
      }),
    ).toEqual({ net: 5000, vat: 0, gross: 5000 });
  });
});

describe("completesReturn", () => {
  const items = [
    { productId: 1, variant: null, quantity: 2 },
    { productId: 2, variant: "L", quantity: 1 },
  ];

  it("is true only when every unit of every line is back", () => {
    expect(completesReturn(items, [], [{ productId: 1, variant: null, quantity: 2 }])).toBe(false);
    expect(
      completesReturn(items, [], [
        { productId: 1, variant: null, quantity: 2 },
        { productId: 2, variant: "L", quantity: 1 },
      ]),
    ).toBe(true);
  });

  it("counts earlier returns", () => {
    const earlier: RetailReturnRecord = {
      ...priorReturn(0),
      items: [{ productId: 1, variant: null, name: "", quantity: 2, unitPrice: 0 }],
    };
    expect(completesReturn(items, [earlier], [{ productId: 2, variant: "L", quantity: 1 }])).toBe(true);
  });
});
