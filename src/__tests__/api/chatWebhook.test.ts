import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  sendText: vi.fn(),
  sendTypingOn: vi.fn(),
  sendQuickReplies: vi.fn(),
  sendCarousel: vi.fn(),
  getUserName: vi.fn(),
  replyToComment: vi.fn(),
  sendPrivateReply: vi.fn(),
  fetchImageAsBase64: vi.fn(),
  callGemini: vi.fn(),
  callGeminiAgent: vi.fn(),
}));

vi.mock("../../../api/bonum/_firebaseAdmin.js", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));

// Only the network calls are stubbed; the pure helpers (attachment parsing,
// text splitting) stay real so the webhook exercises the shipping code.
vi.mock("../../../api/chat/_lib/facebook.js", async () => {
  const actual = await vi.importActual<typeof import("../../../api/chat/_lib/facebook")>(
    "../../../api/chat/_lib/facebook",
  );
  return {
    ...actual,
    sendText: mocks.sendText,
    sendTypingOn: mocks.sendTypingOn,
    sendQuickReplies: mocks.sendQuickReplies,
    sendCarousel: mocks.sendCarousel,
    getUserName: mocks.getUserName,
    replyToComment: mocks.replyToComment,
    sendPrivateReply: mocks.sendPrivateReply,
    fetchImageAsBase64: mocks.fetchImageAsBase64,
  };
});

vi.mock("../../../api/chat/_lib/gemini.js", async () => {
  const actual = await vi.importActual<typeof import("../../../api/chat/_lib/gemini")>(
    "../../../api/chat/_lib/gemini",
  );
  return { ...actual, callGemini: mocks.callGemini, callGeminiAgent: mocks.callGeminiAgent };
});

import handler from "../../../api/chat/webhook";
import { clearStorefrontContextCache } from "../../../api/chat/_lib/buildPrompt";

const PAGE_TOKEN = "PAGE-TOKEN";
const PAGE_ID = "PAGE-1";
const SENDER = "PSID-1";

// ─── Fake Firestore ───────────────────────────────────────────────────────────

interface Doc {
  path: string;
  data: Record<string, unknown>;
}

function createFakeDb(seed: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Record<string, unknown>>(Object.entries(seed));
  const writes: Doc[] = [];

  const docHandle = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({
        exists: store.has(path),
        data: () => store.get(path),
        id: path.split("/").pop(),
      }),
    create: (data: Record<string, unknown>) => {
      if (store.has(path)) return Promise.reject(new Error("ALREADY_EXISTS"));
      store.set(path, data);
      writes.push({ path, data });
      return Promise.resolve();
    },
    set: (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : data);
      writes.push({ path, data });
      return Promise.resolve();
    },
    update: (data: Record<string, unknown>) => {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
      writes.push({ path, data });
      return Promise.resolve();
    },
    delete: () => {
      store.delete(path);
      return Promise.resolve();
    },
    collection: (sub: string) => collectionHandle(`${path}/${sub}`),
  });

  let autoId = 0;
  const collectionHandle = (path: string) => {
    // Faithful enough to exercise the real query shape: orderBy and limit are
    // honoured, because the history de-duplication depends on the ordering.
    const build = (order: { field: string; dir: string } | null, take: number | null) => {
      const rows = () => {
        let entries = [...store.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
          .map(([key, data]) => ({ id: key.split("/").pop() as string, data: () => data }));

        if (order) {
          entries = entries.sort((a, b) => {
            const left = a.data()[order.field];
            const right = b.data()[order.field];
            const leftTime = left instanceof Date ? left.getTime() : Number(left ?? 0);
            const rightTime = right instanceof Date ? right.getTime() : Number(right ?? 0);
            // Stable tie-break on insertion order; Date has ms granularity and
            // several messages can land inside the same millisecond.
            if (leftTime === rightTime) {
              const keys = [...store.keys()];
              const diff = keys.indexOf(`${path}/${a.id}`) - keys.indexOf(`${path}/${b.id}`);
              return order.dir === "desc" ? -diff : diff;
            }
            return order.dir === "desc" ? rightTime - leftTime : leftTime - rightTime;
          });
        }

        return take === null ? entries : entries.slice(0, take);
      };

      const query = {
        where: () => build(order, take),
        orderBy: (field: string, dir = "asc") => build({ field, dir }, take),
        limit: (n: number) => build(order, n),
        get: () => Promise.resolve({ docs: rows(), empty: rows().length === 0 }),
      };
      return query;
    };

    return {
      doc: (id?: string) => docHandle(`${path}/${id ?? `auto-${(autoId += 1)}`}`),
      ...build(null, null),
    };
  };

  return {
    db: {
      doc: (path: string) => docHandle(path),
      collection: (path: string) => collectionHandle(path),
      batch: () => {
        const ops: Array<() => Promise<void>> = [];
        return {
          set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
            ops.push(() => docHandle(ref.path).set(data, options));
          },
          commit: async () => {
            for (const op of ops) await op();
          },
        };
      },
      runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
        fn({
          get: (ref: { path: string }) =>
            Promise.resolve({ exists: store.has(ref.path), data: () => store.get(ref.path) }),
          set: (ref: { path: string }, data: Record<string, unknown>) => store.set(ref.path, data),
          update: (ref: { path: string }, data: Record<string, unknown>) =>
            store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data }),
        }),
    },
    store,
    writes,
  };
}

