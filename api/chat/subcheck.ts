// TEMPORARY diagnostic — delete after use.
// Reads, and on request extends, this page's webhook field subscriptions.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { loadChatSettings } from './_lib/settings.js';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const GUARD = '0b99106894adc51d6c5be0740bab01871cb3';

/**
 * What the page must stay subscribed to.
 *
 * subscribed_fields replaces the list rather than adding to it, so the ones
 * already there are repeated here. Dropping "messages" would stop every
 * customer message reaching the bot.
 */
const WANTED = ['messages', 'messaging_postbacks', 'message_echoes'];

export const config = { maxDuration: 30 };

async function readFields(token: string): Promise<{ http: number; fields: string[]; error: string | null }> {
  const res = await fetch(`${GRAPH_URL}/me/subscribed_apps?fields=subscribed_fields`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body: any = await res.json().catch(() => ({}));
  const apps = Array.isArray(body?.data) ? body.data : [];
  return {
    http: res.status,
    fields: apps.flatMap((app: any) => app?.subscribed_fields ?? []),
    error: body?.error?.message ?? null,
  };
}

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

  const before = await readFields(token);

  if (req.query?.apply !== '1') {
    res.status(200).json({ before, wanted: WANTED, applied: false });
    return;
  }

  const post = await fetch(`${GRAPH_URL}/me/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribed_fields: WANTED.join(',') }),
  });
  const postBody: any = await post.json().catch(() => ({}));
  const after = await readFields(token);

  res.status(200).json({
    before,
    post: { http: post.status, ok: post.ok, error: postBody?.error?.message ?? null },
    after,
    applied: true,
  });
}
