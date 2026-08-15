import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  checkRateLimit,
  markEventProcessed,
  releaseEvent,
  toDocumentId,
  PROCESSED_EVENTS_COLLECTION,
  RATE_LIMITS_COLLECTION,
} from "../../../api/chat/_lib/guards";

interface DocStub {
  create: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function fakeDb() {
  const docs = new Map<string, DocStub>();
  const seenIds: string[] = [];
  const store = new Map<string, Record<string, unknown>>();

  const doc = (collectionPath: string) => (id: string) => {
    seenIds.push(id);
    const key = `${collectionPath}/${id}`;
    if (!docs.has(key)) {
      docs.set(key, {
        create: vi.fn(() => {
          if (store.has(key)) {
            return Promise.reject(new Error("ALREADY_EXISTS"));
          }
          store.set(key, {});
          return Promise.resolve();
        }),
        delete: vi.fn(() => {
          store.delete(key);
          return Promise.resolve();
        }),
      });
    }
    return { ...docs.get(key)!, __key: key };
  };

  return {
    db: {
      collection: (path: string) => ({ doc: doc(path) }),
      store,
    },
    seenIds,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("toDocumentId", () => {
  it("replaces every character Firestore forbids in a document id", () => {
    expect(toDocumentId("a/b\\c.d#e$f[g]h")).toBe("a_b_c_d_e_f_g_h");
  });

  it("caps the id length", () => {
    expect(toDocumentId("x".repeat(1000))).toHaveLength(400);
  });

  it("leaves a normal Facebook message id untouched", () => {
    expect(toDocumentId("m_AbC123-xyz")).toBe("m_AbC123-xyz");
  });
});

describe("markEventProcessed", () => {
  it("claims a fresh event", async () => {
    const { db } = fakeDb();

    await expect(markEventProcessed(db, "mid-1")).resolves.toBe(true);
  });

  it("rejects the same event the second time", async () => {
    const { db } = fakeDb();

    await expect(markEventProcessed(db, "mid-1")).resolves.toBe(true);
    await expect(markEventProcessed(db, "mid-1")).resolves.toBe(false);
  });

  it("treats different events independently", async () => {
    const { db } = fakeDb();

    await expect(markEventProcessed(db, "mid-1")).resolves.toBe(true);
    await expect(markEventProcessed(db, "mid-2")).resolves.toBe(true);
  });

  it("processes rather than drops when there is no key", async () => {
    const { db } = fakeDb();

    await expect(markEventProcessed(db, "")).resolves.toBe(true);
  });

  it("writes to the server-only processed-events collection", async () => {
    const { db } = fakeDb();

    await markEventProcessed(db, "mid-1");

    expect([...db.store.keys()][0]).toContain(PROCESSED_EVENTS_COLLECTION);
  });

  it("stores an expireAt so the TTL policy can reap the marker", async () => {
    const created: Record<string, unknown>[] = [];
    const db = {
      collection: () => ({
        doc: () => ({
          create: (data: Record<string, unknown>) => {
            created.push(data);
            return Promise.resolve();
          },
        }),
      }),
    };

    await markEventProcessed(db, "mid-1");

    expect(created[0].expireAt).toBeInstanceOf(Date);
    expect((created[0].expireAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("sanitizes the key into a legal document id", async () => {
    const { db, seenIds } = fakeDb();

    await markEventProcessed(db, "pb_123/456.SHOW_PRODUCTS");

    expect(seenIds[0]).toBe("pb_123_456_SHOW_PRODUCTS");
  });
});

describe("releaseEvent", () => {
  it("lets a retry of a failed event through again", async () => {
    const { db } = fakeDb();

    await markEventProcessed(db, "mid-1");
    await releaseEvent(db, "mid-1");

    await expect(markEventProcessed(db, "mid-1")).resolves.toBe(true);
  });

  it("does nothing when there is no key", async () => {
    const { db } = fakeDb();

    await expect(releaseEvent(db, "")).resolves.toBeUndefined();
  });

  it("swallows a delete failure — the retry path must not throw", async () => {
    const db = {
      collection: () => ({
        doc: () => ({ delete: () => Promise.reject(new Error("offline")) }),
      }),
    };

    await expect(releaseEvent(db, "mid-1")).resolves.toBeUndefined();
  });
});

describe("checkRateLimit", () => {
  /** In-memory stand-in for db.runTransaction over a single counter document. */
  function rateLimitDb(initial: Record<string, unknown> | null = null) {
    let stored = initial;
    return {
      db: {
        collection: () => ({ doc: () => ({ __ref: true }) }),
        runTransaction: async (fn: (tx: unknown) => Promise<boolean>) => {
          const tx = {
            get: () =>
              Promise.resolve({ exists: stored !== null, data: () => stored ?? undefined }),
            set: (_ref: unknown, data: Record<string, unknown>) => {
              stored = data;
            },
            update: (_ref: unknown, patch: Record<string, unknown>) => {
              stored = { ...(stored ?? {}), ...patch };
            },
          };
          return fn(tx);
        },
      },
      current: () => stored,
    };
  }

  it("allows the first request and opens a window", async () => {
    const { db, current } = rateLimitDb();

    await expect(checkRateLimit(db, "user-1")).resolves.toBe(true);
    expect(current()).toMatchObject({ count: 1 });
  });

  it("allows requests up to the limit", async () => {
    const { db } = rateLimitDb({ windowStart: Date.now(), count: 2 });

    await expect(checkRateLimit(db, "user-1", { max: 3 })).resolves.toBe(true);
  });

  it("blocks once the limit is reached inside the window", async () => {
    const { db } = rateLimitDb({ windowStart: Date.now(), count: 3 });

    await expect(checkRateLimit(db, "user-1", { max: 3 })).resolves.toBe(false);
  });

  it("starts a new window once the old one has elapsed", async () => {
    const { db, current } = rateLimitDb({ windowStart: Date.now() - 120_000, count: 99 });

    await expect(checkRateLimit(db, "user-1", { max: 3, windowMs: 60_000 })).resolves.toBe(true);
    expect(current()).toMatchObject({ count: 1 });
  });

  it("stores an expireAt for the TTL policy", async () => {
    const { db, current } = rateLimitDb();

    await checkRateLimit(db, "user-1");

    expect(current()?.expireAt).toBeInstanceOf(Date);
  });

  it("allows through when no key is supplied", async () => {
    const { db } = rateLimitDb();

    await expect(checkRateLimit(db, "")).resolves.toBe(true);
  });

  it("fails open so a broken counter cannot silence the bot", async () => {
    const db = {
      collection: () => ({ doc: () => ({}) }),
      runTransaction: () => Promise.reject(new Error("firestore unavailable")),
    };

    await expect(checkRateLimit(db, "user-1")).resolves.toBe(true);
  });

  it("writes to the server-only rate-limit collection", async () => {
    const paths: string[] = [];
    const db = {
      collection: (path: string) => {
        paths.push(path);
        return { doc: () => ({}) };
      },
      runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
        fn({
          get: () => Promise.resolve({ exists: false, data: () => undefined }),
          set: () => {},
          update: () => {},
        }),
    };

    await checkRateLimit(db, "user-1");

    expect(paths).toContain(RATE_LIMITS_COLLECTION);
  });
});
