import { describe, it, expect, vi, beforeEach } from "vitest";
import { firestoreMock } from "../helpers/firestoreMock";

// ─── Mock firebase ────────────────────────────────────────────────────────────
//
// Every batch step now reads and writes inside one transaction, so the mock is the shared
// in-memory Firestore (src/__tests__/helpers/firestoreMock.ts): seeded documents, recorded
// writes. Batch codes and journal entry numbers come from `counters/` documents in it too.

vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);

import {
  createProductionBatch,
  updateProductionBatch,
  advanceProductionBatch,
  deleteProductionBatch,
  type ProductionBatch,
  type CreateProductionBatchInput,
} from "../../lib/productionBatches";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const year = Number(
  new Intl.DateTimeFormat("en", { timeZone: "Asia/Ulaanbaatar", year: "numeric" }).format(new Date()),
);

function makeCreateInput(overrides: Partial<CreateProductionBatchInput> = {}): CreateProductionBatchInput {
  return {
    productId: 1,
    productName: "Organic Soap",
    plannedQuantity: 100,
    supplies: [
      { rawMaterialId: 10, rawMaterialName: "Olive Oil", quantity: 5, unit: "L", unitCost: 8000 },
      { rawMaterialId: 11, rawMaterialName: "Lye", quantity: 1, unit: "kg", unitCost: 3000 },
    ],
    totalCost: 43000,
    createdByUid: "uid-admin",
    ...overrides,
  };
}

function makeBatch(overrides: Partial<ProductionBatch> = {}): ProductionBatch {
  return {
    id: "batch-1",
    batchCode: "BATCH-2024-0001",
    journalEntryId: null,
    productId: 1,
    productName: "Organic Soap",
    status: "planning",
    plannedQuantity: 100,
    actualQuantity: null,
    startedAt: null,
    expectedReadyAt: null,
    readyAt: null,
    plannedVariant: null,
    producedVariant: null,
    supplies: [
      { rawMaterialId: 10, rawMaterialName: "Olive Oil", quantity: 5, unit: "L", unitCost: 8000 },
    ],
    totalCost: 40000,
    notes: "",
    createdByUid: "uid-admin",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

/** Stores a batch as Firestore holds it — the steps read this, not the screen's copy. */
function storeBatch(batch: ProductionBatch, extra: Record<string, unknown> = {}) {
  firestoreMock.seed(`productionBatches/${batch.id}`, { ...batch, ...extra });
}

function journalEntriesWritten() {
  return firestoreMock.writes
    .filter((write) => write.op === "set" && write.data && "lines" in write.data)
    .map(
      (write) =>
        write.data as {
          lines: Array<{ accountCode: string; debit: number; credit: number }>;
          reversalOf?: string | null;
        },
    );
}

function batchWrite() {
  return firestoreMock.writes.find((write) => write.path.startsWith("productionBatches/"));
}

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.reset();
});

// ─── createProductionBatch ────────────────────────────────────────────────────

describe("createProductionBatch", () => {
  it("generates batch code starting at 0001 when the counter has never been used", async () => {
    await createProductionBatch(makeCreateInput());

    expect(batchWrite()?.data).toMatchObject({ batchCode: `BATCH-${year}-0001` });
  });

  it("continues the batch code series from the shared counter", async () => {
    firestoreMock.seed("counters/productionBatches", { lastNumber: 3, year, prefix: "BATCH" });

    await createProductionBatch(makeCreateInput());

    expect(batchWrite()?.data).toMatchObject({ batchCode: `BATCH-${year}-0004` });
  });

  it("sets status to planning and stores every supply", async () => {
    await createProductionBatch(makeCreateInput());

    expect(batchWrite()?.data).toMatchObject({ status: "planning", actualQuantity: null });
    expect((batchWrite()?.data?.supplies as unknown[]).length).toBe(2);
  });
});

// ─── advanceProductionBatch — planning → curing ──────────────────────────────

