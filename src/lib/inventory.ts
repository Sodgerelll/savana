import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * The single definition of what "stock" means for a product, shared by every module that
 * moves it: storefront orders, offline sales, POS direct sales, reseller transactions and
 * wholesale transfers.
 *
 * A product's remaining stock is `totalStock - soldCount`, and for a product with variants
 * the same subtraction is done per variant with `totalStock` mirroring the sum of variant
 * quantities. Production is the only thing that raises `totalStock`; everything else moves
 * `soldCount`.
 *
 * Historically several modules invented their own field (`currentStock`) or clamped
 * `soldCount` at zero, which silently lost quantity whenever a transaction was later edited
 * or deleted. Both are gone: there is one pair of fields, and going below zero raises
 * instead of clamping.
 */

export const PRODUCTS_COLLECTION = "products";
/** Audit trail for stock that moved outside a sale — transfers, returns, hand corrections. */
export const STOCK_MOVEMENTS_COLLECTION = "stockMovements";

export interface ProductStockVariant {
  name: string;
  price: number;
  quantity: number;
  soldCount?: number;
  [key: string]: unknown;
}

/** The mutable stock position of one product, read once and then adjusted in memory. */
export interface ProductStockState {
  /** The product's Firestore document id. Numeric in the catalogue, but kept as given. */
  productId: number | string;
  exists: boolean;
  totalStock: number;
  soldCount: number;
  costPrice: number;
  variants: ProductStockVariant[] | null;
}

/** One requested movement — positive quantity always means "leaving stock". */
export interface StockMovementRequest {
  productId: number | string;
  variant: string | null;
  quantity: number;
}

/**
 * A movement named a variant the product does not have. Previously this silently moved
 * only the product-level `soldCount` and left the variant's own count untouched, so a
 * renamed variant made stock drift apart with nothing to show for it.
 */
export class UnknownVariantError extends Error {
  readonly productName: string;
  readonly variant: string;

  constructor(productName: string, variant: string) {
    super(`UNKNOWN_VARIANT:${variant}`);
    this.name = "UnknownVariantError";
    this.productName = productName;
    this.variant = variant;
  }
}

export class InsufficientStockError extends Error {
  readonly productName: string;
  readonly available: number;
  readonly requested: number;

  constructor(productName: string, available: number, requested: number) {
    // The `INSUFFICIENT_STOCK:<available>` message shape is what the admin modals already
    // parse to show "only N left", so it is kept verbatim.
    super(`INSUFFICIENT_STOCK:${available}`);
    this.name = "InsufficientStockError";
    this.productName = productName;
    this.available = available;
    this.requested = requested;
  }
}

export function productRef(productId: number | string): DocumentReference {
  return doc(db, PRODUCTS_COLLECTION, String(productId));
}

/** Builds the in-memory stock state from a raw product document. */
export function readProductStockState(
  productId: number | string,
  data: Record<string, unknown> | null,
): ProductStockState {
  if (!data) {
    return { productId, exists: false, totalStock: 0, soldCount: 0, costPrice: 0, variants: null };
  }

  return {
    productId,
    exists: true,
    totalStock: Number(data.totalStock ?? 0),
    soldCount: Number(data.soldCount ?? 0),
    costPrice: Number(data.costPrice ?? 0),
    variants: Array.isArray(data.variants) ? (data.variants as ProductStockVariant[]).map((v) => ({ ...v })) : null,
  };
}

function findVariant(state: ProductStockState, variant: string | null): ProductStockVariant | null {
  if (!variant || !state.variants) return null;
  return state.variants.find((v) => v.name === variant) ?? null;
}

/** Units still on the shelf for a product, or for one of its variants. */
export function availableStock(state: ProductStockState, variant: string | null): number {
  const match = findVariant(state, variant);
  if (match) {
    return Number(match.quantity ?? 0) - Number(match.soldCount ?? 0);
  }
  return state.totalStock - state.soldCount;
}

/**
 * Applies one movement to the in-memory state. `quantity` is the number of units leaving
 * stock — pass a negative quantity to put units back.
 *
 * Returning units is never blocked, but taking more than is on the shelf raises
 * InsufficientStockError so a caller can surface it instead of overselling. `soldCount` is
 * deliberately allowed to go negative on a return: clamping it at zero would make the
 * movement irreversible, which is how stock used to drift.
 */
export function applyStockMovement(
  state: ProductStockState,
  movement: Pick<StockMovementRequest, "variant" | "quantity">,
  options: { productName?: string; validate?: boolean } = {},
): void {
  if (!state.exists || movement.quantity === 0) {
    return;
  }

  const { quantity, variant } = movement;

  // A named variant that does not exist on the product is a data error, not a movement to
  // approximate. Returning stock is still allowed to raise: a return that cannot find its
  // variant would put the units back in the wrong place.
  if (variant && state.variants && !findVariant(state, variant)) {
    throw new UnknownVariantError(options.productName ?? String(state.productId), variant);
  }

  if (options.validate !== false && quantity > 0) {
    const available = availableStock(state, variant);
    if (quantity > available) {
      throw new InsufficientStockError(
        options.productName ?? String(state.productId),
        Math.max(0, available),
        quantity,
      );
    }
  }

  state.soldCount += quantity;

  const match = findVariant(state, variant);
  if (match) {
    match.soldCount = Number(match.soldCount ?? 0) + quantity;
  }
}

/**
 * Adds produced units to stock, on the named variant when the product has any. A negative
 * quantity takes them back out, which is what deleting a completed batch does.
 *
 * Nothing is clamped at zero. The variant path never was, and clamping only the
 * product-level path meant undoing a batch whose output had already been sold quietly
 * created stock out of nothing — exactly the drift this module exists to prevent. A
 * negative figure is the honest answer and shows the shortfall.
 */
