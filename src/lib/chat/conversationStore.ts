import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  CHAT_COLLECTIONS,
  type ChatChannel,
  type ChatConversationRecord,
  type ChatConversationStatus,
  type ChatMessageRecord,
  type ChatMessageRole,
} from "./types";

/** The admin list stays bounded; older threads are reached by filtering. */
const CONVERSATION_PAGE_SIZE = 100;
const MESSAGE_PAGE_SIZE = 200;

const conversationsRef = collection(db, CHAT_COLLECTIONS.CONVERSATIONS);

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

function asChannel(value: unknown): ChatChannel {
  return value === "instagram" || value === "widget" || value === "admin_test" ? value : "facebook";
}

function asStatus(value: unknown): ChatConversationStatus {
  return value === "handover" ||
    value === "admin_active" ||
    value === "resolved" ||
    value === "abandoned"
    ? value
    : "active";
}

function asRole(value: unknown): ChatMessageRole {
  return value === "assistant" || value === "admin" || value === "system" ? value : "user";
}

function deserializeConversation(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ChatConversationRecord {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    schemaVersion: Number(data.schemaVersion ?? 1),
    channel: asChannel(data.channel),
    status: asStatus(data.status),
    externalUserId: typeof data.externalUserId === "string" ? data.externalUserId : null,
    userId: typeof data.userId === "string" ? data.userId : null,
    customerName: typeof data.customerName === "string" ? data.customerName : null,
    customerPhone: typeof data.customerPhone === "string" ? data.customerPhone : null,
    messageCount: Number(data.messageCount ?? 0),
    lastMessagePreview: String(data.lastMessagePreview ?? ""),
    lastMessageAt: parseTimestamp(data.lastMessageAt),
    handoverReason: typeof data.handoverReason === "string" ? data.handoverReason : null,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

function deserializeMessage(snapshot: QueryDocumentSnapshot<DocumentData>): ChatMessageRecord {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    role: asRole(data.role),
    content: String(data.content ?? ""),
    toolName: typeof data.toolName === "string" ? data.toolName : null,
    authorName: typeof data.authorName === "string" ? data.authorName : null,
    createdAt: parseTimestamp(data.createdAt),
  };
}

/**
 * Streams the conversation list, newest activity first.
 *
 * Uses the single-field `lastMessageAt` index; the channel and status filters
 * are applied in the UI so switching a filter needs no extra Firestore read and
 * no extra composite index.
 */
export function subscribeToChatConversations({
  onData,
  onError,
}: {
  onData: (conversations: ChatConversationRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(conversationsRef, orderBy("lastMessageAt", "desc"), limit(CONVERSATION_PAGE_SIZE)),
    (snapshot) => {
      onData(snapshot.docs.map((documentSnapshot) => deserializeConversation(documentSnapshot)));
    },
    onError,
  );
}

/** Streams one thread's messages, oldest first — reading order. */
export function subscribeToChatMessages(
  conversationId: string,
  {
    onData,
    onError,
  }: {
    onData: (messages: ChatMessageRecord[]) => void;
    onError?: (error: FirestoreError) => void;
  },
) {
  const messagesRef = collection(
    doc(conversationsRef, conversationId),
    CHAT_COLLECTIONS.MESSAGES,
  );

  return onSnapshot(
    query(messagesRef, orderBy("createdAt", "asc"), limit(MESSAGE_PAGE_SIZE)),
    (snapshot) => {
      onData(snapshot.docs.map((documentSnapshot) => deserializeMessage(documentSnapshot)));
    },
    onError,
  );
}

export const CHANNEL_LABELS: Record<ChatChannel, string> = {
  facebook: "Messenger",
  instagram: "Instagram",
  widget: "Вэб",
  admin_test: "Тест",
};

export const STATUS_LABELS: Record<ChatConversationStatus, { mn: string; en: string }> = {
  active: { mn: "Бот хариулж байна", en: "Bot handling" },
  handover: { mn: "Хүн хүлээж байна", en: "Awaiting human" },
  admin_active: { mn: "Ажилтан хариулж байна", en: "Admin replying" },
  resolved: { mn: "Шийдэгдсэн", en: "Resolved" },
  abandoned: { mn: "Орхигдсон", en: "Abandoned" },
};

/**
 * Threads needing a human, most urgent first. Drives the sidebar badge, so the
 * admin sees an escalation without opening the section.
 */
export function countAwaitingHuman(conversations: ChatConversationRecord[]): number {
  return conversations.filter((conversation) => conversation.status === "handover").length;
}
