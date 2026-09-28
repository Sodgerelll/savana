// Who is calling a public /api route — any signed-in Firebase user, guests included.
//
// The admin-only routes use api/chat/_lib/auth.ts, which additionally checks the role. The
// routes here serve shoppers, so all they need to know is which uid the request speaks for;
// a guest checkout signs in anonymously and carries an ID token like anyone else.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminAuth } from '../bonum/_firebaseAdmin.js';

export type CallerIdentity =
  | { ok: true; uid: string }
  | { ok: false; status: number; error: string };

export function readBearerToken(req: any): string | null {
  const header = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Verifies the caller's Firebase ID token. Fails closed when the Admin SDK is not configured. */
export async function identifyCaller(req: any): Promise<CallerIdentity> {
  const token = readBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Нэвтрэх шаардлагатай.' };
  }

  const authPromise = getAdminAuth();
  if (!authPromise) {
    return { ok: false, status: 503, error: 'Сервер тохируулагдаагүй байна.' };
  }

  try {
    const auth = await authPromise;
    const decoded = await auth.verifyIdToken(token);
    return { ok: true, uid: String(decoded.uid) };
  } catch (err) {
    console.warn('[callerIdentity] token verification failed:', (err as Error).message);
    return { ok: false, status: 401, error: 'Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.' };
  }
}
