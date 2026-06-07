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

// ─── advanceProductionBatch — planning → curing ──────────────────────────────

describe("advanceProductionBatch — planning → curing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("throws when no supplies are defined", async () => {
    const batch = makeBatch({ status: "planning", supplies: [] });
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ status: "planning" }), id: "batch-1" });

    await expect(advanceProductionBatch("batch-1", batch, "curing")).rejects.toThrow("No supplies");
  });

  it("deducts raw materials and advances status", async () => {
    const batch = makeBatch({ status: "planning" });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "planning" }), id: "batch-1" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ remaining: 20 }), id: "10" }); // rawMaterial 10

    await advanceProductionBatch("batch-1", batch, "curing");

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "curing" }),
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

    await expect(advanceProductionBatch("batch-1", batch, "curing")).rejects.toThrow("INSUFFICIENT");
  });

  it("throws stale error if batch status changed since read", async () => {
    const batch = makeBatch({ status: "planning" });
    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ status: "ready" }), // mismatch with previous "planning"
      id: "batch-1",
    });

    await expect(advanceProductionBatch("batch-1", batch, "curing")).rejects.toThrow("changed");
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

  it("adds produced quantity to the chosen variant for variant products", async () => {
    const batch = makeBatch({ status: "curing" });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "curing" }), id: "batch-1" })
      .mockResolvedValueOnce({
        exists: () => true,
        id: "1",
        data: () => ({
          totalStock: 30,
          variants: [
            { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
            { name: "Large", price: 2000, quantity: 20, soldCount: 0 },
          ],
        }),
      });

    await advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 15, variantName: "Large" });

    // Chosen variant quantity bumped (20 → 35); totalStock mirrors variant sum (10 + 35).
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        variants: [
          { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
          { name: "Large", price: 2000, quantity: 35, soldCount: 0 },
        ],
        totalStock: 45,
      }),
    );
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "ready", actualQuantity: 15, producedVariant: "Large" }),
    );
  });

  it("throws VARIANT_REQUIRED when a variant product has no variant chosen", async () => {
    const batch = makeBatch({ status: "curing" });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ status: "curing" }), id: "batch-1" })
      .mockResolvedValueOnce({
        exists: () => true,
        id: "1",
        data: () => ({ variants: [{ name: "Small", price: 1000, quantity: 10 }] }),
      });

    await expect(
      advanceProductionBatch("batch-1", batch, "ready", { actualQuantity: 5 }),
    ).rejects.toThrow("VARIANT_REQUIRED");
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

  it("reverses the produced quantity from the variant when deleting a READY variant batch", async () => {
    const batch = makeBatch({ status: "ready", actualQuantity: 15, producedVariant: "Large" });
    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      id: "1",
      data: () => ({
        totalStock: 45,
        variants: [
          { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
          { name: "Large", price: 2000, quantity: 35, soldCount: 0 },
        ],
      }),
    });

    await deleteProductionBatch(batch);

    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    // Large variant reverted (35 → 20); totalStock mirrors variant sum (10 + 20).
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        variants: [
          { name: "Small", price: 1000, quantity: 10, soldCount: 0 },
          { name: "Large", price: 2000, quantity: 20, soldCount: 0 },
        ],
        totalStock: 30,
      }),
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
    const previous = makeBatch({ status: "curing" });
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
