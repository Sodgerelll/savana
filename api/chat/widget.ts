// POST /api/chat/widget — the storefront chat widget.
//
// This is the only chat route with no authentication, so it is the only one an
// abuser can reach. Three limits guard it:
//   1. a per-session cap, which stops one visitor running up a bill
//   2. a per-IP cap, because the session id is client-generated and forgeable
//   3. the storefront-wide `widget.isActive` switch
//
// Like the Facebook webhook, every Firestore write happens here under the Admin
// SDK; the browser never writes to chat_* itself.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { buildStorefrontPrompt, loadStorefrontContext, storefrontUrl } from './_lib/buildPrompt.js';
import {
  appendMessage,
  botShouldStaySilent,
  ensureConversation,
  readRecentMessages,
  setConversationStatus,
} from './_lib/conversation.js';
import { matchFaq } from './_lib/faqMatch.js';
import {
  callGeminiAgent,
  geminiErrorToUserMessage,
  looksLikeOurOwnInstructions,
  primaryModel,
} from './_lib/gemini.js';
import { forgetPromptCache, getOrCreatePromptCache } from './_lib/promptCache.js';
import { checkRateLimit } from './_lib/guards.js';
import { createChatLead, extractName, extractPhone, findOpenLead, updateChatLead } from './_lib/leads.js';
import { canAnswerOnChannel, loadChatSettings } from './_lib/settings.js';
import { CHAT_TOOLS, ORDER_DETAILS_ASK, runTool, type ToolContext } from './_lib/tools.js';
import { ordersForConversation, placeChatOrder } from './_lib/chatOrder.js';

export const config = { maxDuration: 60 };

const MAX_MESSAGE_LENGTH = 600;
/** A session id we generated is 24 hex chars; reject anything unlike one. */
const SESSION_ID_PATTERN = /^[a-z0-9]{16,40}$/i;

/** Mirrors the webhook: one message can name a few products, not a dozen. */
const MAX_TOOL_CALLS_PER_TURN = 4;

/**
 * What a customer is told when the model reads its own instructions back. Rare,
 * and worth one awkward turn: the alternative is internal material on a screen
 * the shop does not control.
 */
const LEAKED_INSTRUCTION_REPLY =
  'Уучлаарай, сүүлийн мессежийг маань үл ойшооно уу 🌿 Та юу хүсэж байгаагаа дахин бичиж өгөхгүй юу?';

/** Mirrors the Messenger wording, so the two channels sound like one shop. */
const RESUMED_REPLY = 'Дахин туслахад бэлэн боллоо 🌿 Юу асуух вэ?';

const PER_SESSION_LIMIT = { max: 8, windowMs: 60_000 };
/** Looser than the session cap because a household or office shares one IP. */
const PER_IP_LIMIT = { max: 24, windowMs: 60_000 };

/** The widget is a single page, so there is no page id to key conversations on. */
const WIDGET_PAGE_ID = 'web';

export interface WidgetProductCard {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  inStock: boolean;
}

function clientIp(req: any): string {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // Vercel appends the real client as the first entry.
    return forwarded.split(',')[0].trim();
  }
  const realIp = req?.headers?.['x-real-ip'];
  return typeof realIp === 'string' && realIp ? realIp : 'unknown';
}

