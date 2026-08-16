import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { RAW_MATERIALS_COLLECTION } from "./rawMaterials";
import { buildProductionCompletedEntry, buildReversalEntry } from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  JOURNAL_ENTRIES_COLLECTION,
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
    supplies: Array.isArray(data.supplies)
      ? data.supplies
          .map((item): ProductionBatchSupply | null => {
            if (typeof item !== "object" || item === null) return null;
            const s = item as Record<string, unknown>;
            const rawCost = s.unitCost;
            return {
              rawMaterialId: Number(s.rawMaterialId ?? 0),
              rawMaterialName: String(s.rawMaterialName ?? ""),
              quantity: Number(s.quantity ?? 0),
              unit: String(s.unit ?? ""),
              unitCost:
                rawCost === null || rawCost === undefined
                  ? null
                  : Number(rawCost),
            };
          })
          .filter((s): s is ProductionBatchSupply => s !== null)
      : [],
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

interface RawMaterialPatch {
  rawMaterialId: number;
  remaining: number;
}

async function loadRawMaterialPatches(
  supplies: ProductionBatchSupply[],
): Promise<Map<number, RawMaterialPatch>> {
  const uniqueIds = Array.from(new Set(supplies.map((s) => s.rawMaterialId)));
  const patches = new Map<number, RawMaterialPatch>();

  await Promise.all(
    uniqueIds.map(async (rawMaterialId) => {
      const ref = doc(db, RAW_MATERIALS_COLLECTION, String(rawMaterialId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      patches.set(rawMaterialId, {
        rawMaterialId,
        remaining: Number(data.remaining ?? 0),
      });
    }),
  );

  return patches;
}

function applySuppliesToPatches(
  patches: Map<number, RawMaterialPatch>,
  supplies: ProductionBatchSupply[],
  sign: number,
) {
  supplies.forEach((supply) => {
    const patch = patches.get(supply.rawMaterialId);
    if (!patch) return;
    patch.remaining = patch.remaining + supply.quantity * sign;
  });
}

function writeRawMaterialPatches(
  batch: ReturnType<typeof writeBatch>,
  patches: Map<number, RawMaterialPatch>,
) {
  patches.forEach((patch) => {
    const ref = doc(db, RAW_MATERIALS_COLLECTION, String(patch.rawMaterialId));
    batch.update(ref, {
      remaining: patch.remaining,
      _updatedAt: serverTimestamp(),
    });
  });
}

function validateSufficientStock(
  patches: Map<number, RawMaterialPatch>,
  supplies: ProductionBatchSupply[],
): string | null {
  const insufficient: string[] = [];
  supplies.forEach((supply) => {
    const patch = patches.get(supply.rawMaterialId);
    if (!patch) {
      insufficient.push(supply.rawMaterialName || String(supply.rawMaterialId));
      return;
    }
    if (patch.remaining < 0) {
      insufficient.push(
        `${supply.rawMaterialName || String(supply.rawMaterialId)}`,
      );
    }
  });
  return insufficient.length > 0 ? insufficient.join(", ") : null;
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

export async function updateProductionBatch(
  id: string,
  previous: ProductionBatch,
  next: UpdateProductionBatchInput,
): Promise<void> {
  const batchRef = doc(db, PRODUCTION_BATCHES_COLLECTION, id);

  if (previous.status !== "planning") {
    // Only allow editing of "soft" fields after planning
    const batch = writeBatch(db);
    batch.update(batchRef, {
      expectedReadyAt: next.expectedReadyAt ?? null,
      readyAt: next.readyAt ?? previous.readyAt ?? null,
      notes: next.notes ?? "",
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return;
  }

  const batch = writeBatch(db);
  batch.update(batchRef, {
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
  await batch.commit();
}

export interface AdvancePatch {
  startedAt?: string | null;
  expectedReadyAt?: string | null;
  readyAt?: string | null;
  actualQuantity?: number;
  /** Required when the target product has variants: which variant to add stock to. */
  variantName?: string | null;
}

export async function advanceProductionBatch(
  id: string,
  previous: ProductionBatch,
  targetStatus: ProductionBatchStatus,
  patch: AdvancePatch = {},
): Promise<void> {
  const batchRef = doc(db, PRODUCTION_BATCHES_COLLECTION, id);

  // Stale check
  const currentSnap = await getDoc(batchRef);
  if (!currentSnap.exists()) {
    throw new Error("Batch not found");
  }
  const currentStatus = normalizeStatus(
    (currentSnap.data() as Record<string, unknown>).status,
  );
  if (currentStatus !== previous.status) {
    throw new Error("Batch status has changed, please reload");
  }

  if (previous.status === "planning" && targetStatus === "curing") {
    if (previous.supplies.length === 0) {
      throw new Error("No supplies defined");
    }
    const patches = await loadRawMaterialPatches(previous.supplies);
    applySuppliesToPatches(patches, previous.supplies, -1);
    const insufficient = validateSufficientStock(patches, previous.supplies);
    if (insufficient) {
      throw new Error(`INSUFFICIENT:${insufficient}`);
    }

    const batch = writeBatch(db);
    batch.update(batchRef, {
      status: "curing",
      startedAt: patch.startedAt ?? new Date().toISOString().slice(0, 10),
      expectedReadyAt: patch.expectedReadyAt ?? previous.expectedReadyAt ?? null,
      updatedAt: serverTimestamp(),
    });
    writeRawMaterialPatches(batch, patches);
    await batch.commit();
    return;
  }

  if (previous.status === "curing" && targetStatus === "ready") {
    const actualQuantity = patch.actualQuantity ?? 0;
    if (actualQuantity <= 0) {
      throw new Error("Actual quantity required");
    }

    const ref = productRef(previous.productId);
    const productSnap = await getDoc(ref);
    if (!productSnap.exists()) {
      throw new Error("Product not found");
    }

    const productData = productSnap.data() as Record<string, unknown>;
    const state = readProductStockState(previous.productId, productData);
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

    // What was on the shelf before this batch landed, and what it was worth — the basis for
    // the weighted average below.
    const stockBefore = Math.max(0, availableStock(state, variantName));
    const costBefore = state.costPrice;

    applyProductionIntake(state, variantName, actualQuantity);

    // The batch's material cost becomes the unit cost of what it produced, which is what
    // every COGS line downstream is priced from. Without this the products keep a cost of
    // zero and every sale looks like pure margin.
    //
    // Blended with the stock already held rather than replacing it: a batch made from
    // dearer oil used to reprice every bar still sitting on the shelf, restating the margin
    // on goods that cost something else entirely.
    const batchUnitCost = previous.totalCost / actualQuantity;
    const unitCost =
      costBefore > 0 && stockBefore > 0
        ? Math.round((stockBefore * costBefore + previous.totalCost) / (stockBefore + actualQuantity))
        : Math.round(batchUnitCost);
    const producedCost = Math.round(previous.totalCost);

    const entryNumber = producedCost > 0 ? await generateJournalEntryNumber() : null;

    const batch = writeBatch(db);
    let journalEntryId: string | null = null;

    if (entryNumber) {
      // The materials the batch consumed turn into finished goods: cost moves from the
      // raw-materials account into inventory, which is the debit COGS later credits back.
      const entryRef = postJournalEntry(
        batch,
        entryNumber,
        buildProductionCompletedEntry({ producedCost }),
        {
          sourceType: "productionBatch",
          sourceId: previous.id,
          sourceNumber: previous.batchCode,
          description: `Үйлдвэрлэл дууслаа: ${previous.batchCode} — ${previous.productName}`,
          createdBy: previous.createdByUid,
        },
      );
      journalEntryId = entryRef.id;
    }

    batch.update(batchRef, {
      status: "ready",
      actualQuantity,
      producedVariant: variantName,
      readyAt: patch.readyAt ?? new Date().toISOString().slice(0, 10),
      journalEntryId,
      updatedAt: serverTimestamp(),
    });

    writeProductStock(batch, state);
    if (unitCost > 0) {
      batch.update(ref, { costPrice: unitCost });
    }

    await batch.commit();
    return;
  }

  throw new Error(
    `Invalid transition: ${previous.status} -> ${targetStatus}`,
  );
}

export async function deleteProductionBatch(
  previous: ProductionBatch,
): Promise<void> {
  const batchRef = doc(db, PRODUCTION_BATCHES_COLLECTION, previous.id);

  if (previous.status === "planning") {
    const batch = writeBatch(db);
    batch.delete(batchRef);
    await batch.commit();
    return;
  }

  if (previous.status === "curing") {
    const patches = await loadRawMaterialPatches(previous.supplies);
    applySuppliesToPatches(patches, previous.supplies, 1);
    const batch = writeBatch(db);
    batch.delete(batchRef);
    writeRawMaterialPatches(batch, patches);
    await batch.commit();
    return;
  }

  // ready
  const actualQuantity = previous.actualQuantity ?? 0;
  const ref = productRef(previous.productId);
  const productSnap = await getDoc(ref);

  // The inventory entry the batch posted has to come back out with it, otherwise deleting
  // a completed batch would leave its cost sitting in the inventory account forever.
  let reversalLines: Parameters<typeof buildReversalEntry>[0] | null = null;
  let reversalNumber: string | null = null;
  if (previous.journalEntryId) {
    const entrySnap = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, previous.journalEntryId));
    if (entrySnap.exists()) {
      reversalLines = (entrySnap.data() as { lines?: Parameters<typeof buildReversalEntry>[0] }).lines ?? [];
      reversalNumber = await generateJournalEntryNumber();
    }
  }

  // The reversal moves the batch's cost back from finished goods into raw materials, so the
  // materials themselves have to come back to the shelf with it. Undoing only the ledger
  // half left the raw-material account claiming stock the warehouse did not have.
  const patches = await loadRawMaterialPatches(previous.supplies);
  applySuppliesToPatches(patches, previous.supplies, 1);

  const batch = writeBatch(db);
  batch.delete(batchRef);
  writeRawMaterialPatches(batch, patches);

  if (productSnap.exists() && actualQuantity > 0) {
    const state = readProductStockState(previous.productId, productSnap.data() as Record<string, unknown>);
    applyProductionIntake(state, previous.producedVariant, -actualQuantity);
    writeProductStock(batch, state);
  }

  if (reversalLines && reversalNumber) {
    postJournalEntry(batch, reversalNumber, buildReversalEntry(reversalLines), {
      sourceType: "productionBatch",
      sourceId: previous.id,
      sourceNumber: previous.batchCode,
      description: `Үйлдвэрлэлийн багц устгасан — бичилтийг цуцаллаа: ${previous.batchCode}`,
      reversalOf: previous.journalEntryId,
      createdBy: previous.createdByUid,
    });
  }

  await batch.commit();
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
