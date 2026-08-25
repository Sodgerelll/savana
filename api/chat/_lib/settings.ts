// Server-side reader for chat_settings/main.
//
// The client mirror lives in src/lib/chat/chatSettings.ts; both are kept small
// and defaulted rather than shared, matching how api/_lib re-implements its
// helpers instead of importing across the runtime boundary.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolvePageToken } from './pageToken.js';

export const CHAT_SETTINGS_PATH = 'chat_settings/main';

/**
 * Buttons the shop can put in front of a customer.
 *
 * A fixed set on purpose: each one runs a tool, and a button whose payload the
 * webhook does not recognise is a button that does nothing when pressed. The
 * shop chooses which appear and what they say, not what they do.
 */
export const BUTTON_ACTIONS = [
  'SHOW_PRODUCTS',
  'SHOW_PROMOTIONS',
  'TRANSFER_TO_STAFF',
  'RESUME_BOT',
] as const;

export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

export interface ChatButton {
  title: string;
  action: ButtonAction;
}

/** Shown on the Facebook menu when the shop has not chosen its own. */
export const DEFAULT_MENU_BUTTONS: ChatButton[] = [
  { title: 'Бүтээгдэхүүн 🌿', action: 'SHOW_PRODUCTS' },
  { title: 'Хямдрал 🎁', action: 'SHOW_PROMOTIONS' },
  { title: 'Ажилтантай ярих ☎️', action: 'TRANSFER_TO_STAFF' },
  { title: 'Ботруу буцах 🤖', action: 'RESUME_BOT' },
];

/** Offered after Get Started when the shop has not chosen its own. */
export const DEFAULT_QUICK_REPLIES: ChatButton[] = [
  { title: 'Бүтээгдэхүүн 🌿', action: 'SHOW_PRODUCTS' },
  { title: 'Хямдрал 🎁', action: 'SHOW_PROMOTIONS' },
  { title: 'Ажилтантай ярих ☎️', action: 'TRANSFER_TO_STAFF' },
];

/** Keeps a stored list usable: unknown actions and blank titles are dropped. */
function asButtons(value: unknown, fallback: ChatButton[]): ChatButton[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const buttons = value
    .map((entry: any) => ({
      title: typeof entry?.title === 'string' ? entry.title.trim() : '',
      action: entry?.action,
    }))
    .filter(
      (entry): entry is ChatButton =>
        entry.title.length > 0 && BUTTON_ACTIONS.includes(entry.action),
    );

  // An empty list means the shop deleted everything, which is a mistake rather
  // than an instruction — a menu with no buttons helps nobody.
  return buttons.length > 0 ? buttons : fallback;
}

export interface ServerChatSettings {
  isActive: boolean;
  botName: string;
  welcomeMessage: string;
  handoverThreshold: number;
  model: string;
  temperature: number;
  /**
   * Whether the system prompt is sent to a context cache and referenced
   * thereafter. On by default because it cuts the input price roughly tenfold;
   * a switch because a cache is a thing that can go wrong on the far side of an
   * API, and when it does the shop needs to be able to turn it off without a
   * deployment.
   */
  promptCacheEnabled: boolean;
  /** Facebook's persistent menu, in order. */
  menuButtons: ChatButton[];
  /** Offered once, after Get Started. */
  quickReplies: ChatButton[];
  facebook: {
    isActive: boolean;
    pageId: string;
    pageAccessToken: string;
    instagramAccountId: string;
    instagramIsActive: boolean;
    replyToComments: boolean;
  };
  widget: {
    isActive: boolean;
  };
}

/** Everything off by default: an unconfigured bot must never answer a customer. */
export const DEFAULT_SERVER_CHAT_SETTINGS: ServerChatSettings = {
  isActive: false,
  botName: 'SAVANA туслах',
  welcomeMessage: 'Сайн байна уу! SAVANA-гийн байгалийн саван, арьс арчилгааны талаар юу асуух вэ?',
  handoverThreshold: 2,
  model: '',
  temperature: 0.7,
  promptCacheEnabled: true,
  menuButtons: DEFAULT_MENU_BUTTONS,
  quickReplies: DEFAULT_QUICK_REPLIES,
  facebook: {
    isActive: false,
    pageId: '',
    pageAccessToken: '',
    instagramAccountId: '',
    instagramIsActive: false,
    replyToComments: false,
  },
  widget: { isActive: false },
};

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function deserializeServerChatSettings(data: any): ServerChatSettings {
  const source = data ?? {};
  const facebook = typeof source.facebook === 'object' && source.facebook !== null ? source.facebook : {};
  const widget = typeof source.widget === 'object' && source.widget !== null ? source.widget : {};
  const defaults = DEFAULT_SERVER_CHAT_SETTINGS;
  const isActive = asBoolean(source.isActive, defaults.isActive);

  return {
    isActive,
    botName: asString(source.botName, defaults.botName),
    welcomeMessage: asString(source.welcomeMessage, defaults.welcomeMessage),
    handoverThreshold: asNumber(source.handoverThreshold, defaults.handoverThreshold),
    model: asString(source.model, defaults.model),
    temperature: asNumber(source.temperature, defaults.temperature),
    promptCacheEnabled: asBoolean(source.promptCacheEnabled, defaults.promptCacheEnabled),
    menuButtons: asButtons(source.menuButtons, defaults.menuButtons),
    quickReplies: asButtons(source.quickReplies, defaults.quickReplies),
    facebook: {
      isActive: asBoolean(facebook.isActive, defaults.facebook.isActive),
      pageId: asString(facebook.pageId, defaults.facebook.pageId),
      pageAccessToken: asString(facebook.pageAccessToken, defaults.facebook.pageAccessToken),
      instagramAccountId: asString(facebook.instagramAccountId, defaults.facebook.instagramAccountId),
      instagramIsActive: asBoolean(facebook.instagramIsActive, defaults.facebook.instagramIsActive),
      replyToComments: asBoolean(facebook.replyToComments, defaults.facebook.replyToComments),
    },
    // The site widget needs no credential, so a switch of its own is one more
    // thing to forget — the same reasoning that gave Facebook no second switch.
    // A document saved before this field existed carries no `widget` key at all,
    // and those installs follow the master switch, which is the only deliberate
    // act there was. A fresh install still answers nobody: the master switch
    // starts off too.
    widget: { isActive: asBoolean(widget.isActive, isActive) },
  };
}

