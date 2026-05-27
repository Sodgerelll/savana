import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Mock firebase/firestore ──────────────────────────────────────────────────

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = {
  set: mockBatchSet,
  update: mockBatchUpdate,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
};

const mockDocRef = { id: "new-doc-id", path: "col/new-doc-id" };

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ id: "customerTransactions" })),
  doc: vi.fn(() => mockDocRef),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
  where: vi.fn(),
  writeBatch: vi.fn(() => mockBatch),
}));

import { getDocs, getDoc } from "firebase/firestore";
import {
  createEmptyTransactionDraft,
  createCustomerTransaction,
  deleteCustomerTransaction,
  updateCustomerTransaction,
  type CustomerTransactionRecord,
  type CreateCustomerTransactionInput,
} from "../../lib/customerTransactions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTxInput(overrides: Partial<CreateCustomerTransactionInput> = {}): CreateCustomerTransactionInput {
  return {
    type: "delivery",
    customerId: "cust-1",
    customerSnapshot: { code: "CUS-0001", name: "Alice", phoneNumber: "99001234" },
    items: [
      { productId: 10, productName: "Soap", category: "soap", image: null, variant: null, quantity: 5, soldQuantity: 0, unitPrice: 2000, lineTotal: 10000 },
    ],
    totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
    payment: { status: "paid", paidAmount: 10000, method: "cash", paidAt: null },
    createdByUid: "uid-admin",
    ...overrides,
  };
}

function makeTxRecord(overrides: Partial<CustomerTransactionRecord> = {}): CustomerTransactionRecord {
  return {
    id: "tx-1",
    txNumber: "TX-000001",
    type: "delivery",
    customerId: "cust-1",
    customerSnapshot: { code: "CUS-0001", name: "Alice", phoneNumber: "99001234" },
    items: [
      { productId: 10, productName: "Soap", category: "soap", image: null, variant: null, quantity: 5, soldQuantity: 0, unitPrice: 2000, lineTotal: 10000 },
    ],
    totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
    payment: { status: "paid", paidAmount: 10000, method: "cash", paidAt: null },
    relatedTransactionId: null,
    transactionDate: "2024-01-15",
    note: "",
    createdByUid: "uid-admin",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function mockGetDocsEmpty() {
  (getDocs as Mock).mockResolvedValue({ docs: [] });
}


// ─── createEmptyTransactionDraft ─────────────────────────────────────────────

describe("createEmptyTransactionDraft", () => {
  it("returns a valid draft with sensible defaults", () => {
    const draft = createEmptyTransactionDraft();
    expect(draft.id).toBe("");
    expect(draft.txNumber).toBe("");
    expect(draft.type).toBe("delivery");
    expect(draft.customerId).toBe("");
    expect(draft.items).toEqual([]);
    expect(draft.totals.grandTotal).toBe(0);
    expect(draft.payment.status).toBe("unpaid");
    expect(draft.payment.paidAmount).toBe(0);
    expect(draft.payment.method).toBeNull();
  });

  it("sets transactionDate to today in YYYY-MM-DD format", () => {
    const draft = createEmptyTransactionDraft();
    expect(draft.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = new Date().toISOString().slice(0, 10);
    expect(draft.transactionDate).toBe(today);
  });

  it("returns a fresh object on each call (not shared reference)", () => {
    const a = createEmptyTransactionDraft();
    const b = createEmptyTransactionDraft();
    a.items.push({ productId: 99, productName: "X", category: "c", image: null, variant: null, quantity: 1, soldQuantity: 0, unitPrice: 100, lineTotal: 100 });
    expect(b.items).toHaveLength(0);
  });
});

// ─── createCustomerTransaction ────────────────────────────────────────────────

describe("createCustomerTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("generates a TX number from the current max + 1", async () => {
    // existing TX-000005
    (getDocs as Mock).mockResolvedValue({
      docs: [{ data: () => ({ txNumber: "TX-000005" }) }],
    });
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 100, soldCount: 10, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 0, totalPaid: 0, outstandingBalance: 0 }), id: "cust-1" });

    const id = await createCustomerTransaction(makeTxInput());
    expect(id).toBe("new-doc-id");

    // batch.set should have been called with txNumber TX-000006
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ txNumber: "TX-000006" }),
    );
  });

  it("starts numbering at TX-000001 when no existing transactions", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 100, soldCount: 0, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 0, totalPaid: 0, outstandingBalance: 0 }), id: "cust-1" });

    await createCustomerTransaction(makeTxInput());

    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ txNumber: "TX-000001" }),
    );
  });

  it("increases soldCount on delivery (stock sign = -1 → soldCount goes up)", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 100, soldCount: 3, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 0, totalPaid: 0, outstandingBalance: 0 }), id: "cust-1" });

    await createCustomerTransaction(makeTxInput({ type: "delivery" }));

    // soldCount should increase: 3 + 5 = 8
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ soldCount: 8 }),
    );
  });

  it("decreases soldCount on return (stock sign = +1 → soldCount goes down)", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 100, soldCount: 8, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 0, totalPaid: 0, outstandingBalance: 0 }), id: "cust-1" });

    await createCustomerTransaction(makeTxInput({ type: "return" }));

    // soldCount should decrease: 8 - 5 = 3
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ soldCount: 3 }),
    );
  });

  it("soldCount never goes below 0", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 100, soldCount: 2, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 0, totalPaid: 0, outstandingBalance: 0 }), id: "cust-1" });

    // returning 5 when soldCount is only 2 → clamp at 0
    await createCustomerTransaction(makeTxInput({ type: "return" }));

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ soldCount: 0 }),
    );
  });

  it("updates customer aggregates correctly for a PAID delivery", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 0, variants: null }), id: "10" })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ totalSales: 5000, totalPaid: 3000, outstandingBalance: 2000 }),
        id: "cust-1",
      });

    const input = makeTxInput({
      type: "delivery",
      totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
      payment: { status: "paid", paidAmount: 10000, method: "cash", paidAt: null },
    });
    await createCustomerTransaction(input);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        totalSales: 15000,        // 5000 + 10000
        totalPaid: 13000,         // 3000 + 10000
        outstandingBalance: 2000, // 2000 + (10000 - 10000) = 2000
      }),
    );
  });

  it("updates customer aggregates correctly for an UNPAID delivery", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 0, variants: null }), id: "10" })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ totalSales: 0, totalPaid: 0, outstandingBalance: 0 }),
        id: "cust-1",
      });

    const input = makeTxInput({
      type: "delivery",
      totals: { subtotal: 8000, discount: 0, grandTotal: 8000 },
      payment: { status: "unpaid", paidAmount: 0, method: null, paidAt: null },
    });
    await createCustomerTransaction(input);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        totalSales: 8000,
        totalPaid: 0,
        outstandingBalance: 8000,
      }),
    );
  });

  it("updates customer aggregates correctly for a RETURN", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 10, variants: null }), id: "10" })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 }),
        id: "cust-1",
      });

    const input = makeTxInput({
      type: "return",
      totals: { subtotal: 4000, discount: 0, grandTotal: 4000 },
      payment: { status: "paid", paidAmount: 4000, method: "cash", paidAt: null },
    });
    await createCustomerTransaction(input);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        totalSales: 6000,          // 10000 - 4000
        totalPaid: 6000,           // 10000 - 4000
        outstandingBalance: 0,     // 0 - (4000 - 4000)
      }),
    );
  });

  it("throws when customer is not found", async () => {
    mockGetDocsEmpty();
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 0, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => false });

    await expect(createCustomerTransaction(makeTxInput())).rejects.toThrow("Customer not found");
  });
});

