import { describe, it, expect, vi, beforeEach } from "vitest";
import { firestoreMock } from "../helpers/firestoreMock";

// ─── Mock firebase/firestore ──────────────────────────────────────────────────
//
// Stock, the customer's running totals, the transaction document and the journal entry are
// written in one Firestore transaction, and all of them are read inside it. The mock models
// a small in-memory Firestore so those reads and writes can be asserted directly.
// See src/__tests__/helpers/firestoreMock.ts.

vi.mock("../../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);

import {
  createEmptyTransactionDraft,
  createCustomerTransaction,
  deleteCustomerTransaction,
  deleteCustomerTransactionPaymentEntry,
  recordCustomerTransactionPayment,
  updateCustomerTransaction,
  updateCustomerTransactionPaymentEntry,
  type CustomerTransactionRecord,
  type CreateCustomerTransactionInput,
} from "../../lib/customerTransactions";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ITEM = {
  productId: 10,
  productName: "Soap",
  category: "soap",
  image: null,
  variant: null,
  quantity: 5,
  soldQuantity: 0,
  unitPrice: 2000,
  lineTotal: 10000,
};

function makeTxInput(overrides: Partial<CreateCustomerTransactionInput> = {}): CreateCustomerTransactionInput {
  return {
    type: "delivery",
    customerId: "cust-1",
    customerSnapshot: { code: "CUS-0001", name: "Alice", phoneNumber: "99001234" },
    items: [{ ...ITEM }],
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
    items: [{ ...ITEM }],
    totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
    payment: { status: "paid", paidAmount: 10000, method: "cash", paidAt: null },
    relatedTransactionId: null,
    transactionDate: "2024-01-15",
    note: "",
    createdByUid: "uid-admin",
    createdAt: null,
    updatedAt: null,
    journalEntryId: null,
    ...overrides,
  };
}

// ─── Seeding helpers ──────────────────────────────────────────────────────────

function seedProduct(productId: number, { totalStock = 100, soldCount = 0, costPrice = 0 } = {}) {
  firestoreMock.seed(`products/${productId}`, { totalStock, soldCount, costPrice, variants: null });
}

function seedCustomer(
  customerId = "cust-1",
  { totalSales = 0, totalPaid = 0, outstandingBalance = 0 } = {},
) {
  firestoreMock.seed(`customers/${customerId}`, { totalSales, totalPaid, outstandingBalance });
}

function seedTxCounter(lastNumber: number) {
  firestoreMock.seed("counters/customerTransactions", {
    lastNumber,
    year: new Date().getFullYear(),
    prefix: "TX",
  });
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/** Stock fields last written for a product, or undefined if it was never touched. */
function stockFor(productId: number) {
  return firestoreMock.lastWriteData(`products/${productId}`) as { soldCount?: number } | undefined;
}

/** Aggregate fields last written for a customer. */
function customerFor(customerId = "cust-1") {
  return firestoreMock.lastWriteData(`customers/${customerId}`) as
    | { totalSales?: number; totalPaid?: number; outstandingBalance?: number }
    | undefined;
}

/** The transaction document, whether it was created (set) or edited (update). */
function transactionDoc() {
  const writes = firestoreMock.writes.filter(
    (w) => w.data !== undefined && (w.data as { type?: string }).type !== undefined,
  );
  return writes[writes.length - 1]?.data as Record<string, unknown> | undefined;
}

/** Every journal entry written, in order. */
function journalEntries() {
  return firestoreMock.writes
    .filter((w) => w.op === "set" && (w.data as { lines?: unknown[] })?.lines !== undefined)
    .map(
      (w) =>
        w.data as {
          lines: Array<{ accountCode: string; debit: number; credit: number }>;
          description?: string;
          reversalOf?: string | null;
        },
    );
}

function anyWriteMatching(predicate: (data: Record<string, unknown>) => boolean) {
  return firestoreMock.writes.some((w) => w.data !== undefined && predicate(w.data));
}

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.reset();
  seedProduct(10);
  seedCustomer("cust-1");
});

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
    expect(draft.transactionDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it("returns a fresh object on each call (not a shared reference)", () => {
    const a = createEmptyTransactionDraft();
    const b = createEmptyTransactionDraft();
    a.items.push({ ...ITEM, productId: 99 });
    expect(b.items).toHaveLength(0);
  });
});

// ─── createCustomerTransaction ────────────────────────────────────────────────

