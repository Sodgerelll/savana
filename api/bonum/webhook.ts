// POST /api/bonum/webhook
// Receives Bonum payment notifications, validates the HmacSHA256 checksum,
// then updates the matching Firestore order to "paid".
//
// Required env vars:
//   BONUM_CHECKSUM_KEY          — MERCHANT_CHECKSUM_KEY from Bonum
//   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase Admin service account JSON (optional;
//                                   if omitted, webhook still returns 200 but won't
//                                   update Firestore — frontend polling handles status)

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHmac } from 'node:crypto';

// Validate x-checksum-v2 header using HmacSHA256 over the compact JSON body string
function isValidChecksum(bodyStr: string, signature: string): boolean {
  const key = process.env.BONUM_CHECKSUM_KEY ?? '';
  if (!key) return false;
  const computed = createHmac('sha256', key).update(bodyStr, 'utf8').digest('hex');
  return computed === signature;
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

  // Reconstruct compact JSON for checksum validation
  const bodyStr = JSON.stringify(req.body);
  const signature = String(req.headers['x-checksum-v2'] ?? '');

  if (!isValidChecksum(bodyStr, signature)) {
    console.error('[bonum/webhook] Invalid checksum');
    res.status(401).json({ error: 'Invalid checksum' });
    return;
  }

  const { type, status, body } = req.body as BonumWebhookBody;

  // Only act on successful payments
  if (type === 'PAYMENT' && status === 'SUCCESS' && body?.transactionId) {
    const orderId = body.transactionId;
    try {
      await markOrderPaidViaAdmin(orderId, body);
    } catch (err) {
      // Log but still return 200 so Bonum doesn't retry endlessly.
      // The frontend "Check payment" button serves as fallback.
      console.error('[bonum/webhook] Firestore update failed:', err);
    }
  }

  // Always acknowledge receipt
  res.status(200).json({ ok: true });
}

async function markOrderPaidViaAdmin(orderId: string, paymentBody: WebhookPayment): Promise<void> {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    // Firebase Admin SDK not configured — frontend polling will handle status
    return;
  }

  // Dynamic import so the module is only loaded when credentials are present
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson) as object) });
  }

  const db = getFirestore();
  const orderRef = db.collection('orders').doc(orderId);
  const snap = await orderRef.get();

  if (!snap.exists) {
    console.warn(`[bonum/webhook] Order ${orderId} not found in Firestore`);
    return;
  }

  const data = snap.data() as Record<string, unknown>;
  const currentPayment = (data['payment'] as Record<string, unknown>) ?? {};

  const bonumFields: Record<string, unknown> = {};
  if (paymentBody.paymentVendor) bonumFields['bonumPaymentVendor'] = String(paymentBody.paymentVendor);
  if (paymentBody.completedAt) bonumFields['bonumCompletedAt'] = String(paymentBody.completedAt);
  if (paymentBody.terminalId != null) bonumFields['bonumTerminalId'] = String(paymentBody.terminalId);
  if (paymentBody.amount != null) bonumFields['bonumAmount'] = Number(paymentBody.amount);

  await orderRef.update({
    status: 'paid',
    payment: {
      ...currentPayment,
      status: 'paid',
      paidAt: new Date().toISOString(),
      ...bonumFields,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
}
