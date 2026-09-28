import { describe, it, expect, vi, beforeEach } from "vitest";
import { firestoreMock } from "../helpers/firestoreMock";

vi.mock("../../lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);

import {
  addRawMaterialPurchase,
  addRawMaterialUsage,
  removeRawMaterialPurchase,
  removeRawMaterialUsage,
  type RawMaterialPurchaseEntry,
} from "../../lib/rawMaterials";

function journalEntries() {
  return firestoreMock.writes
    .filter((write) => write.op === "set" && write.data && "lines" in write.data)
    .map((write) => write.data as { lines: Array<{ accountCode: string; debit: number; credit: number }> });
}

const purchase = {
  quantity: 10,
  unitCost: 1000,
  supplier: "Нийлүүлэгч",
  origin: "",
  cargo: 2000,
  purchasedAt: "2026-09-01",
  notes: "",
  createdByUid: "uid-1",
  paymentMethod: "bank",
};

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.reset();
});

describe("raw material purchases", () => {
  it("books the landed cost — goods plus freight — and blends it into the unit cost", async () => {
    firestoreMock.seed("rawMaterials/10", { remaining: 0, unitCost: null, purchaseLog: [] });

    await addRawMaterialPurchase(10, purchase);

    // 10 × 1000 + 2000 freight, paid from the bank.
    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "1220", debit: 12000 }),
      expect.objectContaining({ accountCode: "1020", credit: 12000 }),
    ]);
    const material = firestoreMock.lastWriteData("rawMaterials/10") as Record<string, unknown>;
    expect(material).toMatchObject({ remaining: 10, unitCost: 1200 });
    expect((material.purchaseLog as Array<Record<string, unknown>>)[0]).toMatchObject({ ledgerAmount: 12000 });
  });

  it("reverses exactly what was booked, and only once", async () => {
    const entry: RawMaterialPurchaseEntry = {
      id: "p1",
      ...purchase,
      createdAt: "",
      ledgerAmount: 12000,
    };
    firestoreMock.seed("rawMaterials/10", { remaining: 10, purchaseLog: [entry] });

    await removeRawMaterialPurchase(10, entry);

    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "1220", credit: 12000 }),
      expect.objectContaining({ accountCode: "1020", debit: 12000 }),
    ]);
    expect(firestoreMock.lastWriteData("rawMaterials/10")).toMatchObject({ remaining: 0, purchaseLog: [] });

    // A second click finds the entry gone and changes nothing.
    await expect(removeRawMaterialPurchase(10, entry)).rejects.toThrow("устгагдсан");
    expect(journalEntries()).toHaveLength(1);
  });

  it("reverses an entry saved before freight was booked at its goods value only", async () => {
    const legacy: RawMaterialPurchaseEntry = { id: "old", ...purchase, createdAt: "" };
    firestoreMock.seed("rawMaterials/10", { remaining: 10, purchaseLog: [legacy] });

    await removeRawMaterialPurchase(10, legacy);

    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "1220", credit: 10000 }),
      expect.objectContaining({ accountCode: "1020", debit: 10000 }),
    ]);
  });
});

describe("raw material usage", () => {
  it("refuses more than is on the shelf", async () => {
    firestoreMock.seed("rawMaterials/10", { remaining: 2, unitCost: 500 });

    await expect(
      addRawMaterialUsage(10, { quantity: 3, reason: "туршилт", usedAt: "2026-09-01", notes: "", createdByUid: "u" }),
    ).rejects.toThrow("INSUFFICIENT_STOCK");
  });

  it("writes the use off at the cost it had, and undoes it only once", async () => {
    firestoreMock.seed("rawMaterials/10", { remaining: 5, unitCost: 500, usageLog: [] });

    await addRawMaterialUsage(10, { quantity: 2, reason: "туршилт", usedAt: "2026-09-01", notes: "", createdByUid: "u" });

    expect(journalEntries()[0].lines).toEqual([
      expect.objectContaining({ accountCode: "5910", debit: 1000 }),
      expect.objectContaining({ accountCode: "1220", credit: 1000 }),
    ]);
    const usage = (firestoreMock.lastWriteData("rawMaterials/10")?.usageLog as Array<Record<string, unknown>>)[0];
    expect(firestoreMock.lastWriteData("rawMaterials/10")).toMatchObject({ remaining: 3 });

    const entry = usage as unknown as Parameters<typeof removeRawMaterialUsage>[1];
    await removeRawMaterialUsage(10, entry);
    expect(firestoreMock.lastWriteData("rawMaterials/10")).toMatchObject({ remaining: 5, usageLog: [] });
    await expect(removeRawMaterialUsage(10, entry)).rejects.toThrow("устгагдсан");
  });
});