describe("createCustomerTransaction", () => {
  it("continues the TX series from the shared counter", async () => {
    seedTxCounter(5);

    await createCustomerTransaction(makeTxInput());

    expect(transactionDoc()).toMatchObject({ txNumber: "TX-000006" });
  });

  it("starts numbering at TX-000001 when the counter has never been used", async () => {
    await createCustomerTransaction(makeTxInput());

    expect(transactionDoc()).toMatchObject({ txNumber: "TX-000001" });
  });

  it("hands out consecutive numbers, so two admins saving at once cannot collide", async () => {
    await createCustomerTransaction(makeTxInput());
    await createCustomerTransaction(makeTxInput());

    const numbers = firestoreMock.writes
      .map((w) => (w.data as { txNumber?: string })?.txNumber)
      .filter(Boolean);
    expect(numbers).toEqual(["TX-000001", "TX-000002"]);
  });

  it("sends goods out of stock on a delivery", async () => {
    seedProduct(10, { soldCount: 3 });

    await createCustomerTransaction(makeTxInput({ type: "delivery" }));

    expect(stockFor(10)).toMatchObject({ soldCount: 8 });
  });

  it("brings goods back into stock on a return", async () => {
    seedProduct(10, { soldCount: 8 });

    await createCustomerTransaction(makeTxInput({ type: "return" }));

    expect(stockFor(10)).toMatchObject({ soldCount: 3 });
  });

  it("lets soldCount go negative rather than clamping, so the movement stays reversible", async () => {
    // Returning 5 when only 2 were ever sold. Clamping at zero here used to lose 3 units:
    // the transaction could no longer be undone to the figure it started from.
    seedProduct(10, { soldCount: 2 });

    await createCustomerTransaction(makeTxInput({ type: "return" }));

    expect(stockFor(10)).toMatchObject({ soldCount: -3 });
  });

  it("refuses to send out more than is in stock", async () => {
    seedProduct(10, { totalStock: 4, soldCount: 0 });

    await expect(createCustomerTransaction(makeTxInput({ type: "delivery" }))).rejects.toThrow(
      /INSUFFICIENT_STOCK/,
    );
  });

  it("updates customer aggregates for a PAID delivery", async () => {
    seedCustomer("cust-1", { totalSales: 5000, totalPaid: 3000, outstandingBalance: 2000 });

    await createCustomerTransaction(makeTxInput());

    expect(customerFor()).toMatchObject({
      totalSales: 15000, // 5000 + 10000
      totalPaid: 13000, // 3000 + 10000
      outstandingBalance: 2000, // unchanged: nothing new is owed
    });
  });

  it("updates customer aggregates for an UNPAID delivery", async () => {
    seedCustomer("cust-1", { totalSales: 5000, totalPaid: 3000, outstandingBalance: 2000 });

    await createCustomerTransaction(
      makeTxInput({ payment: { status: "unpaid", paidAmount: 0, method: null, paidAt: null } }),
    );

    expect(customerFor()).toMatchObject({
      totalSales: 15000,
      totalPaid: 3000,
      outstandingBalance: 12000, // 2000 + the whole 10000 now owed
    });
  });

  it("updates customer aggregates for a RETURN", async () => {
    seedProduct(10, { soldCount: 10 });
    seedCustomer("cust-1", { totalSales: 20000, totalPaid: 20000, outstandingBalance: 0 });

    await createCustomerTransaction(makeTxInput({ type: "return" }));

    expect(customerFor()).toMatchObject({
      totalSales: 10000, // 20000 − 10000
      totalPaid: 10000,
      outstandingBalance: 0,
    });
  });

  it("posts wholesale revenue for a sale and a sales return for a return", async () => {
    await createCustomerTransaction(makeTxInput());
    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "1010", debit: 10000 }),
      expect.objectContaining({ accountCode: "4200", credit: 10000 }),
    ]);

    firestoreMock.reset();
    seedProduct(10, { soldCount: 10 });
    seedCustomer("cust-1");
    await createCustomerTransaction(makeTxInput({ type: "return" }));
    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "4910", debit: 10000 }),
      expect.objectContaining({ accountCode: "1110", credit: 10000 }),
    ]);
  });

  it("splits НӨАТ off the revenue line when the transaction carries it", async () => {
    await createCustomerTransaction(
      makeTxInput({
        totals: { subtotal: 10000, discount: 0, grandTotal: 11000, vatMode: "added" },
        payment: { status: "paid", paidAmount: 11000, method: "cash", paidAt: null },
      }),
    );

    // 11000 gross → 1000 tax to 2410, 10000 net revenue to 4200.
    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "1010", debit: 11000 }),
      expect.objectContaining({ accountCode: "2410", credit: 1000 }),
      expect.objectContaining({ accountCode: "4200", credit: 10000 }),
    ]);
  });

  it("adds COGS lines from the product cost price", async () => {
    seedProduct(10, { costPrice: 800 });

    await createCustomerTransaction(makeTxInput());

    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "1010", debit: 10000 }),
      expect.objectContaining({ accountCode: "4200", credit: 10000 }),
      expect.objectContaining({ accountCode: "5000", debit: 4000 }),
      expect.objectContaining({ accountCode: "1210", credit: 4000 }),
    ]);
  });

  it("throws when the customer is not found", async () => {
    firestoreMock.documents.delete("customers/cust-1");

    await expect(createCustomerTransaction(makeTxInput())).rejects.toThrow("Customer not found");
  });
});

