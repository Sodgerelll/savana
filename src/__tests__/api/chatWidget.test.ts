import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  callGeminiAgent: vi.fn(),
}));

vi.mock("../../../api/bonum/_firebaseAdmin.js", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));

vi.mock("../../../api/chat/_lib/gemini.js", async () => {
  const actual = await vi.importActual<typeof import("../../../api/chat/_lib/gemini")>(
    "../../../api/chat/_lib/gemini",
  );
  return { ...actual, callGeminiAgent: mocks.callGeminiAgent };
});

import handler from "../../../api/chat/widget";
import { clearStorefrontContextCache } from "../../../api/chat/_lib/buildPrompt";

/** callGeminiAgent reports the first call and the full list; fixtures set both. */
function agentCall(call: { name: string; args: Record<string, unknown> }) {
  return { functionCall: call, functionCalls: [call] };
}


const SESSION = "a1b2c3d4e5f6a7b8";

function createFakeDb(seed: Record<string, Record<string, unknown>> = {}) {
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
    delete: () => {
      store.delete(path);
      return Promise.resolve();
    },
    collection: (sub: string) => collectionHandle(`${path}/${sub}`),
  });

  const collectionHandle = (path: string) => {
    const build = (order: { dir: string } | null, take: number | null) => {
      const rows = () => {
        let entries = [...store.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
          .map(([key, data]) => ({ id: key.split("/").pop() as string, data: () => data }));
        if (order?.dir === "desc") entries = entries.reverse();
        return take === null ? entries : entries.slice(0, take);
      };
      return {
        where: () => build(order, take),
        orderBy: (_f: string, dir = "asc") => build({ dir }, take),
        limit: (n: number) => build(order, n),
        // Products are read with a field mask so their inline base64 photos
        // never leave the server; the fixtures hold only the named fields.
        select: () => build(order, take),
        get: () => Promise.resolve({ docs: rows(), empty: rows().length === 0 }),
      };
    };
    return { doc: (id?: string) => docHandle(`${path}/${id ?? `a${(autoId += 1)}`}`), ...build(null, null) };
  };

  return {
    store,
    db: {
      doc: (path: string) => docHandle(path),
      collection: (path: string) => collectionHandle(path),
      batch: () => {
        const ops: Array<() => Promise<unknown>> = [];
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
  };
}

function widgetSettings(enabled = true) {
  return {
    isActive: enabled,
    botName: "SAVANA туслах",
    welcomeMessage: "Сайн байна уу!",
    temperature: 0.7,
    facebook: { isActive: false, pageAccessToken: "" },
    widget: { isActive: enabled },
  };
}

function mockRes() {
  const captured = { status: 0, body: {} as Record<string, unknown>, headers: {} as Record<string, string> };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value;
      return res;
    },
  };
  return { res, captured };
}

function post(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return { method: "POST", headers, body };
}

let fake: ReturnType<typeof createFakeDb>;

beforeEach(() => {
  vi.clearAllMocks();
  clearStorefrontContextCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  process.env.GEMINI_API_KEY = "key";

  fake = createFakeDb({ "chat_settings/main": widgetSettings() });
  mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
  mocks.callGeminiAgent.mockResolvedValue({ text: "Байгалийн саван байна.", functionCall: null, functionCalls: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/chat/widget (config probe)", () => {
  it("reports the widget as enabled", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "GET", headers: {} }, res);

    expect(captured.status).toBe(200);
    expect(captured.body).toMatchObject({ enabled: true, botName: "SAVANA туслах" });
  });

  it("never leaks the Facebook page token", async () => {
    fake = createFakeDb({
      "chat_settings/main": {
        ...widgetSettings(),
        facebook: { isActive: true, pageAccessToken: "PAGE-SECRET" },
      },
    });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
    const { res, captured } = mockRes();

    await handler({ method: "GET", headers: {} }, res);

    expect(JSON.stringify(captured.body)).not.toContain("PAGE-SECRET");
    expect(captured.body.facebook).toBeUndefined();
  });

  it("reports disabled when the widget is switched off", async () => {
    fake = createFakeDb({ "chat_settings/main": widgetSettings(false) });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
    const { res, captured } = mockRes();

    await handler({ method: "GET", headers: {} }, res);

    expect(captured.body.enabled).toBe(false);
  });

  it("reports disabled rather than failing when no service account is set", async () => {
    mocks.getAdminFirestore.mockReturnValue(null);
    const { res, captured } = mockRes();

    await handler({ method: "GET", headers: {} }, res);

    expect(captured.status).toBe(200);
    expect(captured.body.enabled).toBe(false);
  });

  it("allows a short edge cache", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "GET", headers: {} }, res);

    expect(captured.headers["Cache-Control"]).toContain("max-age=60");
  });
});