function activeSettings(overrides: Record<string, unknown> = {}) {
  return {
    isActive: true,
    welcomeMessage: "Сайн байна уу!",
    temperature: 0.7,
    facebook: {
      isActive: true,
      pageId: PAGE_ID,
      pageAccessToken: PAGE_TOKEN,
      instagramIsActive: true,
      replyToComments: false,
    },
    widget: { isActive: false },
    ...overrides,
  };
}

function mockRes() {
  const captured = { status: 0, body: "" as unknown };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    send(payload: unknown) {
      captured.body = payload;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  };
  return { res, captured };
}

function messageEvent(text: string, mid = "m_1") {
  return {
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        messaging: [{ sender: { id: SENDER }, timestamp: 1, message: { mid, text } }],
      },
    ],
  };
}

function postbackEvent(payload: string) {
  return {
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        messaging: [{ sender: { id: SENDER }, timestamp: 1, postback: { payload } }],
      },
    ],
  };
}

let fake: ReturnType<typeof createFakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  clearStorefrontContextCache();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  process.env.FB_VERIFY_TOKEN = "verify-me";
  process.env.GEMINI_API_KEY = "key";

  fake = createFakeDb({ "chat_settings/main": activeSettings() });
  mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
  mocks.getUserName.mockResolvedValue("Батбаяр");
  mocks.callGeminiAgent.mockResolvedValue({ text: "Тийм ээ, байгаа.", functionCall: null });
  mocks.callGemini.mockResolvedValue("Энэ бол манай хужирт саван.");
  mocks.fetchImageAsBase64.mockResolvedValue({ base64: "AAAA", mimeType: "image/jpeg" });
  mocks.replyToComment.mockResolvedValue(true);
  mocks.sendPrivateReply.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FB_VERIFY_TOKEN;
  delete process.env.FB_APP_SECRET;
});

// ─── Delivery signatures ──────────────────────────────────────────────────────

/** A request that behaves like the real stream, so the raw bytes are readable. */
function streamedPost(raw: string, signature?: string) {
  return {
    method: "POST",
    headers: signature ? { "x-hub-signature-256": signature } : {},
    ...Readable.from([Buffer.from(raw, "utf8")]),
    [Symbol.asyncIterator]() {
      return Readable.from([Buffer.from(raw, "utf8")])[Symbol.asyncIterator]();
    },
    readable: true,
    readableEnded: false,
  };
}

function sign(raw: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
}

