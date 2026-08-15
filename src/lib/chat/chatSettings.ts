import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  CHAT_COLLECTIONS,
  CHAT_SETTINGS_DOC_ID,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettingsRecord,
} from "./types";

const settingsDocRef = doc(db, CHAT_COLLECTIONS.SETTINGS, CHAT_SETTINGS_DOC_ID);

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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Fills in every field from {@link DEFAULT_CHAT_SETTINGS}, so a document written
 * by an older build (or no document at all) still yields a complete record and
 * the settings form never has to guard each field itself.
 */
export function deserializeChatSettings(data: Record<string, unknown> | undefined): ChatSettingsRecord {
  const source = data ?? {};
  const facebook = asRecord(source.facebook);
  const widget = asRecord(source.widget);
  const position = asString(widget.position, DEFAULT_CHAT_SETTINGS.widget.position);

  return {
    isActive: asBoolean(source.isActive, DEFAULT_CHAT_SETTINGS.isActive),
    botName: asString(source.botName, DEFAULT_CHAT_SETTINGS.botName),
    welcomeMessage: asString(source.welcomeMessage, DEFAULT_CHAT_SETTINGS.welcomeMessage),
    basePrompt: asString(source.basePrompt, DEFAULT_CHAT_SETTINGS.basePrompt),
    knowledgePoints: Array.isArray(source.knowledgePoints)
      ? source.knowledgePoints.filter((point): point is string => typeof point === "string")
      : DEFAULT_CHAT_SETTINGS.knowledgePoints,
    handoverThreshold: asNumber(source.handoverThreshold, DEFAULT_CHAT_SETTINGS.handoverThreshold),
    model: asString(source.model, DEFAULT_CHAT_SETTINGS.model),
    temperature: asNumber(source.temperature, DEFAULT_CHAT_SETTINGS.temperature),
    facebook: {
      isActive: asBoolean(facebook.isActive, DEFAULT_CHAT_SETTINGS.facebook.isActive),
      pageId: asString(facebook.pageId, DEFAULT_CHAT_SETTINGS.facebook.pageId),
      pageAccessToken: asString(
        facebook.pageAccessToken,
        DEFAULT_CHAT_SETTINGS.facebook.pageAccessToken,
      ),
      instagramAccountId: asString(
        facebook.instagramAccountId,
        DEFAULT_CHAT_SETTINGS.facebook.instagramAccountId,
      ),
      instagramIsActive: asBoolean(
        facebook.instagramIsActive,
        DEFAULT_CHAT_SETTINGS.facebook.instagramIsActive,
      ),
      replyToComments: asBoolean(
        facebook.replyToComments,
        DEFAULT_CHAT_SETTINGS.facebook.replyToComments,
      ),
    },
    widget: {
      isActive: asBoolean(widget.isActive, DEFAULT_CHAT_SETTINGS.widget.isActive),
      primaryColor: asString(widget.primaryColor, DEFAULT_CHAT_SETTINGS.widget.primaryColor),
      position: position === "bottom-left" ? "bottom-left" : "bottom-right",
    },
    updatedAt: parseTimestamp(source.updatedAt),
  };
}

/**
 * Streams the single settings document. A missing document resolves to the
 * defaults rather than null, so the admin form renders on a fresh install.
 */
export function subscribeToChatSettings({
  onData,
  onError,
}: {
  onData: (settings: ChatSettingsRecord) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    settingsDocRef,
    (snapshot: DocumentSnapshot<DocumentData>) => {
      onData(deserializeChatSettings(snapshot.exists() ? snapshot.data() : undefined));
    },
    onError,
  );
}

/**
 * Merge-writes a partial update. `updatedAt` is always stamped server-side so a
 * client clock cannot make a stale save look newer than it is.
 */
export async function saveChatSettings(patch: Partial<Omit<ChatSettingsRecord, "updatedAt">>) {
  await setDoc(
    settingsDocRef,
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
