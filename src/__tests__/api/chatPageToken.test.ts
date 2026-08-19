import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolvePageToken } from "../../../api/chat/_lib/pageToken";

const USER_TOKEN = "EAAuser-token-that-belongs-to-a-person";
const PAGE_TOKEN = "EAApage-token-that-can-post-as-the-shop";

let calls: string[] = [];
let responder: () => Response;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** One page, as /me/accounts returns it for a user token. */
function accountsWithOnePage(): Response {
  return jsonResponse({
    data: [{ id: "101064165859823", name: "Savana Brand", access_token: PAGE_TOKEN }],
  });
}

function fakeDb(stored: Record<string, unknown> | null) {
  const writes: Array<Record<string, unknown>> = [];
  let doc = stored;

  return {
    writes,
    db: {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: doc !== null, data: () => doc }),
          set: async (value: Record<string, unknown>) => {
            writes.push(value);
            doc = value;
          },
        }),
      }),
    },
  };
}

beforeEach(() => {
  calls = [];
  responder = accountsWithOnePage;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(String(url));
    return Promise.resolve(responder());
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolvePageToken", () => {
  it("exchanges a user token for the page token behind it", async () => {
    // The whole point: Meta hands out both, they are indistinguishable by eye,
    // and only the page token can send a message as the shop.
    const { db, writes } = fakeDb(null);

    const resolved = await resolvePageToken(db, USER_TOKEN);

    expect(resolved).toEqual({
      token: PAGE_TOKEN,
      pageId: "101064165859823",
      pageName: "Savana Brand",
      exchanged: true,
    });
    expect(calls[0]).toContain("/me/accounts");
    expect(writes[0].expireAt).toBeInstanceOf(Date);
  });

  it("leaves a token that is already a page token alone", async () => {
    // A page token cannot list pages, so an empty result is the signal.
    responder = () => jsonResponse({ data: [] });
    const { db } = fakeDb(null);

    const resolved = await resolvePageToken(db, PAGE_TOKEN);

    expect(resolved).toMatchObject({ token: PAGE_TOKEN, exchanged: false });
  });

  it("picks the page the deployment named when the token manages several", async () => {
    responder = () =>
      jsonResponse({
        data: [
          { id: "111", name: "Other Shop", access_token: "EAAother" },
          { id: "222", name: "Savana Brand", access_token: PAGE_TOKEN },
        ],
      });
    const { db } = fakeDb(null);

    const resolved = await resolvePageToken(db, USER_TOKEN, { pageId: "222" });

    expect(resolved?.token).toBe(PAGE_TOKEN);
    expect(resolved?.pageName).toBe("Savana Brand");
  });

  it("reuses the cached answer instead of asking Meta on every request", async () => {
    const { db } = fakeDb({
      token: PAGE_TOKEN,
      pageId: "101064165859823",
      pageName: "Savana Brand",
      exchanged: true,
      expireAt: new Date(Date.now() + 60 * 60_000),
    });

    const resolved = await resolvePageToken(db, USER_TOKEN);

    expect(resolved?.token).toBe(PAGE_TOKEN);
    expect(calls).toHaveLength(0);
  });

  it("re-asks once the cached answer has aged out", async () => {
    const { db } = fakeDb({
      token: "EAAstale",
      pageId: "111",
      pageName: "Old Page",
      exchanged: true,
      expireAt: new Date(Date.now() - 1000),
    });

    const resolved = await resolvePageToken(db, USER_TOKEN);

    expect(resolved?.token).toBe(PAGE_TOKEN);
    expect(calls).toHaveLength(1);
  });

  it("keeps the configured token when Meta refuses the exchange", async () => {
    // A failed exchange must leave the bot exactly as it was, never worse.
    responder = () => jsonResponse({ error: { message: "nope" } }, 400);
    const { db } = fakeDb(null);

    const resolved = await resolvePageToken(db, USER_TOKEN);

    expect(resolved).toMatchObject({ token: USER_TOKEN, exchanged: false });
  });

  it("survives a Firestore that cannot be read or written", async () => {
    const brokenDb = {
      collection: () => ({
        doc: () => ({
          get: async () => {
            throw new Error("firestore down");
          },
          set: async () => {
            throw new Error("firestore down");
          },
        }),
      }),
    };

    const resolved = await resolvePageToken(brokenDb, USER_TOKEN);

    // The exchange still happened; only the caching did not.
    expect(resolved?.token).toBe(PAGE_TOKEN);
  });

  it("does nothing without a token", async () => {
    const { db } = fakeDb(null);

    expect(await resolvePageToken(db, "")).toBeNull();
    expect(await resolvePageToken(db, "   ")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
