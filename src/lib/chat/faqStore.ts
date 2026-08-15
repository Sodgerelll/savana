import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { CHAT_COLLECTIONS, type ChatFaqRecord } from "./types";

const faqsRef = collection(db, CHAT_COLLECTIONS.FAQS);

export interface ChatFaqDraft {
  question: string;
  answer: string;
  topic: string;
  order: number;
  isActive: boolean;
}

export function createEmptyFaqDraft(order = 0): ChatFaqDraft {
  return { question: "", answer: "", topic: "", order, isActive: true };
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

function deserializeFaq(snapshot: QueryDocumentSnapshot<DocumentData>): ChatFaqRecord {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    question: String(data.question ?? ""),
    answer: String(data.answer ?? ""),
    topic: String(data.topic ?? ""),
    order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : 0,
    // Missing means active: entries written before the flag existed should keep
    // feeding the bot rather than silently disappearing from its knowledge.
    isActive: data.isActive !== false,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

/**
 * Streams the knowledge base, ordered the way the bot reads it. Sorting happens
 * client-side so an entry saved without an `order` still appears in the admin
 * list instead of being dropped by an orderBy.
 */
export function subscribeToChatFaqs({
  onData,
  onError,
}: {
  onData: (faqs: ChatFaqRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(faqsRef),
    (snapshot) => {
      const faqs = snapshot.docs.map((documentSnapshot) => deserializeFaq(documentSnapshot));
      faqs.sort((a, b) => a.order - b.order || a.question.localeCompare(b.question, "mn"));
      onData(faqs);
    },
    onError,
  );
}

function normalizeDraft(draft: ChatFaqDraft) {
  return {
    question: draft.question.trim(),
    answer: draft.answer.trim(),
    topic: draft.topic.trim(),
    order: Number.isFinite(draft.order) ? draft.order : 0,
    isActive: draft.isActive,
  };
}

export async function createChatFaq(draft: ChatFaqDraft): Promise<string> {
  const faqRef = doc(faqsRef);

  await setDoc(faqRef, {
    ...normalizeDraft(draft),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return faqRef.id;
}

export async function updateChatFaq(id: string, draft: ChatFaqDraft): Promise<void> {
  await updateDoc(doc(faqsRef, id), {
    ...normalizeDraft(draft),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteChatFaq(id: string): Promise<void> {
  await deleteDoc(doc(faqsRef, id));
}

export async function setChatFaqActive(id: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(faqsRef, id), { isActive, updatedAt: serverTimestamp() });
}

/**
 * Writes a generated batch in one commit so the knowledge base never shows a
 * half-imported list. Firestore caps a batch at 500 writes; the generator is
 * limited well below that, but the guard keeps the failure legible.
 */
export async function createChatFaqsBatch(drafts: ChatFaqDraft[]): Promise<number> {
  if (drafts.length === 0) {
    return 0;
  }
  if (drafts.length > 400) {
    throw new Error("Нэг удаад 400-аас олон FAQ нэмэх боломжгүй.");
  }

  const batch = writeBatch(db);

  for (const draft of drafts) {
    batch.set(doc(faqsRef), {
      ...normalizeDraft(draft),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  return drafts.length;
}
