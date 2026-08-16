import {
  collection,
  doc,
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
import { reserveDocumentNumber } from "./documentNumbers";
import { normalizeContactPhone } from "./crmContacts";

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
    // The join key between this reseller ledger and the buyer directory in /crmContacts.
    // The two collections describe the same people from different sides — a reseller who
    // also buys at retail has a row in each — and without a shared key there was no way to
    // tell that. Digits only, matching how crmContacts stores it.
    phoneDigits: normalizeContactPhone(input.phoneNumber),
    secondaryPhone: input.secondaryPhone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    note: input.note ?? "",
    tags: input.tags ?? [],
    status: input.status ?? "active",
  };
}

export function getNextCustomerCode(): Promise<string> {
  return reserveDocumentNumber("customer");
}

export async function createCustomer(input: CustomerDraftInput): Promise<string> {
  const ref = doc(collection(db, CUSTOMERS_COLLECTION));
  await setDoc(ref, {
    ...serializeCustomerPayload(input),
    totalSales: 0,
    totalPaid: 0,
    outstandingBalance: 0,
    lastTransactionAt: null,
    // The wholesale/transfer screens read the same customer document through a wider view
    // (src/types/crm.ts). Seeding their fields here means a customer created from this side
    // shows up there fully formed instead of as a row of blanks and zeroes.
    category: "REGULAR",
    discountRate: 0,
    priceTier: "RETAIL",
    paymentTermDays: 0,
    creditLimit: 0,
    totalOrders: 0,
    totalReturns: 0,
    lastOrderDate: null,
    isActive: (input.status ?? "active") === "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCustomer(id: string, input: CustomerDraftInput): Promise<void> {
  await updateDoc(doc(db, CUSTOMERS_COLLECTION, id), {
    ...serializeCustomerPayload(input),
    // Kept in step with `status` so the wholesale screens' active filter agrees with this one.
    isActive: (input.status ?? "active") === "active",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCustomer(id: string): Promise<void> {
  await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
}

/**
 * The buyer-directory contact and the reseller record that describe the same person,
 * matched on the phone number's digits.
 *
 * The two collections are deliberately separate — one carries balances and consignment
 * stock, the other simply records who bought — but they were also completely unjoinable,
 * so a reseller who also shopped at retail appeared as two unrelated people and their
 * total spend could not be answered at all.
 */
export function linkCustomersToContacts<C extends { id: string; phoneNumber: string }>(
  customers: readonly CustomerRecord[],
  contacts: readonly C[],
): Map<string, C> {
  const byDigits = new Map<string, C>();
  for (const contact of contacts) {
    const digits = normalizeContactPhone(contact.phoneNumber);
    if (digits) byDigits.set(digits, contact);
  }

  const linked = new Map<string, C>();
  for (const customer of customers) {
    const match = byDigits.get(normalizeContactPhone(customer.phoneNumber));
    if (match) linked.set(customer.id, match);
  }

  return linked;
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
