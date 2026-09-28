import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { RAW_MATERIALS_COLLECTION } from "./rawMaterials";
import { buildProductionCompletedEntry, buildReversalEntry } from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  readJournalEntryLines,
} from "./accounting/postEntryClient";
import { reserveDocumentNumber } from "./documentNumbers";
import {
  applyProductionIntake,
  availableStock,
  productRef,
  readProductStockState,
  writeProductStock,
} from "./inventory";

export const PRODUCTION_BATCHES_COLLECTION = "productionBatches";

export type ProductionBatchStatus = "planning" | "curing" | "ready";

export interface ProductionBatchSupply {
  rawMaterialId: number;
  rawMaterialName: string;
  quantity: number;
  unit: string;
  unitCost: number | null;
}

export interface ProductionBatch {
  id: string;
  batchCode: string;
  productId: number;
  productName: string;
  status: ProductionBatchStatus;
  plannedQuantity: number;
  actualQuantity: number | null;
  startedAt: string | null;
  expectedReadyAt: string | null;
  readyAt: string | null;
  /** For variant products: which variant the batch is planned for (drives the recipe). */
  plannedVariant: string | null;
  /** For variant products: which variant received the produced quantity. */
  producedVariant: string | null;
  supplies: ProductionBatchSupply[];
  totalCost: number;
  notes: string;
  createdByUid: string;
  /** journalEntries doc id posted when the batch reached "ready" — reversed if it is deleted. */
  journalEntryId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateProductionBatchInput {
  productId: number;
  productName: string;
  plannedQuantity: number;
  expectedReadyAt?: string | null;
  plannedVariant?: string | null;
  supplies: ProductionBatchSupply[];
  totalCost: number;
  notes?: string;
  createdByUid: string;
}

export interface UpdateProductionBatchInput {
  productId: number;
  productName: string;
  plannedQuantity: number;
  expectedReadyAt?: string | null;
  startedAt?: string | null;
  readyAt?: string | null;
  plannedVariant?: string | null;
  supplies: ProductionBatchSupply[];
  totalCost: number;
  notes?: string;
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

function normalizeStatus(value: unknown): ProductionBatchStatus {
  if (value === "curing" || value === "ready") {
    return value;
  }
  return "planning";
}

/** A batch's stored supply list, tolerant of anything malformed. */
function deserializeSupplies(value: unknown): ProductionBatchSupply[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): ProductionBatchSupply | null => {
      if (typeof item !== "object" || item === null) return null;
      const s = item as Record<string, unknown>;
      const rawCost = s.unitCost;
      return {
        rawMaterialId: Number(s.rawMaterialId ?? 0),
        rawMaterialName: String(s.rawMaterialName ?? ""),
        quantity: Number(s.quantity ?? 0),
        unit: String(s.unit ?? ""),
        unitCost: rawCost === null || rawCost === undefined ? null : Number(rawCost),
      };
    })
    .filter((s): s is ProductionBatchSupply => s !== null);
}

