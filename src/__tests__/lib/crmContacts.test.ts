import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Mock firebase ────────────────────────────────────────────────────────────

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ id: "crmContacts" })),
  doc: vi.fn((_db: unknown, _col?: string, id?: string) => ({
    id: id ?? "new-contact-id",
    path: `crmContacts/${id ?? "new-contact-id"}`,
  })),
  getDocs: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _ts: true })),
}));

import { getDocs, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  createCrmContact,
  createEmptyCrmContactDraft,
  deleteCrmContact,
  getCrmContactDisplayName,
  getNextCrmContactCode,
  matchesCrmContactSearch,
  normalizeContactPhone,
  searchCrmContacts,
  updateCrmContact,
  type CrmContactDraftInput,
  type CrmContactRecord,
} from "../../lib/crmContacts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDraftInput(overrides: Partial<CrmContactDraftInput> = {}): CrmContactDraftInput {
  return {
    code: "HAR-0001",
    type: "individual",
    fullName: "Bat",
    phoneNumber: "99001234",
    ...overrides,
  };
}

function makeContact(overrides: Partial<CrmContactRecord> = {}): CrmContactRecord {
  return { ...createEmptyCrmContactDraft(), id: "c1", code: "HAR-0001", fullName: "Bat", ...overrides };
}

function mockGetDocsWithCodes(codes: string[]) {
  (getDocs as Mock).mockResolvedValue({
    docs: codes.map((code) => ({ data: () => ({ code }) })),
  });
}

// ─── createEmptyCrmContactDraft ───────────────────────────────────────────────

describe("createEmptyCrmContactDraft", () => {
  it("returns a blank individual contact", () => {
    const draft = createEmptyCrmContactDraft();
    expect(draft.id).toBe("");
    expect(draft.code).toBe("");
    expect(draft.type).toBe("individual");
    expect(draft.fullName).toBe("");
    expect(draft.organizationName).toBe("");
    expect(draft.phoneNumber).toBe("");
    expect(draft.email).toBeNull();
    expect(draft.address).toBeNull();
    expect(draft.status).toBe("active");
  });

  it("returns independent objects on each call", () => {
    const a = createEmptyCrmContactDraft();
    const b = createEmptyCrmContactDraft();
    a.fullName = "Changed";
    expect(b.fullName).toBe("");
  });
});

// ─── getCrmContactDisplayName ─────────────────────────────────────────────────

describe("getCrmContactDisplayName", () => {
  it("uses the person's name for an individual", () => {
    expect(getCrmContactDisplayName(makeContact({ fullName: "Bat" }))).toBe("Bat");
  });

  it("uses the organization name for an organization", () => {
    expect(
      getCrmContactDisplayName(
        makeContact({ type: "organization", organizationName: "Savana LLC", fullName: "Bat" }),
      ),
    ).toBe("Savana LLC");
  });

  it("falls back to the contact person when an organization has no name yet", () => {
    expect(
      getCrmContactDisplayName(makeContact({ type: "organization", organizationName: "  ", fullName: "Bat" })),
    ).toBe("Bat");
  });
});

// ─── normalizeContactPhone ────────────────────────────────────────────────────

describe("normalizeContactPhone", () => {
  it("reduces a phone to its digits so formatting never splits one person in two", () => {
    expect(normalizeContactPhone("9900-1234")).toBe("99001234");
    expect(normalizeContactPhone("+976 99 00 12 34")).toBe("97699001234");
    expect(normalizeContactPhone("(99) 001234")).toBe("99001234");
  });

  it("returns an empty string when there is nothing to match on", () => {
    expect(normalizeContactPhone("")).toBe("");
    expect(normalizeContactPhone("—")).toBe("");
  });
});

// ─── matchesCrmContactSearch ──────────────────────────────────────────────────

describe("matchesCrmContactSearch", () => {
  const contact = makeContact({
    fullName: "Bat Erdene",
    organizationName: "Savana LLC",
    phoneNumber: "99001234",
    registrationNumber: "6123456",
    email: "bat@example.mn",
  });

  it("matches everything on a blank term", () => {
    expect(matchesCrmContactSearch(contact, "")).toBe(true);
    expect(matchesCrmContactSearch(contact, "   ")).toBe(true);
  });

  it("matches on name, organization, phone, code, register number and email", () => {
    expect(matchesCrmContactSearch(contact, "erdene")).toBe(true);
    expect(matchesCrmContactSearch(contact, "savana")).toBe(true);
    expect(matchesCrmContactSearch(contact, "9900")).toBe(true);
    expect(matchesCrmContactSearch(contact, "har-0001")).toBe(true);
    expect(matchesCrmContactSearch(contact, "6123456")).toBe(true);
    expect(matchesCrmContactSearch(contact, "bat@example")).toBe(true);
  });

  it("is case insensitive and ignores surrounding whitespace", () => {
    expect(matchesCrmContactSearch(contact, "  BAT  ")).toBe(true);
  });

  it("rejects a term that appears nowhere", () => {
    expect(matchesCrmContactSearch(contact, "zzz")).toBe(false);
  });
});

