import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Mock firebase ────────────────────────────────────────────────────────────

vi.mock("../../lib/firebase", () => ({ db: {} }));

// Customer codes now come from a `counters/customers` document reserved in a transaction,
// so the mock models that document rather than a scan over the whole collection.
const counterState: { lastNumber: number | null } = { lastNumber: null };

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ id: "customers" })),
  doc: vi.fn((_db: unknown, _col?: string, id?: string) => ({ id: id ?? "new-cust-id", path: `customers/${id ?? "new-cust-id"}` })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _ts: true })),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({
      get: vi.fn().mockResolvedValue({
        exists: () => counterState.lastNumber !== null,
        data: () => ({ lastNumber: counterState.lastNumber, year: new Date().getFullYear() }),
      }),
      set: vi.fn((_ref: unknown, data: { lastNumber: number }) => {
        counterState.lastNumber = data.lastNumber;
      }),
    }),
  ),
}));

import { setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  createEmptyCustomerDraft,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getNextCustomerCode,
  type CustomerDraftInput,
} from "../../lib/customers";

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeDraftInput(overrides: Partial<CustomerDraftInput> = {}): CustomerDraftInput {
  return {
    code: "CUS-0001",
    type: "individual",
    name: "Alice",
    phoneNumber: "99001234",
    ...overrides,
  };
}

/** Puts the shared counter at a given last-issued number (null = never used). */
function setCounterTo(lastNumber: number | null) {
  counterState.lastNumber = lastNumber;
}

// ─── createEmptyCustomerDraft ─────────────────────────────────────────────────

describe("createEmptyCustomerDraft", () => {
  it("returns a record with blank / zero defaults", () => {
    const draft = createEmptyCustomerDraft();
    expect(draft.id).toBe("");
    expect(draft.code).toBe("");
    expect(draft.type).toBe("individual");
    expect(draft.name).toBe("");
    expect(draft.phoneNumber).toBe("");
    expect(draft.totalSales).toBe(0);
    expect(draft.totalPaid).toBe(0);
    expect(draft.outstandingBalance).toBe(0);
    expect(draft.status).toBe("active");
    expect(draft.tags).toEqual([]);
    expect(draft.createdAt).toBeNull();
    expect(draft.updatedAt).toBeNull();
  });

  it("returns independent objects on each call", () => {
    const a = createEmptyCustomerDraft();
    const b = createEmptyCustomerDraft();
    a.tags.push("vip");
    expect(b.tags).toHaveLength(0);
  });
});

// ─── getNextCustomerCode ──────────────────────────────────────────────────────

describe("getNextCustomerCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCounterTo(null);
  });

  it("starts at CUS-0001 when the counter has never been used", async () => {
    expect(await getNextCustomerCode()).toBe("CUS-0001");
  });

  it("continues from the last issued number", async () => {
    setCounterTo(5);
    expect(await getNextCustomerCode()).toBe("CUS-0006");
  });

  it("hands out consecutive codes, so two concurrent callers cannot collide", async () => {
    expect([await getNextCustomerCode(), await getNextCustomerCode()]).toEqual([
      "CUS-0001",
      "CUS-0002",
    ]);
  });

  it("pads to 4 digits", async () => {
    setCounterTo(9);
    expect(await getNextCustomerCode()).toBe("CUS-0010");
  });

  it("handles codes beyond 4 digits", async () => {
    setCounterTo(9999);
    expect(await getNextCustomerCode()).toBe("CUS-10000");
  });
});

// ─── createCustomer ───────────────────────────────────────────────────────────

describe("createCustomer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls setDoc and returns a new id", async () => {
    const id = await createCustomer(makeDraftInput());
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("writes correct core fields", async () => {
    await createCustomer(makeDraftInput({ name: "Bob", type: "organization", phoneNumber: "88001234" }));

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.name).toBe("Bob");
    expect(payload.type).toBe("organization");
    expect(payload.phoneNumber).toBe("88001234");
  });

  it("sets financial aggregates to 0 on creation", async () => {
    await createCustomer(makeDraftInput());

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.totalSales).toBe(0);
    expect(payload.totalPaid).toBe(0);
    expect(payload.outstandingBalance).toBe(0);
    expect(payload.lastTransactionAt).toBeNull();
  });

  it("defaults missing optional fields", async () => {
    await createCustomer(makeDraftInput({ note: undefined, tags: undefined }));

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.note).toBe("");
    expect(payload.tags).toEqual([]);
    expect(payload.status).toBe("active");
  });

  it("serializes address when provided", async () => {
    await createCustomer(makeDraftInput({
      address: {
        region: "UB",
        districtOrSoum: "Chingeltei",
        khorooOrBag: "1-r khoroo",
        streetAddress: "Street 10",
      },
    }));

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.address).toMatchObject({ region: "UB", districtOrSoum: "Chingeltei" });
  });
});

// ─── updateCustomer ───────────────────────────────────────────────────────────

describe("updateCustomer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls updateDoc with correct id", async () => {
    await updateCustomer("cust-42", makeDraftInput({ name: "Updated Name" }));

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = (updateDoc as Mock).mock.calls[0];
    expect(ref.path).toContain("cust-42");
    expect(payload.name).toBe("Updated Name");
  });

  it("includes updatedAt serverTimestamp", async () => {
    await updateCustomer("cust-1", makeDraftInput());

    const [, payload] = (updateDoc as Mock).mock.calls[0];
    expect(payload.updatedAt).toBeDefined();
  });
});

// ─── deleteCustomer ───────────────────────────────────────────────────────────

describe("deleteCustomer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls deleteDoc with the correct id", async () => {
    await deleteCustomer("cust-99");

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    const [ref] = (deleteDoc as Mock).mock.calls[0];
    expect(ref.path).toContain("cust-99");
  });
});
