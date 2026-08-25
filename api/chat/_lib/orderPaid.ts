// What happens to a chat order once its payment lands.
//
// Two things can notice a payment: Bonum's webhook, and — because a webhook
// that does not arrive leaves no trace at all — a sweep that asks Bonum
// directly about orders still sitting unpaid. The storefront has a "check
// payment" button for exactly this case; a customer who ordered in Messenger
// has no such button and no way to say "I have paid", so the shop has to look.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { bonumGet } from '../../bonum/_client.js';
import { postOrderPaidEntry } from '../../_lib/postOrderPaidEntry.js';
import { appendMessage } from './conversation.js';
import { sendText } from './facebook.js';
import { loadChatSettings } from './settings.js';
import { checkRateLimit } from './guards.js';

/** Orders looked at per sweep. Each one costs a call to Bonum. */
const MAX_PER_SWEEP = 10;
/** Older than this and a pending invoice has expired anyway. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Bonum is asked at most this often, however busy the page is. */
const SWEEP_THROTTLE = { max: 1, windowMs: 5 * 60 * 1000 };

/**
 * Tells a customer who ordered in a chat that their payment landed.
 *
 * They paid on Bonum's page, which knows nothing about the conversation they
 * came from, so without this the thread goes quiet at the moment the customer
 * most wants to hear something. Orders placed on the website carry no `chat`
 * block and are left alone — the site tells them itself.
 */
export async function tellTheChatCustomer(db: any, orderId: string): Promise<void> {
  const snapshot = await db.collection('orders').doc(orderId).get();
  const order = snapshot.exists ? snapshot.data() : null;
  const chat = order?.chat;

  if (!chat?.conversationId) {
    return;
  }

  const orderNumber = String(order.orderNumber ?? orderId);
  const message =
    `Төлбөр амжилттай хийгдлээ ✅ ${orderNumber} дугаартай захиалга баталгаажлаа.\n\n` +
    'Захиалгаа бэлтгээд удахгүй хүргэлтэд гаргана. Баярлалаа 🌿';

  // Recorded either way, so the thread and the admin panel both show what the
  // customer was told even when Facebook refuses the send.
  if (chat.externalUserId && (chat.channel === 'facebook' || chat.channel === 'instagram')) {
    const settings = await loadChatSettings(db);
    if (settings.facebook.pageAccessToken) {
      await sendText(settings.facebook.pageAccessToken, String(chat.externalUserId), message);
    }
  }

  await appendMessage(db, String(chat.conversationId), { role: 'assistant', content: message });
}

export interface PaymentSweepResult {
  checked: number;
  settled: number;
}

/**
 * Asks Bonum about chat orders that are still waiting to be paid.
 *
 * The webhook is the fast path and this is the one that catches what it drops:
 * a delivery that never arrives, a deploy in the wrong second, a callback URL
 * pointing at a deployment that has moved on. Without it a customer can pay and
 * hear nothing, and the shop can be owed goods it never knew were sold.
 */
export async function sweepPendingChatPayments(
  db: any,
  options: { now?: number; force?: boolean } = {},
): Promise<PaymentSweepResult> {
  const now = options.now ?? Date.now();
  const result: PaymentSweepResult = { checked: 0, settled: 0 };

  if (!options.force && !(await checkRateLimit(db, 'payments:sweep', SWEEP_THROTTLE))) {
    return result;
  }

  let pending;
  try {
    pending = await db.collection('orders').where('payment.status', '==', 'pending').limit(40).get();
  } catch (err) {
    console.warn('[chat/orderPaid] could not list pending orders:', (err as Error).message);
    return result;
  }

  const candidates = (pending.docs ?? [])
    .filter((doc: any) => {
      const data = doc.data() ?? {};
      const created = data.createdAt?.toDate?.()?.getTime?.() ?? 0;
      // Chat orders only: a website order has its own "check payment" button.
      return Boolean(data.chat?.conversationId) && created > 0 && now - created < MAX_AGE_MS;
    })
    .slice(0, MAX_PER_SWEEP);

  for (const doc of candidates) {
    const invoiceId = String(doc.data()?.payment?.invoiceId ?? '');
    if (!invoiceId) {
      continue;
    }

    result.checked += 1;

    try {
      const status: any = await bonumGet(`/bonum-gateway/ecommerce/invoices/${invoiceId}`);
      const top = String(status?.status ?? '').toUpperCase();
      const inner = String(status?.body?.status ?? status?.body?.invoiceStatus ?? '').toUpperCase();
      const paid = ['PAID', 'SUCCESS'].includes(top) || ['PAID', 'SUCCESS'].includes(inner);

      if (!paid) {
        continue;
      }

      await postOrderPaidEntry(db, doc.id, {
        ...(status?.body?.paymentVendor && { bonumPaymentVendor: String(status.body.paymentVendor) }),
        ...(status?.body?.completedAt && { bonumCompletedAt: String(status.body.completedAt) }),
        ...(status?.body?.amount != null && { bonumAmount: Number(status.body.amount) }),
      });
      await tellTheChatCustomer(db, doc.id);
      result.settled += 1;
    } catch (err) {
      // One unreachable invoice must not stop the rest being checked.
      console.warn(`[chat/orderPaid] ${invoiceId} check failed:`, (err as Error).message);
    }
  }

  return result;
}