describe("advanceProductionBatch — planning → curing", () => {
  it("throws when no supplies are defined", async () => {
    const batch = makeBatch({ supplies: [] });
    storeBatch(batch);

    await expect(advanceProductionBatch("batch-1", batch, "curing")).rejects.toThrow("No supplies");
  });

  it("deducts raw materials and advances status", async () => {
    const batch = makeBatch();
    storeBatch(batch);
    firestoreMock.seed("rawMaterials/10", { remaining: 20, unitCost: 8000 });

    await advanceProductionBatch("batch-1", batch, "curing");

    expect(firestoreMock.lastWriteData("productionBatches/batch-1")).toMatchObject({ status: "curing" });
    expect(firestoreMock.lastWriteData("rawMaterials/10")).toMatchObject({ remaining: 15 });
  });

  it("records what the materials were worth when they left the shelf, keeping the planned figure", async () => {
    const batch = makeBatch({ totalCost: 40000 });
    storeBatch(batch);
    // The oil has got dearer since the batch was planned.
    firestoreMock.seed("rawMaterials/10", { remaining: 20, unitCost: 9000 });

    await advanceProductionBatch("batch-1", batch, "curing");

    expect(firestoreMock.lastWriteData("productionBatches/batch-1")).toMatchObject({
      totalCost: 45000,
      plannedTotalCost: 40000,
    });
  });

  it("throws INSUFFICIENT when raw material stock is too low", async () => {
    const batch = makeBatch();
    storeBatch(batch);
    firestoreMock.seed("rawMaterials/10", { remaining: 3 }); // need 5

    await expect(advanceProductionBatch("batch-1", batch, "curing")).rejects.toThrow("INSUFFICIENT");
    expect(firestoreMock.writesFor("rawMaterials/10")).toHaveLength(0);
  });

  it("throws the stale error if the batch already moved on (a double click)", async () => {
    const batch = makeBatch({ status: "planning" });
    storeBatch(batch, { status: "curing" });
    firestoreMock.seed("rawMaterials/10", { remaining: 20 });

    await expect(advanceProductionBatch("batch-1", batch, "curing")).rejects.toThrow("changed");
    // The materials were not taken a second time.
    expect(firestoreMock.writesFor("rawMaterials/10")).toHaveLength(0);
  });
});

// ─── advanceProductionBatch — curing → ready ─────────────────────────────────

