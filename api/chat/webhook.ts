// GET  /api/chat/webhook — Facebook verification handshake
// POST /api/chat/webhook — Facebook Messenger and Instagram Direct events
//
// Instagram Direct arrives here too: when an IG Business account is linked to
// the page, Meta delivers its messages to the same webhook with
// `object: "instagram"`. Everything downstream is channel-agnostic.
//
// Required env vars: FB_VERIFY_TOKEN, FB_PAGE_ACCESS_TOKEN, GEMINI_API_KEY,
// FIREBASE_SERVICE_ACCOUNT_JSON. Strongly recommended: FB_APP_SECRET.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { buildStorefrontPrompt, loadStorefrontContext, storefrontUrl } from './_lib/buildPrompt.js';
import { handleCommentEvent, parseCommentChange } from './_lib/comments.js';
import { matchFaq } from './_lib/faqMatch.js';
import {
  appendMessage,
  botShouldStaySilent,
  ensureConversation,
  readRecentMessages,
  setConversationStatus,
  setConversationTopic,
  type ChatChannel,
} from './_lib/conversation.js';
import {
  fetchImageAsBase64,
  firstImageAttachmentUrl,
  getRecentPosts,
  getUserName,
  sendButtons,
  sendCarousel,
  sendQuickReplies,
  sendText,
  sendTypingOff,
  sendTypingOn,
} from './_lib/facebook.js';
import { classifyTopic, mergeTopic } from './_lib/topics.js';
import { catalogueVocabulary, repairCatalogueWords } from './_lib/factGuard.js';
import { ordersForConversation, placeChatOrder } from './_lib/chatOrder.js';
import {
  markModelHealthy,
  markModelUnhealthy,
  recordChatFailure,
  unhealthyModels,
} from './_lib/diagnostics.js';
import {
  callGemini,
  callGeminiAgent,
  geminiErrorToUserMessage,
  looksLikeOurOwnInstructions,
  primaryModel,
  probeEveryModel,
  shouldEscalateAfterFailure,
} from './_lib/gemini.js';
import { forgetPromptCache, getOrCreatePromptCache } from './_lib/promptCache.js';
import { sweepStaleLeads } from './_lib/followUp.js';
import { sweepPendingChatPayments } from './_lib/orderPaid.js';
import { checkRateLimit, markEventProcessed, releaseEvent } from './_lib/guards.js';
import {
  createChatLead,
  extractName,
  extractPhone,
  findOpenLead,
  isLeadComplete,
  updateChatLead,
} from './_lib/leads.js';
import { canAnswerOnChannel, loadChatSettings, type ServerChatSettings } from './_lib/settings.js';
import {
  CHAT_TOOLS,
  ORDER_DETAILS_ASK,
  runTool,
  TOOL_NAMES,
  type ToolContext,
} from './_lib/tools.js';

// Body parsing is off so the handler sees the bytes Meta actually sent: the
// signature covers the raw payload, and re-serialising a parsed object would
// not reproduce it.
export const config = { maxDuration: 60, api: { bodyParser: false } };

/**
 * What a customer is told when the model reads its own instructions back. Rare,
 * and worth one awkward turn: the alternative is internal material on a screen
 * the shop does not control.
 */
const LEAKED_INSTRUCTION_REPLY =
  'Уучлаарай, сүүлийн мессежийг маань үл ойшооно уу 🌿 Та юу хүсэж байгаагаа дахин бичиж өгөхгүй юу?';

/**
 * How often the typing indicator is renewed while a reply is being written.
 *
 * Messenger drops the bubble after about twenty seconds. A turn that takes
 * longer than that — and one waiting out a slow model does — leaves the
 * customer looking at a thread with nothing happening in it, which reads as the
 * shop having ignored them rather than as an answer on its way.
 */
const TYPING_REFRESH_MS = 8_000;

/**
 * Keeps the typing bubble alive until the reply is ready. Returns the function
 * that stops it, which the caller must run — an interval left behind on a
 * serverless invocation keeps it alive and billing.
 *
 * Raises it once on the way in as well. One was already sent when the message
 * arrived, but that was however long the bookkeeping took ago, and an interval
 * that first fires eight seconds from now cannot refresh a bubble that expired
 * before it started.
 */
