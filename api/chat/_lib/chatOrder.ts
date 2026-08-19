// Turns a chat conversation into a real order.
//
// The storefront's createOrder lives in src/lib/orders.ts and runs on the
// Firebase Web SDK in the browser, which a webhook cannot use. This writes the
// same document with the Admin SDK, so an order placed in Messenger lands in
// the same Orders list as one placed on the site — same shape, same number
// series, same Bonum payment record — instead of in a parallel world an admin
// has to reconcile by hand.
//
// The one addition is `chat`, which records where the order came from so the
// payment webhook can tell that customer, on their own channel, that it landed.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { bonumPost } from '../../bonum/_client.js';
import type { ChatChannel } from './conversation.js';
import { findOpenLead, updateChatLead } from './leads.js';
import { NothingToOrderError } from './tools.js';


const ORDERS_COLLECTION = 'orders';
const ORDER_SCHEMA_VERSION = 1;
const BUSINESS_TIME_ZONE = 'Asia/Ulaanbaatar';
const INVOICE_TTL_SECONDS = 3600;

/** Mirrors OrderSource in src/lib/orders.ts, which firestore.rules also validates. */
const CHANNEL_TO_SOURCE: Record<string, string> = {
  facebook: 'messenger',
  instagram: 'instagram',
  widget: 'web',
};

