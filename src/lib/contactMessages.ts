import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { STOREFRONT_SITE_ID } from "./storefrontRepository";

export const CONTACT_MESSAGES_COLLECTION = "contactMessages";
export const CONTACT_MESSAGE_SCHEMA_VERSION = 1;

const contactMessagesRef = collection(db, "sites", STOREFRONT_SITE_ID, CONTACT_MESSAGES_COLLECTION);

export interface CreateContactMessageInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactMessageRecord extends CreateContactMessageInput {
  id: string;
  schemaVersion: number;
  createdAt: string | null;
}

function parseTimestamp(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return null;
}

function deserializeContactMessage(snapshot: QueryDocumentSnapshot<DocumentData>): ContactMessageRecord {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    schemaVersion: Number(data.schemaVersion ?? CONTACT_MESSAGE_SCHEMA_VERSION),
    name: String(data.name ?? ""),
    email: String(data.email ?? ""),
    subject: String(data.subject ?? ""),
    message: String(data.message ?? ""),
    createdAt: parseTimestamp(data.createdAt),
  };
}

export async function createContactMessage(input: CreateContactMessageInput) {
  const messageRef = doc(contactMessagesRef);

  await setDoc(messageRef, {
    schemaVersion: CONTACT_MESSAGE_SCHEMA_VERSION,
    name: input.name.trim(),
    email: input.email.trim(),
    subject: input.subject.trim(),
    message: input.message.trim(),
    createdAt: serverTimestamp(),
  });

  return {
    id: messageRef.id,
  };
}

export function subscribeToContactMessages({
  onData,
  onError,
}: {
  onData: (messages: ContactMessageRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(contactMessagesRef, orderBy("createdAt", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((documentSnapshot) => deserializeContactMessage(documentSnapshot)));
    },
    onError,
  );
}