// ─── deleteCustomerTransaction ────────────────────────────────────────────────

describe("deleteCustomerTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("deletes the transaction doc", async () => {
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 5, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 }), id: "cust-1" });

    const record = makeTxRecord();
    await deleteCustomerTransaction(record);

    expect(mockBatchDelete).toHaveBeenCalled();
  });

  it("reverses stock for a delivery (soldCount decreases)", async () => {
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 8, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 }), id: "cust-1" });

    const record = makeTxRecord({ type: "delivery" });
    await deleteCustomerTransaction(record);

    // Reversing delivery: sign = -(-1) = 1 → soldCount - 5 = 3
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ soldCount: 3 }),
    );
  });

  it("reverses customer aggregates correctly", async () => {
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 8, variants: null }), id: "10" })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 }),
        id: "cust-1",
      });

    const record = makeTxRecord({
      type: "delivery",
      totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
      payment: { status: "paid", paidAmount: 10000, method: "cash", paidAt: null },
    });
    await deleteCustomerTransaction(record);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        totalSales: 0,
        totalPaid: 0,
        outstandingBalance: 0,
      }),
    );
  });

  it("proceeds gracefully if customer is already deleted", async () => {
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 5, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => false });

    const record = makeTxRecord();
    // Should not throw — customer deletion is handled with try/catch
    await expect(deleteCustomerTransaction(record)).resolves.toBeUndefined();
    expect(mockBatchDelete).toHaveBeenCalled();
  });
});

// ─── updateCustomerTransaction ────────────────────────────────────────────────

describe("updateCustomerTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
  });

  it("batch updates the transaction document", async () => {
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 8, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 }), id: "cust-1" });

    const previous = makeTxRecord();
    const next = makeTxInput();
    await updateCustomerTransaction("tx-1", previous, next);

    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: next.type }),
    );
  });

  it("adjusts customer aggregates when customerId stays the same", async () => {
    (getDoc as Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalStock: 50, soldCount: 8, variants: null }), id: "10" })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 }), id: "cust-1" });

    const previous = makeTxRecord({
      totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
      payment: { status: "paid", paidAmount: 10000, method: "cash", paidAt: null },
    });
    const next = makeTxInput({
      totals: { subtotal: 12000, discount: 0, grandTotal: 12000 },
      payment: { status: "paid", paidAmount: 12000, method: "cash", paidAt: null },
    });
    await updateCustomerTransaction("tx-1", previous, next);

    // reverse(old): totalSales -10000, then apply(new): +12000 → net +2000 on 10000 = 12000
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        totalSales: 12000,
        totalPaid: 12000,
        outstandingBalance: 0,
      }),
    );
  });
});
