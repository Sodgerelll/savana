// Server-side reader for chat_settings/main.
//
// The client mirror lives in src/lib/chat/chatSettings.ts; both are kept small
// and defaulted rather than shared, matching how api/_lib re-implements its
// helpers instead of importing across the runtime boundary.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CHAT_SETTINGS_PATH = 'chat_settings/main';

export interface ServerChatSettings {
  isActive: boolean;
  botName: string;
  welcomeMessage: string;
  handoverThreshold: number;
  model: string;
  temperature: number;
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

  return {
    isActive: asBoolean(source.isActive, defaults.isActive),
    botName: asString(source.botName, defaults.botName),
    welcomeMessage: asString(source.welcomeMessage, defaults.welcomeMessage),
    handoverThreshold: asNumber(source.handoverThreshold, defaults.handoverThreshold),
    model: asString(source.model, defaults.model),
    temperature: asNumber(source.temperature, defaults.temperature),
    facebook: {
      isActive: asBoolean(facebook.isActive, defaults.facebook.isActive),
      pageId: asString(facebook.pageId, defaults.facebook.pageId),
      pageAccessToken: asString(facebook.pageAccessToken, defaults.facebook.pageAccessToken),
      instagramAccountId: asString(facebook.instagramAccountId, defaults.facebook.instagramAccountId),
      instagramIsActive: asBoolean(facebook.instagramIsActive, defaults.facebook.instagramIsActive),
      replyToComments: asBoolean(facebook.replyToComments, defaults.facebook.replyToComments),
    },
    widget: { isActive: asBoolean(widget.isActive, defaults.widget.isActive) },
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

export async function loadChatSettings(db: any): Promise<ServerChatSettings> {
  try {
    const snapshot = await db.doc(CHAT_SETTINGS_PATH).get();
    return applyFacebookEnv(deserializeServerChatSettings(snapshot.exists ? snapshot.data() : null));
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
