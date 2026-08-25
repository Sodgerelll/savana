import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ProductionBatchSupply } from "./productionBatches";

export const PRODUCTION_RECIPES_COLLECTION = "productionRecipes";

/** One raw-material line of a recipe, expressed for `baseQuantity` produced units. */
export type ProductionRecipeSupply = ProductionBatchSupply;

export interface ProductionRecipe {
  id: string;
  productId: number;
  productName: string;
  /** Optional label distinguishing this recipe from others on the same product/variant. */
  name: string;
  /** Product category slug at save time — kept so recipes stay groupable on their own. */
  category: string;
  /** Variant the recipe belongs to. `null` means it covers every variant of the product. */
  variantName: string | null;
  /** How many finished units the listed supplies produce. */
  baseQuantity: number;
  supplies: ProductionRecipeSupply[];
  totalCost: number;
  notes: string;
  createdByUid: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductionRecipeInput {
  productId: number;
  productName: string;
  name?: string;
  category: string;
  variantName: string | null;
  baseQuantity: number;
  supplies: ProductionRecipeSupply[];
  totalCost: number;
  notes?: string;
  createdByUid?: string;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function deserializeSupply(raw: unknown): ProductionRecipeSupply | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const rawCost = s.unitCost;
  return {
    rawMaterialId: Number(s.rawMaterialId ?? 0),
    rawMaterialName: String(s.rawMaterialName ?? ""),
    quantity: Number(s.quantity ?? 0),
    unit: String(s.unit ?? ""),
    unitCost: rawCost === null || rawCost === undefined ? null : Number(rawCost),
  };
}

function deserializeRecipe(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ProductionRecipe {
  const data = snapshot.data({ serverTimestamps: "estimate" }) as Record<string, unknown>;
  const variantName = data.variantName;
  return {
    id: snapshot.id,
    productId: Number(data.productId ?? 0),
    productName: String(data.productName ?? ""),
    name: String(data.name ?? ""),
    category: String(data.category ?? ""),
    variantName:
      typeof variantName === "string" && variantName.length > 0 ? variantName : null,
    baseQuantity: Number(data.baseQuantity ?? 0) || 1,
    supplies: Array.isArray(data.supplies)
      ? data.supplies
          .map(deserializeSupply)
          .filter((s): s is ProductionRecipeSupply => s !== null)
      : [],
    totalCost: Number(data.totalCost ?? 0),
    notes: String(data.notes ?? ""),
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

function serializeRecipe(input: ProductionRecipeInput): DocumentData {
  return {
    productId: input.productId,
    productName: input.productName,
    name: input.name ?? "",
    category: input.category,
    variantName: input.variantName,
    baseQuantity: input.baseQuantity,
    supplies: input.supplies,
    totalCost: input.totalCost,
    notes: input.notes ?? "",
  };
}

export function subscribeToProductionRecipes({
  onData,
  onError,
}: {
  onData: (recipes: ProductionRecipe[]) => void;
  onError?: (error: FirestoreError) => void;
}): Unsubscribe {
  const q = query(
    collection(db, PRODUCTION_RECIPES_COLLECTION),
    orderBy("productId", "asc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const recipes = snapshot.docs.map((d) => deserializeRecipe(d));
      recipes.sort((a, b) => {
        if (a.productId !== b.productId) return a.productId - b.productId;
        return (a.variantName ?? "").localeCompare(b.variantName ?? "");
      });
      onData(recipes);
    },
    onError,
  );
}

export async function createProductionRecipe(
  input: ProductionRecipeInput,
): Promise<string> {
  const ref = await addDoc(collection(db, PRODUCTION_RECIPES_COLLECTION), {
    ...serializeRecipe(input),
    createdByUid: input.createdByUid ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateProductionRecipe(
  id: string,
  input: ProductionRecipeInput,
): Promise<void> {
  await updateDoc(doc(db, PRODUCTION_RECIPES_COLLECTION, id), {
    ...serializeRecipe(input),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProductionRecipe(id: string): Promise<void> {
  await deleteDoc(doc(db, PRODUCTION_RECIPES_COLLECTION, id));
}

/**
 * Finds every recipe that applies to a product/variant pair. A product can carry
 * several recipes for the same variant, so exact variant matches are returned
 * together (caller picks one); only when none exist does it fall back to the
 * product-wide recipes (`variantName === null`).
 */
export function findMatchingRecipes(
  recipes: ProductionRecipe[],
  productId: number,
  variantName?: string | null,
): ProductionRecipe[] {
  const forProduct = recipes.filter((r) => r.productId === productId);
  if (variantName) {
    const exact = forProduct.filter((r) => r.variantName === variantName);
    if (exact.length > 0) return exact;
  }
  return forProduct.filter((r) => r.variantName === null);
}

/**
 * Finds the recipe that applies to a product/variant pair. An exact variant match
 * wins; otherwise a product-wide recipe (`variantName === null`) is used. When
 * several recipes match, the first one is returned — use `findMatchingRecipes`
 * when the caller needs to let the user pick among them.
 */
export function findRecipeFor(
  recipes: ProductionRecipe[],
  productId: number,
  variantName?: string | null,
): ProductionRecipe | null {
  return findMatchingRecipes(recipes, productId, variantName)[0] ?? null;
}

/** Keeps scaled quantities readable instead of carrying float noise. */
function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function calculateSuppliesCost(supplies: ProductionRecipeSupply[]): number {
  return supplies.reduce(
    (sum, supply) =>
      supply.unitCost != null ? sum + supply.quantity * supply.unitCost : sum,
    0,
  );
}

export interface RawMaterialSnapshot {
  name: string;
  unit: string;
  unitCost: number | null;
}

/**
 * Scales a recipe to `targetQuantity` finished units. When a raw-material index is
 * supplied, names/units/costs are refreshed from it so a batch always prices with
 * today's raw-material data rather than the values captured when the recipe was saved.
 */
export function buildSuppliesFromRecipe(
  recipe: ProductionRecipe,
  targetQuantity: number,
  rawMaterialIndex?: Map<number, RawMaterialSnapshot>,
): ProductionBatchSupply[] {
  const base = recipe.baseQuantity > 0 ? recipe.baseQuantity : 1;
  const factor = targetQuantity > 0 ? targetQuantity / base : 0;
  return recipe.supplies.map((supply) => {
    const current = rawMaterialIndex?.get(supply.rawMaterialId);
    return {
      rawMaterialId: supply.rawMaterialId,
      rawMaterialName: current?.name ?? supply.rawMaterialName,
      quantity: roundQuantity(supply.quantity * factor),
      unit: current?.unit ?? supply.unit,
      unitCost: current ? current.unitCost : supply.unitCost,
    };
  });
}
