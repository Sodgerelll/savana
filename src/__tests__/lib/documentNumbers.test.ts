import { describe, it, expect, vi, beforeEach } from "vitest";

// One shared counter document per series, exactly like Firestore holds them.
const counters: Record<string, { lastNumber: number; year: number }> = {};

vi.mock("../../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, _collection: string, counterId: string) => ({ counterId })),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<unknown>) => {
    let counterId = "";
    return fn({
      get: vi.fn(async (ref: { counterId: string }) => {
        counterId = ref.counterId;
        const stored = counters[counterId];
        return { exists: () => stored !== undefined, data: () => stored };
      }),
      set: vi.fn((_ref: unknown, data: { lastNumber: number; year: number }) => {
        counters[counterId] = data;
      }),
    });
  }),
}));

import { documentNumberFromId, reserveDocumentNumber } from "../../lib/documentNumbers";

beforeEach(() => {
  for (const key of Object.keys(counters)) delete counters[key];
});

describe("reserveDocumentNumber", () => {
  it("starts a series at 1", async () => {
    expect(await reserveDocumentNumber("sale")).toBe(`SL-${new Date().getFullYear()}-00001`);
  });

  it("hands out consecutive numbers, so two concurrent callers cannot collide", async () => {
    const numbers = [
      await reserveDocumentNumber("sale"),
      await reserveDocumentNumber("sale"),
      await reserveDocumentNumber("sale"),
    ];
    const year = new Date().getFullYear();
    expect(numbers).toEqual([`SL-${year}-00001`, `SL-${year}-00002`, `SL-${year}-00003`]);
  });

  it("keeps each series on its own counter", async () => {
    await reserveDocumentNumber("sale");
    await reserveDocumentNumber("sale");

    expect(await reserveDocumentNumber("directSale")).toBe(`DS-${new Date().getFullYear()}-00001`);
  });

  it("restarts a year-scoped series when the stored year is stale", async () => {
    counters.sales = { lastNumber: 812, year: new Date().getFullYear() - 1 };

    expect(await reserveDocumentNumber("sale")).toBe(`SL-${new Date().getFullYear()}-00001`);
  });

  it("keeps counting across years for a flat series", async () => {
    counters.customers = { lastNumber: 812, year: new Date().getFullYear() - 1 };

    expect(await reserveDocumentNumber("customer")).toBe("CUS-0813");
  });

  it("grows past its padding rather than truncating", async () => {
    counters.crmContacts = { lastNumber: 9999, year: new Date().getFullYear() };

    expect(await reserveDocumentNumber("crmContact")).toBe("HAR-10000");
  });
});

describe("documentNumberFromId", () => {
  it("ends with the tail of the document id, which is already globally unique", () => {
    expect(documentNumberFromId("ORD", "abcdefGHIJKL")).toMatch(/^ORD-\d{6}-GHIJKL$/);
  });

  it("gives different documents different numbers", () => {
    // The old random three-character suffix could repeat; a Firestore id cannot.
    const a = documentNumberFromId("ORD", "aaaaaaaaaaaa");
    const b = documentNumberFromId("ORD", "bbbbbbbbbbbb");
    expect(a).not.toBe(b);
  });

  it("strips anything that is not a letter or digit", () => {
    expect(documentNumberFromId("ORD", "ab-cd_ef")).toMatch(/^ORD-\d{6}-[A-Z0-9]+$/);
  });

  it("copes with a short id", () => {
    expect(documentNumberFromId("ORD", "x7")).toMatch(/^ORD-\d{6}-X7$/);
  });
});
