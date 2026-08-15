// POST /api/orders/register-contact
// Body: { orderId: string }
//
// Puts the buyer of a freshly placed storefront order into the CRM customer directory,
// before any payment has happened. The shopper's browser cannot do this itself:
// /crmContacts is admin-only in firestore.rules, both to write AND to read — and reading
// is what deduplicating by phone would need, so opening it up would expose the whole
// customer list to anyone at checkout. The Admin SDK does it here instead.
//
// Best-effort by design: the checkout calls this and ignores the outcome, and the paid
// path (Bonum webhook / mark-paid) upserts the same buyer again as a backstop. Both are
// idempotent — a buyer already in the directory is matched on phone, never duplicated.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { upsertOrderContact } from '../_lib/upsertOrderContact.js';

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
    // No Admin SDK credentials (e.g. local dev) — nothing to register, and the caller
    // treats this as a no-op rather than a checkout failure.
    res.status(503).json({ error: 'Service unavailable', skipped: true });
    return;
  }

  try {
    const db = await dbPromise;
    const contactId = await upsertOrderContact(db, orderId);
    res.status(200).json({ contactId });
  } catch (err) {
    console.error('[orders/register-contact] failed:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
}