describe("searchCrmContacts", () => {
  it("keeps only the matching contacts", () => {
    const contacts = [
      makeContact({ id: "a", fullName: "Bat" }),
      makeContact({ id: "b", fullName: "Dulmaa" }),
    ];
    expect(searchCrmContacts(contacts, "dul").map((contact) => contact.id)).toEqual(["b"]);
  });
});

// ─── getNextCrmContactCode ────────────────────────────────────────────────────

describe("getNextCrmContactCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts at HAR-0001 when the directory is empty", async () => {
    mockGetDocsWithCodes([]);
    expect(await getNextCrmContactCode()).toBe("HAR-0001");
  });

  it("increments from the highest existing code", async () => {
    mockGetDocsWithCodes(["HAR-0001", "HAR-0005", "HAR-0003"]);
    expect(await getNextCrmContactCode()).toBe("HAR-0006");
  });

  it("ignores codes belonging to other registries", async () => {
    mockGetDocsWithCodes(["CUS-0100", "", "HAR-0002"]);
    expect(await getNextCrmContactCode()).toBe("HAR-0003");
  });

  it("pads to 4 digits and grows past them", async () => {
    mockGetDocsWithCodes(["HAR-0009"]);
    expect(await getNextCrmContactCode()).toBe("HAR-0010");
    mockGetDocsWithCodes(["HAR-9999"]);
    expect(await getNextCrmContactCode()).toBe("HAR-10000");
  });
});

// ─── createCrmContact ─────────────────────────────────────────────────────────

describe("createCrmContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the contact and returns its id", async () => {
    const id = await createCrmContact(makeDraftInput());
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(id).toBe("new-contact-id");
  });

  it("trims the typed-in fields", async () => {
    await createCrmContact(makeDraftInput({ fullName: "  Bat  ", phoneNumber: " 99001234 " }));

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.fullName).toBe("Bat");
    expect(payload.phoneNumber).toBe("99001234");
  });

  it("stores the phone's digits as the lookup key for the storefront sync", async () => {
    await createCrmContact(makeDraftInput({ phoneNumber: "9900-1234" }));

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.phoneNumber).toBe("9900-1234");
    expect(payload.phoneDigits).toBe("99001234");
  });

  it("keeps organization fields for an organization", async () => {
    await createCrmContact(
      makeDraftInput({ type: "organization", organizationName: "Savana LLC", registrationNumber: "6123456" }),
    );

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.organizationName).toBe("Savana LLC");
    expect(payload.registrationNumber).toBe("6123456");
  });

  it("drops organization fields for an individual", async () => {
    await createCrmContact(
      makeDraftInput({ type: "individual", organizationName: "Savana LLC", registrationNumber: "6123456" }),
    );

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.organizationName).toBe("");
    expect(payload.registrationNumber).toBe("");
  });

  it("stores a blank email as null", async () => {
    await createCrmContact(makeDraftInput({ email: "   " }));

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.email).toBeNull();
  });

  it("defaults the optional fields", async () => {
    await createCrmContact(makeDraftInput());

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.secondaryPhone).toBe("");
    expect(payload.address).toBeNull();
    expect(payload.note).toBe("");
    expect(payload.status).toBe("active");
  });

  it("serializes an address when one is given", async () => {
    await createCrmContact(
      makeDraftInput({
        address: {
          region: "Улаанбаатар",
          districtOrSoum: "Баянгол",
          khorooOrBag: "5-р хороо",
          streetAddress: "12-р байр",
        },
      }),
    );

    const [, payload] = (setDoc as Mock).mock.calls[0];
    expect(payload.address).toMatchObject({ region: "Улаанбаатар", districtOrSoum: "Баянгол" });
  });
});

// ─── updateCrmContact ─────────────────────────────────────────────────────────

describe("updateCrmContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the addressed document and stamps updatedAt", async () => {
    await updateCrmContact("contact-42", makeDraftInput({ fullName: "Renamed" }));

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = (updateDoc as Mock).mock.calls[0];
    expect(ref.path).toContain("contact-42");
    expect(payload.fullName).toBe("Renamed");
    expect(payload.updatedAt).toBeDefined();
  });
});

// ─── deleteCrmContact ─────────────────────────────────────────────────────────

describe("deleteCrmContact", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the addressed document", async () => {
    await deleteCrmContact("contact-99");

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    const [ref] = (deleteDoc as Mock).mock.calls[0];
    expect(ref.path).toContain("contact-99");
  });
});
