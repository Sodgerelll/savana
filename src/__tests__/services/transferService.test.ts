import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// --- Mock firebase ---

const mockTxSet = vi.fn();
const mockTxUpdate = vi.fn();

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ id: "col" })),
  doc: vi.fn((_, col?: string, id?: string) => ({ path: `${col ?? "col"}/${id ?? "new"}`, id: id ?? "new" })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: "new-transfer-id" }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _ts: true })),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 })),
    fromDate: vi.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
  },
  increment: vi.fn((n: number) => ({ _increment: n })),
}));

import {
  addDoc,
  runTransaction,
} from "firebase/firestore";

import {
  createTransfer,
  confirmTransfer,
  cancelTransfer,
  generateTransferNumber,
  type CreateTransferInput,
} from "../../services/transferService";

// --- Fixtures ---

function makeTransferInput(overrides: Partial<CreateTransferInput> = {}): CreateTransferInput {
  return {
    customerId: "cust-1",
    customerName: "Alice",
    type: "SALE",
    items: [
      {
        productId: "prod-1",
        productName: "Soap",
        sku: "SKU-001",
        quantity: 10,
        unitPrice: 2000,
        originalPrice: 2000,
        discountPercent: 0,
      },
    ],
    paymentMethod: "CASH",
    paidAmount: 20000,
    taxEnabled: false,
    referenceNumber: "",
    notes: "",
    createdBy: "uid-admin",
    createdByName: "Admin",
    ...overrides,
  };
}

function makeTransfer(overrides: object = {}) {
  return {
    id: "trf-1",
    transferNumber: "TRF-2024-00001",
    customerId: "cust-1",
    customerName: "Alice",
    type: "SALE",
    status: "DRAFT",
    paymentStatus: "UNPAID",
    paymentMethod: "CASH",
    items: [
      { productId: "prod-1", productName: "Soap", sku: "SKU-001", quantity: 10, unitPrice: 2000, originalPrice: 2000, discountPercent: 0, lineTotal: 20000 },
    ],
    subtotal: 20000,
    discountAmount: 0,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 20000,
    paidAmount: 0,
    remainingAmount: 20000,
    notes: "",
    parentTransferId: null,
    deliveredAt: null,
    createdBy: "uid-admin",
    createdByName: "Admin",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

// --- generateTransferNumber ---

describe("generateTransferNumber", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses atomic counter via runTransaction", async () => {
    const currentYear = new Date().getFullYear();
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ lastNumber: 4, year: currentYear }),
        }),
        set: vi.fn(),
      });
    });

    const result = await generateTransferNumber();
    expect(result).toBe(`TRF-${currentYear}-00005`);
  });

  it("resets counter when year changes", async () => {
    const currentYear = new Date().getFullYear();
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ lastNumber: 99, year: currentYear - 1 }),
        }),
        set: vi.fn(),
      });
    });

    const result = await generateTransferNumber();
    expect(result).toBe(`TRF-${currentYear}-00001`);
  });

  it("starts at 1 when no counter document exists", async () => {
    const currentYear = new Date().getFullYear();
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn().mockResolvedValue({ exists: () => false }),
        set: vi.fn(),
      });
    });

    const result = await generateTransferNumber();
    expect(result).toBe(`TRF-${currentYear}-00001`);
  });
});

// --- createTransfer - line totals & financials ---

