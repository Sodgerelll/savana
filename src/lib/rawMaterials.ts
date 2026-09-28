import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  type FirestoreError,
  onSnapshot,
  type QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildRawMaterialPurchaseEntry, buildRawMaterialWriteOffEntry } from "./accounting/entryBuilders";
import {
  blendUnitCost,
  landedAmount,
  recordMaterialPurchase,
  recordMaterialUsage,
  removeMaterialPurchase,
  removeMaterialUsage,
  type MaterialLedgerConfig,
} from "./materialLedger";

export const RAW_MATERIALS_COLLECTION = "rawMaterials";

const rawMaterialsRef = collection(db, RAW_MATERIALS_COLLECTION);

export type RawMaterialCategory =
  | "oil"
  | "lye"
  | "fragrance"
  | "colorant"
  | "additive"
  | "other";

export interface RawMaterialPurchaseEntry {
  id: string;
  quantity: number;
  unitCost: number | null;
  supplier: string;
  origin: string;
  /** Freight/shipping cost paid to land this purchase, in ₮ — separate from the material's own price. */
  cargo: number;
  purchasedAt: string;
  notes: string;
  createdByUid: string;
  createdAt: string;
  /**
   * Money account the purchase settled from. Stored on the entry itself so removing it
   * later returns the money to the account it actually came out of — without this every
   * reversal defaulted to cash, so a bank purchase deleted cash it never spent.
   */
  paymentMethod?: string | null;
  /** What the purchase posted to the ledger (goods + freight). Absent on older entries. */
  ledgerAmount?: number;
}

export interface RawMaterialUsageEntry {
  id: string;
  quantity: number;
  /** Material's unit cost at the moment of use, snapshotted so a later reversal posts the
   *  same amount even if the material's unit cost has since drifted from new purchases. */
  unitCost: number | null;
  reason: string;
  usedAt: string;
  notes: string;
  createdByUid: string;
  createdAt: string;
}

export interface RawMaterial {
  id: number;
  name: string;
  category: RawMaterialCategory;
  unit: string;
  remaining: number;
  unitCost: number | null;
  notes: string;
  sortOrder: number;
  purchaseLog: RawMaterialPurchaseEntry[];
  usageLog: RawMaterialUsageEntry[];
}

function deserializePurchaseEntry(raw: unknown): RawMaterialPurchaseEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    quantity: Number(r.quantity ?? 0),
    unitCost: r.unitCost === null || r.unitCost === undefined ? null : Number(r.unitCost),
    supplier: String(r.supplier ?? ""),
    origin: String(r.origin ?? ""),
    cargo: Number(r.cargo ?? 0),
    purchasedAt: String(r.purchasedAt ?? ""),
    notes: String(r.notes ?? ""),
    createdByUid: String(r.createdByUid ?? ""),
    createdAt: String(r.createdAt ?? ""),
    // Purchases recorded before the field existed all went to cash, which is what the
    // reversal will now use for them too — the same account their original entry hit.
    paymentMethod: typeof r.paymentMethod === "string" ? r.paymentMethod : null,
    ...(typeof r.ledgerAmount === "number" ? { ledgerAmount: r.ledgerAmount } : {}),
  };
}

function deserializeUsageEntry(raw: unknown): RawMaterialUsageEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    quantity: Number(r.quantity ?? 0),
    unitCost: r.unitCost === null || r.unitCost === undefined ? null : Number(r.unitCost),
    reason: String(r.reason ?? ""),
    usedAt: String(r.usedAt ?? ""),
    notes: String(r.notes ?? ""),
    createdByUid: String(r.createdByUid ?? ""),
    createdAt: String(r.createdAt ?? ""),
  };
}

function serializeRawMaterial(item: RawMaterial): DocumentData {
  return {
    name: item.name,
    category: item.category,
    unit: item.unit,
    remaining: item.remaining,
    unitCost: item.unitCost,
    notes: item.notes,
    sortOrder: item.sortOrder,
    _updatedAt: serverTimestamp(),
  };
}

function deserializeRawMaterial(docSnap: QueryDocumentSnapshot): RawMaterial {
  const data = docSnap.data();
  const categoryValue = String(data.category ?? "other") as RawMaterialCategory;
  const unitCostRaw = data.unitCost;
  const rawLog = Array.isArray(data.purchaseLog) ? data.purchaseLog : [];
  const rawUsageLog = Array.isArray(data.usageLog) ? data.usageLog : [];
  return {
    id: Number(docSnap.id),
    name: String(data.name ?? ""),
    category: categoryValue,
    unit: String(data.unit ?? ""),
    remaining: Number(data.remaining ?? 0),
    unitCost:
      unitCostRaw === null || unitCostRaw === undefined || unitCostRaw === ""
        ? null
        : Number(unitCostRaw),
    notes: String(data.notes ?? ""),
    sortOrder: Number(data.sortOrder ?? 0),
    purchaseLog: rawLog
      .map(deserializePurchaseEntry)
      .filter((e): e is RawMaterialPurchaseEntry => e !== null)
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
    usageLog: rawUsageLog
      .map(deserializeUsageEntry)
      .filter((e): e is RawMaterialUsageEntry => e !== null)
      .sort((a, b) => b.usedAt.localeCompare(a.usedAt)),
  };
}

