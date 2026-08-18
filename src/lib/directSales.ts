import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildDirectSaleEntry, buildReversalEntry } from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  readJournalEntryLines,
} from "./accounting/postEntryClient";
import { reserveDocumentNumber } from "./documentNumbers";
import { applyStockMovement, productRef, readProductStockState, writeProductStock } from "./inventory";
import { calculateVat, normalizeVatMode as normalizeVat, type VatMode } from "./vat";

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
  /** How НӨАТ relates to the entered unit price — matches the Sales module's modes. */
  vatMode: VatMode;
  /** НӨАТ in tugriks carried by `lineTotal`. */
  vatAmount: number;
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
  vatMode?: VatMode;
  createdByUid: string;
}

function createSaleNumber(): Promise<string> {
  return reserveDocumentNumber("directSale");
}

/**
 * What the customer pays and how much of it is НӨАТ, for a given net line. `included`
 * carves the tax out of the entered price; `added` charges it on top.
 */
function priceWithVat(baseTotal: number, vatMode: VatMode) {
  const vatAmount = calculateVat(baseTotal, vatMode);
  return { lineTotal: vatMode === "added" ? baseTotal + vatAmount : baseTotal, vatAmount };
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
    vatMode: normalizeVat(data.vatMode),
    vatAmount: Number(data.vatAmount ?? 0),
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
  };
}

/**
 * Registers a POS sale. Stock check, stock movement, sale document and journal entry all
 * happen inside one Firestore transaction, so two tills selling the last unit at the same
 * moment cannot both succeed — the loser retries against the updated stock and is rejected.
 */
export async function createDirectSale(input: CreateDirectSaleInput): Promise<string> {
  const vatMode = normalizeVat(input.vatMode);
  const { lineTotal, vatAmount } = priceWithVat(input.quantity * input.unitPrice, vatMode);
  const now = new Date().toISOString();

  // Both numbers run their own transactions, so they must be reserved before the business
  // transaction opens.
  const saleNumber = await createSaleNumber();
  const entryNumber = await generateJournalEntryNumber();

  const saleRef = doc(collection(db, DIRECT_SALES_COLLECTION));

  await runTransaction(db, async (t) => {
    const ref = productRef(input.productId);
    const snap = await t.get(ref);
    const state = readProductStockState(
      input.productId,
      snap.exists() ? (snap.data() as Record<string, unknown>) : null,
    );

    // Raises InsufficientStockError, aborting the transaction before anything is written.
    applyStockMovement(state, { variant: input.variant, quantity: input.quantity }, {
      productName: input.productName,
    });

    const cogsAmount = state.costPrice > 0 ? state.costPrice * input.quantity : 0;

    const entryRef = postJournalEntry(
      t,
      entryNumber,
      buildDirectSaleEntry({ lineTotal, cogsAmount, vatAmount }),
      {
        sourceType: "directSale",
        sourceId: saleRef.id,
        sourceNumber: saleNumber,
        description: `Шууд борлуулалт: ${input.productName}`,
        createdBy: input.createdByUid,
      },
    );

    t.set(saleRef, {
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
      vatMode,
      vatAmount,
      createdByUid: input.createdByUid,
      createdAt: now,
      journalEntryId: entryRef.id,
    });

    writeProductStock(t, state);
  });

  return saleRef.id;
}

export async function updateDirectSale(
  id: string,
  oldSale: Pick<DirectSaleRecord, "saleNumber" | "productId" | "variant" | "quantity" | "journalEntryId" | "vatMode">,
  updates: { quantity: number; unitPrice: number; note: string; vatMode?: VatMode },
): Promise<void> {
  const vatMode = normalizeVat(updates.vatMode ?? oldSale.vatMode);
  const { lineTotal, vatAmount } = priceWithVat(updates.quantity * updates.unitPrice, vatMode);

  const reversalEntryNumber = oldSale.journalEntryId ? await generateJournalEntryNumber() : null;
  const newEntryNumber = await generateJournalEntryNumber();

  await runTransaction(db, async (t) => {
    const saleRef = doc(db, DIRECT_SALES_COLLECTION, id);
    const ref = productRef(oldSale.productId);

    // Every read must happen before the first write in a Firestore transaction.
    const snap = await t.get(ref);
    const oldLines =
      oldSale.journalEntryId !== null && oldSale.journalEntryId !== undefined
        ? await readJournalEntryLines(t, oldSale.journalEntryId)
        : null;

    const state = readProductStockState(
      oldSale.productId,
      snap.exists() ? (snap.data() as Record<string, unknown>) : null,
    );

    // Release the quantity the sale currently holds, then take the new one, so an edit is
    // checked against stock that excludes the sale's own units. The edit form changes the
    // quantity and the price, never the variant, so a sale recorded before variants had to
    // be named is still editable — refusing it would leave the record stuck instead.
    applyStockMovement(state, { variant: oldSale.variant, quantity: -oldSale.quantity }, { validate: false });
    applyStockMovement(state, { variant: oldSale.variant, quantity: updates.quantity }, { requireVariant: false });

    const cogsAmount = state.costPrice > 0 ? state.costPrice * updates.quantity : 0;

    if (oldLines && reversalEntryNumber) {
      postJournalEntry(t, reversalEntryNumber, buildReversalEntry(oldLines), {
        sourceType: "directSale",
        sourceId: id,
        sourceNumber: oldSale.saleNumber,
        description: "Шууд борлуулалт засварласан — хуучин бичилтийг цуцаллаа",
        reversalOf: oldSale.journalEntryId,
        createdBy: "system",
      });
    }

    const newEntryRef = postJournalEntry(
      t,
      newEntryNumber,
      buildDirectSaleEntry({ lineTotal, cogsAmount, vatAmount }),
      {
        sourceType: "directSale",
        sourceId: id,
        sourceNumber: oldSale.saleNumber,
        description: "Шууд борлуулалт засварласан",
        createdBy: "system",
      },
    );

    t.update(saleRef, {
      quantity: updates.quantity,
      unitPrice: updates.unitPrice,
      lineTotal,
      note: updates.note,
      vatMode,
      vatAmount,
      journalEntryId: newEntryRef.id,
    });

    writeProductStock(t, state);
  });
}

export async function deleteDirectSale(
  id: string,
  sale: Pick<DirectSaleRecord, "saleNumber" | "productId" | "variant" | "quantity" | "journalEntryId">,
): Promise<void> {
  const entryNumber = sale.journalEntryId ? await generateJournalEntryNumber() : null;

  await runTransaction(db, async (t) => {
    const ref = productRef(sale.productId);
    const snap = await t.get(ref);
    const lines =
      sale.journalEntryId !== null && sale.journalEntryId !== undefined
        ? await readJournalEntryLines(t, sale.journalEntryId)
        : null;

    const state = readProductStockState(
      sale.productId,
      snap.exists() ? (snap.data() as Record<string, unknown>) : null,
    );
    applyStockMovement(state, { variant: sale.variant, quantity: -sale.quantity }, { validate: false });

    if (lines && entryNumber) {
      postJournalEntry(t, entryNumber, buildReversalEntry(lines), {
        sourceType: "directSale",
        sourceId: id,
        sourceNumber: sale.saleNumber,
        description: "Шууд борлуулалт устгасан — бичилтийг цуцаллаа",
        reversalOf: sale.journalEntryId,
        createdBy: "system",
      });
    }

    t.delete(doc(db, DIRECT_SALES_COLLECTION, id));
    writeProductStock(t, state);
  });
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
