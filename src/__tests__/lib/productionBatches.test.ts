import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Mock firebase ────────────────────────────────────────────────────────────

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, update: mockBatchUpdate, delete: mockBatchDelete, commit: mockBatchCommit };

vi.mock("../../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ id: "productionBatches" })),
  doc: vi.fn((_db: unknown, col?: string, id?: string) => ({
    path: `${col ?? "col"}/${id ?? "new"}`,
    id: id ?? "new-batch-id",
  })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _ts: true })),
  writeBatch: vi.fn(() => mockBatch),
}));

import { getDocs, getDoc } from "firebase/firestore";
import {
  createProductionBatch,
  updateProductionBatch,
  advanceProductionBatch,
  deleteProductionBatch,
  type ProductionBatch,
  type CreateProductionBatchInput,
} from "../../lib/productionBatches";

// ─── Fixtures ──────────────────────────────────────────────────────────────

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
    productId: 1,
    productName: "Organic Soap",
    status: "planning",
    plannedQuantity: 100,
    actualQuantity: null,
    startedAt: null,
    expectedReadyAt: null,
    readyAt: null,
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

// ─── createProductionBatch ────────────────────────────────────────────────────

describe("createProductionBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("generates batch code starting at 0001 when none exist", async () => {
    (getDocs as Mock).mockResolvedValue({ docs: [] });

    const id = await createProductionBatch(makeCreateInput());
    expect(id).toBe("new-batch-id");

    const year = new Date().getFullYear();
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ batchCode: `BATCH-${year}-0001` }),
    );
  });

  it("increments batch code based on existing max", async () => {
    const year = new Date().getFullYear();
    (getDocs as Mock).mockResolvedValue({
      docs: [
        { data: () => ({ batchCode: `BATCH-${year}-0003` }) },
        { data: () => ({ batchCode: `BATCH-${year}-0001` }) },
      ],
    });

    await createProductionBatch(makeCreateInput());

    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ batchCode: `BATCH-${year}-0004` }),
    );
  });

  it("sets status to planning", async () => {
    (getDocs as Mock).mockResolvedValue({ docs: [] });
    await createProductionBatch(makeCreateInput());

    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "planning", actualQuantity: null }),
    );
  });

  it("stores all supplies in the document", async () => {
    (getDocs as Mock).mockResolvedValue({ docs: [] });
    await createProductionBatch(makeCreateInput());

    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        supplies: expect.arrayContaining([
          expect.objectContaining({ rawMaterialId: 10 }),
          expect.objectContaining({ rawMaterialId: 11 }),
        ]),
      }),
    );
  });
});

// ─── advanceProductionBatch — planning → in_progress ─────────────────────────

describe("advanceProductionBatch — planning → in_progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("throws when no supplies are defined", async () => {
    const batch = makeBatch({ status: "planning", supplies: [] });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ status: "planning" }), id: "batch-1" });

    await expect(advanceProductionBatch("batch-1", batch, "in_progress")).rejects.toThrow("No supplies");
  });

  it("deducts raw materials and advances status", async () => {
    const batch = makeBatch({ status: "planning" });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "planning" }), id: "batch-1" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ remaining: 20 }), id: "10" }); // rawMaterial 10

    await advanceProductionBatch("batch-1", batch, "in_progress");

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "in_progress" }),
    );
    // Raw material should be deducted: 20 - 5 = 15
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ remaining: 15 }),
    );
  });

  it("throws INSUFFICIENT when raw material stock is too low", async () => {
    const batch = makeBatch({ status: "planning" });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "planning" }), id: "batch-1" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ remaining: 3 }), id: "10" }); // only 3, need 5

    await expect(advanceProductionBatch("batch-1", batch, "in_progress")).rejects.toThrow("INSUFFICIENT");
  });

  it("throws stale error if batch status changed since read", async () => {
    const batch = makeBatch({ status: "planning" });
    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ status: "in_progress" }), // mismatch
      id: "batch-1",
    });

    await expect(advanceProductionBatch("batch-1", batch, "in_progress")).rejects.toThrow("changed");
  });
});

// ─── advanceProductionBatch — in_progress → curing ───────────────────────────

