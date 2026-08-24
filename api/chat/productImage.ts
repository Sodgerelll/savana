// GET /api/chat/productImage?id=403114 — a product photo, over HTTPS.
//
// Photos are stored in Firestore as `data:` URIs. That is fine for the
// storefront, where the browser renders the bytes inline, and useless for
// Messenger: Facebook fetches a carousel image itself, from its own servers,
// and a `data:` URI has no host to fetch from. So every card went out without a
// picture — the catalogue looked broken in exactly the place it should sell.
//
// This hands the stored bytes back as an ordinary image response. Nothing is
// migrated and nothing is duplicated: the product document stays the one copy.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';

export const config = { maxDuration: 15 };

const ID_PATTERN = /^\d{1,12}$/;
const DATA_URI = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * A day. Facebook caches what it fetches, so this mostly spares the repeat
 * cards inside one conversation — and keeps a photo swap visible the next day
 * without anyone clearing anything.
 */
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=86400';

/**
 * An 8×8 block of the storefront's own cream, sent when a product has no usable
 * photo. A 404 would leave the card pointing at a URL that fails to load, and a
 * card whose image fails is worse than one that never promised a picture — this
 * way every card renders, at the same size, whatever the catalogue holds.
 */
const PLACEHOLDER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mN4+/IBVsQwtCQAzfWtgafIJkcAAAAASUVORK5CYII=',
  'base64',
);

type StoredImage =
  | { kind: 'url'; url: string }
  | { kind: 'bytes'; contentType: string; bytes: Buffer };

/**
 * The first entry that can actually be served. Anything else — a relative path,
 * a blob URL, a truncated data URI — is skipped rather than guessed at.
 */
export function parseStoredImage(images: unknown): StoredImage | null {
  if (!Array.isArray(images)) {
    return null;
  }

  for (const entry of images) {
    if (typeof entry !== 'string') {
      continue;
    }
    const value = entry.trim();

    if (/^https:\/\//i.test(value)) {
      return { kind: 'url', url: value };
    }

    const match = DATA_URI.exec(value);
    if (match) {
      const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
      if (bytes.length > 0) {
        return { kind: 'bytes', contentType: match[1].toLowerCase(), bytes };
      }
    }
  }

  return null;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = String(req.query?.id ?? '').trim();
  if (!ID_PATTERN.test(id)) {
    res.status(400).send('Bad request');
    return;
  }

  const dbPromise = getAdminFirestore();
  if (!dbPromise) {
    res.status(503).send('Unavailable');
    return;
  }

  try {
    const db = await dbPromise;
    const snapshot = await db.collection('products').doc(id).get();
    const data = snapshot.exists ? snapshot.data() : null;

    // Matches how the prompt picks products, so a card can never point at a
    // photo the catalogue itself would not show.
    if (!data || data.status === 'inactive') {
      res.status(404).send('Not found');
      return;
    }

    res.setHeader('Cache-Control', CACHE_CONTROL);

    const image = parseStoredImage(data.images);
    if (!image) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', String(PLACEHOLDER.length));
      res.status(200).send(PLACEHOLDER);
      return;
    }

    // A photo already on the web is served from where it lives, so its bytes
    // never travel through here at all.
    if (image.kind === 'url') {
      res.redirect(302, image.url);
      return;
    }

    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Length', String(image.bytes.length));
    res.status(200).send(image.bytes);
  } catch (err) {
    console.error('[chat/productImage] failed:', (err as Error).message);
    res.status(500).send('Error');
  }
}