describe("X-Hub-Signature-256", () => {
  const raw = JSON.stringify(messageEvent("сайн уу"));

  it("accepts a delivery signed with the app secret", async () => {
    process.env.FB_APP_SECRET = "app-secret";
    const { res, captured } = mockRes();

    await handler(streamedPost(raw, sign(raw, "app-secret")), res);

    expect(captured.status).toBe(200);
    expect(mocks.sendText).toHaveBeenCalled();
  });

  it("hashes the bytes Meta sent rather than a re-serialised object", async () => {
    // Meta escapes non-ASCII, so this payload is byte-for-byte different from
    // JSON.stringify(JSON.parse(escaped)) while parsing to the same object.
    // Anything that re-serialises before hashing fails every Mongolian message.
    const escaped = raw.replace(/[-￿]/g, (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
    expect(escaped).not.toBe(raw);
    process.env.FB_APP_SECRET = "app-secret";
    const { res, captured } = mockRes();

    await handler(streamedPost(escaped, sign(escaped, "app-secret")), res);

    expect(captured.status).toBe(200);
    expect(mocks.sendText).toHaveBeenCalled();
  });

  it("rejects a delivery signed with the wrong secret", async () => {
    process.env.FB_APP_SECRET = "app-secret";
    const { res, captured } = mockRes();

    await handler(streamedPost(raw, sign(raw, "not-the-secret")), res);

    expect(captured.status).toBe(403);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("rejects a delivery carrying no signature at all", async () => {
    process.env.FB_APP_SECRET = "app-secret";
    const { res, captured } = mockRes();

    await handler(streamedPost(raw), res);

    expect(captured.status).toBe(403);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("rejects a delivery whose body was drained before it could be hashed", async () => {
    process.env.FB_APP_SECRET = "app-secret";
    const { res, captured } = mockRes();

    await handler(
      { method: "POST", headers: { "x-hub-signature-256": sign(raw, "app-secret") }, body: JSON.parse(raw) },
      res,
    );

    expect(captured.status).toBe(403);
  });

  it("processes unverified deliveries when no secret is configured", async () => {
    // Back-compat: a missing variable must not silence the bot, only warn.
    const { res, captured } = mockRes();

    await handler(streamedPost(raw), res);

    expect(captured.status).toBe(200);
    expect(mocks.sendText).toHaveBeenCalled();
  });
});

// ─── Verification handshake ───────────────────────────────────────────────────

describe("GET /api/chat/webhook", () => {
  it("echoes the challenge when the verify token matches", async () => {
    const { res, captured } = mockRes();

    await handler(
      {
        method: "GET",
        query: { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" },
      },
      res,
    );

    expect(captured.status).toBe(200);
    expect(captured.body).toBe("12345");
  });

  it("rejects a wrong verify token", async () => {
    const { res, captured } = mockRes();

    await handler(
      {
        method: "GET",
        query: { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" },
      },
      res,
    );

    expect(captured.status).toBe(403);
  });

  it("rejects a mode other than subscribe", async () => {
    const { res, captured } = mockRes();

    await handler(
      { method: "GET", query: { "hub.mode": "unsubscribe", "hub.verify_token": "verify-me" } },
      res,
    );

    expect(captured.status).toBe(403);
  });

  it("refuses to verify when no token is configured", async () => {
    delete process.env.FB_VERIFY_TOKEN;
    const { res, captured } = mockRes();

    await handler({ method: "GET", query: { "hub.mode": "subscribe" } }, res);

    expect(captured.status).toBe(503);
  });
});

describe("unsupported methods", () => {
  it("rejects DELETE", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "DELETE", query: {}, body: {} }, res);

    expect(captured.status).toBe(405);
  });
});

// ─── Event acknowledgement ────────────────────────────────────────────────────

// ─── Knowledge-base short circuit ─────────────────────────────────────────────

describe("FAQ short circuit", () => {
  const FAQ = {
    question: "Хүргэлт хэдэн хоног вэ?",
    answer: "УБ дотор 1-2 өдөрт хүргэнэ.",
    isActive: true,
    order: 0,
  };

  async function openConversation() {
    // The shortcut sits out the opening message, which carries the greeting.
    await handler({ method: "POST", body: messageEvent("сайн уу", "m_open") }, mockRes().res);
    mocks.callGeminiAgent.mockClear();
    mocks.sendText.mockClear();
  }

  beforeEach(() => {
    clearStorefrontContextCache();
    fake = createFakeDb({ "chat_settings/main": activeSettings(), "chat_faqs/faq1": FAQ });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
  });

  it("answers a repeated question without spending a model call", async () => {
    await openConversation();

    await handler(
      { method: "POST", body: messageEvent("Хүргэлт хэдэн хоног вэ?", "m_faq") },
      mockRes().res,
    );

    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
    expect(mocks.sendText).toHaveBeenCalledWith(
      expect.anything(),
      SENDER,
      "УБ дотор 1-2 өдөрт хүргэнэ.",
    );
  });

  it("still reaches the model for anything the knowledge base does not cover", async () => {
    await openConversation();

    await handler(
      { method: "POST", body: messageEvent("Саван яаж хийдэг вэ?", "m_other") },
      mockRes().res,
    );

    expect(mocks.callGeminiAgent).toHaveBeenCalled();
  });

  it("lets the model take the opening message even when it matches", async () => {
    await handler(
      { method: "POST", body: messageEvent("Хүргэлт хэдэн хоног вэ?", "m_first") },
      mockRes().res,
    );

    expect(mocks.callGeminiAgent).toHaveBeenCalled();
  });
});

describe("POST acknowledgement", () => {
  it("always answers 200 so Facebook stops retrying", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toBe("EVENT_RECEIVED");
  });

  it("acknowledges but ignores an object that is not page or instagram", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "POST", body: { object: "user", entry: [] } }, res);

    expect(captured.status).toBe(200);
    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
  });

  it("still answers 200 when processing throws", async () => {
    mocks.getUserName.mockRejectedValue(new Error("graph down"));
    mocks.callGeminiAgent.mockRejectedValue(new Error("boom"));
    const { res, captured } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(captured.status).toBe(200);
  });

  it("does nothing when no service account is configured", async () => {
    mocks.getAdminFirestore.mockReturnValue(null);
    const { res, captured } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(captured.status).toBe(200);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });
});

// ─── Enablement gates ─────────────────────────────────────────────────────────

describe("enablement", () => {
  it("stays silent when the bot is switched off globally", async () => {
    fake = createFakeDb({ "chat_settings/main": activeSettings({ isActive: false }) });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("stays silent when Facebook is off", async () => {
    fake = createFakeDb({
      "chat_settings/main": activeSettings({
        facebook: { isActive: false, pageAccessToken: PAGE_TOKEN, instagramIsActive: false },
      }),
    });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("stays silent when no page token has been saved", async () => {
    fake = createFakeDb({
      "chat_settings/main": activeSettings({
        facebook: { isActive: true, pageAccessToken: "", instagramIsActive: false },
      }),
    });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("answers an Instagram event when Instagram is enabled", async () => {
    const { res } = mockRes();

    await handler(
      { method: "POST", body: { ...messageEvent("сайн уу"), object: "instagram" } },
      res,
    );

    expect(mocks.sendText).toHaveBeenCalled();
  });

  it("stays silent on Instagram when only Facebook is enabled", async () => {
    fake = createFakeDb({
      "chat_settings/main": activeSettings({
        facebook: {
          isActive: true,
          pageAccessToken: PAGE_TOKEN,
          instagramIsActive: false,
        },
      }),
    });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
    const { res } = mockRes();

    await handler(
      { method: "POST", body: { ...messageEvent("сайн уу"), object: "instagram" } },
      res,
    );

    expect(mocks.sendText).not.toHaveBeenCalled();
  });
});

// ─── Message handling ─────────────────────────────────────────────────────────

describe("text messages", () => {
  it("sends the model's prose answer back to the sender", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("саван байна уу") }, res);

    expect(mocks.sendText).toHaveBeenCalledWith(PAGE_TOKEN, SENDER, "Тийм ээ, байгаа.");
  });

  it("shows a typing indicator before answering", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(mocks.sendTypingOn).toHaveBeenCalledWith(PAGE_TOKEN, SENDER);
  });

  it("records the customer's message and the bot's reply", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("саван байна уу") }, res);

    const messages = [...fake.store.entries()].filter(([key]) => key.includes("/messages/"));
    expect(messages).toHaveLength(2);
    expect(messages.map(([, data]) => data.role)).toEqual(["user", "assistant"]);
  });

  it("ignores an echo of our own outgoing message", async () => {
    const { res } = mockRes();

    await handler(
      {
        method: "POST",
        body: {
          object: "page",
          entry: [
            {
              id: PAGE_ID,
              messaging: [
                { sender: { id: PAGE_ID }, message: { mid: "m_1", text: "hi", is_echo: true } },
              ],
            },
          ],
        },
      },
      res,
    );

    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("ignores a sticker or image with no text", async () => {
    const { res } = mockRes();

    await handler(
      {
        method: "POST",
        body: {
          object: "page",
          entry: [
            {
              id: PAGE_ID,
              messaging: [{ sender: { id: SENDER }, message: { mid: "m_1", attachments: [{}] } }],
            },
          ],
        },
      },
      res,
    );

    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
  });

  it("answers the same message id only once", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу", "m_dup") }, res);
    await handler({ method: "POST", body: messageEvent("сайн уу", "m_dup") }, res);

    expect(mocks.sendText).toHaveBeenCalledTimes(1);
  });

  it("answers two different messages", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("нэг", "m_1") }, res);
    await handler({ method: "POST", body: messageEvent("хоёр", "m_2") }, res);

    expect(mocks.sendText).toHaveBeenCalledTimes(2);
  });

  it("lets a retry through after the reply failed", async () => {
    mocks.sendText.mockRejectedValueOnce(new Error("graph 500"));
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу", "m_retry") }, res);
    mocks.sendText.mockResolvedValue(undefined);
    await handler({ method: "POST", body: messageEvent("сайн уу", "m_retry") }, res);

    expect(mocks.sendText).toHaveBeenCalledTimes(2);
  });

  it("does not send the message being answered as history too", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("нэг", "m_1") }, res);
    await handler({ method: "POST", body: messageEvent("хоёр", "m_2") }, res);

    const history = mocks.callGeminiAgent.mock.calls[1][0].history;
    expect(history.map((entry: { content: string }) => entry.content)).not.toContain("хоёр");
  });

  it("tells the customer something went wrong when generation fails", async () => {
    mocks.callGeminiAgent.mockRejectedValue(new Error("gemini down"));
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(mocks.sendText).toHaveBeenCalledWith(
      PAGE_TOKEN,
      SENDER,
      "Хариу авч чадсангүй. Дахин оролдоно уу.",
    );
  });
});

