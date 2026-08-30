// Conversation and message persistence for the chat webhook.
//
// Everything here runs under the Admin SDK, which bypasses Firestore rules —
// that is why the rules deny all client writes to chat_conversations.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ChatTopic } from './topics.js';

export const CONVERSATIONS_COLLECTION = 'chat_conversations';
export const MESSAGES_SUBCOLLECTION = 'messages';

/** Preview shown in the admin conversation list. */
const PREVIEW_LENGTH = 120;
/** How much history the bot is given; matches the model-side cap. */
export const HISTORY_TURNS = 20;

/**
 * A handover with no admin reply expires, so a customer is not stuck talking to
 * nobody after hours. The bot picks the thread back up when it does.
 */
export const HANDOVER_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * How long the bot stays out of a thread a human has answered.
 *
 * A staff reply used to silence the bot for good, which is right for the next
 * few messages and wrong by the next morning: the customer comes back with an
 * ordinary question and nobody answers it. Three hours is long enough not to
 * interrupt a conversation being handled, short enough that a thread does not
 * stay dead overnight.
 */
export const ADMIN_HANDOVER_TIMEOUT_MS = 3 * 60 * 60 * 1000;

export type ChatChannel = 'facebook' | 'instagram' | 'widget' | 'admin_test';
export type ConversationStatus = 'active' | 'handover' | 'admin_active' | 'resolved' | 'abandoned';
export type MessageRole = 'user' | 'assistant' | 'admin' | 'system';

export interface ConversationRef {
  id: string;
  status: ConversationStatus;
  /** What the thread has been about so far; null until a turn says something. */
  topic: ChatTopic | null;
  messageCount: number;
  customerName: string | null;
  handoverAt: number | null;
  /** When a human last replied here, which is what the bot's silence is timed from. */
  adminActiveAt: number | null;
}

/**
 * A turn as the model may see it. Narrower than {@link MessageRole} on purpose:
 * `admin` and `system` rows are filtered out before this type is produced.
 */
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
}

