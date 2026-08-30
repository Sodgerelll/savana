// Shared vocabulary for the AI chat module.
//
// The serverless side (api/chat/**) deliberately re-declares the small subset it
// needs rather than importing from here: it runs in Vercel's Node runtime under
// its own tsconfig, the same reason api/_lib/* re-implements its helpers.

/**
 * What a conversation turned out to be about.
 *
 * Re-declared here rather than imported from api/chat/_lib/topics.ts, for the
 * reason at the top of this file. A test holds the two lists to each other so
 * they cannot drift apart in silence.
 */
export type ChatTopic =
  | "order"
  | "delivery"
  | "payment"
  | "price"
  | "product"
  | "complaint"
  | "other";

export const CHAT_TOPIC_VALUES = [
  "order",
  "delivery",
  "payment",
  "price",
  "product",
  "complaint",
  "other",
] as const;

export const CHAT_TOPIC_LABELS: Record<ChatTopic, string> = {
  order: "Захиалга",
  delivery: "Хүргэлт",
  payment: "Төлбөр",
  price: "Үнэ",
  product: "Бүтээгдэхүүн",
  complaint: "Гомдол",
  other: "Бусад",
};

export function isTopic(value: unknown): value is ChatTopic {
  return typeof value === "string" && (CHAT_TOPIC_VALUES as readonly string[]).includes(value);
}

/** Where a conversation came from. `admin_test` never reaches a real customer. */
export type ChatChannel = "facebook" | "instagram" | "widget" | "admin_test";
export const CHAT_CHANNEL_VALUES = ["facebook", "instagram", "widget", "admin_test"] as const;

/**
 * - `active` — the bot is handling it
 * - `handover` — the bot asked for a human and nobody has replied yet
 * - `admin_active` — a human is replying; the bot stays quiet
 * - `resolved` / `abandoned` — closed, by an admin or by silence
 */
export type ChatConversationStatus = "active" | "handover" | "admin_active" | "resolved" | "abandoned";
export const CHAT_CONVERSATION_STATUS_VALUES = [
  "active",
  "handover",
  "admin_active",
  "resolved",
  "abandoned",
] as const;

/** `admin` marks a message a human typed, so the UI can tell it from the bot. */
export type ChatMessageRole = "user" | "assistant" | "admin" | "system";
export const CHAT_MESSAGE_ROLE_VALUES = ["user", "assistant", "admin", "system"] as const;

export type ChatLeadType = "order" | "inquiry" | "complaint" | "callback";
export const CHAT_LEAD_TYPE_VALUES = ["order", "inquiry", "complaint", "callback"] as const;

export type ChatLeadStatus = "new" | "processing" | "converted" | "dismissed";
export const CHAT_LEAD_STATUS_VALUES = ["new", "processing", "converted", "dismissed"] as const;

export const CHAT_COLLECTIONS = {
  CONVERSATIONS: "chat_conversations",
  /** Subcollection under a conversation document. */
  MESSAGES: "messages",
  FAQS: "chat_faqs",
  SETTINGS: "chat_settings",
  LEADS: "chat_leads",
} as const;

/** SAVANA is a single storefront, so the settings collection holds one document. */
export const CHAT_SETTINGS_DOC_ID = "main";

export const CHAT_SCHEMA_VERSION = 1;

export const CHAT_LIMITS = {
  MAX_MESSAGE_LENGTH: 1000,
  /** Turns of history sent to the model — matches the cap inside api/chat/_lib/gemini.ts. */
  MAX_HISTORY_MESSAGES: 20,
  /** Client-side debounce so a held Enter key cannot spam the API route. */
  CLIENT_RATE_LIMIT_MS: 1500,
  REQUEST_TIMEOUT_MS: 40_000,
} as const;

export interface ChatMessageRecord {
  id: string;
  role: ChatMessageRole;
  content: string;
  /** Set when the bot answered by invoking a tool rather than writing prose. */
  toolName: string | null;
  /** Display name of the admin who typed this, for `role: "admin"` messages. */
  authorName: string | null;
  createdAt: string | null;
}

