import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Mock firebase/firestore ──────────────────────────────────────────────────

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = {
  set: mockBatchSet,
  update: mockBatchUpdate,
  delete: vi.fn(),
  commit: mockBatchCommit,
};

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ id: "orders" })),
  doc: vi.fn(() => ({ id: "new-order-id", path: "orders/new-order-id" })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  // Used by generateJournalEntryNumber (postEntryClient) — runs the callback against
  // an empty counter doc so numbering always starts at 1 in tests.
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({
      get: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
      set: vi.fn(),
      update: vi.fn(),
    }),
  ),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  where: vi.fn(),
  writeBatch: vi.fn(() => mockBatch),
}));

import { getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import {
  createManualOrder,
  subscribeToOrders,
  updateOrderByAdmin,
  type CreateManualOrderInput,
  type OrderPaymentPayload,
  type OrderRecord,
} from "../../lib/orders";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeManualInput(overrides: Partial<CreateManualOrderInput> = {}): CreateManualOrderInput {
  return {
    source: "messenger",
    status: "new",
    paymentMethod: "cash",
    customer: { fullName: "Alice", phoneNumber: "99001234", email: null, note: "" },
    address: {
      region: "Улаанбаатар",
      districtOrSoum: "Баянгол",
      khorooOrBag: "5-р хороо",
      streetAddress: "12-р байр",
      additionalAddress: "",
    },
    items: [
      {
        productId: 10,
        name: "Soap",
        category: "soap",
        image: null,
        variant: null,
        quantity: 2,
        unitPrice: 9000,
        originalUnitPrice: 10000,
        lineTotal: 18000,
      },
    ],
    totals: { subtotal: 18000, shippingFee: 8000, grandTotal: 26000, discountTotal: 2000 },
    createdByUid: "uid-admin",
    ...overrides,
  };
}

interface WrittenJournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

/** The two shapes createManualOrder writes through the batch: the order and its journal entry. */
interface WrittenDoc {
  orderNumber?: string;
  source?: string;
  isManual?: boolean;
  createdByUid?: string;
  status?: string;
  currency?: string;
  journalEntryId?: string | null;
  auth?: { uid: string; isAnonymous: boolean; method: string };
  payment?: Record<string, unknown>;
  lines?: WrittenJournalLine[];
  sourceType?: string;
  sourceNumber?: string;
  totalAmount?: number;
}

function writtenDocs(): WrittenDoc[] {
  return mockBatchSet.mock.calls.map((args) => args[1] as WrittenDoc);
}

/** The batch.set() payload that carries the order document (the other one is the journal entry). */
function writtenOrder(): WrittenDoc {
  return writtenDocs().find((data) => data.orderNumber !== undefined) as WrittenDoc;
}

/** The batch.set() payload that carries the journal entry, if one was posted. */
function writtenJournalEntry(): WrittenDoc | undefined {
  return writtenDocs().find((data) => data.lines !== undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  (getDoc as Mock).mockResolvedValue({ exists: () => false, data: () => ({}) });
});

// ─── createManualOrder ────────────────────────────────────────────────────────

describe("createManualOrder", () => {
  it("stores the chosen source and flags the order as manual", async () => {
    const result = await createManualOrder(makeManualInput({ source: "phone" }));

    const order = writtenOrder();
    expect(order.source).toBe("phone");
    expect(order.isManual).toBe(true);
    expect(order.createdByUid).toBe("uid-admin");
    expect(order.status).toBe("new");
    expect(order.currency).toBe("MNT");
    expect(result.orderNumber).toMatch(/^ORD-/);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it("leaves a new order's payment pending and posts no journal entry", async () => {
    await createManualOrder(makeManualInput({ status: "new" }));

    const order = writtenOrder();
    expect(order.payment).toMatchObject({
      method: "cash",
      provider: "cash",
      status: "pending",
      amount: 26000,
      paidAt: null,
      invoiceId: null,
    });
    expect(order.journalEntryId).toBeNull();
    expect(writtenJournalEntry()).toBeUndefined();
  });

  it("marks a settled order paid and posts the revenue journal entry", async () => {
    await createManualOrder(makeManualInput({ status: "delivered" }));

    const order = writtenOrder();
    expect(order.payment?.status).toBe("paid");
    expect(typeof order.payment?.paidAt).toBe("string");

    const entry = writtenJournalEntry();
    expect(entry).toBeDefined();
    expect(entry?.sourceType).toBe("order");
    expect(entry?.sourceNumber).toBe(order.orderNumber);
    // cash in, online revenue out — no COGS lines because the product has no costPrice
    expect(entry?.lines).toEqual([
      { accountCode: "1010", accountName: expect.any(String), debit: 26000, credit: 0 },
      { accountCode: "4100", accountName: expect.any(String), debit: 0, credit: 26000 },
    ]);
    expect(order.journalEntryId).toBeTruthy();
  });

  it("settles a bank transfer into the bank account instead of cash", async () => {
    await createManualOrder(makeManualInput({ status: "paid", paymentMethod: "bank_transfer" }));

    const entry = writtenJournalEntry();
    expect(entry?.lines?.[0]?.accountCode).toBe("1020");
  });

  it("adds COGS lines from the product cost price", async () => {
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ costPrice: 3000 }) });

    await createManualOrder(makeManualInput({ status: "paid" }));

    const entry = writtenJournalEntry();
    // 2 units × 3000 cost
    expect(entry?.lines).toEqual([
      expect.objectContaining({ accountCode: "1010", debit: 26000 }),
      expect.objectContaining({ accountCode: "4100", credit: 26000 }),
      expect.objectContaining({ accountCode: "5000", debit: 6000 }),
      expect.objectContaining({ accountCode: "1210", credit: 6000 }),
    ]);
    expect(entry?.totalAmount).toBe(32000);
  });

  it("keeps manual orders out of every shopper's order list", async () => {
    await createManualOrder(makeManualInput());

    expect(writtenOrder().auth).toEqual({ uid: "", isAnonymous: false, method: "manual" });
  });
});

