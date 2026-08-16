import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { FINANCE_ENTRIES_COLLECTION, type FinanceEntryType } from "./financeEntries";
import { buildFinanceLedgerEntry } from "./accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry } from "./accounting/postEntryClient";

export const FINANCE_RECURRING_COLLECTION = "financeRecurring";

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

/**
 * A recurring income/expense rule. Occurrences are materialized into real
 * financeEntries docs with deterministic ids (`rec_<ruleId>_<date>`), so
 * concurrent admin sessions can never double-create an occurrence.
 */
export interface FinanceRecurringRecord {
  id: string;
  type: FinanceEntryType;
  amount: number;
  category: string;
  note: string;
  frequency: RecurringFrequency;
  /** First occurrence date, YYYY-MM-DD. Sets weekday / day-of-month / month+day. */
  startDate: string;
  active: boolean;
  /** Occurrences on or before this date have already been generated. */
  lastGeneratedDate: string | null;
  createdByUid: string;
  createdAt: string | null;
}

export interface FinanceRecurringInput {
  type: FinanceEntryType;
  amount: number;
  category: string;
  note: string;
  frequency: RecurringFrequency;
  startDate: string;
  createdByUid: string;
}

function deserializeRecurring(snapshot: QueryDocumentSnapshot<DocumentData>): FinanceRecurringRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const frequency = data.frequency;
  return {
    id: snapshot.id,
    type: data.type === "expense" ? "expense" : "income",
    amount: Number(data.amount ?? 0),
    category: String(data.category ?? ""),
    note: String(data.note ?? ""),
    frequency: frequency === "weekly" || frequency === "yearly" ? frequency : "monthly",
    startDate: String(data.startDate ?? ""),
    active: data.active !== false,
    lastGeneratedDate: typeof data.lastGeneratedDate === "string" ? data.lastGeneratedDate : null,
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
  };
}

export async function createFinanceRecurring(input: FinanceRecurringInput): Promise<string> {
  const ref = await addDoc(collection(db, FINANCE_RECURRING_COLLECTION), {
    type: input.type,
    amount: input.amount,
    category: input.category,
    note: input.note,
    frequency: input.frequency,
    startDate: input.startDate,
    active: true,
    lastGeneratedDate: null,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateFinanceRecurring(
  id: string,
  updates: Partial<Pick<FinanceRecurringRecord, "type" | "amount" | "category" | "note" | "frequency" | "startDate" | "active">>,
): Promise<void> {
  await updateDoc(doc(db, FINANCE_RECURRING_COLLECTION, id), updates);
}

export async function deleteFinanceRecurring(id: string): Promise<void> {
  // Generated historical entries are intentionally kept; only the rule dies.
  await deleteDoc(doc(db, FINANCE_RECURRING_COLLECTION, id));
}

export function subscribeToFinanceRecurring({
  onData,
  onError,
}: {
  onData: (rules: FinanceRecurringRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    collection(db, FINANCE_RECURRING_COLLECTION),
    (snapshot) => {
      onData(snapshot.docs.map((d) => deserializeRecurring(d)));
    },
    onError,
  );
}

// ── Occurrence math (pure string/UTC arithmetic; no local-timezone drift) ──

function toKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clampDay(year: number, monthIndex: number, day: number): number {
  return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

export function localTodayKey(): string {
  const now = new Date();
  return toKey(now.getFullYear(), now.getMonth(), now.getDate());
}

/** All occurrence dates with floor < date <= ceiling (floor null = include startDate). */
export function listDueOccurrences(
  rule: Pick<FinanceRecurringRecord, "frequency" | "startDate" | "lastGeneratedDate">,
  todayKey: string,
  maxOccurrences = 120,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.startDate)) return [];
  const [startYear, startMonth, startDay] = rule.startDate.split("-").map(Number);
  const floor = rule.lastGeneratedDate;
  const due: string[] = [];

  if (rule.frequency === "weekly") {
    const cursor = new Date(Date.UTC(startYear, startMonth - 1, startDay));
    for (let i = 0; i < 10000; i += 1) {
      const key = toKey(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
      if (key > todayKey) break;
      if (floor === null || key > floor) {
        due.push(key);
        if (due.length >= maxOccurrences) break;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return due;
  }

  if (rule.frequency === "monthly") {
    for (let i = 0; i < 10000; i += 1) {
      const monthIndex = startMonth - 1 + i;
      const year = startYear + Math.floor(monthIndex / 12);
      const month = monthIndex % 12;
      const key = toKey(year, month, clampDay(year, month, startDay));
      if (key > todayKey) break;
      if (floor === null || key > floor) {
        due.push(key);
        if (due.length >= maxOccurrences) break;
      }
    }
    return due;
  }

  // yearly
  for (let i = 0; i < 1000; i += 1) {
    const year = startYear + i;
    const key = toKey(year, startMonth - 1, clampDay(year, startMonth - 1, startDay));
    if (key > todayKey) break;
    if (floor === null || key > floor) {
      due.push(key);
      if (due.length >= maxOccurrences) break;
    }
  }
  return due;
}

/**
 * Create financeEntries docs for every due occurrence of every active rule.
 * Idempotent: entry ids are deterministic, and each rule's lastGeneratedDate
 * advances so already-generated (or user-deleted) occurrences never reappear.
 */
export async function materializeDueRecurringEntries(rules: FinanceRecurringRecord[]): Promise<number> {
  const today = localTodayKey();
  const batch = writeBatch(db);
  let entryWrites = 0;

  for (const rule of rules) {
    if (!rule.active) continue;
    const due = listDueOccurrences(rule, today);
    if (due.length === 0) continue;

    for (const date of due) {
      const entryRef = doc(db, FINANCE_ENTRIES_COLLECTION, `rec_${rule.id}_${date}`);
      // Reserved before the batch is written, since it runs its own transaction.
      const entryNumber = rule.amount > 0 ? await generateJournalEntryNumber() : null;
      let journalEntryId: string | null = null;

      if (entryNumber) {
        // A generated occurrence is a real cost or receipt, so it posts to the ledger just
        // like a hand-entered one does.
        const posted = postJournalEntry(
          batch,
          entryNumber,
          buildFinanceLedgerEntry({ type: rule.type, amount: rule.amount }),
          {
            sourceType: "financeEntry",
            sourceId: entryRef.id,
            sourceNumber: entryRef.id,
            description: `${rule.category}${rule.note ? ` — ${rule.note}` : ""}`,
            createdBy: rule.createdByUid,
          },
        );
        journalEntryId = posted.id;
        entryWrites += 1;
      }

      batch.set(entryRef, {
        type: rule.type,
        amount: rule.amount,
        category: rule.category,
        note: rule.note,
        date,
        recurringId: rule.id,
        paymentMethod: null,
        journalEntryId,
        createdByUid: rule.createdByUid,
        createdAt: new Date().toISOString(),
      });
      entryWrites += 1;
    }
    batch.update(doc(db, FINANCE_RECURRING_COLLECTION, rule.id), { lastGeneratedDate: today });

    // Stay well under the 500-write batch limit.
    if (entryWrites > 400) break;
  }

  if (entryWrites > 0) await batch.commit();
  return entryWrites;
}
