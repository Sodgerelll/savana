import { describe, it, expect, vi, beforeEach } from "vitest";
import { firestoreMock } from "../helpers/firestoreMock";

vi.mock("../../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);

import {
  applyProductionIntake,
  applyStockMovement,
  availableStock,
  cogsForMovements,
  InsufficientStockError,
  MissingVariantError,
  ProductNotFoundError,
  readProductStockState,
  recountProductStock,
  writeProductStock,
  type ProductStockState,
} from "../../lib/inventory";

function state(data: Record<string, unknown>, productId: number | string = 10): ProductStockState {
  return readProductStockState(productId, data);
}

// ─── readProductStockState ────────────────────────────────────────────────────

describe("readProductStockState", () => {
  it("reads the totalStock/soldCount pair and the unit cost", () => {
    const s = state({ totalStock: 50, soldCount: 12, costPrice: 900 });
    expect(s).toMatchObject({ exists: true, totalStock: 50, soldCount: 12, costPrice: 900 });
  });

  it("treats a missing product as existing-nowhere with zeroed figures", () => {
    const s = readProductStockState(10, null);
    expect(s).toMatchObject({ exists: false, totalStock: 0, soldCount: 0 });
  });

  it("copies the variant array so adjusting it cannot mutate the caller's data", () => {
    const variants = [{ name: "85g", price: 1000, quantity: 10, soldCount: 2 }];
    const s = state({ variants });
    s.variants![0].soldCount = 99;
    expect(variants[0].soldCount).toBe(2);
  });
});

// ─── availableStock ───────────────────────────────────────────────────────────

describe("availableStock", () => {
  it("is totalStock minus soldCount for a plain product", () => {
    expect(availableStock(state({ totalStock: 50, soldCount: 12 }), null)).toBe(38);
  });

  it("uses the variant's own figures when one is named", () => {
    const s = state({
      totalStock: 30,
      soldCount: 5,
      variants: [
        { name: "85g", price: 1000, quantity: 10, soldCount: 4 },
        { name: "100g", price: 1200, quantity: 20, soldCount: 1 },
      ],
    });
    expect(availableStock(s, "85g")).toBe(6);
    expect(availableStock(s, "100g")).toBe(19);
  });

  it("falls back to the product total when the named variant does not exist", () => {
    const s = state({ totalStock: 30, soldCount: 5, variants: [{ name: "85g", price: 1000, quantity: 10 }] });
    expect(availableStock(s, "unknown")).toBe(25);
  });
});

// ─── applyStockMovement ───────────────────────────────────────────────────────

describe("applyStockMovement", () => {
  it("raises soldCount when goods leave", () => {
    const s = state({ totalStock: 50, soldCount: 10 });
    applyStockMovement(s, { variant: null, quantity: 5 });
    expect(s.soldCount).toBe(15);
  });

  it("lowers soldCount when goods come back", () => {
    const s = state({ totalStock: 50, soldCount: 10 });
    applyStockMovement(s, { variant: null, quantity: -5 });
    expect(s.soldCount).toBe(5);
  });

  it("moves the variant's own soldCount alongside the product total", () => {
    const s = state({
      totalStock: 30,
      soldCount: 5,
      variants: [{ name: "85g", price: 1000, quantity: 10, soldCount: 4 }],
    });
    applyStockMovement(s, { variant: "85g", quantity: 3 });
    expect(s.soldCount).toBe(8);
    expect(s.variants![0].soldCount).toBe(7);
  });

  it("refuses to send out a variant product without naming a variant", () => {
    // The movement used to land on the product-level counter alone, leaving the variant's
    // own figure behind — the two then disagreed for good.
    const s = state({
      totalStock: 30,
      soldCount: 5,
      variants: [{ name: "85g", price: 1000, quantity: 10, soldCount: 4 }],
    });
    expect(() => applyStockMovement(s, { variant: null, quantity: 3 }, { productName: "Soap" })).toThrow(
      MissingVariantError,
    );
    expect(s.soldCount).toBe(5);
  });

  it("still takes a variant-less movement for a product that has no variants", () => {
    const s = state({ totalStock: 30, soldCount: 5 });
    applyStockMovement(s, { variant: null, quantity: 3 });
    expect(s.soldCount).toBe(8);
  });

  it("lets a variant product take goods back without naming a variant", () => {
    // A return, a deleted sale and an un-settled order all come back through here, and
    // blocking them would leave the movement that took the goods impossible to undo.
    const s = state({
      totalStock: 30,
      soldCount: 5,
      variants: [{ name: "85g", price: 1000, quantity: 10, soldCount: 4 }],
    });
    applyStockMovement(s, { variant: null, quantity: -3 });
    expect(s.soldCount).toBe(2);
  });

  it("records a web order that names no variant — the money has already been taken", () => {
    const s = state({
      totalStock: 30,
      soldCount: 5,
      variants: [{ name: "85g", price: 1000, quantity: 10, soldCount: 4 }],
    });
    applyStockMovement(s, { variant: null, quantity: 3 }, { validate: false });
    expect(s.soldCount).toBe(8);
  });

  it("lets a caller re-apply a record's own variant-less units on purpose", () => {
    // An edited POS sale re-takes exactly what it was already holding. Refusing would only
    // make a sale recorded before variants had to be named impossible to correct.
    const s = state({
      totalStock: 30,
      soldCount: 5,
      variants: [{ name: "85g", price: 1000, quantity: 10, soldCount: 4 }],
    });
    applyStockMovement(s, { variant: null, quantity: 3 }, { requireVariant: false });
    expect(s.soldCount).toBe(8);
  });

  it("still refuses a re-applied movement that exceeds the shelf", () => {
    const s = state({ totalStock: 10, soldCount: 8 });
    expect(() =>
      applyStockMovement(s, { variant: null, quantity: 3 }, { requireVariant: false, productName: "Soap" }),
    ).toThrow(InsufficientStockError);
  });

  it("refuses to take more than is on the shelf", () => {
    const s = state({ totalStock: 10, soldCount: 8 });
    expect(() => applyStockMovement(s, { variant: null, quantity: 3 }, { productName: "Soap" })).toThrow(
      InsufficientStockError,
    );
  });

  it("reports how many are actually available in the error", () => {
    const s = state({ totalStock: 10, soldCount: 8 });
    try {
      applyStockMovement(s, { variant: null, quantity: 3 }, { productName: "Soap" });
      throw new Error("expected the movement to be refused");
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).available).toBe(2);
      expect((error as Error).message).toBe("INSUFFICIENT_STOCK:2");
    }
  });

  it("never blocks a return, however far it takes soldCount below zero", () => {
    // Clamping here is what used to lose quantity: a transaction that put back more than
    // it took could no longer be undone to the figure it started from.
    const s = state({ totalStock: 10, soldCount: 2 });
    applyStockMovement(s, { variant: null, quantity: -5 });
    expect(s.soldCount).toBe(-3);
  });

  it("skips validation when the caller asks it to", () => {
    const s = state({ totalStock: 10, soldCount: 8 });
    applyStockMovement(s, { variant: null, quantity: 5 }, { validate: false });
    expect(s.soldCount).toBe(13);
  });

  it("does nothing for a product that does not exist", () => {
    const s = readProductStockState(10, null);
    applyStockMovement(s, { variant: null, quantity: 5 });
    expect(s.soldCount).toBe(0);
  });

  it("is exactly reversible, so an edit nets back to where it started", () => {
    const s = state({ totalStock: 50, soldCount: 10 });
    applyStockMovement(s, { variant: null, quantity: 7 });
    applyStockMovement(s, { variant: null, quantity: -7 });
    expect(s.soldCount).toBe(10);
  });
});

