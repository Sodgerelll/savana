import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  callGemini,
  callGeminiAgent,
  geminiErrorToUserMessage,
  GeminiError,
} from "../../../api/chat/_lib/gemini";

const API_KEY = "test-api-key-do-not-leak";

interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];

/** Queue of responses consumed one per fetch call, in order. */
type Responder = () => Response | Promise<Response>;
let responders: Responder[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textPayload(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

interface ParsedRequestBody {
  contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    topP: number;
    thinkingConfig: unknown;
  };
  safetySettings: unknown;
  system_instruction?: unknown;
  tools?: unknown;
  cachedContent?: string;
  __model?: unknown;
}

function requestBody(call: FetchCall): ParsedRequestBody {
  return JSON.parse(String(call.init.body)) as ParsedRequestBody;
}

/** Parts of the final (current-turn) user message. */
function currentTurnParts(call: FetchCall): Array<Record<string, unknown>> {
  const { contents } = requestBody(call);
  return contents[contents.length - 1].parts;
}

beforeEach(() => {
  calls = [];
  responders = [];
  process.env.GEMINI_API_KEY = API_KEY;
  delete process.env.GEMINI_MODELS;

  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const responder = responders.shift();
    if (!responder) {
      throw new Error(`Unexpected fetch call #${calls.length} to ${url}`);
    }
    return Promise.resolve(responder());
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_MODELS;
});

describe("callGemini", () => {
  it("returns the first text part of the winning candidate", async () => {
    responders = [() => jsonResponse(textPayload("Сайн байна уу"))];

    await expect(callGemini({ message: "hi" })).resolves.toBe("Сайн байна уу");
    expect(calls).toHaveLength(1);
  });

  it("sends the API key as a header and never in the URL", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi" });

    expect(calls[0].url).not.toContain(API_KEY);
    expect(calls[0].url).not.toContain("key=");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe(API_KEY);
  });

  it("throws when GEMINI_API_KEY is absent, without calling the API", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(callGemini({ message: "hi" })).rejects.toBeInstanceOf(GeminiError);
    expect(calls).toHaveLength(0);
  });

  it("moves to the next model on an HTTP error instead of retrying the same one", async () => {
    responders = [
      () => jsonResponse({ error: "rate limited" }, 429),
      () => jsonResponse(textPayload("second model answered")),
    ];

    await expect(callGemini({ message: "hi" })).resolves.toBe("second model answered");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("gemini-3.7-flash");
    expect(calls[1].url).toContain("gemini-3.6-flash");
  });

  it("falls through a deterministic 400 rather than aborting the chain", async () => {
    // A 400 from one model is usually an unsupported tools/thinking combination —
    // the next model in the chain typically handles it fine.
    responders = [
      () => jsonResponse({ error: "bad request" }, 400),
      () => jsonResponse(textPayload("recovered")),
    ];

    await expect(callGemini({ message: "hi" })).resolves.toBe("recovered");
    expect(calls).toHaveLength(2);
  });

  it("retries a transport failure once on the same model before moving on", async () => {
    responders = [
      () => {
        throw new TypeError("network down");
      },
      () => jsonResponse(textPayload("retried fine")),
    ];

    await expect(callGemini({ message: "hi" })).resolves.toBe("retried fine");
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(calls[1].url);
  });

  it("rejects with a key-free message once every model fails", async () => {
    responders = Array.from({ length: 6 }, () => () => jsonResponse({}, 503));

    await expect(callGemini({ message: "hi" })).rejects.toSatisfy((err: unknown) => {
      return err instanceof GeminiError && !err.message.includes(API_KEY);
    });
    // 2 models × 1 attempt each (HTTP errors do not retry in place).
    expect(calls).toHaveLength(2);
  });

  it("carries Google's own reason into the error, not just the status", async () => {
    // A bare "400" does not say whether the model is gone, the key is
    // unauthorised or a field is wrong — and those need different fixes. This
    // cost a round trip through the production logs to work out once already.
    responders = [
      () =>
        jsonResponse(
          { error: { message: "Unknown name \"thinkingLevel\" at 'generation_config'" } },
          400,
        ),
      () => jsonResponse({ error: { message: "model is no longer available" } }, 404),
    ];

    await expect(callGemini({ message: "hi" })).rejects.toSatisfy((err: unknown) => {
      const message = (err as Error).message;
      return message.includes("404") && message.includes("no longer available");
    });
  });

  it("still fails cleanly when the error body is not JSON", async () => {
    responders = Array.from(
      { length: 2 },
      () => () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );

    await expect(callGemini({ message: "hi" })).rejects.toBeInstanceOf(GeminiError);
  });

  it("surfaces a safety block as a terminal BLOCKED error", async () => {
    responders = [
      () => jsonResponse({ promptFeedback: { blockReason: "SAFETY" }, candidates: [{}] }),
    ];

    await expect(callGemini({ message: "hi" })).rejects.toMatchObject({ message: "BLOCKED" });
    // Terminal — no point asking the remaining models.
    expect(calls).toHaveLength(1);
  });

  it("surfaces a truncated answer as a terminal MAX_TOKENS error", async () => {
    responders = [() => jsonResponse({ candidates: [{ finishReason: "MAX_TOKENS" }] })];

    await expect(callGemini({ message: "hi" })).rejects.toMatchObject({ message: "MAX_TOKENS" });
    expect(calls).toHaveLength(1);
  });

  it("honours GEMINI_MODELS as the fallback chain override", async () => {
    process.env.GEMINI_MODELS = "model-a, model-b";
    responders = [() => jsonResponse({}, 500), () => jsonResponse(textPayload("b"))];

    await expect(callGemini({ message: "hi" })).resolves.toBe("b");
    expect(calls[0].url).toContain("model-a");
    expect(calls[1].url).toContain("model-b");
  });

  it("puts an allow-listed requested model first, keeping the rest as fallback", async () => {
    responders = [() => jsonResponse(textPayload("pro"))];

    await callGemini({ message: "hi", model: "gemini-3.6-flash" });

    expect(calls[0].url).toContain("gemini-3.6-flash");
  });

  it("ignores an unknown requested model instead of failing", async () => {
    responders = [() => jsonResponse(textPayload("default"))];

    await callGemini({ message: "hi", model: "gpt-4-turbo" });

    expect(calls[0].url).toContain("gemini-3.7-flash");
  });
});