function isEnvTrue(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

function isEnvFalse(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'false';
}

/** True when the deployment, rather than Firestore, supplies the credentials. */
export function facebookComesFromEnv(): boolean {
  return (process.env.FB_PAGE_ACCESS_TOKEN ?? '').trim().length > 0;
}

/**
 * Overlays the Facebook credentials the deployment supplies.
 *
 * A Page Access Token is a bearer credential that can post as the brand, so it
 * belongs in the environment rather than in Firestore, where every admin-role
 * account could read it. The admin screen has no field for any of this — the
 * deployment is the only place Facebook is configured.
 *
 * The environment wins whenever it carries a token; otherwise the stored
 * document is left exactly as it is, so an install configured before this
 * change keeps answering until its variables are in place.
 */
function applyFacebookEnv(settings: ServerChatSettings): ServerChatSettings {
  const pageAccessToken = (process.env.FB_PAGE_ACCESS_TOKEN ?? '').trim();

  if (!pageAccessToken) {
    return settings;
  }

  return {
    ...settings,
    facebook: {
      // A configured token *is* the connection — there is no second switch to
      // forget to turn on. The master `isActive` still gates every channel.
      isActive: true,
      pageId: (process.env.FB_PAGE_ID ?? '').trim() || settings.facebook.pageId,
      pageAccessToken,
      instagramAccountId: (process.env.IG_ACCOUNT_ID ?? '').trim(),
      // Instagram Direct arrives on the same page token, so it rides along by
      // default; a shop with no linked IG account simply never receives one.
      instagramIsActive: !isEnvFalse(process.env.IG_IS_ACTIVE),
      replyToComments: isEnvTrue(process.env.FB_REPLY_TO_COMMENTS),
    },
  };
}

/**
 * Swaps in the page token when the deployment was handed a user token.
 *
 * Meta's own tools hand you both, they look identical, and only one can send
 * a message as the shop — so the code works out which it was given rather
 * than assuming. The answer is cached, so this is one Firestore read.
 */
async function withPageToken(db: any, settings: ServerChatSettings): Promise<ServerChatSettings> {
  if (!settings.facebook.pageAccessToken) {
    return settings;
  }

  const resolved = await resolvePageToken(db, settings.facebook.pageAccessToken, {
    pageId: settings.facebook.pageId || undefined,
  });

  if (!resolved || resolved.token === settings.facebook.pageAccessToken) {
    return settings;
  }

  return {
    ...settings,
    facebook: {
      ...settings.facebook,
      pageAccessToken: resolved.token,
      pageId: resolved.pageId || settings.facebook.pageId,
    },
  };
}

export async function loadChatSettings(db: any): Promise<ServerChatSettings> {
  try {
    const snapshot = await db.doc(CHAT_SETTINGS_PATH).get();
    const settings = applyFacebookEnv(deserializeServerChatSettings(snapshot.exists ? snapshot.data() : null));
    return await withPageToken(db, settings);
  } catch (err) {
    console.error('[chat/settings] load failed:', (err as Error).message);
    return applyFacebookEnv(DEFAULT_SERVER_CHAT_SETTINGS);
  }
}

/**
 * Whether the bot may answer on this channel. Both the global switch and the
 * channel switch must be on, and a page token must exist — without one there is
 * nothing to reply through.
 */
export function canAnswerOnChannel(
  settings: ServerChatSettings,
  channel: 'facebook' | 'instagram' | 'widget',
): boolean {
  if (!settings.isActive) {
    return false;
  }
  if (channel === 'widget') {
    return settings.widget.isActive;
  }
  if (!settings.facebook.isActive || !settings.facebook.pageAccessToken) {
    return false;
  }
  return channel === 'facebook' || settings.facebook.instagramIsActive;
}
