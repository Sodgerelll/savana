import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({ id: "productionRecipes" })),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _ts: true })),
  updateDoc: vi.fn(),
}));

import {
  buildSuppliesFromRecipe,
  calculateSuppliesCost,
  findRecipeFor,
  type ProductionRecipe,
} from "../../lib/productionRecipes";

function makeRecipe(overrides: Partial<ProductionRecipe> = {}): ProductionRecipe {
  return {
    id: "recipe-1",
    productId: 1,
    productName: "Organic Soap",
    category: "soap",
    variantName: "100g",
    baseQuantity: 10,
    supplies: [
      { rawMaterialId: 10, rawMaterialName: "Olive Oil", quantity: 2.5, unit: "L", unitCost: 8000 },
      { rawMaterialId: 11, rawMaterialName: "Lye", quantity: 0.4, unit: "kg", unitCost: 3000 },
    ],
    totalCost: 21200,
    notes: "",
    createdByUid: "uid-admin",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("findRecipeFor", () => {
  it("prefers the recipe matching the requested variant", () => {
    const recipes = [
      makeRecipe({ id: "a", variantName: "50g" }),
      makeRecipe({ id: "b", variantName: "100g" }),
    ];
    expect(findRecipeFor(recipes, 1, "100g")?.id).toBe("b");
  });

  it("falls back to the product-wide recipe when the variant has none", () => {
    const recipes = [
      makeRecipe({ id: "a", variantName: "50g" }),
      makeRecipe({ id: "b", variantName: null }),
    ];
    expect(findRecipeFor(recipes, 1, "100g")?.id).toBe("b");
  });

  it("returns null when the product has no recipe at all", () => {
    expect(findRecipeFor([makeRecipe({ productId: 2 })], 1, "100g")).toBeNull();
  });

  it("returns null when only variant recipes exist and no variant is requested", () => {
    expect(findRecipeFor([makeRecipe({ variantName: "50g" })], 1, null)).toBeNull();
  });
});

describe("buildSuppliesFromRecipe", () => {
  it("scales supply quantities to the target quantity", () => {
    const supplies = buildSuppliesFromRecipe(makeRecipe(), 25);
    // 25 units against a base of 10 → factor 2.5
    expect(supplies[0].quantity).toBe(6.25);
    expect(supplies[1].quantity).toBe(1);
  });

  it("returns zero quantities when nothing is planned", () => {
    const supplies = buildSuppliesFromRecipe(makeRecipe(), 0);
    expect(supplies.every((s) => s.quantity === 0)).toBe(true);
  });

  it("treats a non-positive base quantity as 1", () => {
    const supplies = buildSuppliesFromRecipe(makeRecipe({ baseQuantity: 0 }), 3);
    expect(supplies[0].quantity).toBe(7.5);
  });

  it("refreshes name, unit, and cost from the current raw materials", () => {
    const index = new Map([
      [10, { name: "Olive Oil (new supplier)", unit: "L", unitCost: 9000 }],
    ]);
    const supplies = buildSuppliesFromRecipe(makeRecipe(), 10, index);
    expect(supplies[0].rawMaterialName).toBe("Olive Oil (new supplier)");
    expect(supplies[0].unitCost).toBe(9000);
    // Materials missing from the index keep the values stored on the recipe.
    expect(supplies[1].unitCost).toBe(3000);
  });

  it("rounds away floating point noise", () => {
    const recipe = makeRecipe({
      baseQuantity: 3,
      supplies: [{ rawMaterialId: 10, rawMaterialName: "Oil", quantity: 1, unit: "L", unitCost: 100 }],
    });
    expect(buildSuppliesFromRecipe(recipe, 1)[0].quantity).toBe(0.3333);
  });
});

describe("calculateSuppliesCost", () => {
  it("sums quantity × unit cost", () => {
    expect(calculateSuppliesCost(makeRecipe().supplies)).toBe(2.5 * 8000 + 0.4 * 3000);
  });

  it("skips lines without a unit cost", () => {
    const supplies = [
      { rawMaterialId: 10, rawMaterialName: "Oil", quantity: 2, unit: "L", unitCost: 1000 },
      { rawMaterialId: 11, rawMaterialName: "Dye", quantity: 5, unit: "g", unitCost: null },
    ];
    expect(calculateSuppliesCost(supplies)).toBe(2000);
  });
});