// ─── deleteCustomerTransaction ────────────────────────────────────────────────

describe("deleteCustomerTransaction", () => {
  it("deletes the transaction document", async () => {
    seedProduct(10, { soldCount: 5 });
    seedCustomer("cust-1", { totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 });

    await deleteCustomerTransaction(makeTxRecord());

    expect(firestoreMock.writes.some((w) => w.op === "delete")).toBe(true);
  });

  it("returns a delivery's stock to the shelf", async () => {
    seedProduct(10, { soldCount: 8 });
    seedCustomer("cust-1", { totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 });

    await deleteCustomerTransaction(makeTxRecord({ type: "delivery" }));

    expect(stockFor(10)).toMatchObject({ soldCount: 3 });
  });

  it("reverses the customer aggregates", async () => {
    seedProduct(10, { soldCount: 8 });
    seedCustomer("cust-1", { totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 });

    await deleteCustomerTransaction(makeTxRecord());

    expect(customerFor()).toMatchObject({ totalSales: 0, totalPaid: 0, outstandingBalance: 0 });
  });

  it("reverses the posted journal entry from its stored lines", async () => {
    seedProduct(10, { soldCount: 5 });
    firestoreMock.seed("journalEntries/entry-1", {
      lines: [
        { accountCode: "1010", accountName: "Cash", debit: 10000, credit: 0 },
        { accountCode: "4200", accountName: "Wholesale", debit: 0, credit: 10000 },
      ],
    });

    await deleteCustomerTransaction(makeTxRecord({ journalEntryId: "entry-1" }));

    const [reversal] = journalEntries();
    expect(reversal.reversalOf).toBe("entry-1");
    expect(reversal.lines).toEqual([
      expect.objectContaining({ accountCode: "1010", credit: 10000 }),
      expect.objectContaining({ accountCode: "4200", debit: 10000 }),
    ]);
  });

  it("still deletes when the customer is already gone", async () => {
    seedProduct(10, { soldCount: 5 });
    firestoreMock.documents.delete("customers/cust-1");

    await expect(deleteCustomerTransaction(makeTxRecord())).resolves.toBeUndefined();
    expect(firestoreMock.writes.some((w) => w.op === "delete")).toBe(true);
  });
});

// ─── updateCustomerTransaction ────────────────────────────────────────────────