// ─── Rate limiting and handover ───────────────────────────────────────────────

describe("rate limiting", () => {
  it("stops answering once the per-user limit is used up", async () => {
    const { res } = mockRes();

    for (let i = 0; i < 15; i++) {
      await handler({ method: "POST", body: messageEvent(`мессеж ${i}`, `m_${i}`) }, res);
    }

    expect(mocks.sendText.mock.calls.length).toBeLessThanOrEqual(12);
  });
});

describe("handover", () => {
  it("goes quiet while an admin is handling the thread", async () => {
    fake.store.set("chat_conversations/fb_PAGE-1_PSID-1", {
      status: "admin_active",
      messageCount: 4,
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("still records the customer's message while staying quiet", async () => {
    fake.store.set("chat_conversations/fb_PAGE-1_PSID-1", {
      status: "admin_active",
      messageCount: 4,
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("нэмэлт асуулт") }, res);

    const messages = [...fake.store.values()].filter((data) => data.role === "user");
    expect(messages).toHaveLength(1);
  });

  it("resumes after an unanswered handover has timed out", async () => {
    fake.store.set("chat_conversations/fb_PAGE-1_PSID-1", {
      status: "handover",
      messageCount: 4,
      handoverAt: Date.now() - 31 * 60 * 1000,
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("байна уу") }, res);

    expect(mocks.sendText).toHaveBeenCalled();
  });

  it("stays quiet during a recent handover", async () => {
    fake.store.set("chat_conversations/fb_PAGE-1_PSID-1", {
      status: "handover",
      messageCount: 4,
      handoverAt: Date.now() - 60 * 1000,
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("байна уу") }, res);

    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("marks the conversation as handover when the bot escalates", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "transfer_to_staff", args: { reason: "Гомдол" } },
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("менежертэй ярья") }, res);

    const conversation = fake.store.get("chat_conversations/fb_PAGE-1_PSID-1");
    expect(conversation?.status).toBe("handover");
    expect(conversation?.handoverReason).toBe("Гомдол");
  });
});

// ─── Tools and postbacks ──────────────────────────────────────────────────────

describe("tool calls", () => {
  beforeEach(() => {
    fake.store.set("products/p1", {
      id: 1,
      name: "Хужирт саван",
      price: 25000,
      category: "soap",
      images: ["https://cdn.savana.mn/1.jpg"],
    });
  });

  it("sends a carousel when the model calls show_products", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "show_products", args: {} },
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("юу байна") }, res);

    expect(mocks.sendCarousel).toHaveBeenCalled();
    const cards = mocks.sendCarousel.mock.calls[0][2];
    expect(cards[0].title).toBe("Хужирт саван");
    expect(cards[0].imageUrl).toBe("https://cdn.savana.mn/1.jpg");
  });

  it("records the tool name on the assistant message", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "show_products", args: {} },
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("юу байна") }, res);

    const assistant = [...fake.store.values()].find((data) => data.role === "assistant");
    expect(assistant?.toolName).toBe("show_products");
  });

  it("runs a menu postback directly without asking the model", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: postbackEvent("SHOW_PRODUCTS") }, res);

    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
    expect(mocks.sendCarousel).toHaveBeenCalled();
  });

  it("turns a carousel order button into a named order request", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: postbackEvent("ORDER_PRODUCT_1") }, res);

    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
    expect(mocks.sendText.mock.calls[0][2]).toContain("Хужирт саван");
  });

  it("greets with quick replies on GET_STARTED", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: postbackEvent("GET_STARTED") }, res);

    expect(mocks.sendQuickReplies).toHaveBeenCalled();
    expect(mocks.sendQuickReplies.mock.calls[0][2]).toBe("Сайн байна уу!");
    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
  });

  it("passes an unrecognised postback to the model rather than dropping it", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: postbackEvent("SOMETHING_NEW") }, res);

    expect(mocks.callGeminiAgent).toHaveBeenCalled();
  });
});

