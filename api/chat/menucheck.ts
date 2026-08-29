// TEMPORARY diagnostic — delete after use.
// Finds which part of the Messenger profile payload Meta refuses.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { loadChatSettings } from './_lib/settings.js';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const GUARD = '7c172aae5b07d39ad94e248a13e42f252db2';

const FLAT = [
  { type: 'postback', title: 'Бүтээгдэхүүн 🌿', payload: 'SHOW_PRODUCTS' },
  { type: 'postback', title: 'Хямдрал 🎁', payload: 'SHOW_PROMOTIONS' },
  { type: 'postback', title: 'Ажилтантай ярих ☎️', payload: 'TRANSFER_TO_STAFF' },
];

const NESTED = [
  FLAT[0],
  FLAT[1],
  {
    type: 'nested',
    title: 'Бусад ☰',
    call_to_actions: [FLAT[2], { type: 'postback', title: 'Ботруу буцах 🤖', payload: 'RESUME_BOT' }],
  },
];

function menu(actions: unknown[]) {
  return [{ locale: 'default', composer_input_disabled: false, call_to_actions: actions }];
}

export const config = { maxDuration: 60 };

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

  const variants: Array<[string, Record<string, unknown>]> = [
    ['get_started', { get_started: { payload: 'GET_STARTED' } }],
    ['greeting', { greeting: [{ locale: 'default', text: 'Сайн байна уу!' }] }],
    ['menu.flat', { persistent_menu: menu(FLAT) }],
    ['menu.nested', { persistent_menu: menu(NESTED) }],
    ['menu.noEmoji', { persistent_menu: menu(FLAT.map((b) => ({ ...b, title: b.title.replace(/[^\u0400-\u04FF\s]/g, '').trim() }))) }],
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const [name, body] of variants) {
    const graph = await fetch(`${GRAPH_URL}/me/messenger_profile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out: any = await graph.json().catch(() => ({}));
    results.push({
      name,
      http: graph.status,
      ok: graph.ok,
      error: out?.error?.message ?? null,
    });
  }

  res.status(200).json({ results });
}
