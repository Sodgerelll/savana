// Facebook / Instagram Send API client.
//
// The Page Access Token travels in an Authorization header rather than the
// `?access_token=` query parameter Meta's docs use, so it cannot leak through a
// logged request URL. Graph accepts either.
//
// Instagram Direct arrives on the same webhook and is answered through the same
// endpoints, so every helper here serves both channels.

/* eslint-disable @typescript-eslint/no-explicit-any */

const GRAPH_VERSION = 'v21.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const REQUEST_TIMEOUT_MS = 10_000;

/** Messenger caps a text message near 2000 chars; stay clear of the edge. */
export const TEXT_LIMIT = 1900;
/** Messenger's cap on the text above a button template. */
const BUTTON_TEXT_LIMIT = 640;
/** Messenger's persistent menu limits. */
const MAX_TOP_LEVEL_MENU_ITEMS = 3;
const MAX_SUBMENU_ITEMS = 5;
const MENU_TITLE_LIMIT = 30;
/** Messenger shows at most 13 quick replies, each title at most 20 chars. */
const MAX_QUICK_REPLIES = 13;
const QUICK_REPLY_TITLE_LIMIT = 20;
/** A generic-template carousel holds at most 10 cards. */
const MAX_CAROUSEL_CARDS = 10;
const CARD_TITLE_LIMIT = 80;
const CARD_SUBTITLE_LIMIT = 80;
const CARD_BUTTON_TITLE_LIMIT = 20;

export interface QuickReply {
  title: string;
  payload: string;
}

export interface CarouselCard {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  /** Storefront page for the card. Opens when the customer taps the image. */
  url?: string;
  buttons?: Array<CarouselButton>;
}

/** A postback stays inside Messenger; a url opens the storefront. */
export type CarouselButton =
  | { title: string; payload: string; url?: undefined }
  | { title: string; url: string; payload?: undefined };

/**
 * Splits a long reply into Messenger-sized chunks, breaking at a newline,
 * sentence end or space rather than mid-word — and never between the two halves
 * of a surrogate pair, which would render as a broken emoji.
 */
