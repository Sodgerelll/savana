// Caller authentication for the admin-facing chat routes.
//
// The browser sends its Firebase ID token as `Authorization: Bearer <token>`.
// We verify the token with the Admin SDK and then re-read the caller's role
// from Firestore — the same `users/{uid}.role` field the security rules check.
// The role is never taken from the token itself: custom claims are not used in
// this project, and a client-supplied role would be trivially forgeable.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminAuth, getAdminFirestore } from '../../bonum/_firebaseAdmin.js';

/** Mirrors isPrivilegedRole() in src/lib/userProfiles.ts. */
const PRIVILEGED_ROLES = ['admin', 'sysadmin'];

export interface AuthorizedCaller {
  uid: string;
  role: string;
  email: string | null;
  displayName: string | null;
}

export type AuthorizationResult =
  | { ok: true; caller: AuthorizedCaller }
  | { ok: false; status: number; error: string };

function readBearerToken(req: any): string | null {
  const header = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Resolves the caller and confirms they hold an admin/sysadmin role.
 *
 * Returns a discriminated result rather than throwing so each route decides its
 * own response shape. Failures are deliberately vague to the client (no "user
 * not found" vs "wrong role" distinction) while the server log keeps the detail.
 */
export async function requirePrivilegedCaller(req: any): Promise<AuthorizationResult> {
  const token = readBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Нэвтрэх шаардлагатай.' };
  }

  const authPromise = getAdminAuth();
  const dbPromise = getAdminFirestore();
  if (!authPromise || !dbPromise) {
    // Without a service account the server cannot verify anything, and letting
    // the request through would be an open door — fail closed.
    console.error('[chat/auth] FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
    return { ok: false, status: 503, error: 'Сервер тохируулагдаагүй байна.' };
  }

  let uid: string;
  let email: string | null;
  try {
    const auth = await authPromise;
    // checkRevoked: a disabled or signed-out admin loses access immediately
    // instead of keeping a valid-looking token for up to an hour.
    const decoded = await auth.verifyIdToken(token, true);
    uid = String(decoded.uid);
    email = decoded.email ? String(decoded.email) : null;
  } catch (err) {
    console.warn('[chat/auth] token verification failed:', (err as Error).message);
    return { ok: false, status: 401, error: 'Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.' };
  }

  try {
    const db = await dbPromise;
    const snapshot = await db.collection('users').doc(uid).get();
    const role = snapshot.exists ? String(snapshot.data()?.role ?? '') : '';

    if (!PRIVILEGED_ROLES.includes(role)) {
      console.warn(`[chat/auth] uid ${uid} has role "${role}" — denied`);
      return { ok: false, status: 403, error: 'Танд энэ үйлдлийг хийх эрх байхгүй.' };
    }

    return {
      ok: true,
      caller: {
        uid,
        role,
        email: snapshot.data()?.email ?? email,
        displayName: snapshot.data()?.displayName ?? null,
      },
    };
  } catch (err) {
    console.error('[chat/auth] role lookup failed:', (err as Error).message);
    return { ok: false, status: 503, error: 'Эрх шалгах боломжгүй байна.' };
  }
}