describe("photo messages", () => {
  function photoEvent(url = "https://cdn.fb.com/photo.jpg", text = "", mid = "m_img") {
    return {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: SENDER },
              timestamp: 1,
              message: {
                mid,
                ...(text ? { text } : {}),
                attachments: [{ type: "image", payload: { url } }],
              },
            },
          ],
        },
      ],
    };
  }

  it("answers a photo instead of going silent", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: photoEvent() }, res);

    expect(mocks.sendText).toHaveBeenCalledWith(PAGE_TOKEN, SENDER, "Энэ бол манай хужирт саван.");
  });

  it("passes the downloaded image to the vision call", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: photoEvent() }, res);

    expect(mocks.fetchImageAsBase64).toHaveBeenCalledWith("https://cdn.fb.com/photo.jpg");
    expect(mocks.callGemini.mock.calls[0][0]).toMatchObject({
      imageBase64: "AAAA",
      imageMimeType: "image/jpeg",
    });
  });

  it("answers without tools — vision plus function calling is unreliable", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: photoEvent() }, res);

    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
    expect(mocks.callGemini.mock.calls[0][0].tools).toBeUndefined();
  });

  it("forbids diagnosing a skin photo", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: photoEvent() }, res);

    const prompt = mocks.callGemini.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain("АРЬСНЫ ЗУРАГ");
    expect(prompt).toContain("онош ХЭЗЭЭ Ч бүү тавь");
  });

  it("sends the caption along when the customer wrote one", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: photoEvent("https://cdn.fb.com/p.jpg", "энэ юу вэ?") }, res);

    expect(mocks.callGemini.mock.calls[0][0].message).toBe("энэ юу вэ?");
  });

  it("records the photo turn on the transcript", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: photoEvent() }, res);

    const userMessage = [...fake.store.values()].find((data) => data.role === "user");
    expect(userMessage?.content).toBe("[зураг]");
  });

  it("asks the customer to type when the image cannot be read", async () => {
    mocks.fetchImageAsBase64.mockResolvedValue(null);
    const { res } = mockRes();

    await handler({ method: "POST", body: photoEvent() }, res);

    expect(mocks.sendText.mock.calls[0][2]).toContain("нээж чадсангүй");
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it("still ignores a sticker or reaction with no image and no text", async () => {
    const { res } = mockRes();

    await handler(
      {
        method: "POST",
        body: {
          object: "page",
          entry: [
            {
              id: PAGE_ID,
              messaging: [
                { sender: { id: SENDER }, message: { mid: "m_s", attachments: [{ type: "fallback" }] } },
              ],
            },
          ],
        },
      },
      res,
    );

    expect(mocks.sendText).not.toHaveBeenCalled();
  });
});

