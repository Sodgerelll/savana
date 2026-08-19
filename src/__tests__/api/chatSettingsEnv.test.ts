import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  canAnswerOnChannel,
  facebookComesFromEnv,
  loadChatSettings,
} from "../../../api/chat/_lib/settings";

/**
 * The Facebook credentials moved out of Firestore and into the deployment's
 * environment, so these cover the seam: what the environment overrides, what it
 * leaves alone, and what a half-configured deployment is allowed to do.
 */

const FACEBOOK_ENV = [
  "FB_PAGE_ACCESS_TOKEN",
  "FB_PAGE_ID",
  "IG_ACCOUNT_ID",
  "IG_IS_ACTIVE",
  "FB_REPLY_TO_COMMENTS",
] as const;

function fakeDb(stored: Record<string, unknown> | null) {
  return {
    doc: () => ({
      get: async () => ({ exists: stored !== null, data: () => stored }),
    }),
    // loadChatSettings resolves the page token through this collection.
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => null }),
        set: async () => undefined,
      }),
    }),
  };
}

/** A document written before the credentials moved, token and all. */
const LEGACY_DOC = {
  isActive: true,
  facebook: {
    isActive: true,
    pageId: "legacy-page",
    pageAccessToken: "legacy-token",
    instagramIsActive: false,
    replyToComments: true,
  },
};

beforeEach(() => {
  for (const key of FACEBOOK_ENV) delete process.env[key];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // No page-token exchange here: a refused exchange leaves the configured
  // token standing, which is exactly what these tests assert about.
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 400 })));
});

afterEach(() => {
  for (const key of FACEBOOK_ENV) delete process.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Facebook credentials from the environment", () => {
  it("takes the page token from the environment over the stored one", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "env-token";

    const settings = await loadChatSettings(fakeDb(LEGACY_DOC));

    expect(settings.facebook.pageAccessToken).toBe("env-token");
    expect(facebookComesFromEnv()).toBe(true);
  });

  it("treats a configured token as the connection, with no second switch", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "env-token";

    // Stored as off; the environment is what decides now.
    const settings = await loadChatSettings(fakeDb({ isActive: true, facebook: { isActive: false } }));

    expect(settings.facebook.isActive).toBe(true);
    expect(canAnswerOnChannel(settings, "facebook")).toBe(true);
  });

  it("carries Instagram on the same token by default", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "env-token";

    const settings = await loadChatSettings(fakeDb({ isActive: true }));

    expect(canAnswerOnChannel(settings, "instagram")).toBe(true);
  });

  it("lets IG_IS_ACTIVE=false hold Instagram back without touching Messenger", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "env-token";
    process.env.IG_IS_ACTIVE = "false";

    const settings = await loadChatSettings(fakeDb({ isActive: true }));

    expect(canAnswerOnChannel(settings, "facebook")).toBe(true);
    expect(canAnswerOnChannel(settings, "instagram")).toBe(false);
  });

  it("keeps comment replies off unless the environment asks for them", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "env-token";

    // The legacy document had them on; only FB_REPLY_TO_COMMENTS decides now,
    // so an unattended migration cannot start posting under customers' posts.
    const settings = await loadChatSettings(fakeDb(LEGACY_DOC));
    expect(settings.facebook.replyToComments).toBe(false);

    process.env.FB_REPLY_TO_COMMENTS = "true";
    expect((await loadChatSettings(fakeDb(LEGACY_DOC))).facebook.replyToComments).toBe(true);
  });

  it("leaves a pre-existing install answering while its variables are missing", async () => {
    const settings = await loadChatSettings(fakeDb(LEGACY_DOC));

    expect(settings.facebook.pageAccessToken).toBe("legacy-token");
    expect(facebookComesFromEnv()).toBe(false);
    expect(canAnswerOnChannel(settings, "facebook")).toBe(true);
  });

  it("stays silent on every channel when nothing is configured anywhere", async () => {
    const settings = await loadChatSettings(fakeDb(null));

    expect(canAnswerOnChannel(settings, "facebook")).toBe(false);
    expect(canAnswerOnChannel(settings, "instagram")).toBe(false);
    expect(canAnswerOnChannel(settings, "widget")).toBe(false);
  });

  it("still honours the master switch when the environment is fully configured", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "env-token";

    const settings = await loadChatSettings(fakeDb({ isActive: false }));

    expect(settings.facebook.isActive).toBe(true);
    expect(canAnswerOnChannel(settings, "facebook")).toBe(false);
  });

  it("falls back to the environment when Firestore cannot be read", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "env-token";
    const brokenDb = {
      doc: () => ({
        get: async () => {
          throw new Error("firestore unavailable");
        },
      }),
    };

    const settings = await loadChatSettings(brokenDb);

    expect(settings.facebook.pageAccessToken).toBe("env-token");
    // Defaults keep the master switch off, so a failed read cannot start the bot.
    expect(canAnswerOnChannel(settings, "facebook")).toBe(false);
  });

  it("ignores whitespace-only environment values", async () => {
    process.env.FB_PAGE_ACCESS_TOKEN = "   ";

    const settings = await loadChatSettings(fakeDb({ isActive: true }));

    expect(facebookComesFromEnv()).toBe(false);
    expect(canAnswerOnChannel(settings, "facebook")).toBe(false);
  });
});