export interface ChatConversationRecord {
  id: string;
  schemaVersion: number;
  channel: ChatChannel;
  status: ChatConversationStatus;
  /** Platform-side sender id (Facebook PSID / Instagram IGSID). Null for the widget. */
  externalUserId: string | null;
  /** Firebase uid when a signed-in customer used the widget — drives the owner read rule. */
  userId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  messageCount: number;
  /** Preview text for the conversation list, so the list needs no subcollection reads. */
  lastMessagePreview: string;
  lastMessageAt: string | null;
  /** Why the bot escalated, shown to the admin picking the thread up. */
  handoverReason: string | null;
  /** What the thread is about, worked out from the turn rather than asked for. */
  topic: ChatTopic | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChatFaqRecord {
  id: string;
  question: string;
  answer: string;
  /** Free-text grouping shown in the admin list; not tied to storefront categories. */
  topic: string;
  order: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChatLeadRecord {
  id: string;
  schemaVersion: number;
  type: ChatLeadType;
  status: ChatLeadStatus;
  conversationId: string;
  channel: ChatChannel;
  customerName: string;
  customerPhone: string;
  /** Delivery address as the customer typed it in the chat. Empty when never asked. */
  address: string;
  note: string;
  /** Products the customer named in chat — an admin turns these into an order. */
  items: ChatLeadItem[];
  /** Set once an admin converts the lead; links to the created order document. */
  convertedOrderId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChatLeadItem {
  productId: number | null;
  name: string;
  variant: string | null;
  quantity: number;
}

export interface ChatSettingsRecord {
  isActive: boolean;
  botName: string;
  welcomeMessage: string;
  /** Appended to the generated system prompt; the admin's own house rules. */
  basePrompt: string;
  /** Short facts the bot should know that do not belong in a FAQ entry. */
  knowledgePoints: string[];
  /** Consecutive bot failures before it offers a human. */
  handoverThreshold: number;
  /** Model id from the admin picker; empty means use the server's default chain. */
  model: string;
  temperature: number;
  /** Facebook's persistent menu, in order. Mirrors api/chat/_lib/settings.ts. */
  menuButtons: ChatButton[];
  /** Offered once, after Get Started. */
  quickReplies: ChatButton[];
  widget: ChatWidgetSettings;
  updatedAt: string | null;
}
// Facebook and Instagram are deliberately absent. The page token is a bearer
// credential that can post as the brand, so it is configured in the deployment
// environment (FB_PAGE_ACCESS_TOKEN) and read only by api/chat/**. Nothing in
// the admin bundle stores it, renders it, or can overwrite it.

/**
 * Buttons the shop can put in front of a customer. The action set is fixed —
 * each one runs a tool, and a button the webhook does not recognise is a button
 * that does nothing when pressed.
 */
export const CHAT_BUTTON_ACTIONS = [
  "SHOW_PRODUCTS",
  "SHOW_PROMOTIONS",
  "TRANSFER_TO_STAFF",
  "RESUME_BOT",
] as const;

export type ChatButtonAction = (typeof CHAT_BUTTON_ACTIONS)[number];

export interface ChatButton {
  title: string;
  action: ChatButtonAction;
}

export const DEFAULT_MENU_BUTTONS: ChatButton[] = [
  { title: "Бүтээгдэхүүн 🌿", action: "SHOW_PRODUCTS" },
  { title: "Хямдрал 🎁", action: "SHOW_PROMOTIONS" },
  { title: "Ажилтантай ярих ☎️", action: "TRANSFER_TO_STAFF" },
  { title: "Ботруу буцах 🤖", action: "RESUME_BOT" },
];

export const DEFAULT_QUICK_REPLIES: ChatButton[] = [
  { title: "Бүтээгдэхүүн 🌿", action: "SHOW_PRODUCTS" },
  { title: "Хямдрал 🎁", action: "SHOW_PROMOTIONS" },
  { title: "Ажилтантай ярих ☎️", action: "TRANSFER_TO_STAFF" },
];

export interface ChatWidgetSettings {
  isActive: boolean;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
}

export const DEFAULT_CHAT_SETTINGS: ChatSettingsRecord = {
  isActive: false,
  botName: "SAVANA туслах",
  welcomeMessage: "Сайн байна уу! SAVANA-гийн байгалийн саван, арьс арчилгааны талаар юу асуух вэ?",
  basePrompt: "",
  knowledgePoints: [],
  handoverThreshold: 2,
  model: "",
  temperature: 0.7,
  menuButtons: DEFAULT_MENU_BUTTONS,
  quickReplies: DEFAULT_QUICK_REPLIES,
  widget: {
    isActive: false,
    primaryColor: "#3f5d45",
    position: "bottom-right",
  },
  updatedAt: null,
};