describe("createTransfer - financial calculations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: vi.fn().mockResolvedValue({ exists: () => false }), set: vi.fn() }),
    );
    (addDoc as Mock).mockResolvedValue({ id: "new-transfer-id" });
  });

  it("calculates lineTotal without discount", async () => {
    await createTransfer(makeTransferInput({
      items: [{ productId: "p1", productName: "Soap", sku: "S1", quantity: 3, unitPrice: 1000, originalPrice: 1000, discountPercent: 0 }],
      paidAmount: 3000,
    }));

    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.items[0].lineTotal).toBe(3000);
    expect(payload.subtotal).toBe(3000);
  });

  it("calculates lineTotal with discount", async () => {
    await createTransfer(makeTransferInput({
      items: [{ productId: "p1", productName: "Soap", sku: "S1", quantity: 10, unitPrice: 2000, originalPrice: 2000, discountPercent: 10 }],
      paidAmount: 18000,
    }));

    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.items[0].lineTotal).toBe(18000);
    expect(payload.subtotal).toBe(18000);
    expect(payload.discountAmount).toBe(2000);
  });

  it("adds 10% VAT when taxEnabled = true", async () => {
    await createTransfer(makeTransferInput({
      items: [{ productId: "p1", productName: "Soap", sku: "S1", quantity: 1, unitPrice: 10000, originalPrice: 10000, discountPercent: 0 }],
      taxEnabled: true,
      paidAmount: 11000,
    }));

    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.taxRate).toBe(10);
    expect(payload.taxAmount).toBe(1000);
    expect(payload.totalAmount).toBe(11000);
  });

  it("no VAT when taxEnabled = false", async () => {
    await createTransfer(makeTransferInput({ taxEnabled: false, paidAmount: 20000 }));
    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.taxRate).toBe(0);
    expect(payload.taxAmount).toBe(0);
  });

  it("paidAmount is clamped to totalAmount (no overpayment)", async () => {
    await createTransfer(makeTransferInput({ paidAmount: 999999, taxEnabled: false }));
    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.paidAmount).toBe(payload.totalAmount);
    expect(payload.remainingAmount).toBe(0);
  });

  it("sets paymentStatus = PAID when paidAmount >= totalAmount", async () => {
    await createTransfer(makeTransferInput({ paidAmount: 20000 }));
    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.paymentStatus).toBe("PAID");
    expect(payload.remainingAmount).toBe(0);
  });

  it("sets paymentStatus = PARTIAL when 0 < paidAmount < totalAmount", async () => {
    await createTransfer(makeTransferInput({ paidAmount: 5000 }));
    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.paymentStatus).toBe("PARTIAL");
    expect(payload.paidAmount).toBe(5000);
    expect(payload.remainingAmount).toBe(15000);
  });

  it("sets paymentStatus = UNPAID when paidAmount = 0", async () => {
    await createTransfer(makeTransferInput({ paidAmount: 0 }));
    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.paymentStatus).toBe("UNPAID");
    expect(payload.paidAmount).toBe(0);
    expect(payload.remainingAmount).toBe(20000);
  });

  it("sets paymentStatus = CREDIT and paidAmount = 0 for CREDIT method", async () => {
    await createTransfer(makeTransferInput({ paymentMethod: "CREDIT", paidAmount: 20000 }));
    const [, payload] = (addDoc as Mock).mock.calls[0];
    expect(payload.paymentStatus).toBe("CREDIT");
    expect(payload.paidAmount).toBe(0);
    expect(payload.remainingAmount).toBe(payload.totalAmount);
  });

  it("returns the new transfer id", async () => {
    const id = await createTransfer(makeTransferInput());
    expect(id).toBe("new-transfer-id");
  });
});

// --- confirmTransfer ---

describe("confirmTransfer", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupConfirmMocks(transferData: object, productData: object, customerData: object) {
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn()
          .mockResolvedValueOnce({ exists: () => true, id: "trf-1", data: () => transferData })
          .mockResolvedValueOnce({ exists: () => true, id: "cust-1", data: () => customerData })
          .mockResolvedValueOnce({ exists: () => true, id: "prod-1", data: () => productData }),
        set: vi.fn(),
        update: mockTxUpdate,
      });
    });
  }

  it("throws if transfer is not DRAFT", async () => {
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn().mockResolvedValueOnce({
          exists: () => true, id: "trf-1",
          data: () => makeTransfer({ status: "CONFIRMED" }),
        }),
        set: vi.fn(),
        update: vi.fn(),
      });
    });

    await expect(confirmTransfer("trf-1", "uid", "Admin")).rejects.toThrow("ноорог");
  });

  it("throws when stock is insufficient", async () => {
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn()
          .mockResolvedValueOnce({ exists: () => true, id: "trf-1", data: () => makeTransfer({ status: "DRAFT" }) })
          .mockResolvedValueOnce({ exists: () => true, id: "cust-1", data: () => ({}) })
          .mockResolvedValueOnce({ exists: () => true, id: "prod-1", data: () => ({ currentStock: 3, minStockLevel: 5 }) }),
        set: vi.fn(),
        update: vi.fn(),
      });
    });

    await expect(confirmTransfer("trf-1", "uid", "Admin")).rejects.toThrow("нөөц хүрэлцэхгүй");
  });

  it("updates stock to currentStock - quantity on confirm", async () => {
    const transfer = makeTransfer({ status: "DRAFT", paymentStatus: "PAID", paidAmount: 20000, remainingAmount: 0 });
    setupConfirmMocks(transfer, { currentStock: 50, minStockLevel: 5 }, { balance: 0 });

    await confirmTransfer("trf-1", "uid", "Admin");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining("prod-1") }),
      expect.objectContaining({ currentStock: 40 }),
    );
  });

  it("updates customer balance for UNPAID transfer", async () => {
    const transfer = makeTransfer({ status: "DRAFT", paymentStatus: "UNPAID", paidAmount: 0, remainingAmount: 20000, totalAmount: 20000 });
    setupConfirmMocks(transfer, { currentStock: 50, minStockLevel: 5 }, { balance: 0 });

    await confirmTransfer("trf-1", "uid", "Admin");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        balance: expect.objectContaining({ _increment: 20000 }),
      }),
    );
  });

  it("does NOT touch balance for PAID transfer", async () => {
    const transfer = makeTransfer({ status: "DRAFT", paymentStatus: "PAID", paidAmount: 20000, remainingAmount: 0 });
    setupConfirmMocks(transfer, { currentStock: 50, minStockLevel: 5 }, { balance: 0 });

    await confirmTransfer("trf-1", "uid", "Admin");

    const customerUpdateCall = (mockTxUpdate as Mock).mock.calls.find(
      ([ref]: [{ path: string }]) => ref?.path?.includes("cust-1"),
    );
    expect(customerUpdateCall?.[1]).not.toHaveProperty("balance");
  });

  it("updates transfer status to CONFIRMED", async () => {
    const transfer = makeTransfer({ status: "DRAFT", paymentStatus: "PAID", paidAmount: 20000, remainingAmount: 0 });
    setupConfirmMocks(transfer, { currentStock: 50, minStockLevel: 5 }, { balance: 0 });

    await confirmTransfer("trf-1", "uid", "Admin");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining("trf-1") }),
      expect.objectContaining({ status: "CONFIRMED" }),
    );
  });

  it("returns low stock alerts when stock goes below minimum", async () => {
    const transfer = makeTransfer({ status: "DRAFT", paymentStatus: "PAID", paidAmount: 20000, remainingAmount: 0 });
    setupConfirmMocks(transfer, { currentStock: 10, minStockLevel: 5 }, { balance: 0 });

    const result = await confirmTransfer("trf-1", "uid", "Admin");
    expect(result.lowStockAlerts.length).toBeGreaterThan(0);
    expect(result.lowStockAlerts[0]).toContain("Soap");
  });
});

