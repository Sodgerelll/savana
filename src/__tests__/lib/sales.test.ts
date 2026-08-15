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

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ id: "sales" })),
  doc: vi.fn(() => ({ id: "new-sale-id", path: "sales/new-sale-id" })),
  getDoc: vi.fn(),
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
  writeBatch: vi.fn(() => mockBatch),
}));

import { getDoc, onSnapshot } from "firebase/firestore";
import {
  createSale,
  deleteSale,
  saleChannelRequiresAddress,
  subscribeToSales,
  updateSale,
  type SaleDraftInput,
  type SaleRecord,
} from "../../lib/sales";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSaleInput(overrides: Partial<SaleDraftInput> = {}): SaleDraftInput {
  return {
    status: "delivered",
    channel: "store",
    paymentMethod: "cash",
    customer: {
      type: "individual",
      fullName: "Alice",
      organizationName: "",
      registrationNumber: "",
      phoneNumber: "99001234",
      email: null,
      note: "",
    },
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
    totals: { subtotal: 18000, shippingFee: 0, grandTotal: 18000, discountTotal: 2000 },
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

/** The two shapes createSale writes through the batch: the sale and its journal entry. */
interface WrittenDoc {
  saleNumber?: string;
  channel?: string;
  status?: string;
  currency?: string;
  paymentMethod?: string;
  paidAt?: string | null;
  createdByUid?: string;
  journalEntryId?: string | null;
  customer?: Record<string, unknown>;
  lines?: WrittenJournalLine[];
  sourceType?: string;
  sourceId?: string;
  sourceNumber?: string;
  reversalOf?: string | null;
  totalAmount?: number;
}

function writtenDocs(): WrittenDoc[] {
  return mockBatchSet.mock.calls.map((args) => args[1] as WrittenDoc);
}

function writtenSale(): WrittenDoc {
  return writtenDocs().find((data) => data.saleNumber !== undefined) as WrittenDoc;
}

function writtenJournalEntries(): WrittenDoc[] {
  return writtenDocs().filter((data) => data.lines !== undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  (getDoc as Mock).mockResolvedValue({ exists: () => false, data: () => ({}) });
});

// ─── saleChannelRequiresAddress ───────────────────────────────────────────────

describe("saleChannelRequiresAddress", () => {
  it("does not require an address for over-the-counter channels", () => {
    expect(saleChannelRequiresAddress("store")).toBe(false);
    expect(saleChannelRequiresAddress("fair")).toBe(false);
    expect(saleChannelRequiresAddress("own_use")).toBe(false);
    expect(saleChannelRequiresAddress("gift")).toBe(false);
  });

  it("requires an address for delivered channels", () => {
    expect(saleChannelRequiresAddress("messenger")).toBe(true);
    expect(saleChannelRequiresAddress("phone")).toBe(true);
    expect(saleChannelRequiresAddress("other")).toBe(true);
  });
});

// ─── createSale ───────────────────────────────────────────────────────────────

describe("createSale", () => {
  it("stores the channel, customer type and a SL- prefixed number", async () => {
    const result = await createSale(makeSaleInput({ channel: "messenger" }));

    const sale = writtenSale();
    expect(sale.channel).toBe("messenger");
    expect(sale.customer).toMatchObject({ type: "individual", fullName: "Alice" });
    expect(sale.currency).toBe("MNT");
    expect(sale.createdByUid).toBe("uid-admin");
    expect(result.saleNumber).toMatch(/^SL-/);
    expect(mockBatchCommit).toHaveBeenCalledOnce();
  });

  it("keeps organization details on an organization sale", async () => {
    await createSale(
      makeSaleInput({
        customer: {
          type: "organization",
          fullName: "Bat",
          organizationName: "Savana LLC",
          registrationNumber: "1234567",
          phoneNumber: "99001234",
          email: null,
          note: "",
        },
      }),
    );

    expect(writtenSale().customer).toMatchObject({
      type: "organization",
      organizationName: "Savana LLC",
      registrationNumber: "1234567",
    });
  });

  it("stores a null directory link when no customer was picked", async () => {
    await createSale(makeSaleInput());

    expect(writtenSale().customer).toMatchObject({ contactId: null });
  });

  it("keeps the directory link when a registered customer was picked", async () => {
    await createSale(
      makeSaleInput({
        customer: {
          type: "individual",
          fullName: "Alice",
          organizationName: "",
          registrationNumber: "",
          phoneNumber: "99001234",
          email: null,
          note: "",
          contactId: "contact-7",
        },
      }),
    );

    expect(writtenSale().customer).toMatchObject({ contactId: "contact-7" });
  });

  it("leaves a new sale unpaid and posts no journal entry", async () => {
    await createSale(makeSaleInput({ status: "new" }));

    const sale = writtenSale();
    expect(sale.paidAt).toBeNull();
    expect(sale.journalEntryId).toBeNull();
    expect(writtenJournalEntries()).toHaveLength(0);
  });

  it("marks a settled sale paid and posts direct revenue, not online revenue", async () => {
    await createSale(makeSaleInput({ status: "delivered" }));

    const sale = writtenSale();
    expect(typeof sale.paidAt).toBe("string");
    expect(sale.journalEntryId).toBeTruthy();

    const [entry] = writtenJournalEntries();
    expect(entry.sourceType).toBe("sale");
    expect(entry.sourceNumber).toBe(sale.saleNumber);
    // cash in, direct (4300) revenue out — no COGS lines because the product has no costPrice
    expect(entry.lines).toEqual([
      { accountCode: "1010", accountName: expect.any(String), debit: 18000, credit: 0 },
      { accountCode: "4300", accountName: expect.any(String), debit: 0, credit: 18000 },
    ]);
  });

  it("settles a bank transfer into the bank account instead of cash", async () => {
    await createSale(makeSaleInput({ status: "paid", paymentMethod: "bank_transfer" }));

    expect(writtenJournalEntries()[0].lines?.[0]?.accountCode).toBe("1020");
  });

  it("adds COGS lines from the product cost price", async () => {
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ costPrice: 3000 }) });

    await createSale(makeSaleInput({ status: "paid" }));

    const [entry] = writtenJournalEntries();
    // 2 units × 3000 cost
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: "1010", debit: 18000 }),
      expect.objectContaining({ accountCode: "4300", credit: 18000 }),
      expect.objectContaining({ accountCode: "5000", debit: 6000 }),
      expect.objectContaining({ accountCode: "1210", credit: 6000 }),
    ]);
    expect(entry.totalAmount).toBe(24000);
  });
});

