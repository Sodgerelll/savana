// Web Push to the admins' devices when an order comes in or is paid.
//
// An admin turns notifications on from the installed PWA (src/components/OrderPushToggle.tsx);
// that stores the browser's push subscription in /pushSubscriptions through
// api/push/subscription.ts. This module is the other half: given an order, it tells every
// subscribed admin device.
//
// Notifying is strictly best-effort. It is called from the paths that take money and write
// the ledger, so nothing here may ever throw into them or hold them up: every failure is
// logged and swallowed, and with no VAPID keys configured the whole thing is a no-op.
//
// The payload carries the order number, item count and total — never the buyer's name, phone
// or address. A push passes through the browser vendor's servers and lands on a lock screen.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';

export const PUSH_SUBSCRIPTIONS_COLLECTION = 'pushSubscriptions';

/** Mirrors isPrivilegedRole() in src/lib/userProfiles.ts — the roles that may read /orders. */
const NOTIFIED_ROLES = ['admin', 'sysadmin'];

/** Where tapping a notification lands. */
const ORDERS_URL = '/account/orders';

/** A push the device could not be reached for is worth retrying for this long, no longer. */
const PUSH_TTL_SECONDS = 12 * 60 * 60;

/** One slow push service must not hold up a payment webhook. */
const SEND_TIMEOUT_MS = 8000;

export interface PushPayload {
  title: string;
  body: string;
  /** Same tag replaces the earlier notification, so "placed" then "paid" show as one. */
  tag: string;
  url: string;
}

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The document id for a subscription: the endpoint is unique per browser install. */
export function subscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

/** Structural check on what a browser's PushSubscription.toJSON() gave us. */
export function parsePushSubscription(value: unknown): StoredPushSubscription | null {
  const candidate = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = candidate?.endpoint;
  const p256dh = candidate?.keys?.p256dh;
  const auth = candidate?.keys?.auth;

  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return null;
  }
  if (!endpoint.startsWith('https://') || endpoint.length > 2048 || !p256dh || !auth) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth } };
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function vapidDetails(): { subject: string; publicKey: string; privateKey: string } | null {
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) {
    return null;
  }
  // The push services want a contact for whoever is sending; a mailto: or the site's URL.
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@savana.mn';
  return { subject, publicKey, privateKey };
}

function formatMnt(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')}₮`;
}

function describeOrder(order: Record<string, any>): string {
  const items = Array.isArray(order.items) ? order.items : [];
  const quantity = items.reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.quantity ?? 0)), 0);
  const total = Number(order.totals?.grandTotal ?? order.payment?.amount ?? 0);
  return [String(order.orderNumber ?? ''), quantity > 0 ? `${quantity} ширхэг` : '', total > 0 ? formatMnt(total) : '']
    .filter(Boolean)
    .join(' · ');
}

export function newOrderPayload(orderId: string, order: Record<string, any>): PushPayload {
  return {
    title: '🛍 Шинэ захиалга ирлээ',
    body: describeOrder(order),
    tag: `order-${orderId}`,
    url: ORDERS_URL,
  };
}

export function paidOrderPayload(orderId: string, order: Record<string, any>): PushPayload {
  return {
    title: '✅ Захиалгын төлбөр төлөгдлөө',
    body: describeOrder(order),
    tag: `order-${orderId}`,
    url: ORDERS_URL,
  };
}

/**
 * Subscriptions whose owner still holds an admin role. Anyone since demoted, or whose
 * profile is gone, is dropped (and their subscription deleted) rather than left receiving
 * order amounts they can no longer open.
 */
async function loadRecipients(db: any): Promise<Array<{ id: string; subscription: StoredPushSubscription }>> {
  const snapshot = await db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).get();
  const docs: any[] = snapshot?.docs ?? [];
  if (docs.length === 0) {
    return [];
  }

  const roles = new Map<string, boolean>();
  for (const uid of new Set(docs.map((doc) => String(doc.data()?.uid ?? '')))) {
    if (!uid) {
      roles.set(uid, false);
      continue;
    }
    const profile = await db.collection('users').doc(uid).get();
    roles.set(uid, profile.exists && NOTIFIED_ROLES.includes(String(profile.data()?.role ?? '')));
  }

  const recipients: Array<{ id: string; subscription: StoredPushSubscription }> = [];
  for (const doc of docs) {
    const data = doc.data() ?? {};
    const subscription = parsePushSubscription(data);
    if (subscription && roles.get(String(data.uid ?? ''))) {
      recipients.push({ id: doc.id, subscription });
    } else {
      await doc.ref.delete().catch(() => undefined);
    }
  }
  return recipients;
}

/**
 * Sends one notification to every subscribed admin device. Returns how many were delivered
 * to a push service. Never throws.
 */
export async function notifyAdmins(db: any, payload: PushPayload): Promise<number> {
  const details = vapidDetails();
  if (!details) {
    return 0;
  }

  try {
    const recipients = await loadRecipients(db);
    if (recipients.length === 0) {
      return 0;
    }

    const imported: any = await import('web-push');
    const webpush = imported.default ?? imported;
    webpush.setVapidDetails(details.subject, details.publicKey, details.privateKey);

    const body = JSON.stringify(payload);
    const outcomes = await Promise.all(
      recipients.map(async ({ id, subscription }) => {
        try {
          await webpush.sendNotification(subscription, body, {
            TTL: PUSH_TTL_SECONDS,
            urgency: 'high',
            timeout: SEND_TIMEOUT_MS,
          });
          return true;
        } catch (err) {
          const status = Number((err as { statusCode?: number }).statusCode);
          // 404/410: the browser has revoked or lost this subscription. It will never work
          // again, so it goes rather than being retried on every order.
          if (status === 404 || status === 410) {
            await db.collection(PUSH_SUBSCRIPTIONS_COLLECTION).doc(id).delete().catch(() => undefined);
          } else {
            console.warn(`[push] send failed (${Number.isFinite(status) ? status : 'network'}):`, (err as Error).message);
          }
          return false;
        }
      }),
    );
    return outcomes.filter(Boolean).length;
  } catch (err) {
    console.error('[push] notify failed:', err);
    return 0;
  }
}

async function notifyAboutOrder(
  db: any,
  orderId: string,
  build: (orderId: string, order: Record<string, any>) => PushPayload,
): Promise<void> {
  // Checked first so an unconfigured deployment (and every test) never touches Firestore.
  if (!vapidDetails()) {
    return;
  }
  try {
    const snapshot = await db.collection('orders').doc(orderId).get();
    if (!snapshot.exists) {
      return;
    }
    await notifyAdmins(db, build(orderId, snapshot.data() as Record<string, any>));
  } catch (err) {
    console.error('[push] could not read order for notification:', err);
  }
}

/** An order has just been placed and its invoice raised. */
export function notifyNewOrder(db: any, orderId: string): Promise<void> {
  return notifyAboutOrder(db, orderId, newOrderPayload);
}

/** An order has just been settled. Call only when it newly became paid, not on a repeat. */
export function notifyOrderPaid(db: any, orderId: string): Promise<void> {
  return notifyAboutOrder(db, orderId, paidOrderPayload);
}