describe("context cache", () => {
  const CACHE = { name: "cachedContents/abc", model: "gemini-3.7-flash" };

  it("swaps the prompt and tools for the handle that already holds them", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({
      message: "hi",
      systemPrompt: "Та SAVANA-гийн туслах.",
      tools: [{ functionDeclarations: [] }],
      cache: CACHE,
    });

    const sent = requestBody(calls[0]);
    expect(sent.cachedContent).toBe("cachedContents/abc");
    // Sending them alongside the handle is an error, not a duplicate.
    expect(sent.system_instruction).toBeUndefined();
    expect(sent.tools).toBeUndefined();
  });

  it("keeps the full prompt for a fallback model the cache does not cover", async () => {
    // A cache belongs to one model. Carrying the handle down the chain would
    // turn one model's outage into every model's 400.
    responders = [
      () => jsonResponse({ error: { message: "overloaded" } }, 503),
      () => jsonResponse(textPayload("ok")),
    ];

    await callGemini({ message: "hi", systemPrompt: "Та SAVANA-гийн туслах.", cache: CACHE });

    expect(calls[1].url).toContain("gemini-3.6-flash");
    expect(requestBody(calls[1]).cachedContent).toBeUndefined();
    expect(requestBody(calls[1]).system_instruction).toBeDefined();
  });

  it("retries the same model at full price when the handle is refused", async () => {
    // An expired cache must cost a customer nothing but a few hundred
    // milliseconds — never a dropped answer.
    responders = [
      () => jsonResponse({ error: { message: "CachedContent not found" } }, 403),
      () => jsonResponse(textPayload("answered anyway")),
    ];
    const rejected = vi.fn();

    await expect(
      callGemini({
        message: "hi",
        systemPrompt: "Та SAVANA-гийн туслах.",
        cache: CACHE,
        onCacheRejected: rejected,
      }),
    ).resolves.toBe("answered anyway");

    expect(rejected).toHaveBeenCalledOnce();
    expect(calls[1].url).toContain("gemini-3.7-flash");
    expect(requestBody(calls[1]).cachedContent).toBeUndefined();
    expect(requestBody(calls[1]).system_instruction).toBeDefined();
  });

  it("sends the prompt as usual when there is no handle", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", systemPrompt: "Та SAVANA-гийн туслах.", cache: null });

    expect(requestBody(calls[0]).cachedContent).toBeUndefined();
    expect(requestBody(calls[0]).system_instruction).toBeDefined();
  });
});

