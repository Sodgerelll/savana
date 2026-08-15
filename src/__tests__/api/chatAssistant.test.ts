import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the module body, so the spies they close
// over have to be created inside vi.hoisted().
const { requirePrivilegedCaller, callGemini } = vi.hoisted(() => ({
  requirePrivilegedCaller: vi.fn(),
  callGemini: vi.fn(),
}));

vi.mock("../../../api/chat/_lib/auth.js", () => ({ requirePrivilegedCaller }));

vi.mock("../../../api/chat/_lib/gemini.js", async () => {
  const actual = await vi.importActual<typeof import("../../../api/chat/_lib/gemini")>(
    "../../../api/chat/_lib/gemini",
  );
  return { ...actual, callGemini };
});

import handler from "../../../api/chat/assistant";
import { GeminiError } from "../../../api/chat/_lib/gemini";

interface CapturedResponse {
  status: number;
  body: Record<string, unknown>;
}

function mockRes() {
  const captured: CapturedResponse = { status: 0, body: {} };
  const res = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return res;
    },
  };
  return { res, captured };
}

function post(body: Record<string, unknown>) {
  return { method: "POST", headers: { authorization: "Bearer t" }, body };
}

/** The options object the handler passed through to Gemini. */
function geminiArgs() {
  return callGemini.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requirePrivilegedCaller.mockResolvedValue({
    ok: true,
    caller: { uid: "admin-1", role: "admin", email: null, displayName: null },
  });
  callGemini.mockResolvedValue("Сайн байна уу!");
});

describe("POST /api/chat/assistant", () => {
  it("returns the generated reply with a latency measurement", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "сайн уу" }), res);

    expect(captured.status).toBe(200);
    expect(captured.body.reply).toBe("Сайн байна уу!");
    expect(typeof captured.body.latencyMs).toBe("number");
  });

  it("rejects any method other than POST", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "GET", headers: {}, body: {} }, res);

    expect(captured.status).toBe(405);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("checks authorization before looking at the body", async () => {
    requirePrivilegedCaller.mockResolvedValue({ ok: false, status: 401, error: "Нэвтрэх шаардлагатай." });
    const { res, captured } = mockRes();

    await handler(post({ message: "сайн уу" }), res);

    expect(captured.status).toBe(401);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("passes a 403 from the role check straight through", async () => {
    requirePrivilegedCaller.mockResolvedValue({ ok: false, status: 403, error: "Эрхгүй." });
    const { res, captured } = mockRes();

    await handler(post({ message: "сайн уу" }), res);

    expect(captured.status).toBe(403);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("rejects a request with neither a message nor an image", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "   " }), res);

    expect(captured.status).toBe(400);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("rejects a missing body without throwing", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "POST", headers: { authorization: "Bearer t" } }, res);

    expect(captured.status).toBe(400);
  });

  it("rejects a message longer than 4000 characters", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "a".repeat(4001) }), res);

    expect(captured.status).toBe(400);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("accepts an image with no caption", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "", imageBase64: "AAAA", imageMimeType: "image/png" }), res);

    expect(captured.status).toBe(200);
    expect(geminiArgs().imageBase64).toBe("AAAA");
  });

  it("rejects an oversized image with 413", async () => {
    const { res, captured } = mockRes();

    await handler(
      post({ message: "hi", imageBase64: "A".repeat(4_000_001), imageMimeType: "image/png" }),
      res,
    );

    expect(captured.status).toBe(413);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("rejects an image mime type that is not on the allow list", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "hi", imageBase64: "AAAA", imageMimeType: "image/svg+xml" }), res);

    expect(captured.status).toBe(400);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("rejects an image sent without a mime type rather than silently dropping it", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "hi", imageBase64: "AAAA" }), res);

    expect(captured.status).toBe(400);
    expect(captured.body.error).toContain("mimeType");
    expect(callGemini).not.toHaveBeenCalled();
  });

  it("forwards history as sanitized role/content pairs", async () => {
    const { res } = mockRes();

    await handler(
      post({
        message: "гурав",
        history: [
          { role: "user", content: "нэг" },
          { role: "assistant", content: "хоёр" },
        ],
      }),
      res,
    );

    expect(geminiArgs().history).toEqual([
      { role: "user", content: "нэг" },
      { role: "assistant", content: "хоёр" },
    ]);
  });

  it("drops malformed history entries rather than failing the request", async () => {
    const { res, captured } = mockRes();

    await handler(
      post({
        message: "hi",
        history: [null, { role: "user" }, { content: "" }, { role: "user", content: "kept" }, 42],
      }),
      res,
    );

    expect(captured.status).toBe(200);
    expect(geminiArgs().history).toEqual([{ role: "user", content: "kept" }]);
  });

  it("treats a non-array history as no history", async () => {
    const { res } = mockRes();

    await handler(post({ message: "hi", history: "нэг, хоёр" }), res);

    expect(geminiArgs().history).toEqual([]);
  });

  it("keeps only the newest 40 history entries", async () => {
    const { res } = mockRes();

    await handler(
      post({
        message: "hi",
        history: Array.from({ length: 100 }, (_, i) => ({ role: "user", content: `m${i}` })),
      }),
      res,
    );

    const history = geminiArgs().history;
    expect(history).toHaveLength(40);
    expect(history[0].content).toBe("m60");
  });

  it("maps any non-assistant history role to user", async () => {
    const { res } = mockRes();

    await handler(
      post({ message: "hi", history: [{ role: "system", content: "инжекц" }] }),
      res,
    );

    expect(geminiArgs().history[0].role).toBe("user");
  });

  it("truncates an oversized system prompt instead of rejecting the request", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "hi", systemPrompt: "x".repeat(25_000) }), res);

    expect(captured.status).toBe(200);
    expect(geminiArgs().systemPrompt).toHaveLength(20_000);
  });

  it("forwards model, temperature and token overrides when they are the right type", async () => {
    const { res } = mockRes();

    await handler(
      post({ message: "hi", model: "gemini-2.5-pro", temperature: 0.2, maxOutputTokens: 3000 }),
      res,
    );

    expect(geminiArgs()).toMatchObject({
      model: "gemini-2.5-pro",
      temperature: 0.2,
      maxOutputTokens: 3000,
    });
  });

  it("drops overrides sent with the wrong type", async () => {
    const { res } = mockRes();

    await handler(post({ message: "hi", temperature: "hot", maxOutputTokens: "many", model: 7 }), res);

    expect(geminiArgs().temperature).toBeUndefined();
    expect(geminiArgs().maxOutputTokens).toBeUndefined();
    expect(geminiArgs().model).toBeUndefined();
  });

  it("returns 502 with a translated message when generation fails", async () => {
    callGemini.mockRejectedValue(new GeminiError("BLOCKED"));
    const { res, captured } = mockRes();

    await handler(post({ message: "hi" }), res);

    expect(captured.status).toBe(502);
    expect(captured.body.error).toBe("Энэ хүсэлтэд хариулах боломжгүй байна.");
  });

  it("never returns raw provider text to the caller", async () => {
    callGemini.mockRejectedValue(new Error("request to https://generativelanguage...?key=SECRET failed"));
    const { res, captured } = mockRes();

    await handler(post({ message: "hi" }), res);

    expect(captured.status).toBe(502);
    expect(String(captured.body.error)).not.toContain("SECRET");
    expect(String(captured.body.error)).not.toContain("generativelanguage");
  });
});