describe("updateCustomerTransaction", () => {
  beforeEach(() => {
    seedProduct(10, { soldCount: 8 });
    seedCustomer("cust-1", { totalSales: 10000, totalPaid: 10000, outstandingBalance: 0 });
  });

  it("writes the edited transaction document", async () => {
    const next = makeTxInput();
    await updateCustomerTransaction("tx-1", makeTxRecord(), next);

    expect(transactionDoc()).toMatchObject({ type: next.type });
  });

  it("passes a custom journal description through options", async () => {
    await updateCustomerTransaction("tx-1", makeTxRecord(), makeTxInput(), {
      journalDescription: "Custom description",
    });

    expect(anyWriteMatching((data) => data.description === "Custom description")).toBe(true);
  });

  it("adjusts customer aggregates when the customer stays the same", async () => {
    await updateCustomerTransaction(
      "tx-1",
      makeTxRecord(),
      makeTxInput({
        totals: { subtotal: 12000, discount: 0, grandTotal: 12000 },
        payment: { status: "paid", paidAmount: 12000, method: "cash", paidAt: null },
      }),
    );

    // reverse(old 10000) then apply(new 12000).
    expect(customerFor()).toMatchObject({ totalSales: 12000, totalPaid: 12000, outstandingBalance: 0 });
  });

  it("moves the figures across when the transaction is reassigned to another customer", async () => {
    seedCustomer("cust-2", { totalSales: 0, totalPaid: 0, outstandingBalance: 0 });

    await updateCustomerTransaction("tx-1", makeTxRecord(), makeTxInput({ customerId: "cust-2" }));

    expect(customerFor("cust-1")).toMatchObject({ totalSales: 0, totalPaid: 0 });
    expect(customerFor("cust-2")).toMatchObject({ totalSales: 10000, totalPaid: 10000 });
  });

  it("releases the old items before reserving the new ones", async () => {
    // Only 5 units exist and the transaction is already holding all 5. Re-saving the same
    // items must not trip the stock check on quantity it already owns.
    seedProduct(10, { totalStock: 5, soldCount: 5 });

    await updateCustomerTransaction("tx-1", makeTxRecord(), makeTxInput());

    expect(stockFor(10)).toMatchObject({ soldCount: 5 });
  });
});

// ─── recordCustomerTransactionPayment ─────────────────────────────────────────

describe("recordCustomerTransactionPayment", () => {
  function makePartiallyPaidRecord() {
    return makeTxRecord({
      totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
      payment: { status: "partial", paidAmount: 3000, method: "bank", paidAt: null },
    });
  }

  beforeEach(() => {
    seedProduct(10, { soldCount: 8 });
    seedCustomer("cust-1", { totalSales: 10000, totalPaid: 3000, outstandingBalance: 7000 });
  });

  it("adds the amount to paidAmount and appends a payment entry", async () => {
    await recordCustomerTransactionPayment(makePartiallyPaidRecord(), {
      date: "2024-02-01",
      amount: 4000,
      note: "Хэсэгчилсэн төлбөр",
      createdByUid: "uid-admin",
    });

    expect(transactionDoc()).toMatchObject({
      payment: expect.objectContaining({
        status: "partial",
        paidAmount: 7000,
        entries: [
          expect.objectContaining({ date: "2024-02-01", amount: 4000, note: "Хэсэгчилсэн төлбөр" }),
        ],
      }),
    });
  });

  it("marks the transaction paid when the full remaining balance is paid", async () => {
    await recordCustomerTransactionPayment(makePartiallyPaidRecord(), {
      date: "2024-02-01",
      amount: 7000,
      note: "",
      createdByUid: "uid-admin",
    });

    expect(transactionDoc()).toMatchObject({
      payment: expect.objectContaining({ status: "paid", paidAmount: 10000 }),
    });
  });

  it("deducts the payment from the customer's outstanding balance", async () => {
    await recordCustomerTransactionPayment(makePartiallyPaidRecord(), {
      date: "2024-02-01",
      amount: 4000,
      note: "",
      createdByUid: "uid-admin",
    });

    expect(customerFor()).toMatchObject({ totalSales: 10000, totalPaid: 7000, outstandingBalance: 3000 });
  });

  it("throws when the amount is zero or negative", async () => {
    await expect(
      recordCustomerTransactionPayment(makePartiallyPaidRecord(), {
        date: "2024-02-01",
        amount: 0,
        note: "",
        createdByUid: "uid-admin",
      }),
    ).rejects.toThrow();
    expect(firestoreMock.writes).toHaveLength(0);
  });

  it("throws when the amount exceeds the remaining balance", async () => {
    await expect(
      recordCustomerTransactionPayment(makePartiallyPaidRecord(), {
        date: "2024-02-01",
        amount: 8000,
        note: "",
        createdByUid: "uid-admin",
      }),
    ).rejects.toThrow();
    expect(firestoreMock.writes).toHaveLength(0);
  });

  it("throws for return-type transactions", async () => {
    await expect(
      recordCustomerTransactionPayment(makeTxRecord({ type: "return" }), {
        date: "2024-02-01",
        amount: 1000,
        note: "",
        createdByUid: "uid-admin",
      }),
    ).rejects.toThrow();
    expect(firestoreMock.writes).toHaveLength(0);
  });
});

// ─── update/delete payment entries ────────────────────────────────────────────

