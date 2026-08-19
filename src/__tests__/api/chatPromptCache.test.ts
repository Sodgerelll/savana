import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cacheKeyFor,
  estimateTokens,
  getOrCreatePromptCache,
} from "../../../api/chat/_lib/promptCache";

const API_KEY = "test-key";
/** Comfortably past the 4,096-token floor once Cyrillic is weighted properly. */
const LONG_PROMPT = "Сайн байна уу, манай дэлгүүрийн бүтээгдэхүүн. ".repeat(200);

interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];
let responder: () => Response;

/** Minimal Firestore double: one collection, one document, in memory. */
function fakeDb(stored: Record<string, unknown> | null) {
  const writes: Array<Record<string, unknown>> = [];
  const deletes: string[] = [];
  let doc = stored;

  return {
    writes,
    deletes,
    db: {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: doc !== null, data: () => doc }),
          set: async (value: Record<string, unknown>) => {
            writes.push(value);
            doc = value;
          },
          delete: async () => {
            deletes.push(id);
            doc = null;
          },
        }),
      }),
    },
  };
}

function created(name: string): Response {
  return new Response(JSON.stringify({ name }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  responder = () => created("cachedContents/abc");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(responder());
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("estimateTokens", () => {
  it("weights Cyrillic far more heavily than Latin", () => {
    // A flat chars/4 estimate would put a large Mongolian prompt under the
    // 4,096-token floor and skip caching on exactly the prompts worth caching.
    const cyrillic = "аа".repeat(500); // 1,000 characters
    const latin = "aa".repeat(500);

    expect(estimateTokens(cyrillic)).toBe(1000);
    expect(estimateTokens(latin)).toBe(250);
  });
});

describe("cacheKeyFor", () => {
  it("separates the same prompt sent with and without tools", () => {
    // The admin test chat sends no tools; the webhook does. They cache the same
    // prompt, and one must not be answered from the other's copy.
    const withTools = cacheKeyFor("gemini-3.7-flash", LONG_PROMPT, [{ functionDeclarations: [] }]);
    const without = cacheKeyFor("gemini-3.7-flash", LONG_PROMPT, undefined);

    expect(withTools).not.toBe(without);
  });

  it("separates models, since a cache belongs to exactly one", () => {
    expect(cacheKeyFor("gemini-3.7-flash", LONG_PROMPT, null)).not.toBe(
      cacheKeyFor("gemini-3.6-flash", LONG_PROMPT, null),
    );
  });

  it("changes when the catalog behind the prompt changes", () => {
    expect(cacheKeyFor("gemini-3.7-flash", LONG_PROMPT, null)).not.toBe(
      cacheKeyFor("gemini-3.7-flash", `${LONG_PROMPT} шинэ бараа`, null),
    );
  });
});

describe("getOrCreatePromptCache", () => {
  it("creates a cache and stores the handle with an expiry", async () => {
    const { db, writes } = fakeDb(null);

    const cache = await getOrCreatePromptCache(db, API_KEY, {
      model: "gemini-3.7-flash",
      systemPrompt: LONG_PROMPT,
    });

    expect(cache).toEqual({ name: "cachedContents/abc", model: "gemini-3.7-flash" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/cachedContents");
    // The key travels in a header, never the URL.
    expect(calls[0].url).not.toContain(API_KEY);

    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.model).toBe("models/gemini-3.7-flash");
    expect(sent.system_instruction.parts[0].text).toBe(LONG_PROMPT);
    expect(sent.ttl).toMatch(/^\d+s$/);
    expect(Date.parse(String(writes[0].expiresAt))).toBeGreaterThan(Date.now());
  });

  it("reuses a stored handle instead of paying to build another", async () => {
    // A cache rebuilt per request would cost more than never caching at all.
    const { db } = fakeDb({
      name: "cachedContents/stored",
      model: "gemini-3.7-flash",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });

    const cache = await getOrCreatePromptCache(db, API_KEY, {
      model: "gemini-3.7-flash",
      systemPrompt: LONG_PROMPT,
    });

    expect(cache?.name).toBe("cachedContents/stored");
    expect(calls).toHaveLength(0);
  });

  it("rebuilds a handle that is about to lapse mid-request", async () => {
    const { db } = fakeDb({
      name: "cachedContents/nearly-gone",
      model: "gemini-3.7-flash",
      expiresAt: new Date(Date.now() + 5_000).toISOString(),
    });

    const cache = await getOrCreatePromptCache(db, API_KEY, {
      model: "gemini-3.7-flash",
      systemPrompt: LONG_PROMPT,
    });

    expect(cache?.name).toBe("cachedContents/abc");
    expect(calls).toHaveLength(1);
  });

  it("skips a prompt too short for the API to accept", async () => {
    const { db } = fakeDb(null);

    const cache = await getOrCreatePromptCache(db, API_KEY, {
      model: "gemini-3.7-flash",
      systemPrompt: "Богино заавар.",
    });

    expect(cache).toBeNull();
    // Not even attempted: the floor is known, so the round trip is skipped.
    expect(calls).toHaveLength(0);
  });

  it("answers at full price rather than failing when creation is refused", async () => {
    responder = () =>
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
    const { db } = fakeDb(null);

    const cache = await getOrCreatePromptCache(db, API_KEY, {
      model: "gemini-3.7-flash",
      systemPrompt: LONG_PROMPT,
    });

    expect(cache).toBeNull();
  });

  it("survives a Firestore read that throws", async () => {
    const brokenDb = {
      collection: () => ({
        doc: () => ({
          get: async () => {
            throw new Error("firestore unavailable");
          },
        }),
      }),
    };

    await expect(
      getOrCreatePromptCache(brokenDb, API_KEY, {
        model: "gemini-3.7-flash",
        systemPrompt: LONG_PROMPT,
      }),
    ).resolves.toBeNull();
  });

  it("does nothing without an API key", async () => {
    const { db } = fakeDb(null);

    expect(
      await getOrCreatePromptCache(db, "", { model: "gemini-3.7-flash", systemPrompt: LONG_PROMPT }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
