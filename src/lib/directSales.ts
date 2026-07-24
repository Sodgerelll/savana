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
import { buildDirectSaleEntry, buildReversalEntry } from "./accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry, JOURNAL_ENTRIES_COLLECTION } from "./accounting/postEntryClient";

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
  /** List price at the time of sale — greater than unitPrice when sold at a discount. */
  originalUnitPrice?: number;
  lineTotal: number;
  note: string;
  createdByUid: string;
  createdAt: string | null;
  journalEntryId?: string | null;
}

export interface CreateDirectSaleInput {
  productId: number;
  productName: string;
  productImage: string | null;
  category: string;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  originalUnitPrice?: number;
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
    originalUnitPrice: Number(data.originalUnitPrice ?? data.unitPrice ?? 0),
    lineTotal: Number(data.lineTotal ?? 0),
    note: String(data.note ?? ""),
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
  };
}

export async function createDirectSale(input: CreateDirectSaleInput): Promise<string> {
  const saleNumber = createSaleNumber();
  const saleRef = doc(collection(db, DIRECT_SALES_COLLECTION));
  const lineTotal = input.quantity * input.unitPrice;
  const now = new Date().toISOString();

  // Read the product first (for stock validation, soldCount update, and best-effort COGS)
  // so the journal entry id is known before the sale doc itself is written.
  const productRef = doc(db, "products", String(input.productId));
  const productSnap = await getDoc(productRef);

  const batch = writeBatch(db);
  let cogsAmount = 0;

  if (productSnap.exists()) {
    const data = productSnap.data() as Record<string, unknown>;
    const currentSoldCount = Number(data.soldCount ?? 0);
    const variants = Array.isArray(data.variants) ? data.variants as Array<Record<string, unknown>> : null;
    const costPrice = Number(data.costPrice ?? 0);
    if (costPrice > 0) {
      cogsAmount = costPrice * input.quantity;
    }

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

  const entryNumber = await generateJournalEntryNumber();
  const entryRef = postJournalEntry(batch, entryNumber, buildDirectSaleEntry({ lineTotal, cogsAmount }), {
    sourceType: "directSale",
    sourceId: saleRef.id,
    sourceNumber: saleNumber,
    description: `Шууд борлуулалт: ${input.productName}`,
    createdBy: input.createdByUid,
  });

  batch.set(saleRef, {
    saleNumber,
    productId: input.productId,
    productName: input.productName,
    productImage: input.productImage ?? null,
    category: input.category,
    variant: input.variant ?? null,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    originalUnitPrice: input.originalUnitPrice ?? input.unitPrice,
    lineTotal,
    note: input.note,
    createdByUid: input.createdByUid,
    createdAt: now,
    journalEntryId: entryRef.id,
  });

  await batch.commit();
  return saleRef.id;
}

export async function updateDirectSale(
  id: string,
  oldSale: Pick<DirectSaleRecord, "productId" | "variant" | "quantity" | "journalEntryId">,
  updates: { quantity: number; unitPrice: number; note: string },
): Promise<void> {
  const batch = writeBatch(db);
  const saleRef = doc(db, DIRECT_SALES_COLLECTION, id);
  const newLineTotal = updates.quantity * updates.unitPrice;

  batch.update(saleRef, {
    quantity: updates.quantity,
    unitPrice: updates.unitPrice,
    lineTotal: newLineTotal,
    note: updates.note,
  });

  const diff = updates.quantity - oldSale.quantity;
  let costPrice = 0;
  const productRef = doc(db, "products", String(oldSale.productId));
  const productSnap = await getDoc(productRef);
  if (productSnap.exists()) {
    const data = productSnap.data() as Record<string, unknown>;
    costPrice = Number(data.costPrice ?? 0);

    if (diff !== 0) {
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

  // Reverse the previously posted entry, then post a fresh one for the updated amounts.
  if (oldSale.journalEntryId) {
    const oldEntrySnap = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, oldSale.journalEntryId));
    if (oldEntrySnap.exists()) {
      const oldLines = (oldEntrySnap.data() as { lines?: Parameters<typeof buildReversalEntry>[0] }).lines ?? [];
      const reversalEntryNumber = await generateJournalEntryNumber();
      postJournalEntry(batch, reversalEntryNumber, buildReversalEntry(oldLines), {
        sourceType: "directSale",
        sourceId: id,
        sourceNumber: id,
        description: "Шууд борлуулалт засварласан — хуучин бичилтийг цуцаллаа",
        reversalOf: oldSale.journalEntryId,
        createdBy: "system",
      });
    }
  }

  const newEntryNumber = await generateJournalEntryNumber();
  const newEntryRef = postJournalEntry(
    batch,
    newEntryNumber,
    buildDirectSaleEntry({ lineTotal: newLineTotal, cogsAmount: costPrice > 0 ? costPrice * updates.quantity : 0 }),
    {
      sourceType: "directSale",
      sourceId: id,
      sourceNumber: id,
      description: "Шууд борлуулалт засварласан",
      createdBy: "system",
    },
  );
  batch.update(saleRef, { journalEntryId: newEntryRef.id });

  await batch.commit();
}

export async function deleteDirectSale(
  id: string,
  sale: Pick<DirectSaleRecord, "productId" | "variant" | "quantity" | "journalEntryId">,
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

  if (sale.journalEntryId) {
    const entrySnap = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, sale.journalEntryId));
    if (entrySnap.exists()) {
      const lines = (entrySnap.data() as { lines?: Parameters<typeof buildReversalEntry>[0] }).lines ?? [];
      const entryNumber = await generateJournalEntryNumber();
      postJournalEntry(batch, entryNumber, buildReversalEntry(lines), {
        sourceType: "directSale",
        sourceId: id,
        sourceNumber: id,
        description: "Шууд борлуулалт устгасан — бичилтийг цуцаллаа",
        reversalOf: sale.journalEntryId,
        createdBy: "system",
      });
    }
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
