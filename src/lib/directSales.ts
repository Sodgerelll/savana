import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export const DIRECT_SALES_COLLECTION = "directSales";

export interface DirectSaleRecord {
  id: string;
  saleNumber: string;
  productId: number;
  productName: string;
  productImage: string | null;
  category: string;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string;
  createdByUid: string;
  createdAt: string | null;
}

export interface CreateDirectSaleInput {
  productId: number;
  productName: string;
  productImage: string | null;
  category: string;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  note: string;
  createdByUid: string;
}

function createSaleNumber(): string {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ulaanbaatar",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = dateParts.find((p) => p.type === "year")?.value ?? "00";
  const month = dateParts.find((p) => p.type === "month")?.value ?? "00";
  const day = dateParts.find((p) => p.type === "day")?.value ?? "00";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomLetter = chars[Math.floor(Math.random() * chars.length)];
  const randomDigits = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `DS-${year}${month}${day}${randomLetter}${randomDigits}`;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function deserializeDirectSale(snapshot: QueryDocumentSnapshot<DocumentData>): DirectSaleRecord {
  const data = snapshot.data() as Record<string, unknown>;
  return {
    id: snapshot.id,
    saleNumber: String(data.saleNumber ?? snapshot.id),
    productId: Number(data.productId ?? 0),
    productName: String(data.productName ?? ""),
    productImage: typeof data.productImage === "string" ? data.productImage : null,
    category: String(data.category ?? ""),
    variant: typeof data.variant === "string" ? data.variant : null,
    quantity: Number(data.quantity ?? 0),
    unitPrice: Number(data.unitPrice ?? 0),
    lineTotal: Number(data.lineTotal ?? 0),
    note: String(data.note ?? ""),
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
  };
}

export async function createDirectSale(input: CreateDirectSaleInput): Promise<string> {
  const saleNumber = createSaleNumber();
  const batch = writeBatch(db);
  const saleRef = doc(collection(db, DIRECT_SALES_COLLECTION));

  const now = new Date().toISOString();

  batch.set(saleRef, {
    saleNumber,
    productId: input.productId,
    productName: input.productName,
    productImage: input.productImage ?? null,
    category: input.category,
    variant: input.variant ?? null,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    lineTotal: input.quantity * input.unitPrice,
    note: input.note,
    createdByUid: input.createdByUid,
    createdAt: now,
  });

  // Update product soldCount
  const productRef = doc(db, "products", String(input.productId));
  const productSnap = await getDoc(productRef);
  if (productSnap.exists()) {
    const data = productSnap.data() as Record<string, unknown>;
    const currentSoldCount = Number(data.soldCount ?? 0);
    const variants = Array.isArray(data.variants) ? data.variants as Array<Record<string, unknown>> : null;

    // Block overselling: quantity must not exceed available remaining stock.
    let available: number;
    if (input.variant && variants) {
      const v = variants.find((vv) => vv.name === input.variant);
      available = Number(v?.quantity ?? 0) - Number(v?.soldCount ?? 0);
    } else {
      available = Number(data.totalStock ?? 0) - currentSoldCount;
    }
    if (input.quantity > available) {
      throw new Error(`INSUFFICIENT_STOCK:${Math.max(0, available)}`);
    }

    const update: Record<string, unknown> = {
      soldCount: currentSoldCount + input.quantity,
      updatedAt: serverTimestamp(),
    };

    if (input.variant && variants) {
      const idx = variants.findIndex((v) => v.name === input.variant);
      if (idx >= 0) {
        const updated = variants.map((v, i) =>
          i === idx ? { ...v, soldCount: Number(v.soldCount ?? 0) + input.quantity } : v
        );
        update.variants = updated;
      }
    }

    batch.update(productRef, update);
  }

  await batch.commit();
  return saleRef.id;
}

export async function updateDirectSale(
  id: string,
  oldSale: Pick<DirectSaleRecord, "productId" | "variant" | "quantity">,
  updates: { quantity: number; unitPrice: number; note: string },
): Promise<void> {
  const batch = writeBatch(db);
  const saleRef = doc(db, DIRECT_SALES_COLLECTION, id);

  batch.update(saleRef, {
    quantity: updates.quantity,
    unitPrice: updates.unitPrice,
    lineTotal: updates.quantity * updates.unitPrice,
    note: updates.note,
  });

  const diff = updates.quantity - oldSale.quantity;
  if (diff !== 0) {
    const productRef = doc(db, "products", String(oldSale.productId));
    const productSnap = await getDoc(productRef);
    if (productSnap.exists()) {
      const data = productSnap.data() as Record<string, unknown>;
      const currentSoldCount = Number(data.soldCount ?? 0);
      const variants = Array.isArray(data.variants) ? (data.variants as Array<Record<string, unknown>>) : null;

      // Block overselling when increasing the quantity. The old quantity is
      // already counted in soldCount, so the extra "diff" must fit in remaining.
      if (diff > 0) {
        let available: number;
        if (oldSale.variant && variants) {
          const v = variants.find((vv) => vv.name === oldSale.variant);
          available = Number(v?.quantity ?? 0) - Number(v?.soldCount ?? 0);
        } else {
          available = Number(data.totalStock ?? 0) - currentSoldCount;
        }
        if (diff > available) {
          throw new Error(`INSUFFICIENT_STOCK:${Math.max(0, available) + oldSale.quantity}`);
        }
      }

      const update: Record<string, unknown> = {
        soldCount: Math.max(0, currentSoldCount + diff),
        updatedAt: serverTimestamp(),
      };

      if (oldSale.variant && variants) {
        const idx = variants.findIndex((v) => v.name === oldSale.variant);
        if (idx >= 0) {
          update.variants = variants.map((v, i) =>
            i === idx ? { ...v, soldCount: Math.max(0, Number(v.soldCount ?? 0) + diff) } : v,
          );
        }
      }

      batch.update(productRef, update);
    }
  }

  await batch.commit();
}

export async function deleteDirectSale(
  id: string,
  sale: Pick<DirectSaleRecord, "productId" | "variant" | "quantity">,
): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, DIRECT_SALES_COLLECTION, id));

  const productRef = doc(db, "products", String(sale.productId));
  const productSnap = await getDoc(productRef);
  if (productSnap.exists()) {
    const data = productSnap.data() as Record<string, unknown>;
    const currentSoldCount = Number(data.soldCount ?? 0);
    const variants = Array.isArray(data.variants) ? (data.variants as Array<Record<string, unknown>>) : null;

    const update: Record<string, unknown> = {
      soldCount: Math.max(0, currentSoldCount - sale.quantity),
      updatedAt: serverTimestamp(),
    };

    if (sale.variant && variants) {
      const idx = variants.findIndex((v) => v.name === sale.variant);
      if (idx >= 0) {
        update.variants = variants.map((v, i) =>
          i === idx ? { ...v, soldCount: Math.max(0, Number(v.soldCount ?? 0) - sale.quantity) } : v,
        );
      }
    }

    batch.update(productRef, update);
  }

  await batch.commit();
}

export function subscribeToDirectSales({
  onData,
  onError,
}: {
  onData: (sales: DirectSaleRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, DIRECT_SALES_COLLECTION), orderBy("createdAt", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((d) => deserializeDirectSale(d)));
    },
    onError,
  );
}
