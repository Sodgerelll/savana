import {
  collection,
  doc,
  serverTimestamp,
  type DocumentData,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { db } from "../firebase";
import { reserveDocumentNumber } from "../documentNumbers";
import type { BuiltEntry, JournalLine } from "./entryBuilders";

export const JOURNAL_ENTRIES_COLLECTION = "journalEntries";

export type SourceType =
  | "order"
  | "sale"
  | "transfer"
  | "payment"
  | "directSale"
  | "customerTransaction"
  | "productionBatch"
  | "rawMaterialPurchase"
  | "rawMaterialUsage"
  | "packagingPurchase"
  | "packagingUsage"
  | "financeEntry"
  | "stockAdjustment"
  | "fixedAsset"
  | "fixedAssetDepreciation"
  | "fixedAssetDisposal";

export interface PostJournalEntryMeta {
  sourceType: SourceType;
  sourceId: string;
  sourceNumber: string;
  description: string;
  reversalOf?: string | null;
  /**
   * Business date the entry belongs to (YYYY-MM-DD or a full ISO string). Defaults to now.
   * Depreciation for a past month and an opening register dated at the cut-over need it,
   * otherwise the expense lands in whatever month the button happened to be pressed.
   */
  date?: string;
  createdBy: string;
  createdByName?: string;
}

/**
 * A plain YYYY-MM-DD becomes midday UTC on that day, so it reads as the same calendar day
 * both in UTC and in Ulaanbaatar (UTC+8). Full ISO strings pass through unchanged.
 */
export function businessDateToIso(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00.000Z` : date;
}

/** Structural subset shared by Firestore's Transaction and WriteBatch — both support write-only `.set()`. */
interface Writer {
  set(ref: DocumentReference, data: DocumentData): unknown;
}

/**
 * Reserves the next sequential journal entry number. Must be called BEFORE the caller's
 * business transaction starts any t.get() reads, since it runs its own transaction.
 */
export async function generateJournalEntryNumber(): Promise<string> {
  return reserveDocumentNumber("journalEntry");
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
    date: meta.date ? businessDateToIso(meta.date) : new Date().toISOString(),
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