describe("request body", () => {
  it("maps assistant history to the model role and appends the new user turn", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({
      message: "гурав дахь",
      history: [
        { role: "user", content: "нэг" },
        { role: "assistant", content: "хоёр" },
      ],
    });

    expect(requestBody(calls[0]).contents).toEqual([
      { role: "user", parts: [{ text: "нэг" }] },
      { role: "model", parts: [{ text: "хоёр" }] },
      { role: "user", parts: [{ text: "гурав дахь" }] },
    ]);
  });

  it("keeps only the last 20 history turns", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({
      message: "now",
      history: Array.from({ length: 30 }, (_, i) => ({
        role: "user" as const,
        content: `msg-${i}`,
      })),
    });

    const contents = requestBody(calls[0]).contents;
    expect(contents).toHaveLength(21); // 20 history + current
    expect(contents[0].parts[0].text).toBe("msg-10");
  });

  it("drops history entries with empty content", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({
      message: "now",
      history: [
        { role: "user", content: "" },
        { role: "user", content: "kept" },
      ],
    });

    expect(requestBody(calls[0]).contents).toHaveLength(2);
  });

  it("clamps temperature outside 0..2 back to the 0.7 default", async () => {
    // Gemini 3 refuses the sampling knobs, and the default chain is all
    // Gemini 3 — so temperature is only observable on a 2.5 model, which these
    // days only reaches the wire through a GEMINI_MODELS override.
    process.env.GEMINI_MODELS = "gemini-2.5-flash";
    responders = [() => jsonResponse(textPayload("ok")), () => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", temperature: 9 });
    expect(requestBody(calls[0]).generationConfig.temperature).toBe(0.7);

    await callGemini({ message: "hi", temperature: 0.2 });
    expect(requestBody(calls[1]).generationConfig.temperature).toBe(0.2);
  });

  it("caps maxOutputTokens at 4000 and floors it at the 800 default", async () => {
    responders = [() => jsonResponse(textPayload("ok")), () => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", maxOutputTokens: 99_999 });
    expect(requestBody(calls[0]).generationConfig.maxOutputTokens).toBe(4000);

    await callGemini({ message: "hi", maxOutputTokens: 10 });
    expect(requestBody(calls[1]).generationConfig.maxOutputTokens).toBe(800);
  });

  it("keeps thinking at its shortest on Gemini 3, where the budget became a level", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi" });

    const config = requestBody(calls[0]).generationConfig;
    // Still nested inside thinkingConfig — only the field within it changed.
    // Hoisting thinkingLevel up to generationConfig is a 400, not a field the
    // model quietly ignores, and it took a production log to find that out.
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("drops the sampling fields Gemini 3 rejects", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", temperature: 0.4 });

    const config = requestBody(calls[0]).generationConfig;
    expect(config.temperature).toBeUndefined();
    expect(config.topP).toBeUndefined();
    // maxOutputTokens survives — that one did not change.
    expect(config.maxOutputTokens).toBe(800);
  });

  it("still speaks 2.5 to a 2.5 model rather than reusing the Gemini 3 body", async () => {
    // Shaping the body once for the whole chain would send the level enum to a
    // model that has never heard of it, and every fallback would fail too.
    process.env.GEMINI_MODELS = "gemini-2.5-flash";
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi" });

    const config = requestBody(calls[0]).generationConfig;
    expect(calls[0].url).toContain("gemini-2.5-flash");
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(config.topP).toBe(0.9);
    expect(config.temperature).toBe(0.7);
  });

  it("attaches the system prompt as system_instruction, and omits it when absent", async () => {
    responders = [() => jsonResponse(textPayload("ok")), () => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", systemPrompt: "Та SAVANA-гийн туслах." });
    expect(requestBody(calls[0]).system_instruction).toEqual({
      parts: [{ text: "Та SAVANA-гийн туслах." }],
    });

    await callGemini({ message: "hi" });
    expect(requestBody(calls[1]).system_instruction).toBeUndefined();
  });

  it("sends an image part ahead of the caption on a vision turn", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "энэ юу вэ", imageBase64: "AAAA", imageMimeType: "image/png" });

    expect(currentTurnParts(calls[0])).toEqual([
      { inline_data: { mime_type: "image/png", data: "AAAA" } },
      { text: "энэ юу вэ" },
    ]);
  });

  it("substitutes a prompt for an image sent with no caption", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "", imageBase64: "AAAA", imageMimeType: "image/png" });

    const parts = currentTurnParts(calls[0]);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({ text: "Энэ юу вэ?" });
  });

  it("never forwards an internal model hint to the API", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", model: "gemini-2.5-pro" });

    const body = requestBody(calls[0]);
    expect(body.__model).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(["contents", "generationConfig", "safetySettings"]);
  });

  it("omits the tools key entirely when no tools are supplied", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", tools: [] });

    expect(requestBody(calls[0]).tools).toBeUndefined();
  });
});

