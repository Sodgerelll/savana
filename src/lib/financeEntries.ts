import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildFinanceLedgerEntry, buildReversalEntry } from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  JOURNAL_ENTRIES_COLLECTION,
} from "./accounting/postEntryClient";

export const FINANCE_ENTRIES_COLLECTION = "financeEntries";

export type FinanceEntryType = "income" | "expense";

export interface FinanceEntryRecord {
  id: string;
  type: FinanceEntryType;
  amount: number;
  category: string;
  note: string;
  /** Entry date in YYYY-MM-DD format (local business date). */
  date: string;
  /** Set when this entry was generated from a recurring rule. */
  recurringId: string | null;
  /** Money account the entry settled through; defaults to cash. */
  paymentMethod: string | null;
  /** journalEntries doc id this row posted — reversed when the row is edited or removed. */
  journalEntryId: string | null;
  createdByUid: string;
  createdAt: string | null;
}

export interface FinanceEntryInput {
  type: FinanceEntryType;
  amount: number;
  category: string;
  note: string;
  date: string;
  paymentMethod?: string | null;
  createdByUid: string;
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

function deserializeFinanceEntry(snapshot: QueryDocumentSnapshot<DocumentData>): FinanceEntryRecord {
  const data = snapshot.data() as Record<string, unknown>;
  return {
    id: snapshot.id,
    type: data.type === "expense" ? "expense" : "income",
    amount: Number(data.amount ?? 0),
    category: String(data.category ?? ""),
    note: String(data.note ?? ""),
    date: String(data.date ?? ""),
    recurringId: typeof data.recurringId === "string" ? data.recurringId : null,
    paymentMethod: typeof data.paymentMethod === "string" ? data.paymentMethod : null,
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
  };
}

/**
 * Queues a mirror-image reversal of an entry this module previously posted, so an edited
 * or deleted row leaves the ledger exactly as it found it.
 */
async function queueReversal(
  batch: ReturnType<typeof writeBatch>,
  journalEntryId: string,
  id: string,
  description: string,
): Promise<void> {
  const snapshot = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, journalEntryId));
  if (!snapshot.exists()) return;

  const lines = (snapshot.data() as { lines?: Parameters<typeof buildReversalEntry>[0] }).lines ?? [];
  const entryNumber = await generateJournalEntryNumber();
  postJournalEntry(batch, entryNumber, buildReversalEntry(lines), {
    sourceType: "financeEntry",
    sourceId: id,
    sourceNumber: id,
    description,
    reversalOf: journalEntryId,
    createdBy: "system",
  });
}

/**
 * Records a hand-entered income or expense. It now also posts to the journal: rent,
 * salaries and marketing used to live only in this collection, so the trial balance showed
 * revenue with no costs against it.
 */
export async function createFinanceEntry(input: FinanceEntryInput): Promise<string> {
  const entryRefDoc = doc(collection(db, FINANCE_ENTRIES_COLLECTION));
  const entryNumber = input.amount > 0 ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);
  let journalEntryId: string | null = null;

  if (entryNumber) {
    const posted = postJournalEntry(
      batch,
      entryNumber,
      buildFinanceLedgerEntry({
        type: input.type,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
      }),
      {
        sourceType: "financeEntry",
        sourceId: entryRefDoc.id,
        sourceNumber: entryRefDoc.id,
        description: `${input.category}${input.note ? ` — ${input.note}` : ""}`,
        createdBy: input.createdByUid,
      },
    );
    journalEntryId = posted.id;
  }

  batch.set(entryRefDoc, {
    type: input.type,
    amount: input.amount,
    category: input.category,
    note: input.note,
    date: input.date,
    recurringId: null,
    paymentMethod: input.paymentMethod ?? null,
    journalEntryId,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
  });

  await batch.commit();
  return entryRefDoc.id;
}

export async function updateFinanceEntry(
  id: string,
  previous: Pick<FinanceEntryRecord, "journalEntryId" | "createdByUid">,
  updates: Pick<FinanceEntryInput, "type" | "amount" | "category" | "note" | "date"> & {
    paymentMethod?: string | null;
  },
): Promise<void> {
  const batch = writeBatch(db);

  if (previous.journalEntryId) {
    await queueReversal(batch, previous.journalEntryId, id, "Санхүүгийн бичилт засварласан — хуучныг цуцаллаа");
  }

  let journalEntryId: string | null = null;

  if (updates.amount > 0) {
    const entryNumber = await generateJournalEntryNumber();
    const posted = postJournalEntry(
      batch,
      entryNumber,
      buildFinanceLedgerEntry({
        type: updates.type,
        amount: updates.amount,
        paymentMethod: updates.paymentMethod,
      }),
      {
        sourceType: "financeEntry",
        sourceId: id,
        sourceNumber: id,
        description: `${updates.category}${updates.note ? ` — ${updates.note}` : ""}`,
        createdBy: previous.createdByUid,
      },
    );
    journalEntryId = posted.id;
  }

  batch.update(doc(db, FINANCE_ENTRIES_COLLECTION, id), {
    type: updates.type,
    amount: updates.amount,
    category: updates.category,
    note: updates.note,
    date: updates.date,
    paymentMethod: updates.paymentMethod ?? null,
    journalEntryId,
  });

  await batch.commit();
}

export async function deleteFinanceEntry(
  id: string,
  previous?: Pick<FinanceEntryRecord, "journalEntryId">,
): Promise<void> {
  const batch = writeBatch(db);

  if (previous?.journalEntryId) {
    await queueReversal(batch, previous.journalEntryId, id, "Санхүүгийн бичилт устгасан — бичилтийг цуцаллаа");
  }

  batch.delete(doc(db, FINANCE_ENTRIES_COLLECTION, id));

  await batch.commit();
}

export function subscribeToFinanceEntries({
  onData,
  onError,
}: {
  onData: (entries: FinanceEntryRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, FINANCE_ENTRIES_COLLECTION), orderBy("date", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((d) => deserializeFinanceEntry(d)));
    },
    onError,
  );
}