function preview(text: string): string {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

/**
 * Deterministic document id per person per channel. Using the platform ids
 * directly (rather than a random id plus a lookup query) means a burst of
 * messages from one user can never race into two parallel conversations.
 */
export function conversationIdFor(channel: ChatChannel, pageId: string, externalUserId: string): string {
  const prefix = channel === 'instagram' ? 'ig' : channel === 'facebook' ? 'fb' : channel;
  return `${prefix}_${pageId}_${externalUserId}`.replace(/[/\\.#$[\]]/g, '_').slice(0, 400);
}

/**
 * Loads the conversation, creating it on first contact.
 *
 * `create` races are expected — two messages can arrive together — so a failed
 * create falls through to a read rather than surfacing an error.
 */
export async function ensureConversation(
  db: any,
  params: {
    channel: ChatChannel;
    pageId: string;
    externalUserId: string;
    customerName?: string | null;
    userId?: string | null;
  },
): Promise<ConversationRef> {
  const id = conversationIdFor(params.channel, params.pageId, params.externalUserId);
  const ref = db.collection(CONVERSATIONS_COLLECTION).doc(id);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    const data = snapshot.data() ?? {};
    // Backfill a name that was unavailable when the thread started.
    if (params.customerName && !data.customerName) {
      await ref.update({ customerName: params.customerName, updatedAt: new Date() });
    }
    return {
      id,
      status: (data.status ?? 'active') as ConversationStatus,
      topic: (data.topic as ChatTopic) ?? null,
      messageCount: Number(data.messageCount ?? 0),
      customerName: data.customerName ?? params.customerName ?? null,
      handoverAt: typeof data.handoverAt === 'number' ? data.handoverAt : null,
      adminActiveAt: typeof data.adminActiveAt === 'number' ? data.adminActiveAt : null,
    };
  }

  const now = new Date();
  const seed = {
    schemaVersion: 1,
    channel: params.channel,
    status: 'active' as ConversationStatus,
    externalUserId: params.externalUserId,
    pageId: params.pageId,
    userId: params.userId ?? null,
    customerName: params.customerName ?? null,
    customerPhone: null,
    messageCount: 0,
    lastMessagePreview: '',
    lastMessageAt: now,
    handoverReason: null,
    handoverAt: null,
    adminActiveAt: null,
    topic: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ref.create(seed);
  } catch {
    // Someone else created it a moment ago — read theirs instead of overwriting.
    const existing = await ref.get();
    const data = existing.data() ?? {};
    return {
      id,
      status: (data.status ?? 'active') as ConversationStatus,
      topic: (data.topic as ChatTopic) ?? null,
      messageCount: Number(data.messageCount ?? 0),
      customerName: data.customerName ?? null,
      handoverAt: typeof data.handoverAt === 'number' ? data.handoverAt : null,
      adminActiveAt: typeof data.adminActiveAt === 'number' ? data.adminActiveAt : null,
    };
  }

  return {
    id,
    status: 'active',
    topic: null,
    messageCount: 0,
    customerName: params.customerName ?? null,
    handoverAt: null,
    adminActiveAt: null,
  };
}

/**
 * Appends a message and refreshes the parent's list fields in one batch, so the
 * conversation list can never show a preview that has no message behind it.
 */
export async function appendMessage(
  db: any,
  conversationId: string,
  message: {
    role: MessageRole;
    content: string;
    toolName?: string | null;
    authorName?: string | null;
  },
): Promise<void> {
  const conversationRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);
  const messageRef = conversationRef.collection(MESSAGES_SUBCOLLECTION).doc();
  const now = new Date();

  const batch = db.batch();
  batch.set(messageRef, {
    role: message.role,
    content: message.content,
    toolName: message.toolName ?? null,
    authorName: message.authorName ?? null,
    createdAt: now,
  });
  batch.set(
    conversationRef,
    {
      lastMessagePreview: preview(message.content),
      lastMessageAt: now,
      updatedAt: now,
      // Atomic: two messages arriving together must both be counted.
      messageCount: await increment(1),
    },
    { merge: true },
  );

  await batch.commit();
}

let cachedFieldValue: any = null;

/** Lazily resolves FieldValue so the module loads without the Admin SDK present. */
async function increment(by: number): Promise<any> {
  if (!cachedFieldValue) {
    const module = await import('firebase-admin/firestore');
    cachedFieldValue = module.FieldValue;
  }
  return cachedFieldValue.increment(by);
}

/**
 * Recent turns, oldest first, ready to hand to the model.
 *
 * `admin` and `system` rows are dropped: the model must not replay a human
 * colleague's words as its own voice.
 */
export async function readRecentMessages(
  db: any,
  conversationId: string,
  take = HISTORY_TURNS,
): Promise<StoredMessage[]> {
  const snapshot = await db
    .collection(CONVERSATIONS_COLLECTION)
    .doc(conversationId)
    .collection(MESSAGES_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(take)
    .get();

  return (snapshot.docs ?? [])
    .map((doc: any) => doc.data())
    .filter((data: any) => data?.role === 'user' || data?.role === 'assistant')
    .map((data: any) => ({
      role: data.role as StoredMessage['role'],
      content: String(data.content ?? ''),
    }))
    .filter((entry: StoredMessage) => entry.content.length > 0)
    .reverse();
}

export async function setConversationStatus(
  db: any,
  conversationId: string,
  status: ConversationStatus,
  extra: { handoverReason?: string | null } = {},
): Promise<void> {
  const patch: Record<string, unknown> = { status, updatedAt: new Date() };

  if (status === 'handover') {
    patch.handoverAt = Date.now();
    patch.handoverReason = extra.handoverReason ?? null;
  }
  if (status === 'admin_active') {
    // Re-stamped on every staff reply, so the three hours run from the last
    // thing the human said rather than from the first.
    patch.adminActiveAt = Date.now();
  }
  if (status === 'active') {
    patch.handoverAt = null;
    patch.handoverReason = null;
    patch.adminActiveAt = null;
  }

  await db.collection(CONVERSATIONS_COLLECTION).doc(conversationId).set(patch, { merge: true });
}

/**
 * Whether the bot should stay quiet on this thread.
 *
 * It steps aside while a human is handling the conversation, and comes back
 * once either timeout has run out — better a bot reply than silence. A customer
 * can also ask for it back at any point, which sets the status directly.
 */
export function botShouldStaySilent(conversation: ConversationRef, now = Date.now()): boolean {
  if (conversation.status === 'admin_active') {
    // A thread written before this stamp existed has no way to prove three
    // hours have passed, so it keeps the old behaviour and waits for a human —
    // or for the customer to ask for the bot back.
    return (
      typeof conversation.adminActiveAt !== 'number' ||
      now - conversation.adminActiveAt < ADMIN_HANDOVER_TIMEOUT_MS
    );
  }
  if (conversation.status === 'handover') {
    return conversation.handoverAt !== null && now - conversation.handoverAt < HANDOVER_TIMEOUT_MS;
  }
  return false;
}

/**
 * Records what the thread turned out to be about.
 *
 * Written on its own rather than folded into the message append, because the
 * tool that names the topic is only known once the model has answered — and
 * fire-and-forget at the call site, because this is a label on an admin screen
 * and no customer should wait a Firestore round trip for it.
 */
export async function setConversationTopic(
  db: any,
  conversationId: string,
  topic: ChatTopic,
): Promise<void> {
  try {
    await db
      .collection(CONVERSATIONS_COLLECTION)
      .doc(conversationId)
      .set({ topic, updatedAt: new Date() }, { merge: true });
  } catch (err) {
    console.warn('[chat/conversation] topic not saved:', (err as Error).message);
  }
}
