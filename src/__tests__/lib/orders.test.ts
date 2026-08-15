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
  registerOrderContact,
  subscribeToOrders,
  updateOrderByAdmin,
  type OrderPaymentPayload,
  type OrderRecord,
} from "../../lib/orders";

beforeEach(() => {
  vi.clearAllMocks();
  (getDoc as Mock).mockResolvedValue({ exists: () => false, data: () => ({}) });
});

// ─── registerOrderContact ─────────────────────────────────────────────────────

describe("registerOrderContact", () => {
  it("posts the order id to the directory endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ contactId: "c1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await registerOrderContact("order-7");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/orders/register-contact");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ orderId: "order-7" });

    vi.unstubAllGlobals();
  });

  it("swallows a failure so a checkout is never broken by the directory", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(registerOrderContact("order-7")).resolves.toBeUndefined();

    vi.unstubAllGlobals();
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