export function applyProductionIntake(
  state: ProductStockState,
  variant: string | null,
  quantity: number,
): void {
  const match = findVariant(state, variant);
  if (match) {
    match.quantity = Number(match.quantity ?? 0) + quantity;
    // totalStock mirrors the sum of variant quantities for variant products.
    state.totalStock = state.variants!.reduce((sum, v) => sum + Number(v.quantity ?? 0), 0);
    return;
  }

  state.totalStock = state.totalStock + quantity;
}

/** Structural subset shared by Firestore's Transaction and WriteBatch. */
interface Writer {
  update(ref: DocumentReference, data: DocumentData): unknown;
}

/**
 * Writes only the stock fields, never the whole product document, so a concurrent edit to
 * the catalogue (name, price, images) cannot be clobbered by a stock movement and vice
 * versa.
 */
export function writeProductStock(writer: Writer, state: ProductStockState): void {
  if (!state.exists) return;

  writer.update(productRef(state.productId), {
    totalStock: state.totalStock,
    soldCount: state.soldCount,
    ...(state.variants ? { variants: state.variants } : {}),
    updatedAt: serverTimestamp(),
  });
}

/** One variant's counted position in a recount. */
export interface ProductRecountVariantInput {
  name: string;
  /** Units counted on the shelf. */
  remaining: number;
  /** The corrected sales counter for this variant. */
  soldCount: number;
}

export interface ProductRecountInput {
  productId: number | string;
  productName: string;
  /** Units counted on the shelf. Ignored for a product with variants — each carries its own. */
  remaining: number;
  /** The corrected product-level sales counter. */
  soldCount: number;
  variants?: ProductRecountVariantInput[] | null;
  /** Why the figures are being overridden — recorded on the movement, never optional. */
  reason: string;
  createdBy: string;
  createdByName?: string;
}

export class ProductNotFoundError extends Error {
  constructor(productId: number | string) {
    super(`PRODUCT_NOT_FOUND:${productId}`);
    this.name = "ProductNotFoundError";
  }
}

/**
 * Sets a product's stock counters from a physical count.
 *
 * Every other path in this module *moves* stock: a sale adds to `soldCount`, a return
 * takes it away, production raises `totalStock`. None of them can repair a counter that
 * has already drifted — a `soldCount` of −4 means four units were given back that the
 * counter never recorded leaving, and no further sale will undo that. The product editor
 * deliberately refuses to write `soldCount` (see saveProductEdit), so this is the one door
 * through which a corrected figure may pass.
 *
 * It is deliberately not a quiet field edit: the before and after figures, the reason and
 * the person are written to /stockMovements in the same transaction, so a counter that was
 * overridden by hand can always be told apart from one the sales history produced.
 *
 * `remaining` is what the shelf holds, which is what an admin can actually count;
 * `totalStock` is derived as `remaining + soldCount`, keeping the invariant every screen
 * relies on. A variant product takes its total from the sum of its variants.
 */
export async function recountProductStock(input: ProductRecountInput): Promise<void> {
  await runTransaction(db, async (t) => {
    const ref = productRef(input.productId);
    const snapshot = await t.get(ref);
    if (!snapshot.exists()) {
      throw new ProductNotFoundError(input.productId);
    }

    const state = readProductStockState(input.productId, snapshot.data() as Record<string, unknown>);
    const before = {
      totalStock: state.totalStock,
      soldCount: state.soldCount,
      remaining: state.totalStock - state.soldCount,
    };

    const countedByName = new Map((input.variants ?? []).map((variant) => [variant.name, variant]));

    // A variant the count does not mention keeps exactly what it had: a recount of one
    // size must never silently reset the others.
    const nextVariants = state.variants?.map((variant) => {
      const counted = countedByName.get(String(variant.name ?? ""));
      if (!counted) return variant;
      return {
        ...variant,
        quantity: counted.remaining + counted.soldCount,
        soldCount: counted.soldCount,
      };
    }) ?? null;

    const nextTotalStock = nextVariants
      ? nextVariants.reduce((sum, variant) => sum + Number(variant.quantity ?? 0), 0)
      : input.remaining + input.soldCount;

    const after = {
      totalStock: nextTotalStock,
      soldCount: input.soldCount,
      remaining: nextTotalStock - input.soldCount,
    };

    t.update(ref, {
      totalStock: after.totalStock,
      soldCount: after.soldCount,
      ...(nextVariants ? { variants: nextVariants } : {}),
      updatedAt: serverTimestamp(),
    });

    t.set(doc(collection(db, STOCK_MOVEMENTS_COLLECTION)), {
      productId: input.productId,
      productName: input.productName,
      transferId: null,
      customerId: null,
      customerName: null,
      type: "ADJUSTMENT",
      // Positive when the count found more on the shelf than the system believed.
      quantity: after.remaining - before.remaining,
      balanceAfter: after.remaining,
      before,
      after,
      reason: input.reason,
      createdBy: input.createdBy,
      createdByName: input.createdByName ?? "",
      createdAt: serverTimestamp(),
    });
  });
}

/** Cost of the goods in a set of movements — 0 for any product with no costPrice recorded. */
export function cogsForMovements(
  states: Map<number | string, ProductStockState>,
  movements: readonly StockMovementRequest[],
): number {
  return movements.reduce((sum, movement) => {
    const state = states.get(movement.productId);
    return state && state.costPrice > 0 ? sum + state.costPrice * movement.quantity : sum;
  }, 0);
}
