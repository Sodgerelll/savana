// POST /api/bonum/invoice
// Body: { orderId: string }   Header: Authorization: Bearer <Firebase ID token>
//
// Raises the Bonum invoice for a storefront order the caller placed, and returns
// { invoiceId, followUpLink, orderNumber, items, totals }.
//
// The amount is never taken from the request. It used to be: this route accepted any
// `amount` and any `transactionId` from anyone, so a shopper could raise a 100₮ invoice
// against a 1,000,000₮ order, pay it, and have the webhook mark the order paid. Now the
// order is re-priced from the catalogue (api/_lib/orderPricing.ts), the invoice is raised
// for that figure, and the order document is rewritten with the verified lines and totals —
// through the Admin SDK, since a shopper can no longer write payment fields at all.
//
// Idempotent: an order that already has an invoice gets the same one back.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { bonumCallbackUrl, bonumPost } from './_client.js';
import { getAdminFirestore } from './_firebaseAdmin.js';
import { identifyCaller } from '../_lib/callerIdentity.js';
import {
  OrderPricingError,
  loadOrderPricingInputs,
  priceWebOrder,
  type PricedOrderItem,
  type PricedOrderTotals,
} from '../_lib/orderPricing.js';

const INVOICE_TTL_SECONDS = 3600;

interface BonumInvoiceResponse {
  invoiceId: string;
  followUpLink: string;
}

interface InvoiceResult {
  invoiceId: string;
  followUpLink: string;
  orderNumber: string;
  items: PricedOrderItem[];
  totals: PricedOrderTotals;
}

function existingInvoice(orderId: string, data: Record<string, any>): InvoiceResult | null {
  const payment = data.payment ?? {};
  // Both the id and the link are only ever written together, by the transaction below; the
  // QR field holds a placeholder until then, so the id is what says an invoice exists.
  if (typeof payment.invoiceId !== 'string' || !payment.invoiceId || !payment.qrPayload) {
    return null;
  }
  return {
    invoiceId: payment.invoiceId,
    followUpLink: String(payment.qrPayload),
    orderNumber: String(data.orderNumber ?? orderId),
    items: Array.isArray(data.items) ? data.items : [],
    totals: data.totals ?? {},
  };
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
    res.status(503).json({ error: 'Төлбөрийн үйлчилгээ түр боломжгүй байна.' });
    return;
  }

  const caller = await identifyCaller(req);
  if (!caller.ok) {
    res.status(caller.status).json({ error: caller.error });
    return;
  }

  try {
    const db = await dbPromise;
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      res.status(404).json({ error: 'Захиалга олдсонгүй.' });
      return;
    }

    const data = snap.data() as Record<string, any>;

    // Only the shopper who placed the order may raise its invoice. The same wording as a
    // missing order, so the route cannot be used to probe which ids exist.
    if (!data.auth?.uid || data.auth.uid !== caller.uid) {
      res.status(404).json({ error: 'Захиалга олдсонгүй.' });
      return;
    }

    if (data.payment?.status === 'paid' || data.status !== 'new') {
      res.status(409).json({ error: 'Энэ захиалгын төлбөр аль хэдийн төлөгдсөн байна.' });
      return;
    }

    const already = existingInvoice(orderId, data);
    if (already) {
      res.status(200).json(already);
      return;
    }

    const pricing = priceWebOrder(data.items, await loadOrderPricingInputs(db, data.items, new Date()));
    const orderNumber = String(data.orderNumber ?? orderId);

    const invoice = await bonumPost<BonumInvoiceResponse>('/bonum-gateway/ecommerce/invoices', {
      amount: pricing.totals.grandTotal,
      // The document id doubles as the Bonum transactionId, which is how the payment
      // webhook finds this order again.
      transactionId: orderId,
      description: `${orderNumber} · web`,
      callback: bonumCallbackUrl(),
      expiresIn: INVOICE_TTL_SECONDS,
    });

    const { FieldValue } = await import('firebase-admin/firestore');

    // Two tabs asking at once both reach Bonum; only the first invoice is kept on the
    // order and handed to both. The other simply expires unpaid.
    const result: InvoiceResult = await db.runTransaction(async (t: any) => {
      const fresh = await t.get(orderRef);
      const freshData = (fresh.exists ? fresh.data() : {}) as Record<string, any>;
      const raced = existingInvoice(orderId, freshData);
      if (raced) {
        return raced;
      }
      if (freshData.payment?.status === 'paid' || freshData.status !== 'new') {
        throw new OrderPricingError('ALREADY_PAID', 'Энэ захиалгын төлбөр аль хэдийн төлөгдсөн байна.');
      }

      t.update(orderRef, {
        items: pricing.items,
        totals: pricing.totals,
        payment: {
          ...(freshData.payment ?? {}),
          method: 'bonum',
          provider: 'bonum',
          status: 'pending',
          amount: pricing.totals.grandTotal,
          qrPayload: invoice.followUpLink,
          invoiceId: invoice.invoiceId,
          paidAt: null,
        },
        // Marks the lines and totals as the server's own, so the paid step can book them
        // as they stand. `clientGrandTotal` keeps what the browser claimed, for an admin
        // wondering why a shopper saw a different figure.
        pricing: {
          verifiedBy: 'server',
          verifiedAt: FieldValue.serverTimestamp(),
          clientGrandTotal: Number(freshData.totals?.grandTotal ?? 0),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        invoiceId: invoice.invoiceId,
        followUpLink: invoice.followUpLink,
        orderNumber,
        items: pricing.items,
        totals: pricing.totals,
      };
    });

    res.status(200).json(result);
  } catch (err) {
    if (err instanceof OrderPricingError) {
      res.status(err.code === 'ALREADY_PAID' ? 409 : 400).json({ error: err.message, code: err.code });
      return;
    }
    console.error('[bonum/invoice] failed:', err);
    res.status(500).json({ error: 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.' });
  }
}
