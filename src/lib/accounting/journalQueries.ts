import {
  collection,
  onSnapshot,
  orderBy,
  query,
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

export function subscribeToJournalEntries({
  onData,
  onError,
}: {
  onData: (entries: JournalEntryRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, JOURNAL_ENTRIES_COLLECTION), orderBy("createdAt", "desc")),
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
