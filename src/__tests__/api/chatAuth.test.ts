import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyIdToken = vi.fn();
const userDocGet = vi.fn();

let authConfigured = true;
let firestoreConfigured = true;

vi.mock("../../../api/bonum/_firebaseAdmin.js", () => ({
  getAdminAuth: () => (authConfigured ? Promise.resolve({ verifyIdToken }) : null),
  getAdminFirestore: () =>
    firestoreConfigured
      ? Promise.resolve({
          collection: () => ({ doc: () => ({ get: userDocGet }) }),
        })
      : null,
}));

import { requirePrivilegedCaller } from "../../../api/chat/_lib/auth";

function req(authorization?: string) {
  return { headers: authorization ? { authorization } : {} };
}

function userDoc(data: Record<string, unknown> | null) {
  return { exists: data !== null, data: () => data ?? undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  authConfigured = true;
  firestoreConfigured = true;
  verifyIdToken.mockResolvedValue({ uid: "admin-1", email: "admin@savana.mn" });
  userDocGet.mockResolvedValue(userDoc({ role: "admin", displayName: "Сод" }));
});

describe("requirePrivilegedCaller", () => {
  it("accepts an admin and returns their identity", async () => {
    const result = await requirePrivilegedCaller(req("Bearer good-token"));

    expect(result).toEqual({
      ok: true,
      caller: {
        uid: "admin-1",
        role: "admin",
        email: "admin@savana.mn",
        displayName: "Сод",
      },
    });
  });

  it("accepts a sysadmin", async () => {
    userDocGet.mockResolvedValue(userDoc({ role: "sysadmin" }));

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({ ok: true });
  });

  it("rejects a customer with 403", async () => {
    userDocGet.mockResolvedValue(userDoc({ role: "customer" }));

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("rejects a worker with 403 — workers are not chat admins", async () => {
    userDocGet.mockResolvedValue(userDoc({ role: "worker" }));

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("rejects a uid that has no users document", async () => {
    userDocGet.mockResolvedValue(userDoc(null));

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("ignores a role claimed in the token and trusts only Firestore", async () => {
    // A forged token body must not be able to grant itself admin.
    verifyIdToken.mockResolvedValue({ uid: "u", email: null, role: "sysadmin", admin: true });
    userDocGet.mockResolvedValue(userDoc({ role: "customer" }));

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("asks the SDK to reject revoked tokens", async () => {
    await requirePrivilegedCaller(req("Bearer good-token"));

    expect(verifyIdToken).toHaveBeenCalledWith("good-token", true);
  });

  it("rejects a missing Authorization header with 401", async () => {
    await expect(requirePrivilegedCaller(req())).resolves.toMatchObject({ ok: false, status: 401 });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects a header that is not a Bearer token", async () => {
    await expect(requirePrivilegedCaller(req("Basic abc123"))).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects a Bearer header with no token value", async () => {
    await expect(requirePrivilegedCaller(req("Bearer "))).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("accepts a lowercase bearer scheme", async () => {
    await expect(requirePrivilegedCaller(req("bearer good-token"))).resolves.toMatchObject({
      ok: true,
    });
  });

  it("rejects an invalid or expired token with 401", async () => {
    verifyIdToken.mockRejectedValue(new Error("Firebase ID token has expired"));

    await expect(requirePrivilegedCaller(req("Bearer stale"))).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("fails closed with 503 when no service account is configured", async () => {
    authConfigured = false;
    firestoreConfigured = false;

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("fails closed when Firestore alone is unavailable", async () => {
    firestoreConfigured = false;

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("denies rather than allows when the role lookup throws", async () => {
    userDocGet.mockRejectedValue(new Error("firestore unavailable"));

    await expect(requirePrivilegedCaller(req("Bearer t"))).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("never leaks the reason for a denial to the caller", async () => {
    userDocGet.mockResolvedValue(userDoc({ role: "customer" }));
    const denied = await requirePrivilegedCaller(req("Bearer t"));

    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).not.toContain("customer");
      expect(denied.error).not.toContain("role");
    }
  });

  it("falls back to the token email when the profile has none", async () => {
    userDocGet.mockResolvedValue(userDoc({ role: "admin" }));

    const result = await requirePrivilegedCaller(req("Bearer t"));

    expect(result).toMatchObject({ ok: true, caller: { email: "admin@savana.mn" } });
  });
});
