// /api/push/subscription — the admin devices that get order notifications.
//
//   GET     → { publicKey }  the VAPID key a browser needs to subscribe. Public by design.
//   POST    { subscription } Authorization: Bearer <ID token>  → stores/refreshes this device.
//   DELETE  { endpoint }     Authorization: Bearer <ID token>  → forgets this device.
//
// Only admins and sysadmins may register — they are the ones who can read /orders, so they
// are the ones an order notification is for (api/_lib/pushNotify.ts re-checks the role at
// send time). The collection is closed to browsers in firestore.rules; this route is the
// only way in. A device belongs to whoever registered it last, so signing in as someone
// else on the same phone moves the subscription rather than duplicating it.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { requirePrivilegedCaller } from '../chat/_lib/auth.js';
import {
  PUSH_SUBSCRIPTIONS_COLLECTION,
  parsePushSubscription,
  subscriptionId,
  vapidPublicKey,
} from '../_lib/pushNotify.js';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method === 'GET') {
    const publicKey = vapidPublicKey();
    if (!publicKey) {
      res.status(503).json({ error: 'Push мэдэгдэл тохируулагдаагүй байна.' });
      return;
    }
    res.status(200).json({ publicKey });
    return;
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authorization = await requirePrivilegedCaller(req);
  if (!authorization.ok) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'Сервер тохируулагдаагүй байна.' });
    return;
  }

  try {
    const db = await dbPromise;
    const { uid } = authorization.caller;

    if (req.method === 'POST') {
      const subscription = parsePushSubscription((req.body ?? {}).subscription);
      if (!subscription) {
        res.status(400).json({ error: 'Хүчинтэй subscription шаардлагатай.' });
        return;
      }

      const { FieldValue } = await import('firebase-admin/firestore');
      await db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(subscriptionId(subscription.endpoint)).set(
        {
          uid,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          userAgent: String(req.headers?.['user-agent'] ?? '').slice(0, 300),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      res.status(200).json({ ok: true });
      return;
    }

    const endpoint = (req.body ?? {}).endpoint;
    if (typeof endpoint !== 'string' || !endpoint) {
      res.status(400).json({ error: 'endpoint шаардлагатай.' });
      return;
    }

    // Only the owner removes a device: one admin cannot silence another's phone.
    const ref = db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(subscriptionId(endpoint));
    const snapshot = await ref.get();
    if (snapshot.exists && snapshot.data()?.uid === uid) {
      await ref.delete();
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push/subscription] failed:', err);
    res.status(500).json({ error: 'Мэдэгдлийн тохиргоо хадгалж чадсангүй.' });
  }
}
