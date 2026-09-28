// POST /api/orders/mark-paid
// Body: { orderId: string }
// The "I have paid — check" button's server side, and the fallback for a Bonum webhook that
// never arrived. Asks Bonum about the order's own invoice and, only if Bonum says it is paid
// in full, flips the order to "paid", moves its stock and posts the journal entry — all via
// the Admin SDK (api/_lib/postOrderPaidEntry.ts).
//
// Needs no caller identity: the only thing it can ever do is record a payment Bonum has
// already confirmed for the invoice the server itself raised for this order. An order with
// no invoice is refused outright — it used to be marked paid with no check at all.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { bonumGet } from '../bonum/_client.js';
import { PaymentVerificationError, postOrderPaidEntry } from '../_lib/postOrderPaidEntry.js';
import { upsertOrderContact } from '../_lib/upsertOrderContact.js';

interface BonumInvoiceBody {
  status?: string;
  invoiceStatus?: string;
  paymentVendor?: string;
  completedAt?: string;
  terminalId?: string | number;
  amount?: number;
  invoiceId?: string;
  transactionId?: string;
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

  const { orderId } = (req.body ?? {}) as { orderId?: unknown };
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(orderId)) {
    res.status(400).json({ error: 'orderId is required' });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'Төлбөрийн баталгаажуулалт түр боломжгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.' });
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

    const invoiceId = typeof payment.invoiceId === 'string' && payment.invoiceId ? payment.invoiceId : null;
    if (!invoiceId) {
      res.status(400).json({ error: 'Энэ захиалгад төлбөрийн нэхэмжлэх үүсээгүй байна.' });
      return;
    }

    const result = await bonumGet<BonumInvoiceStatus>(
      `/bonum-gateway/ecommerce/invoices/${encodeURIComponent(invoiceId)}`,
    );
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

    // The invoice must be this order's own. Bonum echoes the transactionId it was raised
    // with, which is the order id.
    if (body?.transactionId && String(body.transactionId) !== orderId) {
      res.status(400).json({ error: 'Төлөгдсөн нэхэмжлэх энэ захиалгынх биш байна.' });
      return;
    }

    const bonumFields: Record<string, unknown> = {};
    if (body?.paymentVendor) bonumFields.bonumPaymentVendor = String(body.paymentVendor);
    if (body?.completedAt) bonumFields.bonumCompletedAt = String(body.completedAt);
    if (body?.terminalId != null) bonumFields.bonumTerminalId = String(body.terminalId);
    if (body?.amount != null) bonumFields.bonumAmount = Number(body.amount);

    await postOrderPaidEntry(db, orderId, bonumFields, {
      invoiceId: body?.invoiceId ? String(body.invoiceId) : invoiceId,
      paidAmount: body?.amount != null ? Number(body.amount) : null,
    });

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
    if (err instanceof PaymentVerificationError) {
      console.error(`[orders/mark-paid] ${orderId}: ${err.code}`);
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('[orders/mark-paid] failed:', err);
    res.status(500).json({ error: 'Төлбөр шалгах үед алдаа гарлаа. Дахин оролдоно уу.' });
  }
}
