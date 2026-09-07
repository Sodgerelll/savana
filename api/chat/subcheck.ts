// TEMPORARY diagnostic — delete after use.
// Says which webhook fields this page is subscribed to. Read-only.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { loadChatSettings } from './_lib/settings.js';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const GUARD = '0b99106894adc51d6c5be0740bab01871cb3';

export const config = { maxDuration: 30 };

export default async function handler(req: any, res: any): Promise<void> {
  if (String(req.query?.key ?? '') !== GUARD) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).json({ error: 'no db' });
    return;
  }
  const settings = await loadChatSettings(await dbPromise);
  const token = settings.facebook.pageAccessToken;
  if (!token) {
    res.status(200).json({ token: 'missing' });
    return;
  }

  const graph = await fetch(`${GRAPH_URL}/me/subscribed_apps?fields=subscribed_fields`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body: any = await graph.json().catch(() => ({}));
  const apps = Array.isArray(body?.data) ? body.data : [];
  const fields = apps.flatMap((app: any) => app?.subscribed_fields ?? []);

  res.status(200).json({
    http: graph.status,
    error: body?.error?.message ?? null,
    apps: apps.length,
    subscribedFields: fields,
    hasMessages: fields.includes('messages'),
    hasEchoes: fields.includes('message_echoes'),
    hasFeed: fields.includes('feed'),
  });
}
