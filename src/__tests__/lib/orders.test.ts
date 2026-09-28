import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { firestoreMock } from "../helpers/firestoreMock";

// ─── Mock firebase/firestore ──────────────────────────────────────────────────

vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

// Admin edits now move stock in the same transaction as the status change, so the mock
// models a small in-memory Firestore. See src/__tests__/helpers/firestoreMock.ts.
vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);

import { onSnapshot } from "firebase/firestore";
import {
  createOrder,
  createOrderReturn,
  deleteOrder,
  OrderInvoiceError,
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

// ─── Ledger follows the admin's paid/unpaid edits ─────────────────────────────

describe("updateOrderByAdmin — revenue", () => {
  const customer = { fullName: "Alice", phoneNumber: "99001234", email: null, note: "" };
  const address = {
    region: "Улаанбаатар",
    districtOrSoum: "Баянгол",
    khorooOrBag: "5-р хороо",
    streetAddress: "12-р байр",
    additionalAddress: "",
  };
  const cashPayment = (status: "pending" | "paid"): OrderPaymentPayload => ({
    method: "cash",
    provider: "cash",
    status,
    amount: 26000,
    qrPayload: "",
    invoiceId: null,
    paidAt: status === "paid" ? "2026-09-01T00:00:00.000Z" : null,
  });

  function seedUnpaidOrder(overrides: Record<string, unknown> = {}) {
    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 0, costPrice: 3000 });
    firestoreMock.seed("orders/order-1", {
      orderNumber: "ORD-1",
      source: "messenger",
      stockApplied: false,
      items: [{ productId: 10, name: "Soap", quantity: 2, unitPrice: 9000, variant: null }],
      totals: { subtotal: 18000, shippingFee: 8000, grandTotal: 26000, vatMode: "none", vatAmount: 0 },
      payment: cashPayment("pending"),
      returns: [],
      ...overrides,
    });
  }

  it("books the revenue and its cost when an admin marks an order paid", async () => {
    seedUnpaidOrder();

    await updateOrderByAdmin("order-1", { status: "paid", source: "messenger", customer, address, payment: cashPayment("pending") });

    const [entry] = writtenJournalEntries();
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: "1010", debit: 26000 }),
      expect.objectContaining({ accountCode: "4400", credit: 8000 }),
      expect.objectContaining({ accountCode: "4100", credit: 18000 }),
      expect.objectContaining({ accountCode: "5000", debit: 6000 }),
      expect.objectContaining({ accountCode: "1210", credit: 6000 }),
    ]);
    expect(firestoreMock.lastWriteData("orders/order-1")).toMatchObject({ stockApplied: true });
    expect(typeof firestoreMock.lastWriteData("orders/order-1")?.journalEntryId).toBe("string");
  });

  it("reverses that revenue when the order is put back to unpaid", async () => {
    seedUnpaidOrder();
    await updateOrderByAdmin("order-1", { status: "paid", source: "messenger", customer, address, payment: cashPayment("pending") });

    await updateOrderByAdmin("order-1", { status: "new", source: "messenger", customer, address, payment: cashPayment("paid") });

    const entries = writtenJournalEntries() as Array<WrittenJournalEntry & { reversalOf?: string | null }>;
    expect(entries).toHaveLength(2);
    expect(entries[1].reversalOf).toBeTruthy();
    expect(entries[1].lines?.[0]).toMatchObject({ accountCode: "1010", credit: 26000 });
    expect(firestoreMock.lastWriteData("orders/order-1")).toMatchObject({ journalEntryId: null, stockApplied: false });
    expect(firestoreMock.lastWriteData("products/10")).toMatchObject({ soldCount: 0 });
  });

  it("refuses to un-pay an order Bonum collected money for", async () => {
    seedUnpaidOrder({
      source: "web",
      payment: { ...cashPayment("paid"), method: "bonum", provider: "bonum", invoiceId: "inv-1" },
      stockApplied: true,
    });

    await expect(
      updateOrderByAdmin("order-1", { status: "new", source: "web", customer, address, payment: cashPayment("pending") }),
    ).rejects.toThrow("Bonum");
  });

  it("keeps the payment record Bonum wrote, whatever the form sends", async () => {
    const bonumPayment = { ...cashPayment("paid"), method: "bonum" as const, provider: "bonum" as const, invoiceId: "inv-1" };
    seedUnpaidOrder({ source: "web", payment: bonumPayment, stockApplied: true, status: "paid" });

    await updateOrderByAdmin("order-1", {
      status: "delivered",
      source: "web",
      customer,
      address,
      // The form switched the method to cash and cleared the invoice.
      payment: { ...cashPayment("paid"), bonumAmount: undefined },
    });

    expect(firestoreMock.lastWriteData("orders/order-1")).toMatchObject({
      status: "delivered",
      payment: expect.objectContaining({ method: "bonum", invoiceId: "inv-1" }),
    });
  });

  it("never writes undefined into the payment, which Firestore rejects outright", async () => {
    seedUnpaidOrder();

    await updateOrderByAdmin("order-1", {
      status: "new",
      source: "messenger",
      customer,
      address,
      payment: { ...cashPayment("pending"), bonumPaymentVendor: undefined, bonumAmount: undefined },
    });

    const payment = firestoreMock.lastWriteData("orders/order-1")?.payment as Record<string, unknown>;
    expect(Object.values(payment).includes(undefined)).toBe(false);
  });

  it("refuses to un-pay an order that has returns", async () => {
    seedUnpaidOrder({
      payment: cashPayment("paid"),
      stockApplied: true,
      returns: [{ id: "r1", items: [{ productId: 10, variant: null, name: "Soap", quantity: 1, unitPrice: 9000 }] }],
    });

    await expect(
      updateOrderByAdmin("order-1", { status: "new", source: "messenger", customer, address, payment: cashPayment("paid") }),
    ).rejects.toThrow("Буцаалт");
  });
});

