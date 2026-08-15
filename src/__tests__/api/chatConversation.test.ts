import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (by: number) => ({ __increment: by }) },
}));

import {
  appendMessage,
  botShouldStaySilent,
  conversationIdFor,
  ensureConversation,
  HANDOVER_TIMEOUT_MS,
  readRecentMessages,
  setConversationStatus,
  type ConversationRef,
} from "../../../api/chat/_lib/conversation";

function ref(overrides: Partial<ConversationRef> = {}): ConversationRef {
  return { id: "c1", status: "active", messageCount: 3, customerName: null, handoverAt: null, ...overrides };
}

/** Minimal Firestore stand-in covering the operations this module uses. */
function fakeDb(seed: Record<string, Record<string, unknown>> = {}) {
  const store = new Map(Object.entries(seed));
  let autoId = 0;

  const docHandle = (path: string) => ({
    path,
    get: () => Promise.resolve({ exists: store.has(path), data: () => store.get(path) }),
    create: (data: Record<string, unknown>) => {
      if (store.has(path)) return Promise.reject(new Error("ALREADY_EXISTS"));
      store.set(path, data);
      return Promise.resolve();
    },
    set: (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : data);
      return Promise.resolve();
    },
    update: (data: Record<string, unknown>) => {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
      return Promise.resolve();
    },
    collection: (sub: string) => collectionHandle(`${path}/${sub}`),
  });

  const collectionHandle = (path: string) => {
    const build = (order: { dir: string } | null, take: number | null) => {
      const rows = () => {
        let entries = [...store.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
          .map(([key, data]) => ({ id: key, data: () => data }));
        if (order?.dir === "desc") entries = entries.reverse();
        return take === null ? entries : entries.slice(0, take);
      };
      return {
        orderBy: (_field: string, dir = "asc") => build({ dir }, take),
        limit: (n: number) => build(order, n),
        get: () => Promise.resolve({ docs: rows() }),
      };
    };
    return { doc: (id?: string) => docHandle(`${path}/${id ?? `m${(autoId += 1)}`}`), ...build(null, null) };
  };

  return {
    db: {
      collection: (path: string) => collectionHandle(path),
      batch: () => {
        const ops: Array<() => Promise<unknown>> = [];
        return {
          set: (target: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
            ops.push(() => docHandle(target.path).set(data, options));
          },
          commit: async () => {
            for (const op of ops) await op();
          },
        };
      },
    },
    store,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("conversationIdFor", () => {
  it("builds a deterministic id per channel and sender", () => {
    expect(conversationIdFor("facebook", "PAGE1", "PSID1")).toBe("fb_PAGE1_PSID1");
    expect(conversationIdFor("instagram", "PAGE1", "IGSID1")).toBe("ig_PAGE1_IGSID1");
  });

  it("keeps Facebook and Instagram apart for the same sender id", () => {
    expect(conversationIdFor("facebook", "P", "X")).not.toBe(conversationIdFor("instagram", "P", "X"));
  });

  it("is stable across calls, so a message burst cannot fork the thread", () => {
    expect(conversationIdFor("facebook", "P", "X")).toBe(conversationIdFor("facebook", "P", "X"));
  });

  it("strips characters Firestore rejects in a document id", () => {
    expect(conversationIdFor("widget", "a/b", "c.d")).toBe("widget_a_b_c_d");
  });
});

describe("ensureConversation", () => {
  const params = { channel: "facebook" as const, pageId: "P1", externalUserId: "U1" };

  it("creates the conversation on first contact", async () => {
    const { db, store } = fakeDb();

    const result = await ensureConversation(db, params);

    expect(result).toMatchObject({ id: "fb_P1_U1", status: "active", messageCount: 0 });
    expect(store.get("chat_conversations/fb_P1_U1")).toMatchObject({
      channel: "facebook",
      status: "active",
      externalUserId: "U1",
    });
  });

  it("returns the existing conversation without overwriting it", async () => {
    const { db, store } = fakeDb({
      "chat_conversations/fb_P1_U1": { status: "handover", messageCount: 7, customerName: "Бат" },
    });

    const result = await ensureConversation(db, params);

    expect(result).toMatchObject({ status: "handover", messageCount: 7, customerName: "Бат" });
    expect(store.get("chat_conversations/fb_P1_U1")?.messageCount).toBe(7);
  });

  it("backfills a name that was unavailable when the thread started", async () => {
    const { db, store } = fakeDb({
      "chat_conversations/fb_P1_U1": { status: "active", messageCount: 2, customerName: null },
    });

    await ensureConversation(db, { ...params, customerName: "Батбаяр" });

    expect(store.get("chat_conversations/fb_P1_U1")?.customerName).toBe("Батбаяр");
  });

  it("does not overwrite a name that is already stored", async () => {
    const { db, store } = fakeDb({
      "chat_conversations/fb_P1_U1": { status: "active", messageCount: 2, customerName: "Хуучин" },
    });

    await ensureConversation(db, { ...params, customerName: "Шинэ" });

    expect(store.get("chat_conversations/fb_P1_U1")?.customerName).toBe("Хуучин");
  });

  it("starts a new conversation with no handover in progress", async () => {
    const { db } = fakeDb();

    expect((await ensureConversation(db, params)).handoverAt).toBeNull();
  });

  it("records the signed-in uid when the widget supplies one", async () => {
    const { db, store } = fakeDb();

    await ensureConversation(db, { ...params, channel: "widget", userId: "uid-9" });

    expect(store.get("chat_conversations/widget_P1_U1")?.userId).toBe("uid-9");
  });
});

describe("appendMessage", () => {
  it("writes the message and refreshes the conversation preview together", async () => {
    const { db, store } = fakeDb({ "chat_conversations/c1": { messageCount: 0 } });

    await appendMessage(db, "c1", { role: "user", content: "Сайн байна уу" });

    const message = [...store.entries()].find(([key]) => key.includes("/messages/"))?.[1];
    expect(message).toMatchObject({ role: "user", content: "Сайн байна уу" });
    expect(store.get("chat_conversations/c1")).toMatchObject({
      lastMessagePreview: "Сайн байна уу",
    });
  });

  it("counts the message atomically rather than writing a computed total", async () => {
    const { db, store } = fakeDb({ "chat_conversations/c1": { messageCount: 5 } });

    await appendMessage(db, "c1", { role: "user", content: "hi" });

    expect(store.get("chat_conversations/c1")?.messageCount).toEqual({ __increment: 1 });
  });

  it("collapses whitespace and truncates a long preview", async () => {
    const { db, store } = fakeDb({ "chat_conversations/c1": {} });

    await appendMessage(db, "c1", { role: "assistant", content: `${"а".repeat(300)}\n\nдараа` });

    const preview = String(store.get("chat_conversations/c1")?.lastMessagePreview);
    expect(preview).toHaveLength(120);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("stores the tool name and author when supplied", async () => {
    const { db, store } = fakeDb({ "chat_conversations/c1": {} });

    await appendMessage(db, "c1", {
      role: "admin",
      content: "Сайн байна уу",
      authorName: "Сод",
      toolName: null,
    });

    const message = [...store.entries()].find(([key]) => key.includes("/messages/"))?.[1];
    expect(message).toMatchObject({ role: "admin", authorName: "Сод", toolName: null });
  });
});

describe("readRecentMessages", () => {
  function withMessages(rows: Array<{ role: string; content: string }>) {
    const seed: Record<string, Record<string, unknown>> = { "chat_conversations/c1": {} };
    rows.forEach((row, index) => {
      seed[`chat_conversations/c1/messages/m${index}`] = { ...row, createdAt: new Date(index) };
    });
    return fakeDb(seed);
  }

  it("returns turns oldest-first, ready for the model", async () => {
    const { db } = withMessages([
      { role: "user", content: "нэг" },
      { role: "assistant", content: "хоёр" },
      { role: "user", content: "гурав" },
    ]);

    expect(await readRecentMessages(db, "c1")).toEqual([
      { role: "user", content: "нэг" },
      { role: "assistant", content: "хоёр" },
      { role: "user", content: "гурав" },
    ]);
  });

  it("drops admin turns so the model never speaks in a colleague's voice", async () => {
    const { db } = withMessages([
      { role: "user", content: "асуулт" },
      { role: "admin", content: "админы хариу" },
      { role: "system", content: "тэмдэглэл" },
      { role: "assistant", content: "ботын хариу" },
    ]);

    expect((await readRecentMessages(db, "c1")).map((entry) => entry.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("drops empty messages", async () => {
    const { db } = withMessages([
      { role: "user", content: "" },
      { role: "user", content: "үлдсэн" },
    ]);

    expect(await readRecentMessages(db, "c1")).toEqual([{ role: "user", content: "үлдсэн" }]);
  });

  it("returns nothing for a conversation with no messages", async () => {
    const { db } = fakeDb({ "chat_conversations/c1": {} });

    expect(await readRecentMessages(db, "c1")).toEqual([]);
  });
});

describe("setConversationStatus", () => {
  it("stamps the handover time and reason when escalating", async () => {
    const { db, store } = fakeDb({ "chat_conversations/c1": { status: "active" } });

    await setConversationStatus(db, "c1", "handover", { handoverReason: "Гомдол" });

    const conversation = store.get("chat_conversations/c1");
    expect(conversation?.status).toBe("handover");
    expect(conversation?.handoverReason).toBe("Гомдол");
    expect(typeof conversation?.handoverAt).toBe("number");
  });

  it("clears the handover when the bot takes the thread back", async () => {
    const { db, store } = fakeDb({
      "chat_conversations/c1": { status: "handover", handoverAt: 123, handoverReason: "х" },
    });

    await setConversationStatus(db, "c1", "active");

    expect(store.get("chat_conversations/c1")).toMatchObject({
      status: "active",
      handoverAt: null,
      handoverReason: null,
    });
  });

  it("leaves the handover stamp alone when only resolving", async () => {
    const { db, store } = fakeDb({ "chat_conversations/c1": { status: "handover", handoverAt: 123 } });

    await setConversationStatus(db, "c1", "resolved");

    expect(store.get("chat_conversations/c1")).toMatchObject({ status: "resolved", handoverAt: 123 });
  });
});

describe("botShouldStaySilent", () => {
  it("answers normally on an active conversation", () => {
    expect(botShouldStaySilent(ref({ status: "active" }))).toBe(false);
  });

  it("stays quiet while an admin is replying", () => {
    expect(botShouldStaySilent(ref({ status: "admin_active" }))).toBe(true);
  });

  it("stays quiet during a fresh handover", () => {
    const now = Date.now();
    expect(botShouldStaySilent(ref({ status: "handover", handoverAt: now - 1000 }), now)).toBe(true);
  });

  it("takes over again once the handover has gone unanswered too long", () => {
    const now = Date.now();
    const stale = now - HANDOVER_TIMEOUT_MS - 1;

    expect(botShouldStaySilent(ref({ status: "handover", handoverAt: stale }), now)).toBe(false);
  });

  it("answers when a handover has no timestamp, rather than going silent forever", () => {
    expect(botShouldStaySilent(ref({ status: "handover", handoverAt: null }))).toBe(false);
  });

  it("answers on a resolved conversation the customer reopens", () => {
    expect(botShouldStaySilent(ref({ status: "resolved" }))).toBe(false);
  });
});