export function subscribeToRawMaterials(
  onData: (items: RawMaterial[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(
    rawMaterialsRef,
    (snapshot) => {
      const items = snapshot.docs.map((d) => deserializeRawMaterial(d));
      items.sort((a, b) => a.sortOrder - b.sortOrder);
      onData(items);
    },
    onError,
  );
}

export async function saveRawMaterial(item: RawMaterial) {
  await setDoc(doc(rawMaterialsRef, String(item.id)), serializeRawMaterial(item), {
    merge: true,
  });
}

export async function deleteRawMaterial(itemId: number) {
  await deleteDoc(doc(rawMaterialsRef, String(itemId)));
}

export interface AddRawMaterialPurchaseInput {
  quantity: number;
  unitCost: number | null;
  supplier: string;
  origin: string;
  cargo: number;
  purchasedAt: string;
  notes: string;
  createdByUid: string;
  /** Which money account the purchase was settled from; defaults to cash. */
  paymentMethod?: string | null;
}

/** Landed cost of a purchase — the material itself plus what it cost to freight in. */
export function purchaseLandedCost(
  entry: Pick<RawMaterialPurchaseEntry, "quantity" | "unitCost" | "cargo">,
): number {
  return landedAmount(entry);
}

export { blendUnitCost };

const RAW_MATERIAL_LEDGER: MaterialLedgerConfig = {
  collectionName: RAW_MATERIALS_COLLECTION,
  purchaseSourceType: "rawMaterialPurchase",
  usageSourceType: "rawMaterialUsage",
  buildPurchaseEntry: buildRawMaterialPurchaseEntry,
  buildWriteOffEntry: buildRawMaterialWriteOffEntry,
  notFoundMessage: "Material not found",
  describePurchase: (entry, itemId) => `Түүхий эд худалдан авалт: ${String(entry.supplier ?? "") || String(itemId)}`,
  describePurchaseRemoval: "Түүхий эдийн худалдан авалт устгасан — бичилтийг цуцаллаа",
  describeUsage: (entry, itemId) => `Түүхий эдийн зарцуулалт: ${String(entry.reason ?? "") || String(itemId)}`,
  describeUsageRemoval: "Түүхий эдийн зарцуулалт устгасан — бичилтийг цуцаллаа",
};

function newEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Records a raw-material purchase: the stock of materials grows by the quantity and the money
 * account it was paid from shrinks by the landed cost (goods plus freight). See
 * src/lib/materialLedger.ts.
 */
export async function addRawMaterialPurchase(
  materialId: number,
  input: AddRawMaterialPurchaseInput,
): Promise<void> {
  await recordMaterialPurchase(RAW_MATERIAL_LEDGER, materialId, {
    id: newEntryId(),
    quantity: input.quantity,
    unitCost: input.unitCost,
    supplier: input.supplier,
    origin: input.origin,
    cargo: input.cargo,
    purchasedAt: input.purchasedAt,
    notes: input.notes,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
    paymentMethod: input.paymentMethod ?? null,
  });
}

export async function removeRawMaterialPurchase(
  materialId: number,
  entry: RawMaterialPurchaseEntry,
): Promise<void> {
  await removeMaterialPurchase(RAW_MATERIAL_LEDGER, materialId, entry);
}

export interface AddRawMaterialUsageInput {
  quantity: number;
  reason: string;
  usedAt: string;
  notes: string;
  createdByUid: string;
}

/**
 * Records raw material consumed outside of a production batch — waste, samples, testing.
 * Production usage is already deducted automatically when a batch starts; this covers
 * everything that leaves the shelf without going through that flow.
 */
export async function addRawMaterialUsage(
  materialId: number,
  input: AddRawMaterialUsageInput,
): Promise<void> {
  await recordMaterialUsage(RAW_MATERIAL_LEDGER, materialId, {
    id: newEntryId(),
    quantity: input.quantity,
    reason: input.reason,
    usedAt: input.usedAt,
    notes: input.notes,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
  });
}

export async function removeRawMaterialUsage(
  materialId: number,
  entry: RawMaterialUsageEntry,
): Promise<void> {
  await removeMaterialUsage(RAW_MATERIAL_LEDGER, materialId, entry);
}