function deserializeBatch(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ProductionBatch {
  const data = snapshot.data({ serverTimestamps: "estimate" }) as Record<string, unknown>;
  return {
    id: snapshot.id,
    batchCode: String(data.batchCode ?? snapshot.id),
    productId: Number(data.productId ?? 0),
    productName: String(data.productName ?? ""),
    status: normalizeStatus(data.status),
    plannedQuantity: Number(data.plannedQuantity ?? 0),
    actualQuantity:
      data.actualQuantity === null || data.actualQuantity === undefined
        ? null
        : Number(data.actualQuantity),
    startedAt: typeof data.startedAt === "string" ? data.startedAt : null,
    expectedReadyAt:
      typeof data.expectedReadyAt === "string" ? data.expectedReadyAt : null,
    readyAt: typeof data.readyAt === "string" ? data.readyAt : null,
    plannedVariant:
      typeof data.plannedVariant === "string" && data.plannedVariant.length > 0
        ? data.plannedVariant
        : null,
    producedVariant:
      typeof data.producedVariant === "string" ? data.producedVariant : null,
    supplies: deserializeSupplies(data.supplies),
    totalCost: Number(data.totalCost ?? 0),
    notes: String(data.notes ?? ""),
    createdByUid: String(data.createdByUid ?? ""),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

function generateBatchCode(): Promise<string> {
  return reserveDocumentNumber("productionBatch");
}

interface RawMaterialState {
  rawMaterialId: number;
  exists: boolean;
  remaining: number;
  unitCost: number | null;
}

/** Who is acting, for the journal entries a batch posts. */
function currentActorUid(fallback: string): string {
  return auth?.currentUser?.uid ?? fallback;
}

/**
 * Reads every raw material a batch uses, inside the caller's transaction. Sequential because
 * a transaction must finish all its reads before the first write.
 */
async function loadRawMaterials(
  t: Transaction,
  supplies: ProductionBatchSupply[],
): Promise<Map<number, RawMaterialState>> {
  const states = new Map<number, RawMaterialState>();
  for (const rawMaterialId of Array.from(new Set(supplies.map((s) => s.rawMaterialId)))) {
    const snap = await t.get(doc(db, RAW_MATERIALS_COLLECTION, String(rawMaterialId)));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    states.set(rawMaterialId, {
      rawMaterialId,
      exists: snap.exists(),
      remaining: Number(data.remaining ?? 0),
      unitCost: data.unitCost === null || data.unitCost === undefined ? null : Number(data.unitCost),
    });
  }
  return states;
}

function applySupplies(states: Map<number, RawMaterialState>, supplies: ProductionBatchSupply[], sign: 1 | -1) {
  supplies.forEach((supply) => {
    const state = states.get(supply.rawMaterialId);
    if (state?.exists) state.remaining += supply.quantity * sign;
  });
}

function writeRawMaterials(t: Transaction, states: Map<number, RawMaterialState>) {
  states.forEach((state) => {
    if (!state.exists) return;
    t.update(doc(db, RAW_MATERIALS_COLLECTION, String(state.rawMaterialId)), {
      remaining: state.remaining,
      _updatedAt: serverTimestamp(),
    });
  });
}

function insufficientSupplies(states: Map<number, RawMaterialState>, supplies: ProductionBatchSupply[]): string | null {
  const insufficient = supplies
    .filter((supply) => {
      const state = states.get(supply.rawMaterialId);
      return !state?.exists || state.remaining < 0;
    })
    .map((supply) => supply.rawMaterialName || String(supply.rawMaterialId));
  return insufficient.length > 0 ? Array.from(new Set(insufficient)).join(", ") : null;
}

/**
 * What the materials a batch consumes are worth on the books right now — the price the
 * raw-materials account carries them at, which is what the completion entry must move out
 * of it. A material with no recorded cost falls back to the cost the recipe planned with.
 */
function consumedCost(states: Map<number, RawMaterialState>, supplies: ProductionBatchSupply[]): number {
  return Math.round(
    supplies.reduce((sum, supply) => {
      const unitCost = states.get(supply.rawMaterialId)?.unitCost ?? supply.unitCost ?? 0;
      return sum + supply.quantity * Math.max(0, unitCost);
    }, 0),
  );
}

export async function createProductionBatch(
  input: CreateProductionBatchInput,
): Promise<string> {
  const batchCode = await generateBatchCode();
  const batchRef = doc(collection(db, PRODUCTION_BATCHES_COLLECTION));

  const batch = writeBatch(db);
  batch.set(batchRef, {
    batchCode,
    productId: input.productId,
    productName: input.productName,
    status: "planning" satisfies ProductionBatchStatus,
    plannedQuantity: input.plannedQuantity,
    actualQuantity: null,
    startedAt: null,
    expectedReadyAt: input.expectedReadyAt ?? null,
    readyAt: null,
    plannedVariant: input.plannedVariant ?? null,
    supplies: input.supplies,
    totalCost: input.totalCost,
    notes: input.notes ?? "",
    createdByUid: input.createdByUid,
    journalEntryId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return batchRef.id;
}

/**
 * Saves edits to a batch. The recipe side (product, quantities, materials, cost) can only
 * change while the batch is still being planned — once it has started, its materials have
 * left the shelf. The status is read inside the transaction, so a batch that was started in
 * another tab a moment ago cannot have its materials rewritten from a stale screen.
 */
export async function updateProductionBatch(
  id: string,
  previous: ProductionBatch,
  next: UpdateProductionBatchInput,
): Promise<void> {
  const batchRef = doc(db, PRODUCTION_BATCHES_COLLECTION, id);

  await runTransaction(db, async (t) => {
    const snap = await t.get(batchRef);
    if (!snap.exists()) {
      throw new Error("Batch not found");
    }
    const status = normalizeStatus((snap.data() as Record<string, unknown>).status);

    if (status !== "planning") {
      t.update(batchRef, {
        expectedReadyAt: next.expectedReadyAt ?? null,
        readyAt: next.readyAt ?? previous.readyAt ?? null,
        notes: next.notes ?? "",
        updatedAt: serverTimestamp(),
      });
      return;
    }

    t.update(batchRef, {
      productId: next.productId,
      productName: next.productName,
      plannedQuantity: next.plannedQuantity,
      expectedReadyAt: next.expectedReadyAt ?? null,
      plannedVariant: next.plannedVariant ?? null,
      supplies: next.supplies,
      totalCost: next.totalCost,
      notes: next.notes ?? "",
      updatedAt: serverTimestamp(),
    });
  });
}

export interface AdvancePatch {
  startedAt?: string | null;
  expectedReadyAt?: string | null;
  readyAt?: string | null;
  actualQuantity?: number;
  /** Required when the target product has variants: which variant to add stock to. */
  variantName?: string | null;
}

/**
 * Moves a batch one step on: planning → curing takes its materials off the shelf, curing →
 * ready puts the product on it and posts the cost into finished goods.
 *
 * Everything — the status check, the stock reads and every write — happens in one
 * transaction. The check used to be a separate read, so a double click (or two people) could
 * both pass it and take the materials, or add the batch's output, twice.
 */
export async function advanceProductionBatch(
  id: string,
  previous: ProductionBatch,
  targetStatus: ProductionBatchStatus,
  patch: AdvancePatch = {},
): Promise<void> {
  const batchRef = doc(db, PRODUCTION_BATCHES_COLLECTION, id);

  if (previous.status === "planning" && targetStatus === "curing") {
    if (previous.supplies.length === 0) {
      throw new Error("No supplies defined");
    }

    await runTransaction(db, async (t) => {
      const snap = await t.get(batchRef);
      if (!snap.exists()) {
        throw new Error("Batch not found");
      }
      const current = snap.data() as Record<string, unknown>;
      if (normalizeStatus(current.status) !== "planning") {
        throw new Error("Batch status has changed, please reload");
      }
      // The stored recipe, not the screen's copy of it.
      const supplies = deserializeSupplies(current.supplies);
      if (supplies.length === 0) {
        throw new Error("No supplies defined");
      }

      const materials = await loadRawMaterials(t, supplies);
      const cost = consumedCost(materials, supplies);
      applySupplies(materials, supplies, -1);
      const insufficient = insufficientSupplies(materials, supplies);
      if (insufficient) {
        throw new Error(`INSUFFICIENT:${insufficient}`);
      }

      t.update(batchRef, {
        status: "curing",
        startedAt: patch.startedAt ?? new Date().toISOString().slice(0, 10),
        expectedReadyAt: patch.expectedReadyAt ?? previous.expectedReadyAt ?? null,
        // What the materials were actually worth when they left the shelf; the completion
        // entry moves exactly this out of the raw-materials account. The planned figure is
        // kept beside it.
        plannedTotalCost: Number(current.totalCost ?? previous.totalCost ?? 0),
        totalCost: cost,
        updatedAt: serverTimestamp(),
      });
      writeRawMaterials(t, materials);
    });
    return;
  }

  if (previous.status === "curing" && targetStatus === "ready") {
    const actualQuantity = patch.actualQuantity ?? 0;
    if (!(actualQuantity > 0)) {
      throw new Error("Actual quantity required");
    }

    // Reserved before the transaction opens (it runs its own), and always: the cost that
    // decides whether an entry is posted is read inside the transaction. A batch whose cost
    // turns out to be zero simply leaves the number unused.
    const entryNumber = await generateJournalEntryNumber();

    await runTransaction(db, async (t) => {
      const snap = await t.get(batchRef);
      if (!snap.exists()) {
        throw new Error("Batch not found");
      }
      const current = snap.data() as Record<string, unknown>;
      if (normalizeStatus(current.status) !== "curing") {
        throw new Error("Batch status has changed, please reload");
      }

      const productId = Number(current.productId ?? previous.productId);
      const ref = productRef(productId);
      const productSnap = await t.get(ref);
      if (!productSnap.exists()) {
        throw new Error("Product not found");
      }

      const state = readProductStockState(productId, productSnap.data() as Record<string, unknown>);
      const hasVariants = state.variants !== null && state.variants.length > 0;

      // Variant products: produced units must be assigned to a specific variant. Falls back
      // to the variant the batch was planned for.
      let variantName: string | null = null;
      if (hasVariants) {
        variantName = patch.variantName ?? previous.plannedVariant;
        if (!variantName) {
          throw new Error("VARIANT_REQUIRED");
        }
        if (!state.variants!.some((v) => v.name === variantName)) {
          throw new Error("VARIANT_NOT_FOUND");
        }
      }

      // What was on the shelf before this batch landed, and what it was worth — the basis
      // for the weighted average below.
      const stockBefore = Math.max(0, availableStock(state, variantName));
      const costBefore = state.costPrice;
      const producedCost = Math.round(Number(current.totalCost ?? previous.totalCost ?? 0));

      applyProductionIntake(state, variantName, actualQuantity);

      // The batch's material cost becomes the unit cost of what it produced, blended with
      // the stock already held rather than replacing it: a batch made from dearer oil used to
      // reprice every bar still sitting on the shelf.
      const unitCost =
        costBefore > 0 && stockBefore > 0
          ? Math.round((stockBefore * costBefore + producedCost) / (stockBefore + actualQuantity))
          : Math.round(producedCost / actualQuantity);

      let journalEntryId: string | null = null;
      if (entryNumber && producedCost > 0) {
        // The materials the batch consumed turn into finished goods: cost moves from the
        // raw-materials account into inventory, which is the debit COGS later credits back.
        const entryRef = postJournalEntry(
          t,
          entryNumber,
          buildProductionCompletedEntry({ producedCost }),
          {
            sourceType: "productionBatch",
            sourceId: previous.id,
            sourceNumber: previous.batchCode,
            description: `Үйлдвэрлэл дууслаа: ${previous.batchCode} — ${previous.productName}`,
            createdBy: currentActorUid(previous.createdByUid),
          },
        );
        journalEntryId = entryRef.id;
      }

      t.update(batchRef, {
        status: "ready",
        actualQuantity,
        producedVariant: variantName,
        readyAt: patch.readyAt ?? new Date().toISOString().slice(0, 10),
        journalEntryId,
        // The product's unit cost before and after this batch, so deleting the batch can put
        // the cost back if nothing has repriced the product since.
        costPriceBefore: costBefore,
        costPriceAfter: unitCost > 0 ? unitCost : costBefore,
        updatedAt: serverTimestamp(),
      });

      writeProductStock(t, state);
      if (unitCost > 0) {
        t.update(ref, { costPrice: unitCost });
      }
    });
    return;
  }

  throw new Error(
    `Invalid transition: ${previous.status} -> ${targetStatus}`,
  );
}

/**
 * Deletes a batch and undoes whatever it did at its current stage: nothing for a plan,
 * the materials back to the shelf once it has started, and for a completed batch also its
 * output off the shelf, its completion entry reversed and — if nothing has repriced the
 * product since — the product's unit cost put back to what it was before.
 */
export async function deleteProductionBatch(
  previous: ProductionBatch,
): Promise<void> {
  const batchRef = doc(db, PRODUCTION_BATCHES_COLLECTION, previous.id);

  // A reversal number is only needed for a completed batch that posted an entry; reserved up
  // front because it runs its own transaction.
  const reversalNumber =
    previous.status === "ready" && previous.journalEntryId ? await generateJournalEntryNumber() : null;

  await runTransaction(db, async (t) => {
    const snap = await t.get(batchRef);
    if (!snap.exists()) {
      return;
    }
    const current = snap.data() as Record<string, unknown>;
    const status = normalizeStatus(current.status);
    if (status !== previous.status) {
      throw new Error("Batch status has changed, please reload");
    }

    if (status === "planning") {
      t.delete(batchRef);
      return;
    }

    const supplies = deserializeSupplies(current.supplies);
    const materials = await loadRawMaterials(t, supplies);

    if (status === "curing") {
      applySupplies(materials, supplies, 1);
      t.delete(batchRef);
      writeRawMaterials(t, materials);
      return;
    }

    // ready
    const actualQuantity = Number(current.actualQuantity ?? previous.actualQuantity ?? 0);
    const productId = Number(current.productId ?? previous.productId);
    const ref = productRef(productId);
    const productSnap = await t.get(ref);
    const journalEntryId = typeof current.journalEntryId === "string" ? current.journalEntryId : null;
    const reversalLines = journalEntryId && reversalNumber ? await readJournalEntryLines(t, journalEntryId) : null;

    // The reversal moves the batch's cost back from finished goods into raw materials, so the
    // materials themselves have to come back to the shelf with it.
    applySupplies(materials, supplies, 1);
    t.delete(batchRef);
    writeRawMaterials(t, materials);

    if (productSnap.exists() && actualQuantity > 0) {
      const productData = productSnap.data() as Record<string, unknown>;
      const state = readProductStockState(productId, productData);
      const producedVariant =
        typeof current.producedVariant === "string" ? current.producedVariant : previous.producedVariant;
      applyProductionIntake(state, producedVariant, -actualQuantity);
      writeProductStock(t, state);

      // Only when the cost is still exactly what this batch left it at — a later batch or an
      // admin edit has since said something newer, and that stands.
      const costAfter = Number(current.costPriceAfter);
      const costBefore = Number(current.costPriceBefore);
      if (
        Number.isFinite(costAfter) &&
        Number.isFinite(costBefore) &&
        Number(productData.costPrice ?? 0) === costAfter &&
        costAfter !== costBefore
      ) {
        t.update(ref, { costPrice: costBefore });
      }
    }

    if (journalEntryId && reversalLines && reversalNumber) {
      postJournalEntry(t, reversalNumber, buildReversalEntry(reversalLines), {
        sourceType: "productionBatch",
        sourceId: previous.id,
        sourceNumber: previous.batchCode,
        description: `Үйлдвэрлэлийн багц устгасан — бичилтийг цуцаллаа: ${previous.batchCode}`,
        reversalOf: journalEntryId,
        createdBy: currentActorUid(previous.createdByUid),
      });
    }
  });
}

export function subscribeToProductionBatches({
  onData,
  onError,
}: {
  onData: (batches: ProductionBatch[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  const q = query(
    collection(db, PRODUCTION_BATCHES_COLLECTION),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => deserializeBatch(d)));
    },
    onError,
  );
}