export default async function handler(req: any, res: any): Promise<void> {
  // GET is the widget's own config probe. It exists because chat_settings is
  // admin-only in the Firestore rules — it holds the Page Access Token — so the
  // storefront cannot read the enabled flag directly. Only non-secret display
  // fields are returned here.
  if (req.method === 'GET') {
    await handleConfig(res);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sessionId = String(body.sessionId ?? '').trim();
  const message = String(body.message ?? '').trim();
  /** Asks for the bot back after the thread was handed to a human. */
  const resume = body.resume === true;

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    res.status(400).json({ error: 'Session id буруу байна.' });
    return;
  }
  if (!resume && !message) {
    res.status(400).json({ error: 'Мессеж хоосон байна.' });
    return;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Мессеж ${MAX_MESSAGE_LENGTH} тэмдэгтээс хэтрэх ёсгүй.` });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'Үйлчилгээ түр боломжгүй байна.' });
    return;
  }

  try {
    const db = await dbPromise;
    const settings = await loadChatSettings(db);

    if (!canAnswerOnChannel(settings, 'widget')) {
      res.status(503).json({ error: 'Онлайн туслах одоогоор идэвхгүй байна.' });
      return;
    }

    const withinSession = await checkRateLimit(db, `widget:${sessionId}`, PER_SESSION_LIMIT);
    const withinIp = await checkRateLimit(db, `widget-ip:${clientIp(req)}`, PER_IP_LIMIT);
    if (!withinSession || !withinIp) {
      res.status(429).json({ error: 'Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.' });
      return;
    }

    const conversation = await ensureConversation(db, {
      channel: 'widget',
      pageId: WIDGET_PAGE_ID,
      externalUserId: sessionId,
      userId: typeof body.userId === 'string' ? body.userId : null,
    });

    // Handled before the message is recorded and before the silence rule, which
    // is the point: the customer is asking to be let out of a thread the bot is
    // deliberately quiet in.
    if (resume) {
      await setConversationStatus(db, conversation.id, 'active');
      await appendMessage(db, conversation.id, { role: 'assistant', content: RESUMED_REPLY });
      res.status(200).json({ reply: RESUMED_REPLY, products: [], handedOver: false });
      return;
    }

    await appendMessage(db, conversation.id, { role: 'user', content: message });
    await captureContactDetails(db, conversation.id, message);

    if (botShouldStaySilent(conversation)) {
      res.status(200).json({
        reply: 'Ажилтан удахгүй хариу өгөх болно. Түр хүлээнэ үү ☎️',
        products: [],
        handedOver: true,
      });
      return;
    }

    const storefront = await loadStorefrontContext(db, new Date());
    const toolContext: ToolContext = {
      storefront,
      // See the note in webhook.ts: the picture is resolved from the id rather
      // than read with the catalogue.
      imageUrlFor: (product) => storefrontUrl(`/api/chat/productImage?id=${product.id}`) || undefined,
      lookupOrder: (orderNumber) => lookupOrder(db, orderNumber),
      placeOrder: (details) =>
        placeChatOrder(
          db,
          storefront,
          { id: conversation.id, channel: 'widget', externalUserId: sessionId },
          details,
        ),
      ownOrders: () => ordersForConversation(db, conversation.id),
    };

    const history = await readRecentMessages(db, conversation.id);
    const priorHistory = history.slice(0, -1);

    let text = '';
    let products: WidgetProductCard[] = [];
    let handedOver = false;
    let toolName: string | null = null;
    /** Bonum's payment page, when the turn produced an order. */
    let payUrl = '';
    let needsOrderDetails = false;

    // Served from the knowledge base when the shop has already answered this,
    // in its own wording and without a model call. The webhook does the same;
    // the bar for a hit lives in faqMatch and errs towards refusing.
    const faqHit = matchFaq(message, storefront.faqs, {
      isFirstTurn: priorHistory.length === 0,
    });

    if (faqHit) {
      await appendMessage(db, conversation.id, { role: 'assistant', content: faqHit.answer });
      res.status(200).json({ reply: faqHit.answer, products: [], handedOver: false });
      return;
    }

    try {
      // Same cache the Messenger webhook uses: identical prompt, identical
      // tools, so both channels share one cached copy.
      const cacheOptions = {
        model: primaryModel(settings.model || undefined),
        systemPrompt: buildStorefrontPrompt(storefront, new Date()),
        tools: CHAT_TOOLS,
      };
      const cache = await getOrCreatePromptCache(db, process.env.GEMINI_API_KEY ?? '', cacheOptions);

      // See webhook.ts: where the conversation already says which step is next,
      // the caller decides and the model only reads out the details.
      const pending = await findOpenLead(db, conversation.id);
      const pendingItems = Array.isArray(pending?.data.items) ? pending.data.items.length : 0;
      const forceTool = pendingItems > 0 && extractPhone(message) ? 'confirm_order' : undefined;

      const result = await callGeminiAgent({
        systemPrompt: cacheOptions.systemPrompt,
        history: priorHistory,
        message,
        tools: CHAT_TOOLS,
        model: settings.model || undefined,
        temperature: settings.temperature,
        cache,
        forceTool,
        onCacheRejected: () => void forgetPromptCache(db, cacheOptions),
      });

      // One message can name two products; the widget answers in one reply, so
      // the parts are joined rather than sent one after another.
      for (const call of result.functionCalls.slice(0, MAX_TOOL_CALLS_PER_TURN)) {
        toolName = call.name;
        const outcome = await runTool(call.name, call.args, toolContext);
        text = [text, outcome.text ?? ''].filter(Boolean).join('\n\n');

        // The widget renders its own cards, so tool output is returned as data
        // rather than the Messenger carousel shape.
        if (outcome.cards && outcome.cards.length > 0) {
          products = [...products, ...matchCards(outcome.cards, storefront.products)];
        }
        if (outcome.handoverReason) {
          handedOver = true;
          await setConversationStatus(db, conversation.id, 'handover', {
            handoverReason: outcome.handoverReason,
          });
        }
        if (outcome.leads && outcome.leads.length > 0) {
          await recordOrderLead(db, conversation.id, outcome.leads);
        }
        // The widget draws its own button rather than sending a Messenger
        // template, so the link is returned as data like the cards are.
        payUrl = outcome.buttons?.find((button) => button.url)?.url ?? payUrl;
        needsOrderDetails = needsOrderDetails || outcome.needsOrderDetails === true;
      }

      // Asked once, however many products the customer just named.
      if (needsOrderDetails) {
        text = `${text}\n\n${ORDER_DETAILS_ASK}`.trim();
      }

      if (result.functionCalls.length === 0) {
        text = result.text ?? '';
        if (looksLikeOurOwnInstructions(text, [cacheOptions.systemPrompt, JSON.stringify(CHAT_TOOLS)])) {
          console.error('[chat/widget] model echoed its own instructions; reply withheld');
          text = LEAKED_INSTRUCTION_REPLY;
        }
      }
    } catch (err) {
      console.error('[chat/widget] generation failed:', (err as Error).message);
      text = geminiErrorToUserMessage(err);
    }

    if (text || products.length > 0) {
      await appendMessage(db, conversation.id, {
        role: 'assistant',
        content: text || `[${products.length} бүтээгдэхүүн]`,
        toolName,
      });
    }

    res.status(200).json({ reply: text, products, handedOver, payUrl });
  } catch (err) {
    console.error('[chat/widget] failed:', (err as Error).message);
    res.status(500).json({ error: 'Хариу авч чадсангүй. Дахин оролдоно уу.' });
  }
}

/**
 * Public widget config. Never include the page token or any Facebook field —
 * this response is world-readable.
 */
async function handleConfig(res: any): Promise<void> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(200).json({ enabled: false });
    return;
  }

  try {
    const settings = await loadChatSettings(await dbPromise);
    // Cached briefly at the edge: the flag changes rarely and every storefront
    // visitor asks for it.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.status(200).json({
      enabled: canAnswerOnChannel(settings, 'widget'),
      botName: settings.botName,
      welcomeMessage: settings.welcomeMessage,
    });
  } catch (err) {
    console.error('[chat/widget] config failed:', (err as Error).message);
    res.status(200).json({ enabled: false });
  }
}

/** Resolves carousel cards back to catalog rows the widget can render. */
function matchCards(
  cards: Array<{ title: string }>,
  catalog: Array<{ id: number; name: string; price: number; imageUrl: string; inStock: boolean }>,
): WidgetProductCard[] {
  return cards
    .map((card) => catalog.find((product) => product.name === card.title))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))
    .map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      inStock: product.inStock,
    }));
}

async function captureContactDetails(db: any, conversationId: string, text: string): Promise<void> {
  const open = await findOpenLead(db, conversationId);
  if (!open) {
    return;
  }

  const patch: Record<string, unknown> = {};
  if (!String(open.data.customerPhone ?? '')) {
    const phone = extractPhone(text);
    if (phone) patch.customerPhone = phone;
  }
  if (!String(open.data.customerName ?? '')) {
    const name = extractName(text);
    if (name) patch.customerName = name;
  }

  if (Object.keys(patch).length > 0) {
    await updateChatLead(db, open.id, patch);
  }
}

async function recordOrderLead(
  db: any,
  conversationId: string,
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
  const open = await findOpenLead(db, conversationId);

  if (open) {
    const existing = Array.isArray(open.data.items) ? open.data.items : [];
    await updateChatLead(db, open.id, { items: [...existing, ...items] });
    return;
  }

  await createChatLead(db, {
    type: 'order',
    conversationId,
    channel: 'widget',
    customerName: '',
    customerPhone: '',
    // Filled in as the customer supplies them; a lead raised the moment they
    // pick a product has neither yet.
    address: '',
    note: '',
    items,
  });
}

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
    console.error('[chat/widget] order lookup failed:', (err as Error).message);
    return null;
  }
}