describe("POST /api/chat/widget", () => {
  it("answers a visitor's question", async () => {
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "саван байна уу" }), res);

    expect(captured.status).toBe(200);
    expect(captured.body.reply).toBe("Байгалийн саван байна.");
  });

  it("records the visitor turn and the reply", async () => {
    const { res } = mockRes();

    await handler(post({ sessionId: SESSION, message: "сайн уу" }), res);

    const messages = [...fake.store.entries()].filter(([key]) => key.includes("/messages/"));
    expect(messages.map(([, data]) => data.role)).toEqual(["user", "assistant"]);
  });

  it("keeps each session in its own conversation", async () => {
    const { res } = mockRes();

    await handler(post({ sessionId: SESSION, message: "нэг" }), res);
    await handler(post({ sessionId: "ffffffffffffffff", message: "хоёр" }), res);

    const conversations = [...fake.store.keys()].filter(
      (key) => key.startsWith("chat_conversations/") && !key.includes("/messages/"),
    );
    expect(conversations).toHaveLength(2);
  });

  it("refuses when the widget is switched off", async () => {
    fake = createFakeDb({ "chat_settings/main": widgetSettings(false) });
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fake.db));
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "сайн уу" }), res);

    expect(captured.status).toBe(503);
    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
  });

  it("rejects a malformed session id", async () => {
    const { res, captured } = mockRes();

    await handler(post({ sessionId: "../../etc/passwd", message: "hi" }), res);

    expect(captured.status).toBe(400);
    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
  });

  it("rejects a session id that is too short to be ours", async () => {
    const { res, captured } = mockRes();

    await handler(post({ sessionId: "abc", message: "hi" }), res);

    expect(captured.status).toBe(400);
  });

  it("rejects an empty message", async () => {
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "  " }), res);

    expect(captured.status).toBe(400);
  });

  it("rejects an over-long message", async () => {
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "а".repeat(601) }), res);

    expect(captured.status).toBe(400);
    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
  });

  it("rejects a non-POST, non-GET method", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "DELETE", headers: {}, body: {} }, res);

    expect(captured.status).toBe(405);
  });

  it("rate-limits a single session", async () => {
    const { res, captured } = mockRes();

    for (let i = 0; i < 10; i++) {
      await handler(post({ sessionId: SESSION, message: `асуулт ${i}` }), res);
    }

    expect(captured.status).toBe(429);
  });

  it("rate-limits by IP so fresh session ids cannot bypass the cap", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const { res, captured } = mockRes();

    // A new session id each time — only the IP cap can stop this.
    for (let i = 0; i < 30; i++) {
      const sessionId = `${String(i).padStart(2, "0")}bbccddeeff001122`;
      await handler(post({ sessionId, message: "спам" }, headers), res);
    }

    expect(captured.status).toBe(429);
  });

  it("takes the client IP from the first x-forwarded-for entry", async () => {
    const { res, captured } = mockRes();

    await handler(
      post(
        { sessionId: SESSION, message: "сайн уу" },
        { "x-forwarded-for": "203.0.113.9, 70.41.3.18" },
      ),
      res,
    );

    expect(captured.status).toBe(200);
    // Dots are not legal in a Firestore document id, so the key is sanitized —
    // the proxy chain's second hop must not appear at all.
    const rateLimitKeys = [...fake.store.keys()].filter((key) =>
      key.startsWith("chat_rate_limits/widget-ip"),
    );
    expect(rateLimitKeys).toEqual(["chat_rate_limits/widget-ip:203_0_113_9"]);
  });

  it("hands the visitor to a person when the model cannot answer at all", async () => {
    mocks.callGeminiAgent.mockRejectedValue(new Error("gemini down"));
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "сайн уу" }), res);

    expect(captured.status).toBe(200);
    expect(String(captured.body.reply)).toContain("Ажилтан");
    expect(captured.body.handedOver).toBe(true);
  });

  it("returns product cards when the bot shows the catalog", async () => {
    fake.store.set("products/p1", {
      id: 1,
      name: "Хужирт саван",
      price: 25000,
      category: "soap",
      images: ["https://cdn.savana.mn/1.jpg"],
    });
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      ...agentCall({ name: "show_products", args: {} }),
    });
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "юу байна" }), res);

    expect(captured.body.products).toEqual([
      {
        id: 1,
        name: "Хужирт саван",
        price: 25000,
        // Photos are stored inline and are no longer read with the catalogue, so
        // the card points at the endpoint that resolves one from the product id.
        imageUrl: "/api/chat/productImage?id=1",
        inStock: true,
      },
    ]);
  });

  it("flags a handover and stops the bot on that thread", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      ...agentCall({ name: "transfer_to_staff", args: { reason: "Гомдол" } }),
    });
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "хүнтэй ярья" }), res);

    expect(captured.body.handedOver).toBe(true);
    const conversation = [...fake.store.entries()].find(
      ([key]) => key.startsWith("chat_conversations/") && !key.includes("/messages/"),
    )?.[1];
    expect(conversation?.status).toBe("handover");
  });

  it("stays quiet on a thread an admin has taken over", async () => {
    fake.store.set("chat_conversations/widget_web_" + SESSION, {
      status: "admin_active",
      messageCount: 3,
    });
    const { res, captured } = mockRes();

    await handler(post({ sessionId: SESSION, message: "байна уу" }), res);

    expect(mocks.callGeminiAgent).not.toHaveBeenCalled();
    expect(captured.body.handedOver).toBe(true);
  });

  it("captures an order lead and later fills in the phone number", async () => {
    mocks.callGeminiAgent.mockResolvedValue({
      text: null,
      ...agentCall({ name: "start_order", args: { productName: "Хужирт саван", quantity: 2 } }),
    });
    const { res } = mockRes();
    await handler(post({ sessionId: SESSION, message: "саван авъя" }), res);

    mocks.callGeminiAgent.mockResolvedValue({ text: "Баярлалаа", functionCall: null, functionCalls: [] });
    await handler(post({ sessionId: SESSION, message: "Батаа 99119911" }), res);

    const lead = [...fake.store.entries()].find(([key]) => key.startsWith("chat_leads/"))?.[1];
    expect(lead).toMatchObject({ type: "order", status: "new", customerPhone: "99119911" });
  });
});
