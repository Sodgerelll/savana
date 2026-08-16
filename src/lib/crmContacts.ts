import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { reserveDocumentNumber } from "./documentNumbers";

/**
 * The customer (харилцагч) directory: everyone the shop sells to, whether a walk-in
 * person or an invoiced organization. Kept apart from `customers`, which is the reseller
 * ledger — those carry consignment stock and balances, these are simply who bought.
 */
export const CRM_CONTACTS_COLLECTION = "crmContacts";
export const CRM_CONTACT_SCHEMA_VERSION = 1;

export type CrmContactType = "individual" | "organization";
export type CrmContactStatus = "active" | "inactive";

export interface CrmContactAddress {
  region: string;
  districtOrSoum: string;
  khorooOrBag: string;
  streetAddress: string;
}

export interface CrmContactRecord {
  id: string;
  code: string;
  type: CrmContactType;
  /** The buyer's own name for an individual, the contact person for an organization. */
  fullName: string;
  /** Organizations only — empty for individuals. */
  organizationName: string;
  /** Organization register number (РД / ТТД) — empty for individuals. */
  registrationNumber: string;
  phoneNumber: string;
  secondaryPhone: string;
  email: string | null;
  address: CrmContactAddress | null;
  note: string;
  status: CrmContactStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CrmContactDraftInput {
  code: string;
  type: CrmContactType;
  fullName: string;
  organizationName?: string;
  registrationNumber?: string;
  phoneNumber: string;
  secondaryPhone?: string;
  email?: string | null;
  address?: CrmContactAddress | null;
  note?: string;
  status?: CrmContactStatus;
}

/**
 * Digits only, so "9900-1234", "+976 99001234" and "99001234" all identify the same
 * person. Stored alongside the typed phone as `phoneDigits` and used to match a
 * storefront buyer to the contact they already have here.
 *
 * Mongolian numbers are eight digits, and a +976 in front of one is the same number. This
 * used to strip punctuation only, so a buyer who typed the country code at checkout did
 * not match the contact they already had and got a second directory entry.
 */
export function normalizeContactPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // "00" and "0" are dialling prefixes, never part of a Mongolian number.
  const dialled = digits.replace(/^0+/, "");

  if (dialled.length === 11 && dialled.startsWith("976")) return dialled.slice(3);

  return digits;
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

export function createEmptyCrmContactDraft(): CrmContactRecord {
  return {
    id: "",
    code: "",
    type: "individual",
    fullName: "",
    organizationName: "",
    registrationNumber: "",
    phoneNumber: "",
    secondaryPhone: "",
    email: null,
    address: null,
    note: "",
    status: "active",
    createdAt: null,
    updatedAt: null,
  };
}

/** What to call the contact in a list: the organization when there is one, the person otherwise. */
export function getCrmContactDisplayName(
  contact: Pick<CrmContactRecord, "type" | "fullName" | "organizationName">,
): string {
  if (contact.type === "organization") {
    return contact.organizationName.trim() || contact.fullName.trim();
  }

  return contact.fullName.trim();
}

/**
 * Free-text match used by the customer pickers. Name, organization, phone, code and
 * register number all match, so an admin can type whichever one they have to hand.
 */
export function matchesCrmContactSearch(contact: CrmContactRecord, term: string): boolean {
  const needle = term.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  return [
    contact.fullName,
    contact.organizationName,
    contact.phoneNumber,
    contact.secondaryPhone,
    contact.code,
    contact.registrationNumber,
    contact.email ?? "",
  ].some((field) => field.toLowerCase().includes(needle));
}

export function searchCrmContacts(contacts: CrmContactRecord[], term: string): CrmContactRecord[] {
  return contacts.filter((contact) => matchesCrmContactSearch(contact, term));
}

function deserializeCrmContact(snapshot: QueryDocumentSnapshot<DocumentData>): CrmContactRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const addressData =
    typeof data.address === "object" && data.address !== null
      ? (data.address as Record<string, unknown>)
      : null;

  return {
    id: snapshot.id,
    code: String(data.code ?? ""),
    type: data.type === "organization" ? "organization" : "individual",
    fullName: String(data.fullName ?? ""),
    organizationName: String(data.organizationName ?? ""),
    registrationNumber: String(data.registrationNumber ?? ""),
    phoneNumber: String(data.phoneNumber ?? ""),
    secondaryPhone: String(data.secondaryPhone ?? ""),
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
    status: data.status === "inactive" ? "inactive" : "active",
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

function serializeCrmContactPayload(input: CrmContactDraftInput) {
  const isOrganization = input.type === "organization";

  return {
    schemaVersion: CRM_CONTACT_SCHEMA_VERSION,
    code: input.code,
    type: input.type,
    fullName: input.fullName.trim(),
    // Organization-only fields never linger on a contact switched back to an individual.
    organizationName: isOrganization ? (input.organizationName ?? "").trim() : "",
    registrationNumber: isOrganization ? (input.registrationNumber ?? "").trim() : "",
    phoneNumber: input.phoneNumber.trim(),
    // Kept in step with phoneNumber so the storefront-order sync matches on it.
    phoneDigits: normalizeContactPhone(input.phoneNumber),
    secondaryPhone: (input.secondaryPhone ?? "").trim(),
    email: input.email?.trim() ? input.email.trim() : null,
    address: input.address ?? null,
    note: input.note ?? "",
    status: input.status ?? "active",
  };
}

export function getNextCrmContactCode(): Promise<string> {
  return reserveDocumentNumber("crmContact");
}

export async function createCrmContact(input: CrmContactDraftInput): Promise<string> {
  const ref = doc(collection(db, CRM_CONTACTS_COLLECTION));
  await setDoc(ref, {
    ...serializeCrmContactPayload(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCrmContact(id: string, input: CrmContactDraftInput): Promise<void> {
  await updateDoc(doc(db, CRM_CONTACTS_COLLECTION, id), {
    ...serializeCrmContactPayload(input),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCrmContact(id: string): Promise<void> {
  await deleteDoc(doc(db, CRM_CONTACTS_COLLECTION, id));
}

export function subscribeToCrmContacts({
  onData,
  onError,
}: {
  onData: (contacts: CrmContactRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(collection(db, CRM_CONTACTS_COLLECTION), orderBy("createdAt", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((docSnapshot) => deserializeCrmContact(docSnapshot)));
    },
    onError,
  );
}
