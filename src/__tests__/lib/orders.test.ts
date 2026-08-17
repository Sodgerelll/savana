import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { firestoreMock } from "../helpers/firestoreMock";

// ─── Mock firebase/firestore ──────────────────────────────────────────────────

vi.mock("../../lib/firebase", () => ({ db: {} }));

// Admin edits now move stock in the same transaction as the status change, so the mock
// models a small in-memory Firestore. See src/__tests__/helpers/firestoreMock.ts.
vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);

import { onSnapshot } from "firebase/firestore";
import {
  createOrderReturn,
  registerOrderContact,
  subscribeToOrders,
  updateOrderByAdmin,
  type OrderPaymentPayload,
  type OrderRecord,
} from "../../lib/orders";

interface WrittenJournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

interface WrittenJournalEntry {
  sourceType?: string;
  sourceNumber?: string;
  lines?: WrittenJournalLine[];
}

function writtenJournalEntries(): WrittenJournalEntry[] {
  return firestoreMock.writes
    .filter((write) => write.op === "set" && write.data && "lines" in write.data)
    .map((write) => write.data as WrittenJournalEntry);
}

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.reset();
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
    firestoreMock.seed("orders/order-1", { stockApplied: false, items: [] });
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

    expect(firestoreMock.lastWriteData("orders/order-1")).toMatchObject({
      status: "new",
      source: "facebook",
    });
  });

  it("moves stock out when the order becomes paid, and back when it is unpaid again", async () => {
    const payment: OrderPaymentPayload = {
      method: "cash",
      provider: "cash",
      status: "pending",
      amount: 26000,
      qrPayload: "",
      invoiceId: null,
      paidAt: null,
    };
    const base = {
      source: "web" as const,
      customer: { fullName: "Alice", phoneNumber: "99001234", email: null, note: "" },
      address: {
        region: "Улаанбаатар",
        districtOrSoum: "Баянгол",
        khorooOrBag: "5-р хороо",
        streetAddress: "12-р байр",
        additionalAddress: "",
      },
      payment,
    };

    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 0, variants: null });
    firestoreMock.seed("orders/order-1", {
      stockApplied: false,
      items: [{ productId: 10, quantity: 3, variant: null }],
    });

    // Marking it paid takes the goods off the shelf...
    await updateOrderByAdmin("order-1", { ...base, status: "paid" });
    expect(firestoreMock.lastWriteData("products/10")).toMatchObject({ soldCount: 3 });

    // ...and putting it back to new returns them.
    await updateOrderByAdmin("order-1", { ...base, status: "new" });
    expect(firestoreMock.lastWriteData("products/10")).toMatchObject({ soldCount: 0 });
  });

  it("does not move stock twice when an already-paid order is edited", async () => {
    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 3, variants: null });
    firestoreMock.seed("orders/order-1", {
      stockApplied: true,
      items: [{ productId: 10, quantity: 3, variant: null }],
    });

    await updateOrderByAdmin("order-1", {
      status: "delivered",
      source: "web",
      customer: { fullName: "Alice", phoneNumber: "99001234", email: null, note: "" },
      address: {
        region: "Улаанбаатар",
        districtOrSoum: "Баянгол",
        khorooOrBag: "5-р хороо",
        streetAddress: "12-р байр",
        additionalAddress: "",
      },
      payment: {
        method: "cash",
        provider: "cash",
        status: "paid",
        amount: 26000,
        qrPayload: "",
        invoiceId: null,
        paidAt: "2026-08-12T00:00:00.000Z",
      },
    });

    expect(firestoreMock.writesFor("products/10")).toHaveLength(0);
  });
});

// ─── createOrderReturn ─────────────────────────────────────────────────────────

describe("createOrderReturn", () => {
  const paidPayment: OrderPaymentPayload = {
    method: "cash",
    provider: "cash",
    status: "paid",
    amount: 18000,
    qrPayload: "",
    invoiceId: null,
    paidAt: "2026-08-12T00:00:00.000Z",
  };

  function seedOrder(overrides: Record<string, unknown> = {}) {
    firestoreMock.seed("orders/order-1", {
      orderNumber: "ORD-1",
      stockApplied: true,
      items: [
        { productId: 10, name: "Soap", category: "soap", image: null, variant: null, quantity: 2, unitPrice: 9000, originalUnitPrice: 9000, lineTotal: 18000 },
      ],
      totals: { subtotal: 18000, shippingFee: 0, grandTotal: 18000, discountTotal: 0, vatMode: "none", vatAmount: 0 },
      payment: paidPayment,
      returns: [],
      ...overrides,
    });
  }

  function orderReturns(): Array<Record<string, unknown>> {
    const data = firestoreMock.lastWriteData("orders/order-1");
    return (data?.returns as Array<Record<string, unknown>>) ?? [];
  }

  it("restores stock and posts a Sales Returns entry for a full return", async () => {
    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 2, variants: null });
    seedOrder();

    await createOrderReturn("order-1", [{ productId: 10, variant: null, quantity: 2 }], "damaged", "uid-1", "Admin");

    expect(firestoreMock.lastWriteData("products/10")).toMatchObject({ soldCount: 0 });

    const [entry] = writtenJournalEntries();
    expect(entry.sourceType).toBe("order");
    expect(entry.lines).toEqual([
      { accountCode: "4910", accountName: expect.any(String), debit: 18000, credit: 0 },
      { accountCode: "1010", accountName: expect.any(String), debit: 0, credit: 18000 },
    ]);
    expect(orderReturns()).toHaveLength(1);
  });

  it("credits the Bonum clearing account back for an online order", async () => {
    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 2, variants: null });
    seedOrder({ payment: { ...paidPayment, method: "bonum", provider: "bonum" } });

    await createOrderReturn("order-1", [{ productId: 10, variant: null, quantity: 1 }], "damaged", "uid-1", "Admin");

    expect(writtenJournalEntries()[0].lines?.[1]).toMatchObject({ accountCode: "1030", credit: 9000 });
  });

  it("rejects a return against an order that was never paid", async () => {
    seedOrder({ payment: { ...paidPayment, status: "pending" } });

    await expect(
      createOrderReturn("order-1", [{ productId: 10, variant: null, quantity: 1 }], "too soon", "uid-1", "Admin"),
    ).rejects.toThrow();
  });

  it("rejects returning more than the order ever shipped", async () => {
    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 2, variants: null });
    seedOrder();

    await expect(
      createOrderReturn("order-1", [{ productId: 10, variant: null, quantity: 5 }], "too many", "uid-1", "Admin"),
    ).rejects.toThrow();
  });

  it("caps a further return at what remains after a prior partial return", async () => {
    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 2, variants: null });
    seedOrder();

    await createOrderReturn("order-1", [{ productId: 10, variant: null, quantity: 1 }], "one back", "uid-1", "Admin");
    await expect(
      createOrderReturn("order-1", [{ productId: 10, variant: null, quantity: 2 }], "too many", "uid-1", "Admin"),
    ).rejects.toThrow();

    await createOrderReturn("order-1", [{ productId: 10, variant: null, quantity: 1 }], "the rest", "uid-1", "Admin");
    expect(firestoreMock.lastWriteData("products/10")).toMatchObject({ soldCount: 0 });
    expect(orderReturns()).toHaveLength(2);
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
