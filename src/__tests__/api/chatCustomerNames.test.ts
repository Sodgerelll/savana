import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getParticipantName: vi.fn(),
  getUserName: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (by: number) => ({ __increment: by }) },
}));

vi.mock("../../../api/chat/_lib/facebook.js", () => ({
  getParticipantName: mocks.getParticipantName,
  getUserName: mocks.getUserName,
}));

import { backfillFacebookNames } from "../../../api/chat/_lib/customerNames";

/** Just what the backfill touches: a channel query and per-document get/update. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const store = new Map(Object.entries(seed).map(([id, data]) => [`chat_conversations/${id}`, data]));

  const docHandle = (path: string) => ({
    get: () => Promise.resolve({ exists: store.has(path), data: () => store.get(path) }),
    update: (data: Record<string, unknown>) => {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
      return Promise.resolve();
    },
  });

  return {
    store,
    db: {
      collection: (name: string) => ({
        doc: (id: string) => docHandle(`${name}/${id}`),
        where: (field: string, _op: string, value: unknown) => ({
          get: () =>
            Promise.resolve({
              docs: [...store.entries()]
                .filter(([key, data]) => key.startsWith(`${name}/`) && data[field] === value)
                .map(([key, data]) => ({ id: key.slice(name.length + 1), data: () => data })),
            }),
        }),
      }),
    },
  };
}

const thread = (psid: string, customerName: string | null, channel = "facebook") => ({
  channel,
  pageId: "PAGE-1",
  externalUserId: psid,
  customerName,
});

beforeEach(() => {
  mocks.getParticipantName.mockReset();
  mocks.getUserName.mockReset().mockResolvedValue(null);
});

describe("backfillFacebookNames", () => {
  it("names every nameless Facebook thread from the page inbox", async () => {
    const { db, store } = fakeDb({
      fb_PAGE_1: thread("P1", null),
      fb_PAGE_2: thread("P2", ""),
    });
    mocks.getParticipantName.mockImplementation(async (_t: string, _p: string, psid: string) =>
      psid === "P1" ? "Бат" : "Сараа",
    );

    const result = await backfillFacebookNames(db, "token", { deadline: Date.now() + 10_000 });

    expect(result).toMatchObject({ missing: 2, updated: 2, unresolved: 0, remaining: 0 });
    expect(store.get("chat_conversations/fb_PAGE_1")?.customerName).toBe("Бат");
    expect(store.get("chat_conversations/fb_PAGE_2")?.customerName).toBe("Сараа");
  });

  it("leaves named threads and other channels alone", async () => {
    const { db } = fakeDb({
      fb_named: thread("P1", "Хуучин нэр"),
      ig_x: thread("I1", null, "instagram"),
    });

    const result = await backfillFacebookNames(db, "token", { deadline: Date.now() + 10_000 });

    expect(result.missing).toBe(0);
    expect(mocks.getParticipantName).not.toHaveBeenCalled();
  });

  it("falls back to the profile and counts what neither source knows", async () => {
    const { db, store } = fakeDb({ fb_a: thread("P1", null), fb_b: thread("P2", null) });
    mocks.getParticipantName.mockResolvedValue(null);
    mocks.getUserName.mockImplementation(async (_t: string, psid: string) => (psid === "P1" ? "Дорж" : null));

    const result = await backfillFacebookNames(db, "token", { deadline: Date.now() + 10_000 });

    expect(result).toMatchObject({ updated: 1, unresolved: 1 });
    expect(store.get("chat_conversations/fb_a")?.customerName).toBe("Дорж");
  });

  it("stops at the deadline and reports what is left", async () => {
    const { db } = fakeDb({ fb_a: thread("P1", null), fb_b: thread("P2", null) });

    const result = await backfillFacebookNames(db, "token", { deadline: Date.now() - 1 });

    expect(result).toMatchObject({ missing: 2, updated: 0, remaining: 2 });
  });
});
