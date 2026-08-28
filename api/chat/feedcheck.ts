// TEMPORARY diagnostic — delete after use.
// Says whether the page's own posts are reaching the prompt, and why not.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { loadChatSettings } from './_lib/settings.js';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const GUARD = '369b247d2315c048d31766d00e450855ee00';

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

  const url = `${GRAPH_URL}/me/posts?fields=message,created_time,attachments{title,description}&limit=15`;
  const graph = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body: any = await graph.json().catch(() => ({}));

  res.status(200).json({
    tokenLength: token.length,
    http: graph.status,
    error: body?.error?.message ?? null,
    count: Array.isArray(body?.data) ? body.data.length : 0,
    sample: (body?.data ?? []).slice(0, 3).map((p: any) => ({
      at: String(p?.created_time ?? '').slice(0, 10),
      text: String(p?.message ?? '').slice(0, 120),
    })),
  });
}