describe("post comments", () => {
  function commentEvent(message = "Үнэ хэд вэ?", commentId = "cmt_1") {
    return {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: commentId,
                post_id: "post_1",
                message,
                from: { id: "u1", name: "Бат" },
              },
            },
          ],
        },
      ],
    };
  }

  function enableComments() {
    fake = createFakeDb({
      "chat_settings/main": activeSettings({
        facebook: {
          isActive: true,
          pageId: PAGE_ID,
          pageAccessToken: PAGE_TOKEN,
          instagramIsActive: true,
          replyToComments: true,
        },
      }),
    });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
  }

  it("answers a comment publicly and privately when the toggle is on", async () => {
    enableComments();
    const { res } = mockRes();

    await handler({ method: "POST", body: commentEvent() }, res);

    expect(mocks.replyToComment).toHaveBeenCalledWith(PAGE_TOKEN, "cmt_1", expect.any(String));
    expect(mocks.sendPrivateReply).toHaveBeenCalledWith(PAGE_TOKEN, "cmt_1", expect.any(String));
  });

  it("ignores comments entirely while the toggle is off", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: commentEvent() }, res);

    expect(mocks.replyToComment).not.toHaveBeenCalled();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it("answers the same comment only once", async () => {
    enableComments();
    const { res } = mockRes();

    await handler({ method: "POST", body: commentEvent("Үнэ хэд вэ?", "cmt_dup") }, res);
    await handler({ method: "POST", body: commentEvent("Үнэ хэд вэ?", "cmt_dup") }, res);

    expect(mocks.replyToComment).toHaveBeenCalledTimes(1);
  });

  it("never answers its own reply", async () => {
    enableComments();
    const { res } = mockRes();

    await handler(
      {
        method: "POST",
        body: {
          object: "page",
          entry: [
            {
              id: PAGE_ID,
              changes: [
                {
                  field: "feed",
                  value: {
                    item: "comment",
                    verb: "add",
                    comment_id: "cmt_own",
                    message: "Баярлалаа",
                    from: { id: PAGE_ID },
                  },
                },
              ],
            },
          ],
        },
      },
      res,
    );

    expect(mocks.replyToComment).not.toHaveBeenCalled();
  });

  it("logs the reply for the admin to review", async () => {
    enableComments();
    const { res } = mockRes();

    await handler({ method: "POST", body: commentEvent() }, res);

    expect(fake.store.get("chat_comment_replies/cmt_1")).toMatchObject({
      comment: "Үнэ хэд вэ?",
      publicReplySent: true,
    });
  });
});