// ─── applyProductionIntake ────────────────────────────────────────────────────

describe("applyProductionIntake", () => {
  it("raises totalStock for a plain product", () => {
    const s = state({ totalStock: 50, soldCount: 10 });
    applyProductionIntake(s, null, 25);
    expect(s.totalStock).toBe(75);
  });

  it("raises the named variant and keeps totalStock mirroring the variant sum", () => {
    const s = state({
      totalStock: 30,
      variants: [
        { name: "85g", price: 1000, quantity: 10 },
        { name: "100g", price: 1200, quantity: 20 },
      ],
    });
    applyProductionIntake(s, "85g", 15);
    expect(s.variants![0].quantity).toBe(25);
    expect(s.totalStock).toBe(45);
  });

  it("reverses cleanly when a completed batch is deleted", () => {
    const s = state({ totalStock: 50 });
    applyProductionIntake(s, null, 25);
    applyProductionIntake(s, null, -25);
    expect(s.totalStock).toBe(50);
  });
});

// ─── writeProductStock ────────────────────────────────────────────────────────

describe("writeProductStock", () => {
  it("writes only the stock fields, never the whole product", () => {
    const writes: Array<Record<string, unknown>> = [];
    const writer = { update: (_ref: unknown, data: Record<string, unknown>) => writes.push(data) };

    writeProductStock(writer, state({ totalStock: 50, soldCount: 10 }));

    // Nothing about name, price or images — a stock movement must not be able to overwrite
    // a concurrent catalogue edit.
    expect(Object.keys(writes[0]).sort()).toEqual(["soldCount", "totalStock", "updatedAt"]);
  });

  it("includes variants only for products that have them", () => {
    const writes: Array<Record<string, unknown>> = [];
    const writer = { update: (_ref: unknown, data: Record<string, unknown>) => writes.push(data) };

    writeProductStock(writer, state({ variants: [{ name: "85g", price: 1000, quantity: 10 }] }));

    expect(writes[0]).toHaveProperty("variants");
  });

  it("writes nothing for a product that does not exist", () => {
    const writes: unknown[] = [];
    const writer = { update: (_ref: unknown, data: unknown) => writes.push(data) };

    writeProductStock(writer, readProductStockState(10, null));

    expect(writes).toHaveLength(0);
  });
});