function keepTyping(token: string, senderId: string): () => void {
  void sendTypingOn(token, senderId);
  const timer = setInterval(() => void sendTypingOn(token, senderId), TYPING_REFRESH_MS);
  // Node keeps the process alive for a pending interval; this one is a courtesy
  // and must never be the reason a function does not finish.
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Tool calls acted on in one turn. "Хоёр саван, нэг шампунь" is two; a model
 * emitting a dozen is confused, and answering all of them would be a wall of
 * messages rather than a reply.
 */
const MAX_TOOL_CALLS_PER_TURN = 4;

/** Facebook resends when it does not see a 200 within roughly 20 seconds. */
const PER_USER_RATE_LIMIT = { max: 12, windowMs: 60_000 };



/**
 * Asks for the bot back. Not a tool: it changes who owns the thread, and it has
 * to be handled before the silence check that would otherwise swallow it.
 */
const RESUME_BOT_PAYLOAD = 'RESUME_BOT';

const RESUME_BOT_REPLY = 'Дахин туслахад бэлэн боллоо 🌿 Юу асуух вэ?';

/** Offered whenever the thread is handed to a human, so the way back is visible. */
const RESUME_QUICK_REPLY = { title: 'Ботруу буцах 🤖', payload: RESUME_BOT_PAYLOAD };

/** Postback payloads the persistent menu and card buttons can produce. */
const POSTBACK_TO_TOOL: Record<string, string> = {
  SHOW_PRODUCTS: TOOL_NAMES.SHOW_PRODUCTS,
  SHOW_PROMOTIONS: TOOL_NAMES.SHOW_PROMOTIONS,
  TRANSFER_TO_STAFF: TOOL_NAMES.TRANSFER_TO_STAFF,
};

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method === 'GET') {
    handleVerify(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const raw = await readRawBody(req);
  if (!hasValidSignature(req, raw)) {
    res.status(403).send('Forbidden');
    return;
  }

  let body: any;
  try {
    body = raw === null ? req.body ?? {} : JSON.parse(raw);
  } catch {
    console.warn('[chat/webhook] payload was not JSON');
    res.status(400).send('Bad request');
    return;
  }

  if (body.object !== 'page' && body.object !== 'instagram') {
    // Not ours, but acknowledge so Meta stops retrying.
    res.status(200).send('EVENT_RECEIVED');
    return;
  }

  // Work is awaited before responding: a Vercel function may be frozen the
  // instant the response is sent, so anything left running would be dropped.
  // Facebook's ~20s tolerance is comfortably more than a Gemini turn needs.
  try {
    await processWebhookBody(body);
  } catch (err) {
    console.error('[chat/webhook] processing failed:', (err as Error).message);
  }

  res.status(200).send('EVENT_RECEIVED');
}

/**
 * The exact bytes of the delivery. Meta escapes non-ASCII in its payloads, so a
 * signature recomputed from `JSON.stringify(req.body)` would fail on every
 * Mongolian message — the raw stream is the only thing worth hashing.
 *
 * Returns null when something upstream already drained the request, which is
 * the one case the caller cannot verify.
 */
async function readRawBody(req: any): Promise<string | null> {
  if (typeof req.body === 'string') {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString('utf8');
  }

  // Already drained, or not a stream at all: either way the bytes are gone.
  if (req.readableEnded || req.readable === false || typeof req[Symbol.asyncIterator] !== 'function') {
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Meta signs every delivery with the app secret. Without this check anyone who
 * learns the URL can post fabricated events: the bot would message arbitrary
 * PSIDs, spend Gemini quota and file leads for customers who never wrote in.
 *
 * An unset secret means unverified — the behaviour before this check existed,
 * and loud in the log — rather than a webhook that silently stops answering
 * because a variable was never added.
 */
function hasValidSignature(req: any, raw: string | null): boolean {
  const secret = (process.env.FB_APP_SECRET ?? '').trim();

  if (!secret) {
    console.warn('[chat/webhook] FB_APP_SECRET is not set — deliveries are NOT verified');
    return true;
  }

  if (raw === null) {
    console.error('[chat/webhook] request body was already consumed; cannot verify the signature');
    return false;
  }

  const received = Buffer.from(String(req.headers['x-hub-signature-256'] ?? ''));
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`,
  );

  // timingSafeEqual throws on a length mismatch, and a wrong length is already
  // a failure, so the comparison is only reached for same-shaped digests.
  if (received.length !== expected.length) {
    console.warn('[chat/webhook] signature missing or malformed');
    return false;
  }

  if (!timingSafeEqual(received, expected)) {
    console.warn('[chat/webhook] signature did not match');
    return false;
  }

  return true;
}

function handleVerify(req: any, res: any): void {
  const expected = process.env.FB_VERIFY_TOKEN;
  const query = req.query ?? {};
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (!expected) {
    console.error('[chat/webhook] FB_VERIFY_TOKEN is not configured');
    res.status(503).send('Not configured');
    return;
  }

  if (mode === 'subscribe' && token === expected) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }

  console.warn('[chat/webhook] verification rejected');
  res.status(403).send('Forbidden');
}

async function processWebhookBody(body: any): Promise<void> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    console.error('[chat/webhook] FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
    return;
  }
  const db = await dbPromise;
  const settings = await loadChatSettings(db);

  // `object` tells the channel apart: Meta sends "instagram" for IG Direct.
  const channel: ChatChannel = body.object === 'instagram' ? 'instagram' : 'facebook';

  if (!canAnswerOnChannel(settings, channel)) {
    console.log(`[chat/webhook] ${channel} is not enabled; ignoring event`);
    return;
  }

  for (const entry of body.entry ?? []) {
    const pageId = String(entry?.id ?? '');

    for (const event of entry?.messaging ?? []) {
      try {
        await processMessagingEvent(db, settings, channel, pageId, event);
      } catch (err) {
        console.error('[chat/webhook] messaging event failed:', (err as Error).message);
      }
    }

    // Comments on page posts arrive as `changes`, not `messaging`.
    if (settings.facebook.replyToComments) {
      for (const change of entry?.changes ?? []) {
        try {
          await processCommentChange(db, settings, channel, pageId, change);
        } catch (err) {
          console.error('[chat/webhook] comment event failed:', (err as Error).message);
        }
      }
    }
  }

  // Traffic drives the follow-up sweep: Vercel's Hobby cron is daily-only,
  // which is useless for a 20-minute nudge. Internally throttled, so this costs
  // one read on most requests.
  try {
    await sweepStaleLeads(db, { token: settings.facebook.pageAccessToken });
  } catch (err) {
    console.warn('[chat/webhook] follow-up sweep failed:', (err as Error).message);
  }

  // Catches what the payment webhook drops. Internally throttled, so this is
  // one read on almost every request and a handful of calls to Bonum now and
  // then — cheap next to a customer who paid and was never told.
  try {
    await sweepPendingChatPayments(db);
  } catch (err) {
    console.warn('[chat/webhook] payment sweep failed:', (err as Error).message);
  }
}

async function processCommentChange(
  db: any,
  settings: ServerChatSettings,
  channel: ChatChannel,
  pageId: string,
  change: any,
): Promise<void> {
  // Facebook posts report under `feed`, Instagram under `comments`.
  const field = String(change?.field ?? '');
  if (field !== 'feed' && field !== 'comments') {
    return;
  }

  const commentChannel = channel === 'instagram' ? 'instagram' : 'facebook';
  const event = parseCommentChange(change, pageId, commentChannel);
  if (!event) {
    return;
  }

  // Comment spam is a real vector on a public post, so the same per-author cap
  // applies here as in direct messages.
  if (!(await checkRateLimit(db, `comment:${event.authorId || event.commentId}`, PER_USER_RATE_LIMIT))) {
    console.warn(`[chat/webhook] comment rate limit hit for ${event.authorId}`);
    return;
  }

  await handleCommentEvent(db, event, {
    token: settings.facebook.pageAccessToken,
    storefront: await loadStorefrontContext(db, new Date()),
    model: settings.model || undefined,
    temperature: settings.temperature,
  });
}

async function processMessagingEvent(
  db: any,
  settings: ServerChatSettings,
  channel: ChatChannel,
  pageId: string,
  event: any,
): Promise<void> {
  // An echo is our own outgoing message coming back — replying would loop — but
  // it is also how a person answering from the Page inbox reaches us, and those
  // two were being dropped together. The consequences showed up in a real
  // thread: staff answered a customer inside Facebook, this side never learned
  // a human had stepped in, and the bot was half an hour from talking over
  // them. The reply was missing from the admin transcript as well.
  //
  // Meta separates them: a message sent through the Send API carries the app
  // that sent it, and one typed by a person in the inbox does not.
  if (event?.message?.is_echo) {
    if (!event.message.app_id) {
      await noteStaffReply(db, channel, pageId, event);
    }
    return;
  }

  const senderId = String(event?.sender?.id ?? '');
  if (!senderId) {
    return;
  }

  const postbackPayload = event?.postback?.payload ?? event?.message?.quick_reply?.payload ?? null;
  const text = String(event?.message?.text ?? '').trim();
  // Customers routinely send a photo instead of typing — "энэ юу вэ?", "миний
  // арьс ийм байна". Staying silent on those reads as a broken bot.
  const imageUrl = firstImageAttachmentUrl(event?.message);

  if (!postbackPayload && !text && !imageUrl) {
    // Sticker, reaction or an attachment we cannot interpret.
    return;
  }

  // One claim per delivery. `mid` is unique per message; postbacks have no mid,
  // so the payload plus timestamp stands in.
  const eventKey = postbackPayload
    ? `pb_${pageId}_${senderId}_${event?.timestamp ?? ''}_${postbackPayload}`
    : String(event?.message?.mid ?? `msg_${pageId}_${senderId}_${event?.timestamp ?? ''}`);

  if (!(await markEventProcessed(db, eventKey))) {
    return;
  }

  try {
    await replyToEvent(db, settings, {
      channel,
      pageId,
      senderId,
      text,
      postbackPayload,
      imageUrl,
    });
  } catch (err) {
    // Let Facebook's retry have another go rather than losing the message.
    await releaseEvent(db, eventKey);
    throw err;
  }
}

async function replyToEvent(
  db: any,
  settings: ServerChatSettings,
  params: {
    channel: ChatChannel;
    pageId: string;
    senderId: string;
    text: string;
    postbackPayload: string | null;
    imageUrl: string | null;
  },
): Promise<void> {
  const { channel, pageId, senderId, text, postbackPayload, imageUrl } = params;
  const token = settings.facebook.pageAccessToken;

  // Before a single round trip to Firestore. Everything below it — the rate
  // limit, the name lookup, recording what was said — is time the customer
  // spends watching a thread in which nothing is happening, and on a cold
  // instance that ran to several seconds. Silence reads as being ignored; the
  // bubble reads as an answer on its way, and it is the same wait either way.
  //
  // Deliberately not awaited. This is here to take a wait away, not to add one.
  void sendTypingOn(token, senderId);

  if (!(await checkRateLimit(db, `${channel}:${senderId}`, PER_USER_RATE_LIMIT))) {
    console.warn(`[chat/webhook] rate limit hit for ${channel}:${senderId}`);
    return;
  }

  // Started here rather than where it is read. The catalogue is the slowest
  // thing this route asks Firestore for and nothing between here and the model
  // depends on it, so it runs alongside the name lookup and the bookkeeping
  // instead of after them. After the rate limit, so a flood cannot make us read
  // it; the handler keeps an early return from leaving the rejection unobserved.
  const storefrontPromise = loadStorefrontContext(db, new Date());
  void storefrontPromise.catch(() => {});

  // The page's own announcements. Cached for a quarter of an hour, so this is a
  // round trip once in a while rather than once a turn.
  const postsPromise = getRecentPosts(token);
  void postsPromise.catch(() => {});

  const customerName = await getUserName(token, senderId);
  const conversation = await ensureConversation(db, {
    channel,
    pageId,
    externalUserId: senderId,
    customerName,
  });

  // Record what the customer sent before anything can fail, so the admin sees
  // the message even if the reply never gets generated. Alongside it, because
  // contact details often arrive a message or two after the order request and
  // every incoming message tops up an open lead — the two touch different
  // documents and neither reads what the other writes.
  await Promise.all([
    appendMessage(db, conversation.id, {
      role: 'user',
      content: postbackPayload
        ? `[${postbackPayload}] ${text}`.trim()
        : text || (imageUrl ? '[зураг]' : ''),
    }),
    text ? captureContactDetails(db, conversation.id, text) : Promise.resolve(),
  ]);

  // Checked before the silence rule, which is the whole point: the customer is
  // asking to be let out of a thread the bot is deliberately quiet in.
  if (postbackPayload === RESUME_BOT_PAYLOAD) {
    await setConversationStatus(db, conversation.id, 'active');
    await sendText(token, senderId, RESUME_BOT_REPLY);
    await appendMessage(db, conversation.id, { role: 'assistant', content: RESUME_BOT_REPLY });
    return;
  }

  if (botShouldStaySilent(conversation)) {
    // Raised on the way in, before there was any way to know a person had taken
    // this thread over. Put it back down rather than leaving the customer with
    // dots that were never going to become a reply.
    void sendTypingOff(token, senderId);
    return;
  }

  const stopTyping = keepTyping(token, senderId);

  try {

    const storefront = await storefrontPromise;
    const toolContext: ToolContext = {
      storefront,
      // Photos are stored inline as `data:` URIs, which Facebook cannot fetch,
      // and reading them with the catalogue cost more than the rest of the prompt
      // put together. Every card points at the image endpoint, which resolves the
      // picture from the id and answers with a placeholder when there is none —
      // so a card is never broken by a URL that fails to load.
      imageUrlFor: (product) => storefrontUrl(`/api/chat/productImage?id=${product.id}`) || undefined,
      productUrlFor: (product) => storefrontUrl(`/product/${product.id}`) || undefined,
      lookupOrder: (orderNumber) => lookupOrder(db, orderNumber),
      placeOrder: (details) =>
        placeChatOrder(db, storefront, { ...conversation, channel, externalUserId: senderId }, details),
      // Read fresh each turn rather than carried in the conversation: the
      // customer may have added something from a carousel button since.
      basket: async () => {
        const open = await findOpenLead(db, conversation.id);
        const items = Array.isArray(open?.data.items) ? (open.data.items as any[]) : [];
        return items.map((item) => ({
          productId: typeof item?.productId === 'number' ? item.productId : null,
          name: String(item?.name ?? ''),
          variant: typeof item?.variant === 'string' ? item.variant : null,
          quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
        }));
      },
      ownOrders: () => ordersForConversation(db, conversation.id),
    };

    // A button press is an explicit instruction — run the tool directly instead
    // of asking the model to re-derive an intent the customer already stated.
    const directTool = postbackPayload ? resolveDirectTool(postbackPayload) : null;
    if (directTool) {
      const outcome = await runTool(directTool.name, directTool.args, toolContext);
      await deliverOutcome(db, token, senderId, { ...conversation, channel }, outcome, directTool.name);
      return;
    }

    // Only the explicit Get Started button gets the canned welcome. An ordinary
    // first message goes to the model, whose prompt already tells it to greet
    // once at the start — and an unmapped payload is intent we should not throw
    // away by answering with a greeting instead.
    if (postbackPayload === 'GET_STARTED') {
      await sendQuickReplies(
        token,
        senderId,
        settings.welcomeMessage,
        settings.quickReplies.map((button) => ({ title: button.title, payload: button.action })),
      );
      await appendMessage(db, conversation.id, {
        role: 'assistant',
        content: settings.welcomeMessage,
      });
      return;
    }

    const history = await readRecentMessages(db, conversation.id);
    // The turn just stored is the message being answered — sending it as history
    // as well makes the model see it twice and repeat itself.
    const priorHistory = history.slice(0, -1);

    if (imageUrl) {
      await answerImage(db, token, senderId, conversation, {
        imageUrl,
        caption: text,
        history: priorHistory,
        storefront,
        settings,
      });
      return;
    }

    /** One entry per tool the model called, delivered in the order it called them. */
    const outcomes: Array<{ outcome: Awaited<ReturnType<typeof runTool>>; toolName: string | null }> = [];

    // A question the shop has already answered is served from the knowledge base
    // for nothing, in the shop's own approved wording. The bar for a hit is high
    // on purpose — see faqMatch — and anything short of it falls through to the
    // model, which is the expensive but always-correct path.
    const faqHit = text
      ? matchFaq(text, storefront.faqs, { isFirstTurn: priorHistory.length === 0 })
      : null;

    if (faqHit) {
      console.log(`[chat/webhook] answered from FAQ (${faqHit.similarity.toFixed(2)}): ${faqHit.question}`);
      await deliverOutcome(db, token, senderId, { ...conversation, channel }, { text: faqHit.answer }, null);
      return;
    }

    try {
      // The prompt is the same ~15,600 characters on every turn, so it is sent
      // once to a context cache and referenced thereafter at a tenth of the
      // price. A null handle simply means paying full price this time.
      const cacheOptions = {
        model: primaryModel(settings.model || undefined),
        systemPrompt: buildStorefrontPrompt(
          { ...storefront, posts: await postsPromise },
          new Date(),
        ),
        tools: CHAT_TOOLS,
      };
      const cache = settings.promptCacheEnabled
          ? await getOrCreatePromptCache(db, process.env.GEMINI_API_KEY ?? '', cacheOptions)
          : null;

      // When the conversation itself says which step is next, say so rather than
      // leaving it to the model — it looped on step one often enough that
      // customers were sending their details twice.
      const pending = await findOpenLead(db, conversation.id);
      const pendingItems = Array.isArray(pending?.data.items) ? pending.data.items.length : 0;
      const forceTool =
        text && pendingItems > 0 && extractPhone(text) ? TOOL_NAMES.CONFIRM_ORDER : undefined;

      const result = await callGeminiAgent({
        systemPrompt: cacheOptions.systemPrompt,
        history: priorHistory,
        message: text || String(postbackPayload ?? ''),
        tools: CHAT_TOOLS,
        model: settings.model || undefined,
        temperature: settings.temperature,
        cache,
        forceTool,
        // A model that timed out a moment ago will most likely time out again, and
        // the customer waits the full twenty-five seconds either way.
        skipModels: await unhealthyModels(db),
        onModelTimedOut: (model) => void markModelUnhealthy(db, model),
        onModelBusy: (model) => void markModelUnhealthy(db, model, 'refused every request'),
        onModelAnswered: (model) => void markModelHealthy(db, model),
        onCacheRejected: () => void forgetPromptCache(db, cacheOptions),
      });

      if (result.functionCalls.length > 0) {
        for (const call of result.functionCalls.slice(0, MAX_TOOL_CALLS_PER_TURN)) {
          outcomes.push({ outcome: await runTool(call.name, call.args, toolContext), toolName: call.name });
        }
      } else {
        const text = result.text ?? '';
        if (looksLikeOurOwnInstructions(text, [cacheOptions.systemPrompt, JSON.stringify(CHAT_TOOLS)])) {
          console.error('[chat/webhook] model echoed its own instructions; reply withheld');
          outcomes.push({ outcome: { text: LEAKED_INSTRUCTION_REPLY }, toolName: null });
        } else {
          outcomes.push({ outcome: { text }, toolName: null });
        }
      }
    } catch (err) {
      console.error('[chat/webhook] generation failed:', (err as Error).message);
      await recordChatFailure(db, 'messenger', (err as Error).message, {
        channel,
        // Says whose fault it was, so nobody has to guess next time.
        probe: await probeEveryModel(),
      });
      outcomes.length = 0;

      // A customer who asked and got "could not answer" has been handed a dead
      // end. When the failure is ours rather than theirs, give them a person
      // instead: the shop sees a waiting thread and they get an answer.
      outcomes.push(
        shouldEscalateAfterFailure(err)
          ? {
              outcome: {
                text: 'Уучлаарай, яг одоо хариулж чадахгүй байна. Ажилтан удахгүй хариу өгнө ☎️',
                handoverReason: `Бот хариулж чадсангүй: ${(err as Error).message}`,
              },
              toolName: null,
            }
          : { outcome: { text: geminiErrorToUserMessage(err) }, toolName: null },
      );
    }

    askForOrderDetailsOnce(outcomes);

    // Last thing before the customer sees it: a catalogue word the model spelled
    // its own way is put back. An ingredient list is read by people with
    // allergies, and one letter is the difference between a herb and a disease.
    const vocabulary = catalogueVocabulary(storefront.products);
    for (const entry of outcomes) {
      if (!entry.outcome.text) continue;
      const guarded = repairCatalogueWords(entry.outcome.text, vocabulary);
      if (guarded.repaired.length > 0) {
        console.warn(
          '[chat/webhook] catalogue wording repaired:',
          guarded.repaired.map((fix) => `${fix.from}→${fix.to}`).join(', '),
        );
        entry.outcome.text = guarded.text;
      }
    }

    for (const entry of outcomes) {
      await deliverOutcome(db, token, senderId, { ...conversation, channel }, entry.outcome, entry.toolName);
    }

    // What the turn was about, for the admin list. Not awaited: it is a label,
    // and no customer should wait a Firestore round trip for one.
    const usedTool = outcomes.find((entry) => entry.toolName)?.toolName ?? null;
    const turnTopic = mergeTopic(conversation.topic, classifyTopic({ toolName: usedTool, message: text }));
    if (turnTopic !== conversation.topic) {
      void setConversationTopic(db, conversation.id, turnTopic);
    }
  } finally {
    // Every path out of here stops it: an early return that left the bubble
    // running would show the customer a reply still being written after it
    // had arrived.
    stopTyping();
  }
}

/**
 * Appends the "name, phone, address" question to the last outcome that wants
 * it. Two products named in one message add two lines to the order and need
 * the details asked once, which is how a person would answer.
 */
function askForOrderDetailsOnce(
  entries: Array<{ outcome: { text?: string; needsOrderDetails?: boolean } }>,
): void {
  const last = entries.filter((entry) => entry.outcome.needsOrderDetails).pop();
  if (last) {
    last.outcome.text = `${last.outcome.text ?? ''}\n\n${ORDER_DETAILS_ASK}`.trim();
  }
}

/**
 * Fills a name and phone into the conversation's open lead as they arrive.
 *
 * Only ever adds what is still missing — a later message must not overwrite a
 * number the customer already confirmed.
 */
async function captureContactDetails(db: any, conversationId: string, text: string): Promise<void> {
  const open = await findOpenLead(db, conversationId);
  if (!open) {
    return;
  }

  const patch: Record<string, unknown> = {};
  const currentPhone = String(open.data.customerPhone ?? '');
  const currentName = String(open.data.customerName ?? '');

  if (!currentPhone) {
    const phone = extractPhone(text);
    if (phone) patch.customerPhone = phone;
  }
  if (!currentName) {
    const name = extractName(text);
    if (name) patch.customerName = name;
  }

  if (Object.keys(patch).length === 0) {
    return;
  }

  await updateChatLead(db, open.id, patch);

  const merged = {
    customerName: String(patch.customerName ?? currentName),
    customerPhone: String(patch.customerPhone ?? currentPhone),
  };
  if (isLeadComplete(merged)) {
    console.log(`[chat/webhook] lead ${open.id} is ready for review`);
  }
}

/**
 * Answers a photo the customer sent.
 *
 * Runs without tools: vision plus function calling is the least reliable model
 * combination, and a photo turn is almost always "what is this / does this suit
 * me", which wants prose. If the answer points at a product the customer can
 * ask for it in the next message, where the tools are available again.
 */
async function answerImage(
  db: any,
  token: string,
  senderId: string,
  conversation: { id: string },
  params: {
    imageUrl: string;
    caption: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    storefront: Parameters<typeof buildStorefrontPrompt>[0];
    settings: ServerChatSettings;
  },
): Promise<void> {
  const image = await fetchImageAsBase64(params.imageUrl);

  if (!image) {
    // Unsupported format, too large, or the CDN link had already expired.
    const fallback = 'Зургийг тань нээж чадсангүй. Юу асуухыг хүсэж байгаагаа бичиж өгнө үү 🙏';
    await sendText(token, senderId, fallback);
    await appendMessage(db, conversation.id, { role: 'assistant', content: fallback });
    return;
  }

  const context = { ...params.storefront, posts: await getRecentPosts(token) };
  const systemPrompt = `${buildStorefrontPrompt(context, new Date())}\n${IMAGE_REPLY_RULES}`;

  let reply: string;
  try {
    reply = await callGemini({
      systemPrompt,
      history: params.history,
      message: params.caption || 'Хэрэглэгч зураг илгээлээ. Юу байгааг хараад тусал.',
      imageBase64: image.base64,
      imageMimeType: image.mimeType,
      model: params.settings.model || undefined,
      temperature: params.settings.temperature,
    });
  } catch (err) {
    console.error('[chat/webhook] image reply failed:', (err as Error).message);
    reply = geminiErrorToUserMessage(err);
  }

  // The same net the text path has. A photo turn builds its own prompt and so
  // answered outside that net, which is exactly where a gap goes unnoticed.
  if (looksLikeOurOwnInstructions(reply, [systemPrompt])) {
    console.error('[chat/webhook] model echoed its own instructions on a photo; reply withheld');
    reply = LEAKED_INSTRUCTION_REPLY;
  }

  // The photo path builds its own reply and would otherwise miss the check the
  // text path gets.
  const guarded = repairCatalogueWords(reply, catalogueVocabulary(params.storefront.products));
  if (guarded.repaired.length > 0) {
    console.warn(
      '[chat/webhook] catalogue wording repaired on a photo reply:',
      guarded.repaired.map((fix) => `${fix.from}→${fix.to}`).join(', '),
    );
    reply = guarded.text;
  }

  await sendText(token, senderId, reply);
  await appendMessage(db, conversation.id, { role: 'assistant', content: reply });
}

const IMAGE_REPLY_RULES = `
# ХЭРЭГЛЭГЧ ЗУРАГ ИЛГЭЭЛЭЭ
- Зурган дээр юу байгааг хараад ТОВЧ (1-3 өгүүлбэр) хариул.
- Манай бүтээгдэхүүн бол каталогоос нэрлэж, үнийг нь хэл.
- Манайх биш бараа бол шүүмжлэхгүй, эелдэг хариулаад ойролцоо төстэйгөө санал болго.
- ⛔ АРЬСНЫ ЗУРАГ бол: онош ХЭЗЭЭ Ч бүү тавь, "эмчилнэ" гэж бүү хэл.
  Ерөнхий арчилгааны зөвлөгөө өгөөд, ноцтой санагдвал арьсны эмчид хандахыг зөвлө.
- Баримт бичиг/шилжүүлгийн зураг бол ажилтан шалгана гэж хэлээд шилжүүл.`;

function resolveDirectTool(payload: string): { name: string; args: Record<string, unknown> } | null {
  const mapped = POSTBACK_TO_TOOL[payload];
  if (mapped) {
    return { name: mapped, args: {} };
  }

  // Carousel "Захиалах" buttons carry the product id.
  const orderMatch = /^ORDER_PRODUCT_(\d+)$/.exec(payload);
  if (orderMatch) {
    return { name: TOOL_NAMES.START_ORDER, args: { productId: Number(orderMatch[1]) } };
  }

  return null;
}

/** Sends whatever a turn produced and records it on the conversation. */
async function deliverOutcome(
  db: any,
  token: string,
  senderId: string,
  conversation: { id: string; channel: ChatChannel; customerName: string | null },
  outcome: {
    text?: string;
    cards?: Array<{ title: string; subtitle?: string; imageUrl?: string; buttons?: any[] }>;
    quickReplies?: Array<{ title: string; payload: string }>;
    handoverReason?: string;
    buttons?: Array<{ title: string; url: string }>;
    orderId?: string;
    leads?: Array<{
      productName: string;
      productId: number | null;
      variant: string | null;
      quantity: number;
    }>;
  },
  toolName: string | null,
): Promise<void> {
  const conversationId = conversation.id;
  const text = (outcome.text ?? '').trim();

  // A customer handed to staff is about to stop hearing from the bot, so the
  // way back rides along with the message that says so.
  const quickReplies = outcome.handoverReason
    ? [...(outcome.quickReplies ?? []), RESUME_QUICK_REPLY]
    : outcome.quickReplies;

  if (text) {
    if (outcome.buttons && outcome.buttons.length > 0) {
      await sendButtons(token, senderId, text, outcome.buttons);
    } else if (quickReplies && quickReplies.length > 0) {
      await sendQuickReplies(token, senderId, text, quickReplies);
    } else {
      await sendText(token, senderId, text);
    }
  }

  if (outcome.cards && outcome.cards.length > 0) {
    await sendCarousel(token, senderId, outcome.cards);
  }

  if (text || outcome.cards?.length) {
    await appendMessage(db, conversationId, {
      role: 'assistant',
      content: text || `[${outcome.cards?.length ?? 0} карт]`,
      toolName,
    });
  }

  if (outcome.handoverReason) {
    await setConversationStatus(db, conversationId, 'handover', {
      handoverReason: outcome.handoverReason,
    });
  }

  if (outcome.leads && outcome.leads.length > 0) {
    await recordOrderLead(db, conversation, outcome.leads);
  }
}

/**
 * Raises — or tops up — the order lead for this conversation.
 *
 * One open lead per thread: a customer adding a second product should extend
 * the request an admin is about to process, not spawn a competing one.
 */
async function recordOrderLead(
  db: any,
  conversation: { id: string; channel: ChatChannel; customerName: string | null },
  leads: Array<{
    productName: string;
    productId: number | null;
    variant: string | null;
    quantity: number;
  }>,
): Promise<void> {
  const items = leads.map((lead) => ({
    productId: lead.productId,
    name: lead.productName,
    variant: lead.variant,
    quantity: lead.quantity,
  }));

  const open = await findOpenLead(db, conversation.id);
  if (open) {
    // Replaced, not appended. What arrives here is the whole basket as the
    // customer was just shown it — already merged with what was set aside
    // earlier — so appending would put every existing line in a second time.
    await updateChatLead(db, open.id, { items });
    return;
  }

  await createChatLead(db, {
    type: 'order',
    conversationId: conversation.id,
    channel: conversation.channel,
    // Messenger gives us a profile name; the customer may still supply their
    // own, which captureContactDetails will not overwrite.
    customerName: conversation.customerName ?? '',
    customerPhone: '',
    // Filled in as the customer supplies them; a lead raised the moment they
    // pick a product has neither yet.
    address: '',
    note: '',
    items,
  });
}

/** Order status lookup for the check_order tool. */
async function lookupOrder(
  db: any,
  orderNumber: string,
): Promise<{ orderNumber: string; status: string; grandTotal: number } | null> {
  try {
    const snapshot = await db
      .collection('orders')
      .where('orderNumber', '==', orderNumber)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data();
    return {
      orderNumber: String(data.orderNumber ?? orderNumber),
      status: String(data.status ?? 'new'),
      grandTotal: Number(data.totals?.grandTotal ?? 0),
    };
  } catch (err) {
    console.error('[chat/webhook] order lookup failed:', (err as Error).message);
    return null;
  }
}

/**
 * Records a reply a person typed in the Page inbox rather than in the admin.
 *
 * Two things follow from it. The transcript gets the message, so the thread
 * reads as one conversation instead of half of one; and the bot steps back for
 * the same three hours a reply through the admin buys, timed from this message
 * rather than from whenever it gave up.
 */
async function noteStaffReply(db: any, channel: ChatChannel, pageId: string, event: any): Promise<void> {
  // On an echo the page is the sender, so the customer is the recipient.
  const customerId = String(event?.recipient?.id ?? '');
  const text = String(event?.message?.text ?? '').trim();
  if (!customerId || !text) {
    return;
  }

  try {
    const conversation = await ensureConversation(db, {
      channel,
      pageId,
      externalUserId: customerId,
    });
    await appendMessage(db, conversation.id, { role: 'assistant', content: text });
    await setConversationStatus(db, conversation.id, 'admin_active');
  } catch (err) {
    console.warn('[chat/webhook] staff reply not recorded:', (err as Error).message);
  }
}