describe("updateCustomerTransactionPaymentEntry / deleteCustomerTransactionPaymentEntry", () => {
  // grandTotal 10000, initial payment 3000 + one recorded entry of 4000 = paid 7000
  function makeRecordWithEntry() {
    return makeTxRecord({
      totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
      payment: {
        status: "partial",
        paidAmount: 7000,
        method: "bank",
        paidAt: "2024-02-01T00:00:00.000Z",
        entries: [
          { date: "2024-02-01", amount: 4000, note: "эхний төлбөр", createdAt: null, createdByUid: "uid-admin" },
        ],
      },
    });
  }

  beforeEach(() => {
    seedProduct(10, { soldCount: 8 });
    seedCustomer("cust-1", { totalSales: 10000, totalPaid: 7000, outstandingBalance: 3000 });
  });

  it("edit replaces the entry amount and recomputes paidAmount", async () => {
    await updateCustomerTransactionPaymentEntry(makeRecordWithEntry(), 0, {
      date: "2024-02-05",
      amount: 5000,
      note: "зассан",
      createdByUid: "uid-admin",
    });

    // paidAmount: 7000 − 4000 + 5000 = 8000, still partial
    expect(transactionDoc()).toMatchObject({
      payment: expect.objectContaining({
        status: "partial",
        paidAmount: 8000,
        entries: [expect.objectContaining({ date: "2024-02-05", amount: 5000, note: "зассан" })],
      }),
    });
    expect(customerFor()).toMatchObject({ totalPaid: 8000, outstandingBalance: 2000 });
  });

  it("edit allows raising the amount up to remaining + own amount", async () => {
    // available = remaining(3000) + own(4000) = 7000 → full payoff
    await updateCustomerTransactionPaymentEntry(makeRecordWithEntry(), 0, {
      date: "2024-02-05",
      amount: 7000,
      note: "",
      createdByUid: "uid-admin",
    });

    expect(transactionDoc()).toMatchObject({
      payment: expect.objectContaining({ status: "paid", paidAmount: 10000 }),
    });
  });

  it("edit throws when the new amount exceeds the available balance", async () => {
    await expect(
      updateCustomerTransactionPaymentEntry(makeRecordWithEntry(), 0, {
        date: "2024-02-05",
        amount: 8000,
        note: "",
        createdByUid: "uid-admin",
      }),
    ).rejects.toThrow();
    expect(firestoreMock.writes).toHaveLength(0);
  });

  it("edit throws when the entry index does not exist", async () => {
    await expect(
      updateCustomerTransactionPaymentEntry(makeRecordWithEntry(), 5, {
        date: "2024-02-05",
        amount: 1000,
        note: "",
        createdByUid: "uid-admin",
      }),
    ).rejects.toThrow();
    expect(firestoreMock.writes).toHaveLength(0);
  });

  it("delete removes the entry and adds the amount back to the outstanding balance", async () => {
    await deleteCustomerTransactionPaymentEntry(makeRecordWithEntry(), 0, "uid-admin");

    expect(transactionDoc()).toMatchObject({
      payment: expect.objectContaining({ status: "partial", paidAmount: 3000, entries: [] }),
    });
    expect(customerFor()).toMatchObject({ totalPaid: 3000, outstandingBalance: 7000 });
  });

  it("delete of the only payment resets status to unpaid and clears paidAt", async () => {
    seedCustomer("cust-1", { totalSales: 10000, totalPaid: 4000, outstandingBalance: 6000 });

    await deleteCustomerTransactionPaymentEntry(
      makeTxRecord({
        totals: { subtotal: 10000, discount: 0, grandTotal: 10000 },
        payment: {
          status: "partial",
          paidAmount: 4000,
          method: "bank",
          paidAt: "2024-02-01T00:00:00.000Z",
          entries: [
            { date: "2024-02-01", amount: 4000, note: "", createdAt: null, createdByUid: "uid-admin" },
          ],
        },
      }),
      0,
      "uid-admin",
    );

    expect(transactionDoc()).toMatchObject({
      payment: expect.objectContaining({ status: "unpaid", paidAmount: 0, paidAt: null }),
    });
  });

  it("delete throws when the entry index does not exist", async () => {
    await expect(
      deleteCustomerTransactionPaymentEntry(makeRecordWithEntry(), 3, "uid-admin"),
    ).rejects.toThrow();
    expect(firestoreMock.writes).toHaveLength(0);
  });
});