describe("callGeminiAgent", () => {
  const tools = [
    {
      functionDeclarations: [
        { name: "show_products", description: "Show the product carousel" },
      ],
    },
  ];

  it("returns the function call the model chose, with its arguments", async () => {
    responders = [
      () =>
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: "show_products", args: { category: "savan" } } }],
              },
            },
          ],
        }),
    ];

    await expect(callGeminiAgent({ message: "савангаа үзүүлээч", tools })).resolves.toEqual({
      functionCall: { name: "show_products", args: { category: "savan" } },
      text: null,
    });
  });

  it("defaults missing function-call args to an empty object", async () => {
    responders = [
      () =>
        jsonResponse({
          candidates: [{ content: { parts: [{ functionCall: { name: "show_promotions" } }] } }],
        }),
    ];

    const result = await callGeminiAgent({ message: "хямдрал", tools });

    expect(result.functionCall).toEqual({ name: "show_promotions", args: {} });
  });

  it("returns prose with a null functionCall when the model answers directly", async () => {
    responders = [() => jsonResponse(textPayload("Манай саван байгалийн гаралтай."))];

    await expect(callGeminiAgent({ message: "найрлага юу вэ", tools })).resolves.toEqual({
      functionCall: null,
      text: "Манай саван байгалийн гаралтай.",
    });
  });

  it("prefers the function call when the model emits both a call and text", async () => {
    responders = [
      () =>
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [{ text: "Түр хүлээнэ үү" }, { functionCall: { name: "show_products" } }],
              },
            },
          ],
        }),
    ];

    const result = await callGeminiAgent({ message: "үзүүлээч", tools });

    expect(result.functionCall?.name).toBe("show_products");
    expect(result.text).toBeNull();
  });

  it("forwards the tool declarations to the API", async () => {
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGeminiAgent({ message: "hi", tools });

    expect(requestBody(calls[0]).tools).toEqual(tools);
  });
});

describe("geminiErrorToUserMessage", () => {
  it("explains a safety block in Mongolian", () => {
    expect(geminiErrorToUserMessage(new GeminiError("BLOCKED"))).toBe(
      "Энэ хүсэлтэд хариулах боломжгүй байна.",
    );
  });

  it("asks the user to shorten the question when the answer was truncated", () => {
    expect(geminiErrorToUserMessage(new GeminiError("MAX_TOKENS"))).toBe(
      "Хариулт хэт урт боллоо. Асуултаа богиносгож дахин оролдоно уу.",
    );
  });

  it("asks the user to wait when rate-limited", () => {
    expect(geminiErrorToUserMessage(new GeminiError("Gemini 429", 429))).toBe(
      "Хүсэлт хэт олон байна. Түр хүлээгээд дахин оролдоно уу.",
    );
  });

  it("falls back to a generic retry message for anything else", () => {
    expect(geminiErrorToUserMessage(new Error("boom"))).toBe(
      "Хариу авч чадсангүй. Дахин оролдоно уу.",
    );
    expect(geminiErrorToUserMessage(new GeminiError("Gemini 500", 500))).toBe(
      "Хариу авч чадсангүй. Дахин оролдоно уу.",
    );
  });

  it("never echoes provider wording that could carry the API key", () => {
    const leaky = new GeminiError(`request to https://x?key=${API_KEY} failed`, 500);
    expect(geminiErrorToUserMessage(leaky)).not.toContain(API_KEY);
  });
});
