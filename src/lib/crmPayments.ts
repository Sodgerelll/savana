import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { PAYMENTS_COLLECTION } from "../services/transferService";

/** AR payment recorded from the CRM (customer profile → Төлбөр таб). */
export interface CrmPaymentRecord {
  id: string;
  transferId: string | null;
  customerId: string;
  customerName: string;
  amount: number;
  method: string;
  referenceNumber: string;
  notes: string;
  /** ISO string (converted from the Firestore timestamp). */
  paidAt: string | null;
  createdBy: string;
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

function deserialize(snapshot: QueryDocumentSnapshot<DocumentData>): CrmPaymentRecord {
  const data = snapshot.data() as Record<string, unknown>;
  return {
    id: snapshot.id,
    transferId: typeof data.transferId === "string" ? data.transferId : null,
    customerId: String(data.customerId ?? ""),
    customerName: String(data.customerName ?? ""),
    amount: Number(data.amount ?? 0),
    method: String(data.method ?? ""),
    referenceNumber: String(data.referenceNumber ?? ""),
    notes: String(data.notes ?? ""),
    paidAt: parseTimestamp(data.paidAt) ?? parseTimestamp(data.createdAt),
    createdBy: String(data.createdBy ?? ""),
  };
}

export function subscribeToCrmPayments({
  onData,
  onError,
}: {
  onData: (payments: CrmPaymentRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, PAYMENTS_COLLECTION), orderBy("paidAt", "desc")),
    (snapshot) => onData(snapshot.docs.map(deserialize)),
    onError,
  );
}