describe("deleteOrder", () => {
  it("refuses a web order, a Bonum-paid order and an order with returns", async () => {
    firestoreMock.seed("orders/web", { source: "web", payment: { status: "pending" } });
    firestoreMock.seed("orders/bonum", { source: "messenger", payment: { status: "paid", invoiceId: "inv-1" } });
    firestoreMock.seed("orders/returned", {
      source: "messenger",
      payment: { status: "paid", invoiceId: null },
      returns: [{ id: "r1", items: [] }],
    });

    await expect(deleteOrder("web")).rejects.toThrow();
    await expect(deleteOrder("bonum")).rejects.toThrow("Bonum");
    await expect(deleteOrder("returned")).rejects.toThrow("Буцаалт");
  });

  it("reverses the revenue and returns the stock of a paid manual order", async () => {
    firestoreMock.seed("products/10", { totalStock: 100, soldCount: 2 });
    firestoreMock.seed("journalEntries/je-1", {
      lines: [
        { accountCode: "1010", accountName: "Cash", debit: 18000, credit: 0 },
        { accountCode: "4100", accountName: "Online", debit: 0, credit: 18000 },
      ],
    });
    firestoreMock.seed("orders/manual", {
      orderNumber: "ORD-9",
      source: "phone",
      stockApplied: true,
      journalEntryId: "je-1",
      items: [{ productId: 10, quantity: 2, variant: null }],
      payment: { status: "paid", invoiceId: null },
    });

    await deleteOrder("manual");

    const [reversal] = writtenJournalEntries() as Array<WrittenJournalEntry & { reversalOf?: string | null }>;
    expect(reversal.reversalOf).toBe("je-1");
    expect(firestoreMock.lastWriteData("products/10")).toMatchObject({ soldCount: 0 });
    expect(firestoreMock.writesFor("orders/manual").some((write) => write.op === "delete")).toBe(true);
  });
});

describe("createOrder", () => {
  it("saves the order with no invoice and reports it when the invoice cannot be raised", async () => {
    // No signed-in user in the test, so the invoice request cannot even be made.
    await expect(
      createOrder({
        auth: { uid: "u1", isAnonymous: true, method: "anonymous" },
        customer: { fullName: "A", phoneNumber: "99001234", email: null, note: "" },
        address: { region: "УБ", districtOrSoum: "Б", khorooOrBag: "1", streetAddress: "x", additionalAddress: "" },
        items: [{ productId: 10, name: "Soap", category: "", image: null, variant: null, quantity: 1, unitPrice: 1, lineTotal: 1 }],
        totals: { subtotal: 1, shippingFee: 8000, grandTotal: 8001 },
      }),
    ).rejects.toBeInstanceOf(OrderInvoiceError);

    const saved = firestoreMock.writes.find((write) => write.path.startsWith("orders/"));
    expect(saved?.data).toMatchObject({
      status: "new",
      payment: expect.objectContaining({ status: "pending", invoiceId: null, qrPayload: "awaiting-invoice" }),
    });
  });
});
