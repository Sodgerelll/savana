import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { authMock } = vi.hoisted(() => ({
  authMock: { currentUser: null as { getIdToken: () => Promise<string> } | null },
}));

vi.mock("../../lib/firebase", () => ({ auth: authMock }));

import { ChatApiError, sendAssistantMessage, toApiHistory } from "../../lib/chat/chatApi";

interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];
let responder: () => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  responder = () => jsonResponse({ reply: "Сайн байна уу", latencyMs: 820 });
  authMock.currentUser = { getIdToken: () => Promise.resolve("id-token-123") };

  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(responder());
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendAssistantMessage", () => {
  it("returns the reply and latency from the route", async () => {
    await expect(sendAssistantMessage({ message: "сайн уу" })).resolves.toEqual({
      reply: "Сайн байна уу",
      latencyMs: 820,
    });
  });

  it("posts to /api/chat/assistant with the Firebase ID token", async () => {
    await sendAssistantMessage({ message: "сайн уу" });

    expect(calls[0].url).toBe("/api/chat/assistant");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer id-token-123",
    );
  });

  it("sends the whole input as the JSON body", async () => {
    await sendAssistantMessage({
      message: "сайн уу",
      systemPrompt: "Та SAVANA-гийн туслах",
      temperature: 0.3,
    });

    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      message: "сайн уу",
      systemPrompt: "Та SAVANA-гийн туслах",
      temperature: 0.3,
    });
  });

  it("fails with 401 before fetching when nobody is signed in", async () => {
    authMock.currentUser = null;

    await expect(sendAssistantMessage({ message: "hi" })).rejects.toMatchObject({
      name: "ChatApiError",
      status: 401,
    });
    expect(calls).toHaveLength(0);
  });

  it("fails with 401 when the token cannot be refreshed", async () => {
    authMock.currentUser = { getIdToken: () => Promise.reject(new Error("network")) };

    await expect(sendAssistantMessage({ message: "hi" })).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);
  });

  it("surfaces the server's own Mongolian error message", async () => {
    responder = () => jsonResponse({ error: "Танд энэ үйлдлийг хийх эрх байхгүй." }, 403);

    await expect(sendAssistantMessage({ message: "hi" })).rejects.toMatchObject({
      status: 403,
      message: "Танд энэ үйлдлийг хийх эрх байхгүй.",
    });
  });

  it("falls back to a generic message when the error body is not JSON", async () => {
    responder = () => new Response("<html>502</html>", { status: 502 });

    await expect(sendAssistantMessage({ message: "hi" })).rejects.toMatchObject({
      status: 502,
      message: "Хариу авч чадсангүй.",
    });
  });

  it("reports a network failure without a status", async () => {
    responder = () => {
      throw new TypeError("Failed to fetch");
    };

    await expect(sendAssistantMessage({ message: "hi" })).rejects.toMatchObject({
      status: 0,
      message: "Сүлжээний алдаа гарлаа.",
    });
  });

  it("reports an aborted request as a timeout", async () => {
    responder = () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    };

    await expect(sendAssistantMessage({ message: "hi" })).rejects.toMatchObject({
      message: "Хариу хэт удлаа. Дахин оролдоно уу.",
    });
  });

  it("normalises a malformed success body instead of returning undefined", async () => {
    responder = () => jsonResponse({});

    await expect(sendAssistantMessage({ message: "hi" })).resolves.toEqual({
      reply: "",
      latencyMs: 0,
    });
  });

  it("is a ChatApiError so callers can branch on the type", async () => {
    authMock.currentUser = null;

    await expect(sendAssistantMessage({ message: "hi" })).rejects.toBeInstanceOf(ChatApiError);
  });
});

describe("toApiHistory", () => {
  it("keeps user and assistant turns in order", () => {
    expect(
      toApiHistory([
        { role: "user", content: "нэг" },
        { role: "assistant", content: "хоёр" },
      ]),
    ).toEqual([
      { role: "user", content: "нэг" },
      { role: "assistant", content: "хоёр" },
    ]);
  });

  it("drops admin and system turns so the model never speaks in a human's voice", () => {
    expect(
      toApiHistory([
        { role: "user", content: "асуулт" },
        { role: "admin", content: "админы хариу" },
        { role: "system", content: "дотоод тэмдэглэл" },
        { role: "assistant", content: "ботын хариу" },
      ]),
    ).toEqual([
      { role: "user", content: "асуулт" },
      { role: "assistant", content: "ботын хариу" },
    ]);
  });

  it("keeps only the newest 20 turns", () => {
    const history = toApiHistory(
      Array.from({ length: 50 }, (_, i) => ({ role: "user" as const, content: `m${i}` })),
    );

    expect(history).toHaveLength(20);
    expect(history[0].content).toBe("m30");
    expect(history[19].content).toBe("m49");
  });

  it("returns an empty array for an empty transcript", () => {
    expect(toApiHistory([])).toEqual([]);
  });
});
