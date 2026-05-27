import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  type FirestoreError,
  increment,
  onSnapshot,
  type QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

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
}

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
  };
  const materialRef = doc(rawMaterialsRef, String(materialId));
  await updateDoc(materialRef, {
    remaining: increment(input.quantity),
    purchaseLog: arrayUnion(entry),
    _updatedAt: serverTimestamp(),
  });
}

export async function removeRawMaterialPurchase(
  materialId: number,
  entry: RawMaterialPurchaseEntry,
): Promise<void> {
  const materialRef = doc(rawMaterialsRef, String(materialId));
  await updateDoc(materialRef, {
    remaining: increment(-entry.quantity),
    purchaseLog: arrayRemove(entry),
    _updatedAt: serverTimestamp(),
  });
}