// ─── updateSale ───────────────────────────────────────────────────────────────

describe("updateSale", () => {
  const previous = { saleNumber: "SL-260812A01", journalEntryId: "entry-1", paidAt: "2026-08-12T00:00:00.000Z" };

  it("reverses the old entry and posts a fresh one for the new amount", async () => {
    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        lines: [
          { accountCode: "1010", accountName: "Cash", debit: 18000, credit: 0 },
          { accountCode: "4300", accountName: "Direct", debit: 0, credit: 18000 },
        ],
      }),
    });

    await updateSale(
      "sale-1",
      previous,
      makeSaleInput({ totals: { subtotal: 20000, shippingFee: 0, grandTotal: 20000, discountTotal: 0 } }),
    );

    const entries = writtenJournalEntries();
    expect(entries).toHaveLength(2);

    const [reversal, reposted] = entries;
    expect(reversal.reversalOf).toBe("entry-1");
    expect(reversal.lines).toEqual([
      { accountCode: "1010", accountName: "Cash", debit: 0, credit: 18000 },
      { accountCode: "4300", accountName: "Direct", debit: 18000, credit: 0 },
    ]);
    expect(reposted.lines).toEqual([
      expect.objectContaining({ accountCode: "1010", debit: 20000 }),
      expect.objectContaining({ accountCode: "4300", credit: 20000 }),
    ]);

    expect(mockBatchUpdate.mock.calls[0][1]).toMatchObject({
      status: "delivered",
      channel: "store",
      totals: expect.objectContaining({ grandTotal: 20000 }),
    });
  });

  it("clears the journal entry and the paid date when a sale is moved back to new", async () => {
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ lines: [] }) });

    await updateSale("sale-1", previous, makeSaleInput({ status: "new" }));

    expect(mockBatchUpdate.mock.calls[0][1]).toMatchObject({ journalEntryId: null, paidAt: null });
  });

  it("keeps the original paid date when a settled sale is edited", async () => {
    (getDoc as Mock).mockResolvedValue({ exists: () => true, data: () => ({ lines: [] }) });

    await updateSale("sale-1", previous, makeSaleInput({ status: "paid" }));

    expect(mockBatchUpdate.mock.calls[0][1]).toMatchObject({ paidAt: previous.paidAt });
  });
});

