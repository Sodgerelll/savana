import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

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
  createdByUid: string;
  createdAt: string | null;
}

export interface FinanceEntryInput {
  type: FinanceEntryType;
  amount: number;
  category: string;
  note: string;
  date: string;
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
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
  };
}

export async function createFinanceEntry(input: FinanceEntryInput): Promise<string> {
  const ref = await addDoc(collection(db, FINANCE_ENTRIES_COLLECTION), {
    type: input.type,
    amount: input.amount,
    category: input.category,
    note: input.note,
    date: input.date,
    recurringId: null,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateFinanceEntry(
  id: string,
  updates: Pick<FinanceEntryInput, "type" | "amount" | "category" | "note" | "date">,
): Promise<void> {
  await updateDoc(doc(db, FINANCE_ENTRIES_COLLECTION, id), {
    type: updates.type,
    amount: updates.amount,
    category: updates.category,
    note: updates.note,
    date: updates.date,
  });
}

export async function deleteFinanceEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, FINANCE_ENTRIES_COLLECTION, id));
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