describe("advanceProductionBatch — in_progress → curing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("updates status to curing", async () => {
    const batch = makeBatch({ status: "in_progress" });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ status: "in_progress" }), id: "batch-1" });

    await advanceProductionBatch("batch-1", batch, "curing", { expectedReadyAt: "2024-06-01" });

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "curing", expectedReadyAt: "2024-06-01" }),
    );
  });

  it("does NOT touch raw materials during curing transition", async () => {
    const batch = makeBatch({ status: "in_progress" });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ status: "in_progress" }), id: "batch-1" });

    await advanceProductionBatch("batch-1", batch, "curing");

    // Only one update call (the batch status update), no raw material updates
    const rawMaterialCalls = (mockBatchUpdate as Mock).mock.calls.filter(
      ([ref]: [{ path: string }]) => ref?.path?.includes("rawMaterial"),
    );
    expect(rawMaterialCalls).toHaveLength(0);
  });
});

// ─── advanceProductionBatch — curing → ready ─────────────────────────────────

describe("advanceProductionBatch — curing → ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("throws when actualQuantity is 0", async () => {
    const batch = makeBatch({ status: "curing" });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ status: "curing" }), id: "batch-1" });

    await expect(advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 0 })).rejects.toThrow("Actual quantity");
  });

  it("adds actualQuantity to product totalStock", async () => {
    const batch = makeBatch({ status: "curing" });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "curing" }), id: "batch-1" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50 }), id: "1" }); // product

    await advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 90 });

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ totalStock: 140 }), // 50 + 90
    );
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "ready", actualQuantity: 90 }),
    );
  });

  it("throws when product is not found", async () => {
    const batch = makeBatch({ status: "curing" });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "curing" }), id: "batch-1" })
      .mockResolvedValueOnce({ exists: () => false });

    await expect(advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 90 })).rejects.toThrow("Product not found");
  });
});

// ─── deleteProductionBatch ────────────────────────────────────────────────────

describe("deleteProductionBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("deletes a PLANNING batch without side effects", async () => {
    const batch = makeBatch({ status: "planning" });
    await deleteProductionBatch(batch);

    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("restores raw materials when deleting an IN_PROGRESS batch", async () => {
    const batch = makeBatch({ status: "in_progress" });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ remaining: 10 }), id: "10" });

    await deleteProductionBatch(batch);

    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    // remaining should be restored: 10 + 5 = 15
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ remaining: 15 }),
    );
  });

  it("restores raw materials when deleting a CURING batch", async () => {
    const batch = makeBatch({ status: "curing" });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ remaining: 0 }), id: "10" });

    await deleteProductionBatch(batch);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ remaining: 5 }), // 0 + 5 restored
    );
  });

  it("removes actualQuantity from product stock when deleting a READY batch", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 90 });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ totalStock: 150 }), id: "1" });

    await deleteProductionBatch(batch);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ totalStock: 60 }), // 150 - 90
    );
  });

  it("clamps product stock to 0 when removing more than available", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 200 });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ totalStock: 50 }), id: "1" });

    await deleteProductionBatch(batch);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ totalStock: 0 }), // clamped
    );
  });
});

// ─── updateProductionBatch ────────────────────────────────────────────────────

describe("updateProductionBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("allows full update when batch is in PLANNING status", async () => {
    const previous = makeBatch({ status: "planning" });
    const next = { productId: 2, productName: "New Soap", plannedQuantity: 200, supplies: [], totalCost: 50000 };

    await updateProductionBatch("batch-1", previous, next);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ productId: 2, plannedQuantity: 200 }),
    );
  });

  it("restricts update to soft fields for non-PLANNING batches", async () => {
    const previous = makeBatch({ status: "in_progress" });
    const next = { productId: 2, productName: "New Soap", plannedQuantity: 200, supplies: [], totalCost: 50000, notes: "updated note" };

    await updateProductionBatch("batch-1", previous, next);

    const updatePayload = (mockBatchUpdate as Mock).mock.calls[0][1];
    // Should NOT update productId, plannedQuantity, supplies
    expect(updatePayload).not.toHaveProperty("productId");
    expect(updatePayload).not.toHaveProperty("plannedQuantity");
    expect(updatePayload).not.toHaveProperty("supplies");
    // Should only update soft fields
    expect(updatePayload).toHaveProperty("notes");
  });
});
