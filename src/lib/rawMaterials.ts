import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  type FirestoreError,
  getDoc,
  increment,
  onSnapshot,
  type QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildRawMaterialPurchaseEntry, buildReversalEntry } from "./accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry } from "./accounting/postEntryClient";

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
}

function deserializePurchaseEntry(raw: unknown): RawMaterialPurchaseEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    quantity: Number(r.quantity ?? 0),
    unitCost: r.unitCost === null || r.unitCost === undefined ? null : Number(r.unitCost),
    supplier: String(r.supplier ?? ""),
    purchasedAt: String(r.purchasedAt ?? ""),
    notes: String(r.notes ?? ""),
    createdByUid: String(r.createdByUid ?? ""),
    createdAt: String(r.createdAt ?? ""),
    // Purchases recorded before the field existed all went to cash, which is what the
    // reversal will now use for them too — the same account their original entry hit.
    paymentMethod: typeof r.paymentMethod === "string" ? r.paymentMethod : null,
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
  purchasedAt: string;
  notes: string;
  createdByUid: string;
  /** Which money account the purchase was settled from; defaults to cash. */
  paymentMethod?: string | null;
}

/** What a purchase cost in total — 0 when no unit cost was recorded. */
function purchaseAmount(entry: Pick<RawMaterialPurchaseEntry, "quantity" | "unitCost">): number {
  return entry.unitCost && entry.unitCost > 0 ? Math.round(entry.quantity * entry.unitCost) : 0;
}

/**
 * The material's unit cost after `quantity` units arrive at `unitCost`, blended with what
 * was already on the shelf.
 *
 * Buying used to leave `unitCost` alone, so it stayed at whatever figure was typed in by
 * hand while the ledger recorded what was really paid — recipes and journal entries then
 * costed the same material two different ways. Returns null when there is nothing to go
 * on, which leaves the existing figure untouched.
 */
export function blendUnitCost(
  currentRemaining: number,
  currentUnitCost: number | null,
  quantity: number,
  unitCost: number | null,
): number | null {
  if (unitCost === null || unitCost <= 0 || quantity <= 0) return null;
  const held = Math.max(0, currentRemaining);
  if (currentUnitCost === null || currentUnitCost <= 0 || held <= 0) return unitCost;
  return Math.round((held * currentUnitCost + quantity * unitCost) / (held + quantity));
}

/**
 * Records a raw-material purchase. The stock of materials grows and the money account it
 * was paid from shrinks — the ledger side used to be missing entirely, which left the
 * inventory accounts only ever being credited by COGS and never debited.
 */
export async function addRawMaterialPurchase(
  materialId: number,
  input: AddRawMaterialPurchaseInput,
): Promise<void> {
  const entry: RawMaterialPurchaseEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    quantity: input.quantity,
    unitCost: input.unitCost,
    supplier: input.supplier,
    purchasedAt: input.purchasedAt,
    notes: input.notes,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
    paymentMethod: input.paymentMethod ?? null,
  };

  const amount = purchaseAmount(entry);
  const entryNumber = amount > 0 ? await generateJournalEntryNumber() : null;

  const materialRef = doc(rawMaterialsRef, String(materialId));

  // Read before writing so the new unit cost can be blended with what is already held.
  const currentSnap = await getDoc(materialRef);
  const currentData = currentSnap.exists() ? (currentSnap.data() as Record<string, unknown>) : {};
  const nextUnitCost = blendUnitCost(
    Number(currentData.remaining ?? 0),
    currentData.unitCost === null || currentData.unitCost === undefined ? null : Number(currentData.unitCost),
    input.quantity,
    input.unitCost,
  );

  const batch = writeBatch(db);

  batch.update(materialRef, {
    remaining: increment(input.quantity),
    purchaseLog: arrayUnion(entry),
    ...(nextUnitCost !== null ? { unitCost: nextUnitCost } : {}),
    _updatedAt: serverTimestamp(),
  });

  if (entryNumber) {
    postJournalEntry(
      batch,
      entryNumber,
      buildRawMaterialPurchaseEntry({ amount, paymentMethod: input.paymentMethod }),
      {
        sourceType: "rawMaterialPurchase",
        sourceId: `${materialId}:${entry.id}`,
        sourceNumber: entry.id,
        description: `Түүхий эд худалдан авалт: ${input.supplier || String(materialId)}`,
        createdBy: input.createdByUid,
      },
    );
  }

  await batch.commit();
}

export async function removeRawMaterialPurchase(
  materialId: number,
  entry: RawMaterialPurchaseEntry,
): Promise<void> {
  const amount = purchaseAmount(entry);
  const entryNumber = amount > 0 ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);
  const materialRef = doc(rawMaterialsRef, String(materialId));

  batch.update(materialRef, {
    remaining: increment(-entry.quantity),
    purchaseLog: arrayRemove(entry),
    _updatedAt: serverTimestamp(),
  });

  if (entryNumber) {
    // Mirror image of the purchase: the materials leave again and the money goes back to
    // the account it was actually paid from, not whichever one happens to be the default.
    postJournalEntry(
      batch,
      entryNumber,
      buildReversalEntry(
        buildRawMaterialPurchaseEntry({ amount, paymentMethod: entry.paymentMethod }).lines,
      ),
      {
        sourceType: "rawMaterialPurchase",
        sourceId: `${materialId}:${entry.id}`,
        sourceNumber: entry.id,
        description: `Түүхий эдийн худалдан авалт устгасан — бичилтийг цуцаллаа`,
        createdBy: entry.createdByUid,
      },
    );
  }

  await batch.commit();
}