export interface ChatOrderItem {
  productId: number;
  name: string;
  category: string;
  image: string | null;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ChatOrderCustomer {
  fullName: string;
  phoneNumber: string;
  note: string;
}

export interface CreateChatOrderInput {
  channel: string;
  conversationId: string;
  externalUserId: string | null;
  customer: ChatOrderCustomer;
  /** Free text as the customer typed it; a chat cannot ask for five fields. */
  address: string;
  items: ChatOrderItem[];
  shippingFee: number;
  /** Order value at or above which delivery is free. 0 disables the rule. */
  freeShippingThreshold: number;
}

export interface CreatedChatOrder {
  id: string;
  orderNumber: string;
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
  /** Bonum's hosted payment page, offered to the customer as a button. */
  payUrl: string;
}

/** `ORD-YYMMDD-XXXXXX`, matching documentNumberFromId in src/lib/documentNumbers.ts. */
export function orderNumberFromId(documentId: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: BUSINESS_TIME_ZONE,
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const at = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const suffix = documentId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();

  return `ORD-${at('year')}${at('month')}${at('day')}-${suffix}`;
}

/**
 * What delivery costs on this order. The shop's own answer to "how much is
 * delivery" promises it free above a threshold, so the same rule has to reach
 * the invoice — a bot that promises one number and charges another is worse
 * than one that never mentioned it.
 */
export function shippingFeeFor(subtotal: number, fee: number, threshold: number): number {
  if (threshold > 0 && subtotal >= threshold) {
    return 0;
  }
  return fee;
}

function callbackUrl(): string {
  const base =
    process.env.BONUM_CALLBACK_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return `${base}/api/bonum/webhook`;
}

export async function createChatOrder(
  db: any,
  input: CreateChatOrderInput,
  now = new Date(),
): Promise<CreatedChatOrder> {
  if (input.items.length === 0) {
    throw new Error('Захиалгад бүтээгдэхүүн байхгүй байна.');
  }

  const ref = db.collection(ORDERS_COLLECTION).doc();
  const orderNumber = orderNumberFromId(ref.id, now);

  const subtotal = input.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shippingFee = shippingFeeFor(subtotal, input.shippingFee, input.freeShippingThreshold);
  const grandTotal = subtotal + shippingFee;

  // The invoice is raised before the order is written: an order that exists
  // with no way to pay for it is worse than one that was never created.
  const invoice = await bonumPost<{ invoiceId: string; followUpLink: string }>(
    '/bonum-gateway/ecommerce/invoices',
    {
      amount: grandTotal,
      // The document id doubles as the Bonum transactionId, which is how the
      // payment webhook finds this order again.
      transactionId: ref.id,
      callback: callbackUrl(),
      expiresIn: INVOICE_TTL_SECONDS,
    },
  );

  await ref.set({
    orderNumber,
    schemaVersion: ORDER_SCHEMA_VERSION,
    status: 'new',
    source: CHANNEL_TO_SOURCE[input.channel] ?? 'messenger',
    isManual: false,
    currency: 'MNT',
    auth: { uid: '', isAnonymous: true, method: 'chat' },
    customer: {
      fullName: input.customer.fullName.trim(),
      phoneNumber: input.customer.phoneNumber.trim(),
      email: null,
      note: input.customer.note.trim(),
    },
    // A chat cannot reasonably ask for region, district, khoroo and street as
    // separate questions, so what the customer typed is kept whole in the field
    // the delivery note actually prints.
    address: {
      region: '',
      districtOrSoum: '',
      khorooOrBag: '',
      streetAddress: input.address.trim(),
      additionalAddress: '',
    },
    items: input.items,
    totals: { subtotal, shippingFee, grandTotal, vatMode: 'none', vatAmount: 0 },
    payment: {
      method: 'bonum',
      provider: 'bonum',
      status: 'pending',
      amount: grandTotal,
      qrPayload: invoice.followUpLink,
      invoiceId: invoice.invoiceId,
      paidAt: null,
    },
    // Stock moves when the payment lands, exactly as it does for a web order.
    stockApplied: false,
    chat: {
      conversationId: input.conversationId,
      channel: input.channel,
      externalUserId: input.externalUserId,
    },
    createdAt: now,
    updatedAt: now,
  });

  return { id: ref.id, orderNumber, subtotal, shippingFee, grandTotal, payUrl: invoice.followUpLink };
}

/**
 * Turns what the conversation has gathered into a real order.
 *
 * The items come from the open lead, which start_order has been filling as the
 * customer picks things out; the contact details come from the tool call, where
 * the model has just confirmed them. Prices are read from the catalogue rather
 * than from anything the model produced — a model that hallucinates a price
 * would otherwise hallucinate an invoice.
 */
export async function placeChatOrder(
  db: any,
  storefront: { products: Array<{ id: number; name: string; price: number; category: string }>; shop: { shippingFee: number; freeShippingThreshold: number } },
  conversation: { id: string; channel: ChatChannel; externalUserId: string },
  details: { customerName: string; phone: string; address: string },
) {
  const open = await findOpenLead(db, conversation.id);
  const rawItems = Array.isArray(open?.data.items) ? (open.data.items as any[]) : [];

  if (rawItems.length === 0) {
    throw new NothingToOrderError('Захиалахыг хүссэн бүтээгдэхүүн бүртгэгдээгүй байна.');
  }

  const items = rawItems.map((item) => {
    const name = String(item?.name ?? '').trim();
    const quantity = Math.max(1, Math.floor(Number(item?.quantity) || 1));
    const product =
      storefront.products.find((entry) => entry.id === Number(item?.productId)) ??
      storefront.products.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

    if (!product) {
      throw new Error(`Каталогоос олдсонгүй: ${name || '?'}`);
    }

    return {
      productId: product.id,
      name: product.name,
      category: product.category,
      // The photo is a data URI in Firestore; the order list resolves it the
      // same way the carousel does, from the product id.
      image: null,
      variant: typeof item?.variant === 'string' ? item.variant : null,
      quantity,
      unitPrice: product.price,
      lineTotal: product.price * quantity,
    };
  });

  const order = await createChatOrder(db, {
    channel: conversation.channel,
    conversationId: conversation.id,
    externalUserId: conversation.externalUserId,
    customer: { fullName: details.customerName, phoneNumber: details.phone, note: '' },
    address: details.address,
    items,
    shippingFee: storefront.shop.shippingFee,
    freeShippingThreshold: storefront.shop.freeShippingThreshold,
  });

  // The lead has become an order, so it leaves the admin's queue — otherwise
  // the same request is processed twice, once from each screen.
  if (open) {
    await updateChatLead(db, open.id, {
      status: 'converted',
      convertedOrderId: order.id,
      customerName: details.customerName,
      customerPhone: details.phone,
      note: details.address,
    });
  }

  return order;
}
