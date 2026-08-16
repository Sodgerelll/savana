import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { ACCOUNTS_COLLECTION } from "./chartOfAccounts";
import { JOURNAL_ENTRIES_COLLECTION } from "./postEntryClient";
import type { JournalLine } from "./entryBuilders";
import type { SourceType } from "./postEntryClient";

export interface JournalEntryRecord {
  id: string;
  entryNumber: string;
  date: string | null;
  sourceType: SourceType;
  sourceId: string;
  sourceNumber: string;
  description: string;
  lines: JournalLine[];
  totalAmount: number;
  currency: string;
  reversalOf: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string | null;
}

export interface AccountRecord {
  code: string;
  name: string;
  nameEn: string;
  type: string;
  normalBalance: "debit" | "credit";
  isActive: boolean;
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

function deserializeEntry(snapshot: QueryDocumentSnapshot<DocumentData>): JournalEntryRecord {
  const data = snapshot.data() as Record<string, unknown>;
  return {
    id: snapshot.id,
    entryNumber: String(data.entryNumber ?? snapshot.id),
    date: typeof data.date === "string" ? data.date : null,
    sourceType: (data.sourceType as SourceType) ?? "transfer",
    sourceId: String(data.sourceId ?? ""),
    sourceNumber: String(data.sourceNumber ?? ""),
    description: String(data.description ?? ""),
    lines: Array.isArray(data.lines) ? (data.lines as JournalLine[]) : [],
    totalAmount: Number(data.totalAmount ?? 0),
    currency: String(data.currency ?? "MNT"),
    reversalOf: typeof data.reversalOf === "string" ? data.reversalOf : null,
    createdBy: String(data.createdBy ?? ""),
    createdByName: String(data.createdByName ?? ""),
    createdAt: parseTimestamp(data.createdAt),
  };
}

/**
 * How far back the admin shell keeps the ledger live.
 *
 * `journalEntries` is the fastest-growing collection in the system — every sale writes one,
 * and every edit writes two more — and the shell used to hold the entire history open on a
 * realtime listener. Three years covers the current and two prior financial years, which is
 * everything the reports and the reconciliation screen work over; anything older is history
 * that no screen recalculates.
 */
export const JOURNAL_WINDOW_YEARS = 3;

/** The oldest entry date the admin shell subscribes to, as a YYYY-MM-DD string. */
export function journalWindowStart(now: Date = new Date()): string {
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - JOURNAL_WINDOW_YEARS);
  return start.toISOString().slice(0, 10);
}

export function subscribeToJournalEntries({
  onData,
  onError,
  since = journalWindowStart(),
}: {
  onData: (entries: JournalEntryRecord[]) => void;
  onError?: (error: FirestoreError) => void;
  /** ISO date (YYYY-MM-DD). Pass null to load the whole ledger. */
  since?: string | null;
}) {
  // `date` is the entry's own ISO business date, written by postJournalEntry, so the range
  // is a plain string comparison and needs no composite index.
  const constraints = since
    ? [where("date", ">=", since), orderBy("date", "desc")]
    : [orderBy("createdAt", "desc")];

  return onSnapshot(
    query(collection(db, JOURNAL_ENTRIES_COLLECTION), ...constraints),
    (snapshot) => onData(snapshot.docs.map(deserializeEntry)),
    onError,
  );
}

export function subscribeToChartOfAccounts({
  onData,
  onError,
}: {
  onData: (accounts: AccountRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    collection(db, ACCOUNTS_COLLECTION),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((docSnapshot) => docSnapshot.data() as AccountRecord)
          .sort((a, b) => a.code.localeCompare(b.code)),
      );
    },
    onError,
  );
}