// --- cancelTransfer ---

describe("cancelTransfer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels DRAFT without modifying stock or balance", async () => {
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn().mockResolvedValueOnce({
          exists: () => true, id: "trf-1",
          data: () => makeTransfer({ status: "DRAFT" }),
        }),
        set: mockTxSet,
        update: mockTxUpdate,
      });
    });

    await cancelTransfer("trf-1", "uid", "Admin");

    const productOrCustomerUpdates = (mockTxUpdate as Mock).mock.calls.filter(
      ([ref]: [{ path: string }]) => ref?.path?.includes("prod") || ref?.path?.includes("cust"),
    );
    expect(productOrCustomerUpdates).toHaveLength(0);

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "CANCELLED" }),
    );
  });

  it("throws when cancelling a DELIVERED transfer", async () => {
    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn().mockResolvedValueOnce({
          exists: () => true, id: "trf-1",
          data: () => makeTransfer({ status: "DELIVERED" }),
        }),
        set: vi.fn(),
        update: vi.fn(),
      });
    });

    await expect(cancelTransfer("trf-1", "uid", "Admin")).rejects.toThrow();
  });

  it("restores stock when cancelling a CONFIRMED transfer", async () => {
    const transfer = makeTransfer({ status: "CONFIRMED", paymentStatus: "UNPAID", paidAmount: 0, remainingAmount: 20000, totalAmount: 20000 });

    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn()
          .mockResolvedValueOnce({ exists: () => true, id: "trf-1", data: () => transfer })
          .mockResolvedValueOnce({ exists: () => true, id: "prod-1", data: () => ({ currentStock: 40, minStockLevel: 5 }) }),
        set: mockTxSet,
        update: mockTxUpdate,
      });
    });

    await cancelTransfer("trf-1", "uid", "Admin");

    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentStock: 50 }),
    );
  });

  it("reverses UNPAID balance when cancelling a CONFIRMED transfer", async () => {
    const transfer = makeTransfer({ status: "CONFIRMED", paymentStatus: "UNPAID", paidAmount: 0, remainingAmount: 20000, totalAmount: 20000 });

    (runTransaction as Mock).mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        get: vi.fn()
          .mockResolvedValueOnce({ exists: () => true, id: "trf-1", data: () => transfer })
          .mockResolvedValueOnce({ exists: () => true, id: "prod-1", data: () => ({ currentStock: 40 }) }),
        set: mockTxSet,
        update: mockTxUpdate,
      });
    });

    await cancelTransfer("trf-1", "uid", "Admin");

    const customerCall = (mockTxUpdate as Mock).mock.calls.find(
      ([ref]: [{ path: string }]) => ref?.path?.includes("cust-1"),
    );
    expect(customerCall?.[1]).toHaveProperty("balance");
    expect(customerCall?.[1].balance._increment).toBe(-20000);
  });
});
