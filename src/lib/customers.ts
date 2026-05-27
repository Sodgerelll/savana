import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export const CUSTOMERS_COLLECTION = "customers";
export const CUSTOMER_SCHEMA_VERSION = 1;

export type CustomerType = "organization" | "individual";
export type CustomerStatus = "active" | "inactive";

export interface CustomerAddress {
  region: string;
  districtOrSoum: string;
  khorooOrBag: string;
  streetAddress: string;
}

export interface CustomerRecord {
  id: string;
  code: string;
  type: CustomerType;
  name: string;
  displayName: string;
  registrationNumber: string | null;
  contactPerson: string | null;
  phoneNumber: string;
  secondaryPhone: string | null;
  email: string | null;
  address: CustomerAddress | null;
  note: string;
  tags: string[];
  totalSales: number;
  totalPaid: number;
  outstandingBalance: number;
  lastTransactionAt: string | null;
  status: CustomerStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CustomerDraftInput {
  code: string;
  type: CustomerType;
  name: string;
  displayName?: string;
  registrationNumber?: string | null;
  contactPerson?: string | null;
  phoneNumber: string;
  secondaryPhone?: string | null;
  email?: string | null;
  address?: CustomerAddress | null;
  note?: string;
  tags?: string[];
  status?: CustomerStatus;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

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

export function createEmptyCustomerDraft(): CustomerRecord {
  return {
    id: "",
    code: "",
    type: "individual",
    name: "",
    displayName: "",
    registrationNumber: null,
    contactPerson: null,
    phoneNumber: "",
    secondaryPhone: null,
    email: null,
    address: null,
    note: "",
    tags: [],
    totalSales: 0,
    totalPaid: 0,
    outstandingBalance: 0,
    lastTransactionAt: null,
    status: "active",
    createdAt: null,
    updatedAt: null,
  };
}

function deserializeCustomer(snapshot: QueryDocumentSnapshot<DocumentData>): CustomerRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const addressData =
    typeof data.address === "object" && data.address !== null
      ? (data.address as Record<string, unknown>)
      : null;

  return {
    id: snapshot.id,
    code: String(data.code ?? ""),
    type: data.type === "organization" ? "organization" : "individual",
    name: String(data.name ?? ""),
    displayName: String(data.displayName ?? ""),
    registrationNumber: typeof data.registrationNumber === "string" ? data.registrationNumber : null,
    contactPerson: typeof data.contactPerson === "string" ? data.contactPerson : null,
    phoneNumber: String(data.phoneNumber ?? ""),
    secondaryPhone: typeof data.secondaryPhone === "string" ? data.secondaryPhone : null,
    email: typeof data.email === "string" ? data.email : null,
    address: addressData
      ? {
          region: String(addressData.region ?? ""),
          districtOrSoum: String(addressData.districtOrSoum ?? ""),
          khorooOrBag: String(addressData.khorooOrBag ?? ""),
          streetAddress: String(addressData.streetAddress ?? ""),
        }
      : null,
    note: String(data.note ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag)) : [],
    totalSales: Number(data.totalSales ?? 0),
    totalPaid: Number(data.totalPaid ?? 0),
    outstandingBalance: Number(data.outstandingBalance ?? 0),
    lastTransactionAt: parseTimestamp(data.lastTransactionAt),
    status: data.status === "inactive" ? "inactive" : "active",
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

function serializeCustomerPayload(input: CustomerDraftInput) {
  return {
    schemaVersion: CUSTOMER_SCHEMA_VERSION,
    code: input.code,
    type: input.type,
    name: input.name,
    displayName: input.displayName ?? "",
    registrationNumber: input.registrationNumber ?? null,
    contactPerson: input.contactPerson ?? null,
    phoneNumber: input.phoneNumber,
    secondaryPhone: input.secondaryPhone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    note: input.note ?? "",
    tags: input.tags ?? [],
    status: input.status ?? "active",
  };
}

export async function getNextCustomerCode(): Promise<string> {
  const snapshot = await getDocs(collection(db, CUSTOMERS_COLLECTION));
  let maxNumber = 0;
  snapshot.docs.forEach((docSnapshot) => {
    const code = String(docSnapshot.data().code ?? "");
    const match = code.match(/CUS-(\d+)/);
    if (match) {
      const num = Number(match[1]);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  });
  return `CUS-${String(maxNumber + 1).padStart(4, "0")}`;
}

export async function createCustomer(input: CustomerDraftInput): Promise<string> {
  const ref = doc(collection(db, CUSTOMERS_COLLECTION));
  await setDoc(ref, {
    ...serializeCustomerPayload(input),
    totalSales: 0,
    totalPaid: 0,
    outstandingBalance: 0,
    lastTransactionAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCustomer(id: string, input: CustomerDraftInput): Promise<void> {
  await updateDoc(doc(db, CUSTOMERS_COLLECTION, id), {
    ...serializeCustomerPayload(input),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
}

export function subscribeToCustomers({
  onData,
  onError,
}: {
  onData: (customers: CustomerRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, CUSTOMERS_COLLECTION), orderBy("createdAt", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((docSnapshot) => deserializeCustomer(docSnapshot)));
    },
    onError,
  );
}