// ─── updateOrderByAdmin ───────────────────────────────────────────────────────

describe("updateOrderByAdmin", () => {
  it("persists a changed order source", async () => {
    const payment: OrderPaymentPayload = {
      method: "cash",
      provider: "cash",
      status: "pending",
      amount: 26000,
      qrPayload: "",
      invoiceId: null,
      paidAt: null,
    };

    await updateOrderByAdmin("order-1", {
      status: "new",
      source: "facebook",
      customer: { fullName: "Alice", phoneNumber: "99001234", email: null, note: "" },
      address: {
        region: "Улаанбаатар",
        districtOrSoum: "Баянгол",
        khorooOrBag: "5-р хороо",
        streetAddress: "12-р байр",
        additionalAddress: "",
      },
      payment,
    });

    expect((updateDoc as Mock).mock.calls[0][1]).toMatchObject({ status: "new", source: "facebook" });
  });
});

// ─── deserialization ──────────────────────────────────────────────────────────

describe("subscribeToOrders", () => {
  function emitOrder(data: Record<string, unknown>): OrderRecord {
    let received: OrderRecord[] = [];
    (onSnapshot as Mock).mockImplementation((_query: unknown, onNext: (snap: unknown) => void) => {
      onNext({ docs: [{ id: "order-1", data: () => data }] });
      return vi.fn();
    });
    subscribeToOrders({ onData: (orders) => { received = orders; } });
    return received[0];
  }

  it("treats orders saved before the source field existed as web orders", () => {
    const order = emitOrder({ orderNumber: "ORD-1", status: "paid" });

    expect(order.source).toBe("web");
    expect(order.isManual).toBe(false);
  });

  it("falls back to web for an unrecognized source", () => {
    const order = emitOrder({ orderNumber: "ORD-1", source: "carrier-pigeon" });

    expect(order.source).toBe("web");
  });

  it("keeps a known source and the manual flag", () => {
    const order = emitOrder({ orderNumber: "ORD-1", source: "messenger", isManual: true, createdByUid: "uid-admin" });

    expect(order.source).toBe("messenger");
    expect(order.isManual).toBe(true);
    expect(order.createdByUid).toBe("uid-admin");
  });
});