// ─── deleteSale ───────────────────────────────────────────────────────────────

describe("deleteSale", () => {
  it("reverses the posted entry and deletes the document", async () => {
    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        lines: [
          { accountCode: "1010", accountName: "Cash", debit: 18000, credit: 0 },
          { accountCode: "4300", accountName: "Direct", debit: 0, credit: 18000 },
        ],
      }),
    });

    await deleteSale("sale-1", { saleNumber: "SL-260812A01", journalEntryId: "entry-1" });

    const [reversal] = writtenJournalEntries();
    expect(reversal.reversalOf).toBe("entry-1");
    expect(reversal.lines).toEqual([
      { accountCode: "1010", accountName: "Cash", debit: 0, credit: 18000 },
      { accountCode: "4300", accountName: "Direct", debit: 18000, credit: 0 },
    ]);
    expect(mockBatchDelete).toHaveBeenCalledOnce();
  });

  it("still deletes a sale that never posted an entry", async () => {
    await deleteSale("sale-1", { saleNumber: "SL-260812A01", journalEntryId: null });

    expect(writtenJournalEntries()).toHaveLength(0);
    expect(mockBatchDelete).toHaveBeenCalledOnce();
  });
});

// ─── deserialization ──────────────────────────────────────────────────────────

describe("subscribeToSales", () => {
  function emitSale(data: Record<string, unknown>): SaleRecord {
    let received: SaleRecord[] = [];
    (onSnapshot as Mock).mockImplementation((_query: unknown, onNext: (snap: unknown) => void) => {
      onNext({ docs: [{ id: "sale-1", data: () => data }] });
      return vi.fn();
    });
    subscribeToSales({ onData: (sales) => { received = sales; } });
    return received[0];
  }

  it("maps the order module's walk_in source onto the store channel", () => {
    expect(emitSale({ saleNumber: "SL-1", channel: "walk_in" }).channel).toBe("store");
  });

  it("falls back to other for an unrecognized channel", () => {
    expect(emitSale({ saleNumber: "SL-1", channel: "carrier-pigeon" }).channel).toBe("other");
  });

  it("defaults a missing customer type to individual", () => {
    expect(emitSale({ saleNumber: "SL-1" }).customer.type).toBe("individual");
  });

  it("reads back the directory link, defaulting to null on sales without one", () => {
    expect(emitSale({ saleNumber: "SL-1" }).customer.contactId).toBeNull();
    expect(
      emitSale({ saleNumber: "SL-1", customer: { contactId: "contact-7" } }).customer.contactId,
    ).toBe("contact-7");
  });

  it("keeps a known channel, status and organization buyer", () => {
    const sale = emitSale({
      saleNumber: "SL-1",
      channel: "messenger",
      status: "delivered",
      paymentMethod: "bank_transfer",
      customer: { type: "organization", organizationName: "Savana LLC", phoneNumber: "99001234" },
    });

    expect(sale.channel).toBe("messenger");
    expect(sale.status).toBe("delivered");
    expect(sale.paymentMethod).toBe("bank_transfer");
    expect(sale.customer.organizationName).toBe("Savana LLC");
  });
});