describe("lead capture", () => {
  function leads() {
    return [...fake.store.entries()]
      .filter(([key]) => key.startsWith("chat_leads/"))
      .map(([, data]) => data);
  }

  beforeEach(() => {
    fake.store.set("products/p1", { id: 1, name: "Хужирт саван", price: 25000, category: "soap" });
  });

  it("raises a lead when the customer asks to order", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "start_order", args: { productName: "Хужирт саван", quantity: 2 } },
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("хужирт саван 2 ширхэг авъя") }, res);

    expect(leads()).toHaveLength(1);
    expect(leads()[0]).toMatchObject({ type: "order", status: "new", convertedOrderId: null });
    expect(leads()[0].items).toEqual([
      { productId: null, name: "Хужирт саван", variant: null, quantity: 2 },
    ]);
  });

  it("seeds the lead with the Messenger profile name", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "start_order", args: { productName: "Саван" } },
    });
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("авъя") }, res);

    expect(leads()[0].customerName).toBe("Батбаяр");
  });

  it("fills in the phone number from a later message", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "start_order", args: { productName: "Саван" } },
    });
    const { res } = mockRes();
    await handler({ method: "POST", body: messageEvent("авъя", "m_1") }, res);

    mocks.callGeminiAgent.mockResolvedValue({ text: "Баярлалаа", functionCall: null });
    await handler({ method: "POST", body: messageEvent("99119911", "m_2") }, res);

    expect(leads()[0].customerPhone).toBe("99119911");
  });

  it("finds the phone number even when a quantity is in the same message", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "start_order", args: { productName: "Саван" } },
    });
    const { res } = mockRes();
    await handler({ method: "POST", body: messageEvent("авъя", "m_1") }, res);

    mocks.callGeminiAgent.mockResolvedValue({ text: "За", functionCall: null });
    await handler({ method: "POST", body: messageEvent("3 ширхэг, 99119911", "m_2") }, res);

    expect(leads()[0].customerPhone).toBe("99119911");
  });

  it("adds a second product to the same open lead instead of starting a new one", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "start_order", args: { productName: "Саван" } },
    });
    const { res } = mockRes();
    await handler({ method: "POST", body: messageEvent("саван авъя", "m_1") }, res);

    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "start_order", args: { productName: "Ванны давс", quantity: 3 } },
    });
    await handler({ method: "POST", body: messageEvent("давс ч бас", "m_2") }, res);

    expect(leads()).toHaveLength(1);
    expect(leads()[0].items).toHaveLength(2);
  });

  it("does not overwrite a phone number already captured", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      functionCall: { name: "start_order", args: { productName: "Саван" } },
    });
    const { res } = mockRes();
    await handler({ method: "POST", body: messageEvent("авъя", "m_1") }, res);

    mocks.callGeminiAgent.mockResolvedValue({ text: "За", functionCall: null });
    await handler({ method: "POST", body: messageEvent("99119911", "m_2") }, res);
    await handler({ method: "POST", body: messageEvent("өө уучлаарай 88008800", "m_3") }, res);

    expect(leads()[0].customerPhone).toBe("99119911");
  });

  it("raises no lead from an ordinary question", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("хүргэлт хэдэн хоног вэ") }, res);

    expect(leads()).toHaveLength(0);
  });

  it("does not capture contact details when there is no open lead", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("99119911") }, res);

    expect(leads()).toHaveLength(0);
  });
});

