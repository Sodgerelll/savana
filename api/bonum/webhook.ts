// POST /api/bonum/webhook
// Receives Bonum payment notifications, validates the HmacSHA256 checksum, then settles the
// matching Firestore order (api/_lib/postOrderPaidEntry.ts) — but only if the notice names
// the order's own invoice and did not collect less than it asked for.
//
// Required env vars:
//   BONUM_CHECKSUM_KEY            — MERCHANT_CHECKSUM_KEY from Bonum
//   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase Admin service account JSON

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAdminFirestore } from './_firebaseAdmin.js';
import { PaymentVerificationError, postOrderPaidEntry } from '../_lib/postOrderPaidEntry.js';
import { upsertOrderContact } from '../_lib/upsertOrderContact.js';
import { readRawBody } from '../_lib/rawBody.js';
import { tellTheChatCustomer } from '../chat/_lib/orderPaid.js';

// The checksum is computed over the body exactly as Bonum sent it, so the platform must
// not parse it first.
export const config = { api: { bodyParser: false } };

function digestMatches(payload: string, key: string, signature: string): boolean {
  const expected = Buffer.from(createHmac('sha256', key).update(payload, 'utf8').digest('hex'));
  const received = Buffer.from(signature.trim().toLowerCase());
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Validates the x-checksum-v2 header: HmacSHA256 over the body. The raw bytes are what Bonum
 * signed; the compact re-serialisation is accepted as well because that is what this route
 * always checked against, and a sender that already emits compact JSON produces the same
 * string either way.
 */
export function isValidChecksum(raw: string | null, parsed: unknown, signature: string): boolean {
  const key = process.env.BONUM_CHECKSUM_KEY ?? '';
  if (!key || !signature) return false;
  if (raw !== null && digestMatches(raw, key, signature)) return true;
  return parsed !== undefined && digestMatches(JSON.stringify(parsed), key, signature);
}

interface WebhookPayment {
  transactionId?: string;
  invoiceId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  invoiceStatus?: string;
  paymentVendor?: string;
  completedAt?: string;
  terminalId?: string | number;
}

interface BonumWebhookBody {
  type?: string;
  status?: string;
  body?: WebhookPayment;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const raw = await readRawBody(req);
  let parsed: BonumWebhookBody | undefined;
  try {
    parsed = raw !== null ? (JSON.parse(raw) as BonumWebhookBody) : (req.body as BonumWebhookBody | undefined);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const signature = String(req.headers?.['x-checksum-v2'] ?? '');
  if (!isValidChecksum(raw, parsed, signature)) {
    console.error('[bonum/webhook] Invalid checksum');
    res.status(401).json({ error: 'Invalid checksum' });
    return;
  }

  const { type, status, body } = parsed ?? {};

  // Only successful payments settle anything; everything else is acknowledged and dropped.
  if (!(type === 'PAYMENT' && status === 'SUCCESS' && body?.transactionId)) {
    res.status(200).json({ ok: true });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    // Nothing can be recorded, so ask Bonum to try again later rather than acknowledging a
    // payment that went nowhere.
    console.error('[bonum/webhook] FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
    res.status(503).json({ error: 'Not configured' });
    return;
  }

  const db = await dbPromise;
  const orderId = String(body.transactionId);

  try {
    await markOrderPaidViaAdmin(db, orderId, body);
  } catch (err) {
    if (err instanceof PaymentVerificationError) {
      // Not something a retry can fix. The order stays unpaid and says why, where an admin
      // looking at it will see — money Bonum took for the wrong amount is theirs to settle.
      console.error(`[bonum/webhook] ${orderId}: ${err.code} — ${err.message}`);
      await recordPaymentIssue(db, orderId, err, body).catch((recordErr) =>
        console.error('[bonum/webhook] could not record the payment issue:', recordErr),
      );
      res.status(200).json({ ok: true });
      return;
    }

    // A transient failure (Firestore, a contended transaction): answer with an error so Bonum
    // delivers the notice again. Settling is idempotent, so a repeat is harmless.
    console.error('[bonum/webhook] settling the order failed:', err);
    res.status(500).json({ error: 'Processing failed' });
    return;
  }

  res.status(200).json({ ok: true });
}

async function markOrderPaidViaAdmin(db: any, orderId: string, paymentBody: WebhookPayment): Promise<void> {
  const bonumFields: Record<string, unknown> = {};
  if (paymentBody.paymentVendor) bonumFields['bonumPaymentVendor'] = String(paymentBody.paymentVendor);
  if (paymentBody.completedAt) bonumFields['bonumCompletedAt'] = String(paymentBody.completedAt);
  if (paymentBody.terminalId != null) bonumFields['bonumTerminalId'] = String(paymentBody.terminalId);
  if (paymentBody.amount != null) bonumFields['bonumAmount'] = Number(paymentBody.amount);

  await postOrderPaidEntry(db, orderId, bonumFields, {
    invoiceId: paymentBody.invoiceId ? String(paymentBody.invoiceId) : null,
    paidAmount: paymentBody.amount != null ? Number(paymentBody.amount) : null,
  });

  // The buyer joins the CRM directory, but never at the cost of the payment: a failure
  // here is logged and swallowed so the order still ends up marked paid.
  try {
    await upsertOrderContact(db, orderId);
  } catch (err) {
    console.error('[bonum/webhook] customer directory sync failed:', err);
  }

  try {
    await tellTheChatCustomer(db, orderId);
  } catch (err) {
    console.error('[bonum/webhook] chat confirmation failed:', err);
  }
}

async function recordPaymentIssue(
  db: any,
  orderId: string,
  error: PaymentVerificationError,
  paymentBody: WebhookPayment,
): Promise<void> {
  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) return;
  await orderRef.update({
    paymentIssue: {
      code: error.code,
      message: error.message,
      invoiceId: paymentBody.invoiceId ?? null,
      amount: paymentBody.amount ?? null,
      recordedAt: new Date().toISOString(),
    },
  });
}
