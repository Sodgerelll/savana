// GET  /api/chat/setup — is Facebook connected, and to which page?
// POST /api/chat/setup — install the greeting, Get Started button and menu
//
// The credentials themselves live in the deployment's environment, never in
// Firestore and never in the admin bundle, so this route is how the settings
// screen learns anything about them. The POST verifies the token as a side
// effect: it is the difference between "configured" and "configured and known
// good".

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { requirePrivilegedCaller } from './_lib/auth.js';
import { applyMessengerProfile, getPageName } from './_lib/facebook.js';
import { facebookComesFromEnv, loadChatSettings, type ChatButton } from './_lib/settings.js';

export const config = { maxDuration: 30 };

/**
 * Lays the shop's buttons out the way Messenger will accept them.
 *
 * One flat list. There used to be a submenu here, because Messenger showed
 * three entries at the top and a fourth was dropped in silence. Asked directly,
 * Meta took four and then eight in one flat list and refused the submenu —
 * "(#100) Invalid button type" — which failed the whole request and left the
 * page with no menu at all rather than an incomplete one.
 */
function toMenuItems(buttons: ChatButton[]) {
  return buttons.map((button) => ({ title: button.title, payload: button.action }));
}

const NOT_CONFIGURED = 'Facebook холбогдоогүй байна. FB_PAGE_ACCESS_TOKEN тохируулна уу.';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
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

    if (req.method === 'GET') {
      const connected = Boolean(settings.facebook.pageAccessToken);

      res.status(200).json({
        connected,
        // Only a token Meta accepts yields a name, so this is the real check.
        // Null means "configured but Meta refused it" — an expired token reads
        // exactly the same as a typo, which is the point.
        pageName: connected ? await getPageName(settings.facebook.pageAccessToken) : null,
        instagram: connected && settings.facebook.instagramIsActive,
        comments: connected && settings.facebook.replyToComments,
        managedByEnv: facebookComesFromEnv(),
      });
      return;
    }

    if (!settings.facebook.pageAccessToken) {
      res.status(409).json({ error: NOT_CONFIGURED });
      return;
    }

    await applyMessengerProfile(settings.facebook.pageAccessToken, {
      menuItems: toMenuItems(settings.menuButtons),
    });

    res.status(200).json({
      ok: true,
      message: 'Facebook хуудсанд цэс суулаа.',
    });
  } catch (err) {
    // The Graph error text is what tells an admin whether the token is expired
    // or the app is missing a permission, so it is worth surfacing here.
    const detail = (err as Error).message;
    console.error('[chat/setup] failed:', detail);
    res.status(502).json({ error: detail });
  }
}
