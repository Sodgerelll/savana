// POST /api/chat/setup
//
// Pushes the greeting, Get Started button and persistent menu onto the Facebook
// page, and verifies the saved Page Access Token actually works. Run from the
// admin settings screen after the token is entered — it is the difference
// between "token saved" and "token saved and known good".

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { requirePrivilegedCaller } from './_lib/auth.js';
import { applyMessengerProfile } from './_lib/facebook.js';
import { loadChatSettings } from './_lib/settings.js';

export const config = { maxDuration: 30 };

/** Matches START_QUICK_REPLIES in the webhook so both entry points agree. */
const DEFAULT_MENU_ITEMS = [
  { title: 'Бүтээгдэхүүн 🌿', payload: 'SHOW_PRODUCTS' },
  { title: 'Хямдрал 🎁', payload: 'SHOW_PROMOTIONS' },
  { title: 'Ажилтантай ярих ☎️', payload: 'TRANSFER_TO_STAFF' },
];

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
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
    const settings = await loadChatSettings(db);

    if (!settings.facebook.pageAccessToken) {
      res.status(409).json({ error: 'Эхлээд Page Access Token хадгална уу.' });
      return;
    }

    await applyMessengerProfile(settings.facebook.pageAccessToken, {
      greeting: settings.welcomeMessage,
      menuItems: DEFAULT_MENU_ITEMS,
    });

    res.status(200).json({
      ok: true,
      message: 'Facebook хуудсанд цэс болон мэндчилгээ суулаа.',
    });
  } catch (err) {
    // The Graph error text is what tells an admin whether the token is expired
    // or the app is missing a permission, so it is worth surfacing here.
    const detail = (err as Error).message;
    console.error('[chat/setup] failed:', detail);
    res.status(502).json({ error: detail });
  }
}