export function splitText(text: string, limit = TEXT_LIMIT): string[] {
  const value = String(text ?? '');
  if (value.length <= limit) {
    return value.length > 0 ? [value] : [];
  }

  const chunks: string[] = [];
  let rest = value;

  while (rest.length > limit) {
    let cut = findCutPoint(rest, limit);

    // Back off one if we would land between a high and low surrogate — cutting
    // there would leave half an emoji at the end of one message.
    const previous = rest.charCodeAt(cut - 1);
    if (previous >= 0xd800 && previous <= 0xdbff) cut -= 1;
    if (cut <= 0) cut = limit;

    const piece = rest.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    rest = rest.slice(cut).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Picks where to break, preferring a paragraph, then a sentence, then a word
 * boundary. A break is only taken past the halfway mark, so we never emit a
 * near-empty chunk just because an early newline existed.
 */
function findCutPoint(rest: string, limit: number): number {
  const earliest = limit * 0.5;

  const newline = rest.lastIndexOf('\n', limit);
  if (newline >= earliest) {
    return newline;
  }

  // Search from limit - 1 so that cutting *after* the full stop still fits the
  // limit. The +1 keeps the full stop with the sentence it terminates, instead
  // of pushing ". " to the front of the next message.
  const sentenceEnd = rest.lastIndexOf('. ', limit - 1);
  if (sentenceEnd >= earliest) {
    return sentenceEnd + 1;
  }

  const space = rest.lastIndexOf(' ', limit);
  if (space >= earliest) {
    return space;
  }

  // No usable break point (one long unbroken run) — cut at the limit.
  return limit;
}

async function graphPost(
  token: string,
  path: string,
  body: unknown,
  { throwOnError = true }: { throwOnError?: boolean } = {},
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GRAPH_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as any;
      const detail = payload?.error?.message ?? `HTTP ${res.status}`;
      console.error(`[chat/facebook] POST ${path} failed: ${detail}`);
      if (throwOnError) {
        throw new Error(`Facebook рүү илгээж чадсангүй: ${detail}`);
      }
      return null;
    }

    return await res.json().catch(() => ({}));
  } catch (err) {
    if (throwOnError) throw err;
    console.warn(`[chat/facebook] POST ${path} failed:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** `RESPONSE` is only valid inside the 24-hour window; outside it a tag is required. */
function messagingType(tag?: string) {
  return tag ? { messaging_type: 'MESSAGE_TAG', tag } : { messaging_type: 'RESPONSE' };
}

/**
 * Sends a text reply, split across several messages when it is too long.
 * Chunks go out sequentially so they arrive in order.
 */
export async function sendText(
  token: string,
  recipientId: string,
  text: string,
  options: { tag?: string; fallbackTag?: string } = {},
): Promise<void> {
  if (!token) throw new Error('Page access token тохируулаагүй байна.');
  if (!recipientId) throw new Error('Хүлээн авагчийн ID байхгүй.');

  for (const chunk of splitText(text)) {
    const payload = { recipient: { id: recipientId }, message: { text: chunk } };

    try {
      await graphPost(token, '/me/messages', { ...payload, ...messagingType(options.tag) });
    } catch (err) {
      if (!options.fallbackTag) {
        throw err;
      }
      // Inside the 24-hour window a plain RESPONSE is the correct send and a
      // tag is not merely unnecessary — HUMAN_AGENT needs a permission granted
      // only by App Review, so leading with it fails every reply an unreviewed
      // app makes. The tag is what reopens a thread outside the window, so it
      // is worth one retry and nothing more.
      await graphPost(token, '/me/messages', {
        ...payload,
        ...messagingType(options.fallbackTag),
      });
    }
  }
}

/** Best-effort typing indicator; a failure here must never break the reply. */
export async function sendTypingOn(token: string, recipientId: string): Promise<void> {
  if (!token || !recipientId) return;

  await graphPost(
    token,
    '/me/messages',
    { recipient: { id: recipientId }, sender_action: 'typing_on' },
    { throwOnError: false },
  );
}

/**
 * Takes the typing bubble back down.
 *
 * Messenger drops it on its own after about twenty seconds, but a turn that
 * ends without a reply — a thread a person has taken over — should not leave
 * the customer watching dots that were never going to become anything.
 */
export async function sendTypingOff(token: string, recipientId: string): Promise<void> {
  if (!token || !recipientId) return;

  await graphPost(
    token,
    '/me/messages',
    { recipient: { id: recipientId }, sender_action: 'typing_off' },
    { throwOnError: false },
  );
}

export async function sendQuickReplies(
  token: string,
  recipientId: string,
  text: string,
  replies: QuickReply[],
): Promise<void> {
  if (!token || !recipientId) return;

  const quickReplies = (replies ?? []).slice(0, MAX_QUICK_REPLIES).map((reply) => ({
    content_type: 'text',
    title: String(reply.title || reply.payload || '').slice(0, QUICK_REPLY_TITLE_LIMIT),
    payload: reply.payload || reply.title || 'NOOP',
  }));

  if (quickReplies.length === 0) {
    await sendText(token, recipientId, text);
    return;
  }

  await graphPost(
    token,
    '/me/messages',
    {
      recipient: { id: recipientId },
      message: { text: String(text ?? '').slice(0, TEXT_LIMIT), quick_replies: quickReplies },
      ...messagingType(),
    },
    { throwOnError: false },
  );
}

/**
 * Product carousel (generic template). Cards without an image still render, so
 * a product with no photo is shown rather than skipped.
 */
/**
 * A message with buttons under it — used to hand a customer a payment link.
 *
 * A bare URL in a text message is a link the customer has to notice and trust;
 * a button is the one thing on screen to press, and Messenger opens it in its
 * own browser so they never leave the conversation.
 */
export async function sendButtons(
  token: string,
  recipientId: string,
  text: string,
  buttons: CarouselButton[],
): Promise<void> {
  if (!token || !recipientId) return;

  const rendered = (buttons ?? []).slice(0, 3).map((button) => {
    const title = String(button.title).slice(0, CARD_BUTTON_TITLE_LIMIT);
    return button.url
      ? { type: 'web_url', title, url: button.url }
      : { type: 'postback', title, payload: button.payload };
  });

  // Messenger rejects a button template with no buttons, so the words still go
  // out on their own rather than the whole message being lost.
  if (rendered.length === 0) {
    await sendText(token, recipientId, text);
    return;
  }

  await graphPost(token, '/me/messages', {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: String(text ?? '').slice(0, BUTTON_TEXT_LIMIT) || '—',
          buttons: rendered,
        },
      },
    },
    ...messagingType(),
  });
}

export async function sendCarousel(
  token: string,
  recipientId: string,
  cards: CarouselCard[],
): Promise<void> {
  if (!token || !recipientId) return;

  const elements = (cards ?? []).slice(0, MAX_CAROUSEL_CARDS).map((card) => {
    const element: Record<string, unknown> = {
      title: String(card.title ?? '').slice(0, CARD_TITLE_LIMIT) || '—',
    };
    if (card.subtitle) element.subtitle = String(card.subtitle).slice(0, CARD_SUBTITLE_LIMIT);
    if (card.imageUrl) element.image_url = card.imageUrl;
    // Tapping the picture opens the product page; the buttons stay as they are.
    if (card.url) element.default_action = { type: 'web_url', url: card.url };
    if (card.buttons && card.buttons.length > 0) {
      element.buttons = card.buttons.slice(0, 3).map((button) => {
        const title = String(button.title).slice(0, CARD_BUTTON_TITLE_LIMIT);
        return button.url
          ? { type: 'web_url', title, url: button.url }
          : { type: 'postback', title, payload: button.payload };
      });
    }
    return element;
  });

  if (elements.length === 0) {
    return;
  }

  await graphPost(
    token,
    '/me/messages',
    {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'template',
          payload: { template_type: 'generic', elements },
        },
      },
      ...messagingType(),
    },
    { throwOnError: false },
  );
}

/** Formats Gemini accepts, and the ones Messenger actually delivers. */
const VISION_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** ~4 MB decoded. Messenger compresses uploads well below this. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export interface FetchedImage {
  base64: string;
  mimeType: string;
}

/**
 * Downloads an image a customer sent and returns it base64-encoded for Gemini.
 *
 * The URL is a signed Meta CDN link that needs no token. Returns null on
 * anything unexpected — an unreadable photo should make the bot ask what the
 * customer meant, not fail the whole turn.
 */
export async function fetchImageAsBase64(url: string): Promise<FetchedImage | null> {
  if (!url || !/^https:\/\//i.test(url)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }

    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!VISION_MIME_TYPES.includes(mimeType)) {
      return null;
    }

    // Trust the header when present so an oversized file is rejected before
    // it is buffered into memory.
    const declaredLength = Number(res.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_IMAGE_BYTES) {
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return null;
    }

    return { base64: buffer.toString('base64'), mimeType };
  } catch (err) {
    console.warn('[chat/facebook] image download failed:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** First image attachment on an inbound message, if there is one. */
export function firstImageAttachmentUrl(message: any): string | null {
  const attachments = message?.attachments;
  if (!Array.isArray(attachments)) {
    return null;
  }

  const image = attachments.find((entry: any) => entry?.type === 'image' && entry?.payload?.url);
  return image ? String(image.payload.url) : null;
}

/**
 * Public reply under a comment on a page post.
 *
 * Kept short on purpose: this is visible to everyone on the post, so detail
 * belongs in the private reply that follows it.
 */
export async function replyToComment(
  token: string,
  commentId: string,
  message: string,
): Promise<boolean> {
  if (!token || !commentId || !message) {
    return false;
  }

  const result = await graphPost(
    token,
    `/${commentId}/comments`,
    { message: message.slice(0, TEXT_LIMIT) },
    { throwOnError: false },
  );
  return result !== null;
}

/**
 * Opens a Messenger thread from a comment.
 *
 * Meta allows exactly one private reply per comment, and only within 7 days —
 * a second attempt returns an error, which is why a failure here is logged and
 * swallowed rather than retried.
 */
export async function sendPrivateReply(
  token: string,
  commentId: string,
  message: string,
): Promise<boolean> {
  if (!token || !commentId || !message) {
    return false;
  }

  const result = await graphPost(
    token,
    `/${commentId}/private_replies`,
    { message: message.slice(0, TEXT_LIMIT) },
    { throwOnError: false },
  );
  return result !== null;
}

/**
 * The page the token belongs to. The admin screen shows this as the proof that
 * the connection is live: a name can only come back from a token Meta accepts,
 * where a configured-looking environment variable proves nothing.
 */
export async function getPageName(token: string): Promise<string | null> {
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GRAPH_URL}/me?fields=name`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as any;
    return typeof data?.name === 'string' && data.name ? data.name : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Looks up the sender's display name so an admin sees a person, not a PSID.
 * Instagram and privacy-restricted profiles can refuse this, hence the null.
 */
export async function getUserName(token: string, userId: string): Promise<string | null> {
  if (!token || !userId) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GRAPH_URL}/${userId}?fields=name,first_name,last_name`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as any;
    const name = data?.name ?? [data?.first_name, data?.last_name].filter(Boolean).join(' ');
    return name ? String(name) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Installs the greeting, Get Started button and persistent menu on the page.
 * Called from the admin settings screen, not from the webhook.
 */
export async function applyMessengerProfile(
  token: string,
  profile: {
    greeting?: string;
    /** A entry with `items` becomes a submenu; Messenger allows three at the top. */
    menuItems?: Array<{ title: string; payload?: string; items?: Array<{ title: string; payload: string }> }>;
  },
): Promise<void> {
  if (!token) throw new Error('Page access token тохируулаагүй байна.');

  const body: Record<string, unknown> = {
    get_started: { payload: 'GET_STARTED' },
  };

  if (profile.greeting) {
    body.greeting = [{ locale: 'default', text: profile.greeting.slice(0, 160) }];
  }

  if (profile.menuItems && profile.menuItems.length > 0) {
    // Messenger takes three entries at the top level and five inside a submenu.
    // Anything past three used to be dropped here without a word, which is how
    // a menu item can be added, deployed, and never appear.
    if (profile.menuItems.length > MAX_TOP_LEVEL_MENU_ITEMS) {
      console.warn(
        `[chat/facebook] persistent menu has ${profile.menuItems.length} top-level items; ` +
          `Messenger shows ${MAX_TOP_LEVEL_MENU_ITEMS}. Nest the rest under a submenu.`,
      );
    }

    body.persistent_menu = [
      {
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: profile.menuItems.slice(0, MAX_TOP_LEVEL_MENU_ITEMS).map((item) =>
          item.items && item.items.length > 0
            ? {
                type: 'nested',
                title: item.title.slice(0, MENU_TITLE_LIMIT),
                call_to_actions: item.items.slice(0, MAX_SUBMENU_ITEMS).map((child) => ({
                  type: 'postback',
                  title: child.title.slice(0, MENU_TITLE_LIMIT),
                  payload: child.payload,
                })),
              }
            : {
                type: 'postback',
                title: item.title.slice(0, MENU_TITLE_LIMIT),
                payload: item.payload,
              },
        ),
      },
    ];
  }

  await graphPost(token, '/me/messenger_profile', body);
}