// ─── cogsForMovements ─────────────────────────────────────────────────────────

describe("cogsForMovements", () => {
  it("prices each movement at the product's unit cost", () => {
    const states = new Map([
      [10, state({ costPrice: 900 }, 10)],
      [11, state({ costPrice: 400 }, 11)],
    ]);

    const total = cogsForMovements(states, [
      { productId: 10, variant: null, quantity: 3 },
      { productId: 11, variant: null, quantity: 5 },
    ]);

    expect(total).toBe(900 * 3 + 400 * 5);
  });

  it("counts nothing for a product with no recorded cost", () => {
    const states = new Map([[10, state({ costPrice: 0 }, 10)]]);
    expect(cogsForMovements(states, [{ productId: 10, variant: null, quantity: 3 }])).toBe(0);
  });
});

// ─── recountProductStock ──────────────────────────────────────────────────────

describe("recountProductStock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMock.reset();
  });

  const count = {
    reason: "сарын тооллого",
    createdBy: "uid-1",
    createdByName: "Sodo",
  };

  it("repairs a counter that drifted below zero and derives totalStock from the count", async () => {
    // Four units were given back that the counter never recorded leaving, so the shelf
    // reads four higher than it is: totalStock 100 with soldCount −4 shows 104 remaining.
    firestoreMock.seed("products/211", { totalStock: 100, soldCount: -4 });

    await recountProductStock({ productId: 211, productName: "Саван", remaining: 96, soldCount: 0, ...count });

    expect(firestoreMock.lastWriteData("products/211")).toMatchObject({ totalStock: 96, soldCount: 0 });
  });

  it("files the correction, its reason and the person in stock movements", async () => {
    firestoreMock.seed("products/211", { totalStock: 100, soldCount: -4 });

    await recountProductStock({ productId: 211, productName: "Саван", remaining: 96, soldCount: 0, ...count });

    const movement = firestoreMock.writes.find((write) => write.path.startsWith("stockMovements/"));
    expect(movement?.data).toMatchObject({
      productId: 211,
      type: "ADJUSTMENT",
      // The count found 8 fewer on the shelf than the drifted figures claimed.
      quantity: -8,
      balanceAfter: 96,
      before: { totalStock: 100, soldCount: -4, remaining: 104 },
      after: { totalStock: 96, soldCount: 0, remaining: 96 },
      reason: "сарын тооллого",
      createdBy: "uid-1",
      createdByName: "Sodo",
    });
  });

  it("counts each variant and mirrors the total, leaving an uncounted variant alone", async () => {
    firestoreMock.seed("products/211", {
      totalStock: 150,
      soldCount: -4,
      variants: [
        { name: "85 гр", price: 8000, quantity: 140, soldCount: 7 },
        { name: "35 гр", price: 3000, quantity: 10, soldCount: 0 },
      ],
    });

    await recountProductStock({
      productId: 211,
      productName: "Саван",
      remaining: 0,
      soldCount: 7,
      variants: [{ name: "85 гр", remaining: 120, soldCount: 7 }],
      ...count,
    });

    const written = firestoreMock.lastWriteData("products/211") as Record<string, unknown>;
    expect(written.variants).toEqual([
      { name: "85 гр", price: 8000, quantity: 127, soldCount: 7 },
      { name: "35 гр", price: 3000, quantity: 10, soldCount: 0 },
    ]);
    // totalStock mirrors the sum of variant quantities, never the product-level count.
    expect(written).toMatchObject({ totalStock: 137, soldCount: 7 });
  });

  it("refuses to invent a product that does not exist", async () => {
    await expect(
      recountProductStock({ productId: 999, productName: "Байхгүй", remaining: 5, soldCount: 0, ...count }),
    ).rejects.toThrow(ProductNotFoundError);
  });
});