describe("conversation records", () => {
  it("creates one conversation per sender per channel", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("нэг", "m_1") }, res);
    await handler({ method: "POST", body: messageEvent("хоёр", "m_2") }, res);

    const conversations = [...fake.store.keys()].filter(
      (key) => key.startsWith("chat_conversations/") && !key.includes("/messages/"),
    );
    expect(conversations).toEqual(["chat_conversations/fb_PAGE-1_PSID-1"]);
  });

  it("keeps Facebook and Instagram threads apart for the same id", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("нэг", "m_1") }, res);
    await handler(
      { method: "POST", body: { ...messageEvent("хоёр", "m_2"), object: "instagram" } },
      res,
    );

    const conversations = [...fake.store.keys()].filter(
      (key) => key.startsWith("chat_conversations/") && !key.includes("/messages/"),
    );
    expect(conversations.sort()).toEqual([
      "chat_conversations/fb_PAGE-1_PSID-1",
      "chat_conversations/ig_PAGE-1_PSID-1",
    ]);
  });

  it("stores the sender's display name", async () => {
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(fake.store.get("chat_conversations/fb_PAGE-1_PSID-1")?.customerName).toBe("Батбаяр");
  });

  it("still answers when the name lookup is refused", async () => {
    mocks.getUserName.mockResolvedValue(null);
    const { res } = mockRes();

    await handler({ method: "POST", body: messageEvent("сайн уу") }, res);

    expect(mocks.sendText).toHaveBeenCalled();
  });
});