describe("advanceProductionBatch — curing → ready", () => {
  it("throws when actualQuantity is 0", async () => {
    const batch = makeBatch({ status: "curing" });
    storeBatch(batch);

    await expect(advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 0 })).rejects.toThrow(
      "Actual quantity",
    );
  });

  it("adds actualQuantity to product totalStock and posts the completion entry", async () => {
    const batch = makeBatch({ status: "curing" });
    storeBatch(batch);
    firestoreMock.seed("products/1", { totalStock: 50 });

    await advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 90 });

    expect(firestoreMock.writesFor("products/1").some((write) => write.data?.totalStock === 140)).toBe(true);
    expect(firestoreMock.lastWriteData("productionBatches/batch-1")).toMatchObject({
      status: "ready",
      actualQuantity: 90,
    });
    expect(journalEntriesWritten()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "1210", debit: 40000 }),
      expect.objectContaining({ accountCode: "1220", credit: 40000 }),
    ]);
  });

  it("does not add the output twice when the batch was already completed", async () => {
    const batch = makeBatch({ status: "curing" });
    storeBatch(batch, { status: "ready" });
    firestoreMock.seed("products/1", { totalStock: 50 });

    await expect(advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 90 })).rejects.toThrow(
      "changed",
    );
    expect(firestoreMock.writesFor("products/1")).toHaveLength(0);
  });

  it("remembers the cost before and after so a deletion can put it back", async () => {
    const batch = makeBatch({ status: "curing", totalCost: 40000 });
    storeBatch(batch);
    firestoreMock.seed("products/1", { totalStock: 10, soldCount: 0, costPrice: 300 });

    await advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 90 });

    // (10 × 300 + 40000) / 100 = 430
    expect(firestoreMock.lastWriteData("productionBatches/batch-1")).toMatchObject({
      costPriceBefore: 300,
      costPriceAfter: 430,
    });
    expect(firestoreMock.lastWriteData("products/1")).toMatchObject({ costPrice: 430 });
  });

  it("throws when product is not found", async () => {
    const batch = makeBatch({ status: "curing" });
    storeBatch(batch);

    await expect(advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 90 })).rejects.toThrow(
      "Product not found",
    );
  });

  it("adds produced quantity to the chosen variant for variant products", async () => {
    const batch = makeBatch({ status: "curing" });
    storeBatch(batch);
    firestoreMock.seed("products/1", {
      totalStock: 30,
      variants: [
        { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
        { name: "Large", price: 2000, quantity: 20, soldCount: 0 },
      ],
    });

    await advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 15, variantName: "Large" });

    const stockWrite = firestoreMock.writesFor("products/1").find((write) => write.data?.variants);
    expect(stockWrite?.data).toMatchObject({
      variants: [
        { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
        { name: "Large", price: 2000, quantity: 35, soldCount: 0 },
      ],
      totalStock: 45,
    });
    expect(firestoreMock.lastWriteData("productionBatches/batch-1")).toMatchObject({
      status: "ready",
      actualQuantity: 15,
      producedVariant: "Large",
    });
  });

  it("throws VARIANT_REQUIRED when a variant product has no variant chosen", async () => {
    const batch = makeBatch({ status: "curing" });
    storeBatch(batch);
    firestoreMock.seed("products/1", { variants: [{ name: "Small", price: 1000, quantity: 10 }] });

    await expect(advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 5 })).rejects.toThrow(
      "VARIANT_REQUIRED",
    );
  });
});

// ─── deleteProductionBatch ────────────────────────────────────────────────────

