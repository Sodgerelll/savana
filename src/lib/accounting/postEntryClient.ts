import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { db } from "../firebase";
import { COUNTERS_COLLECTION } from "../../services/transferService";
import type { BuiltEntry, JournalLine } from "./entryBuilders";

export const JOURNAL_ENTRIES_COLLECTION = "journalEntries";

export type SourceType = "order" | "transfer" | "payment" | "directSale" | "customerTransaction";

export interface PostJournalEntryMeta {
  sourceType: SourceType;
  sourceId: string;
  sourceNumber: string;
  description: string;
  reversalOf?: string | null;
  createdBy: string;
  createdByName?: string;
}

/** Structural subset shared by Firestore's Transaction and WriteBatch — both support write-only `.set()`. */
interface Writer {
  set(ref: DocumentReference, data: DocumentData): unknown;
}

/**
 * Reserves the next sequential journal entry number via its own standalone transaction,
 * mirroring generateTransferNumber() in transferService.ts. Must be called BEFORE the
 * caller's business transaction starts any t.get() reads, since it runs its own transaction.
 */
export async function generateJournalEntryNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const counterRef = doc(db, COUNTERS_COLLECTION, "journalEntries");

  return runTransaction(db, async (t) => {
    const snap = await t.get(counterRef);
    let lastNumber = 0;

    if (snap.exists()) {
      const data = snap.data();
      if (data.year === currentYear) {
        lastNumber = data.lastNumber ?? 0;
      }
    }

    const newNumber = lastNumber + 1;
    t.set(counterRef, { lastNumber: newNumber, year: currentYear, prefix: "JE" });
    return `JE-${currentYear}-${String(newNumber).padStart(6, "0")}`;
  });
}

/**
 * Writes a journalEntries doc as part of an in-flight Transaction/WriteBatch (write-only —
 * does not call t.get, so it's always safe to call after other reads/writes in the caller's
 * transaction). Pass an entryNumber obtained from generateJournalEntryNumber() beforehand.
 */
export function postJournalEntry(
  writer: Writer,
  entryNumber: string,
  built: BuiltEntry,
  meta: PostJournalEntryMeta,
): DocumentReference {
  const ref = doc(collection(db, JOURNAL_ENTRIES_COLLECTION));
  writer.set(ref, {
    entryNumber,
    date: new Date().toISOString(),
    sourceType: meta.sourceType,
    sourceId: meta.sourceId,
    sourceNumber: meta.sourceNumber,
    description: meta.description,
    lines: built.lines,
    totalAmount: built.totalAmount,
    currency: "MNT",
    reversalOf: meta.reversalOf ?? null,
    createdBy: meta.createdBy,
    createdByName: meta.createdByName ?? "",
    createdAt: serverTimestamp(),
  });
  return ref;
}

/** Reads a previously posted entry's lines from within an in-flight Transaction (must be called before any writes in that transaction). */
export async function readJournalEntryLines(t: Transaction, entryId: string): Promise<JournalLine[] | null> {
  const snap = await t.get(doc(db, JOURNAL_ENTRIES_COLLECTION, entryId));
  if (!snap.exists()) return null;
  const data = snap.data() as { lines?: JournalLine[] };
  return Array.isArray(data.lines) ? data.lines : null;
}
