// POST /api/orders/mark-paid
// Body: { orderId: string }
// Server-side counterpart to src/lib/orders.ts#markOrderAsPaid — re-verifies the order's
// Bonum invoice, flips the order to "paid", and posts the accounting journal entry, all via
// the Admin SDK. This keeps online-order revenue recognition (and the journal entry that
// represents it) authored server-side instead of trusting the customer's own browser.
//
// If FIREBASE_SERVICE_ACCOUNT_JSON isn't configured (e.g. local dev), responds 503 with
// { fallback: true } so the client can degrade to its previous direct-Firestore-write path
// (no journal entry posted in that case — matches today's dev-without-credentials behavior).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { bonumGet } from '../bonum/_client.js';
import { postOrderPaidEntry } from '../_lib/postOrderPaidEntry.js';
import { upsertOrderContact } from '../_lib/upsertOrderContact.js';

interface BonumInvoiceBody {
  status?: string;
  invoiceStatus?: string;
  paymentVendor?: string;
  completedAt?: string;
  terminalId?: string | number;
  amount?: number;
}

interface BonumInvoiceStatus {
  status?: string;
  body?: BonumInvoiceBody;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { orderId } = (req.body ?? {}) as { orderId?: string };
  if (!orderId || !orderId.trim()) {
    res.status(400).json({ error: 'orderId is required' });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'Service unavailable', fallback: true });
    return;
  }

  try {
    const db = await dbPromise;
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const data = snap.data() as Record<string, unknown>;
    const payment = (data.payment as Record<string, unknown>) ?? {};

    if (payment.status === 'paid') {
      res.status(200).json({ payment });
      return;
    }

    const invoiceId = typeof payment.invoiceId === 'string' ? payment.invoiceId : null;
    const bonumFields: Record<string, unknown> = {};

    if (invoiceId) {
      const result = await bonumGet<BonumInvoiceStatus>(`/bonum-gateway/ecommerce/invoices/${invoiceId}`);
      const body = result?.body;
      const topStatus = String(result?.status ?? '').toUpperCase();
      const bodyStatus = String(body?.status ?? body?.invoiceStatus ?? '').toUpperCase();
      const paid = topStatus === 'PAID' || bodyStatus === 'PAID' || topStatus === 'SUCCESS' || bodyStatus === 'SUCCESS';

      if (!paid) {
        res.status(400).json({
          error: 'Төлбөр Bonum системд баталгаажаагүй байна. Төлбөрөө хийсний дараа дахин шалгана уу.',
        });
        return;
      }

      if (body?.paymentVendor) bonumFields.bonumPaymentVendor = String(body.paymentVendor);
      if (body?.completedAt) bonumFields.bonumCompletedAt = String(body.completedAt);
      if (body?.terminalId != null) bonumFields.bonumTerminalId = String(body.terminalId);
      if (body?.amount != null) bonumFields.bonumAmount = Number(body.amount);
    }

    await postOrderPaidEntry(db, orderId, bonumFields);

    // The buyer joins the CRM directory, but never at the cost of the payment: a failure
    // here is logged and swallowed so the order is still reported as paid.
    try {
      await upsertOrderContact(db, orderId);
    } catch (err) {
      console.error('[orders/mark-paid] customer directory sync failed:', err);
    }

    const updatedSnap = await orderRef.get();
    res.status(200).json({ payment: (updatedSnap.data() as Record<string, unknown>).payment });
  } catch (err) {
    console.error('[orders/mark-paid] failed:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
}
