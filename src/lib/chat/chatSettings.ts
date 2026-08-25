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
  CHAT_BUTTON_ACTIONS,
  CHAT_COLLECTIONS,
  CHAT_SETTINGS_DOC_ID,
  DEFAULT_CHAT_SETTINGS,
  type ChatButton,
  type ChatButtonAction,
  type ChatSettingsRecord,
} from "./types";

/** Mirrors asButtons in api/chat/_lib/settings.ts: unusable entries are dropped. */
function asButtons(value: unknown, fallback: ChatButton[]): ChatButton[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const buttons = value
    .map((entry) => asRecord(entry))
    .map((entry) => ({
      title: typeof entry.title === "string" ? entry.title.trim() : "",
      action: entry.action as ChatButtonAction,
    }))
    .filter(
      (entry): entry is ChatButton =>
        entry.title.length > 0 && CHAT_BUTTON_ACTIONS.includes(entry.action),
    );

  // An empty list is a mistake rather than an instruction — a menu with no
  // buttons helps nobody, so the defaults stand.
  return buttons.length > 0 ? buttons : fallback;
}

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
  const widget = asRecord(source.widget);
  const position = asString(widget.position, DEFAULT_CHAT_SETTINGS.widget.position);
  const isActive = asBoolean(source.isActive, DEFAULT_CHAT_SETTINGS.isActive);

  return {
    isActive,
    botName: asString(source.botName, DEFAULT_CHAT_SETTINGS.botName),
    welcomeMessage: asString(source.welcomeMessage, DEFAULT_CHAT_SETTINGS.welcomeMessage),
    basePrompt: asString(source.basePrompt, DEFAULT_CHAT_SETTINGS.basePrompt),
    knowledgePoints: Array.isArray(source.knowledgePoints)
      ? source.knowledgePoints.filter((point): point is string => typeof point === "string")
      : DEFAULT_CHAT_SETTINGS.knowledgePoints,
    handoverThreshold: asNumber(source.handoverThreshold, DEFAULT_CHAT_SETTINGS.handoverThreshold),
    model: asString(source.model, DEFAULT_CHAT_SETTINGS.model),
    temperature: asNumber(source.temperature, DEFAULT_CHAT_SETTINGS.temperature),
    menuButtons: asButtons(source.menuButtons, DEFAULT_CHAT_SETTINGS.menuButtons),
    quickReplies: asButtons(source.quickReplies, DEFAULT_CHAT_SETTINGS.quickReplies),
    // `source.facebook` is read past on purpose: a document written before the
    // credentials moved into the environment may still carry a page token, and
    // nothing in the browser has any business holding one.
    widget: {
      // Mirrors api/chat/_lib/settings.ts: a document saved before this field
      // existed follows the master switch, so the form shows what the server
      // will actually do rather than an off switch the server ignores.
      isActive: asBoolean(widget.isActive, isActive),
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
