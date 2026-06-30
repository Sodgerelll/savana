// GET /api/orders/lookup?orderNumber=ORD-...
// Returns limited order info (status, items, totals) — no customer PII.
// Uses Firebase Admin SDK to bypass Firestore client security rules.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { orderNumber } = req.query as { orderNumber?: string };
  if (!orderNumber || !orderNumber.trim()) {
    res.status(400).json({ error: 'orderNumber is required' });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }

  try {
    const db = await dbPromise;
    const snapshot = await db
      .collection('orders')
      .where('orderNumber', '==', orderNumber.toUpperCase().trim())
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const data = snapshot.docs[0].data();

    res.status(200).json({
      orderNumber: data.orderNumber,
      status: data.status,
      items: (data.items ?? []).map((item: any) => ({
        productId: item.productId,
        name: item.name,
        image: item.image ?? null,
        variant: item.variant ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      totals: {
        subtotal: data.totals?.subtotal ?? 0,
        shippingFee: data.totals?.shippingFee ?? 0,
        grandTotal: data.totals?.grandTotal ?? 0,
      },
      createdAt: data.createdAt ?? null,
    });
  } catch (err) {
    console.error('[orders/lookup] failed:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