describe("deleteProductionBatch", () => {
  it("deletes a PLANNING batch without side effects", async () => {
    const batch = makeBatch();
    storeBatch(batch);

    await deleteProductionBatch(batch);

    expect(firestoreMock.writes).toEqual([{ op: "delete", path: "productionBatches/batch-1", data: undefined }]);
  });

  it("restores raw materials when deleting a CURING batch", async () => {
    const batch = makeBatch({ status: "curing" });
    storeBatch(batch);
    firestoreMock.seed("rawMaterials/10", { remaining: 0 });

    await deleteProductionBatch(batch);

    expect(firestoreMock.lastWriteData("rawMaterials/10")).toMatchObject({ remaining: 5 });
    expect(firestoreMock.writesFor("productionBatches/batch-1").some((write) => write.op === "delete")).toBe(true);
  });

  it("reverses the produced quantity from the variant when deleting a READY variant batch", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 15, producedVariant: "Large" });
    storeBatch(batch);
    firestoreMock.seed("products/1", {
      totalStock: 45,
      variants: [
        { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
        { name: "Large", price: 2000, quantity: 35, soldCount: 0 },
      ],
    });

    await deleteProductionBatch(batch);

    expect(firestoreMock.lastWriteData("products/1")).toMatchObject({
      variants: [
        { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
        { name: "Large", price: 2000, quantity: 20, soldCount: 0 },
      ],
      totalStock: 30,
    });
  });

  it("removes actualQuantity from product stock when deleting a READY batch", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 90 });
    storeBatch(batch);
    firestoreMock.seed("products/1", { totalStock: 150 });

    await deleteProductionBatch(batch);

    expect(firestoreMock.lastWriteData("products/1")).toMatchObject({ totalStock: 60 });
  });

  it("shows the shortfall rather than clamping when removing more than is on the shelf", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 200 });
    storeBatch(batch);
    firestoreMock.seed("products/1", { totalStock: 50 });

    await deleteProductionBatch(batch);

    // Clamping at zero used to invent 150 units out of nothing.
    expect(firestoreMock.lastWriteData("products/1")).toMatchObject({ totalStock: -150 });
  });

  it("puts the consumed raw materials back when deleting a READY batch", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 90 });
    storeBatch(batch);
    firestoreMock.seed("products/1", { totalStock: 150 });
    firestoreMock.seed("rawMaterials/10", { remaining: 0 });

    await deleteProductionBatch(batch);

    expect(firestoreMock.lastWriteData("rawMaterials/10")).toMatchObject({ remaining: 5 });
  });

  it("reverses the completion entry and restores the cost the batch had blended in", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 90, journalEntryId: "entry-1" });
    storeBatch(batch, { costPriceBefore: 300, costPriceAfter: 430 });
    firestoreMock.seed("products/1", { totalStock: 100, costPrice: 430 });
    firestoreMock.seed("journalEntries/entry-1", {
      lines: [
        { accountCode: "1210", accountName: "Inventory", debit: 40000, credit: 0 },
        { accountCode: "1220", accountName: "Raw", debit: 0, credit: 40000 },
      ],
    });

    await deleteProductionBatch(batch);

    const [reversal] = journalEntriesWritten();
    expect(reversal.reversalOf).toBe("entry-1");
    expect(reversal.lines).toEqual([
      expect.objectContaining({ accountCode: "1210", credit: 40000 }),
      expect.objectContaining({ accountCode: "1220", debit: 40000 }),
    ]);
    expect(firestoreMock.lastWriteData("products/1")).toMatchObject({ costPrice: 300 });
  });

  it("leaves a cost that something newer has since set", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 90 });
    storeBatch(batch, { costPriceBefore: 300, costPriceAfter: 430 });
    firestoreMock.seed("products/1", { totalStock: 100, costPrice: 500 });

    await deleteProductionBatch(batch);

    expect(firestoreMock.writesFor("products/1").some((write) => "costPrice" in (write.data ?? {}))).toBe(false);
  });
});

// ─── updateProductionBatch ────────────────────────────────────────────────────

describe("updateProductionBatch", () => {
  it("allows full update when batch is in PLANNING status", async () => {
    const previous = makeBatch();
    storeBatch(previous);
    const next = { productId: 2, productName: "New Soap", plannedQuantity: 200, supplies: [], totalCost: 50000 };

    await updateProductionBatch("batch-1", previous, next);

    expect(firestoreMock.lastWriteData("productionBatches/batch-1")).toMatchObject({
      productId: 2,
      plannedQuantity: 200,
    });
  });

  it("restricts update to soft fields for non-PLANNING batches", async () => {
    const previous = makeBatch({ status: "curing" });
    storeBatch(previous);
    const next = {
      productId: 2,
      productName: "New Soap",
      plannedQuantity: 200,
      supplies: [],
      totalCost: 50000,
      notes: "updated note",
    };

    await updateProductionBatch("batch-1", previous, next);

    const update = firestoreMock.writesFor("productionBatches/batch-1").find((write) => write.op === "update");
    expect(update?.data).not.toHaveProperty("productId");
    expect(update?.data).not.toHaveProperty("plannedQuantity");
    expect(update?.data).not.toHaveProperty("supplies");
    expect(update?.data).toHaveProperty("notes", "updated note");
  });

  it("keeps the recipe when the screen still thinks a started batch is in planning", async () => {
    const previous = makeBatch({ status: "planning" });
    storeBatch(previous, { status: "curing" });
    const next = { productId: 2, productName: "New Soap", plannedQuantity: 200, supplies: [], totalCost: 50000 };

    await updateProductionBatch("batch-1", previous, next);

    const update = firestoreMock.writesFor("productionBatches/batch-1").find((write) => write.op === "update");
    expect(update?.data).not.toHaveProperty("supplies");
  });
});
