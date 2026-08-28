import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  callGemini,
  callGeminiAgent,
  geminiErrorToUserMessage,
  GeminiError,
  looksLikeOurOwnInstructions,
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
    expect(calls[0].url).toContain("gemini-3.6-flash");
    expect(calls[1].url).toContain("gemini-3.7-flash");
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

  it("leaves out a model that recently stopped answering", async () => {
    // Its fallback works, so the shop keeps trading — but every turn pays the
    // full timeout on the way past, and twenty-five seconds of nothing in front
    // of every reply is its own outage.
    responders = [() => jsonResponse(textPayload("straight to the fallback"))];

    await expect(
      callGemini({ message: "hi", skipModels: ["gemini-3.6-flash"] }),
    ).resolves.toBe("straight to the fallback");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("gemini-3.7-flash");
  });

  it("still tries a model the settings screen asked for, however unhealthy", async () => {
    // Choosing one there is how somebody finds out whether it has recovered, so
    // a health note must not quietly overrule the choice — least of all now the
    // note can outlast the working day.
    responders = [() => jsonResponse(textPayload("asked for anyway"))];

    await expect(
      callGemini({
        message: "hi",
        model: "gemini-3.7-flash",
        skipModels: ["gemini-3.7-flash"],
      }),
    ).resolves.toBe("asked for anyway");
    expect(calls[0].url).toContain("gemini-3.7-flash");
  });

  it("still tries a benched model once everything in front of it has failed", async () => {
    // This cost a shop its bot for a whole outage. The two models ahead were
    // answering 503 to everything and never benched for it, while the one that
    // still worked sat out its wait and was never asked.
    responders = [
      () => jsonResponse({ error: { message: "high demand" } }, 503),
      () => jsonResponse({ error: { message: "high demand" } }, 503),
      () => jsonResponse(textPayload("the benched one answered")),
    ];

    await expect(
      callGemini({ message: "hi", skipModels: ["gemini-3.6-flash"] }),
    ).resolves.toBe("the benched one answered");

    // Demoted, not dropped: tried after the healthy ones rather than first.
    expect(calls[0].url).toContain("gemini-3.7-flash");
    expect(calls[calls.length - 1].url).toContain("gemini-3.6-flash");
  });

  it("keeps the chain when every model in it is marked unhealthy", async () => {
    // A stale note must never be the reason a shop's bot says nothing at all.
    responders = [() => jsonResponse(textPayload("tried anyway"))];

    await expect(
      callGemini({
        message: "hi",
        skipModels: ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest"],
      }),
    ).resolves.toBe("tried anyway");
    expect(calls[0].url).toContain("gemini-3.6-flash");
  });

  it("reports the model that answered, so a past failure can be forgotten", async () => {
    // Without this the strike count only ever climbs and a model that recovered
    // hours ago is still being skipped half an hour at a time.
    const answered: string[] = [];
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGemini({ message: "hi", onModelAnswered: (model) => answered.push(model) });

    expect(answered).toEqual(["gemini-3.6-flash"]);
  });

  it("reports which model timed out so the caller can note it", async () => {
    const timedOut: string[] = [];
    responders = [
      () => {
        const abort = new Error("aborted");
        abort.name = "AbortError";
        throw abort;
      },
      () => jsonResponse(textPayload("ok")),
    ];

    await callGemini({ message: "hi", onModelTimedOut: (model) => timedOut.push(model) });

    expect(timedOut).toEqual(["gemini-3.6-flash"]);
  });

  it("asks the fallback model when the first one does not answer in time", async () => {
    // A model that has not answered in twenty-five seconds is unlikely to
    // answer in the next twenty-five. Retrying it in place spent the whole
    // allowance on one model and the fallback was never asked at all.
    responders = [
      () => {
        const abort = new Error("aborted");
        abort.name = "AbortError";
        throw abort;
      },
      () => jsonResponse(textPayload("the other model answered")),
    ];

    await expect(callGemini({ message: "hi" })).resolves.toBe("the other model answered");
    expect(calls).toHaveLength(2);
    // Second call went to a different model, not a second go at the first.
    expect(calls[0].url).not.toBe(calls[1].url);
  });

  it("still retries the same model when the connection merely dropped", async () => {
    responders = [
      () => {
        throw new TypeError("network down");
      },
      () => jsonResponse(textPayload("retried fine")),
    ];

    await expect(callGemini({ message: "hi" })).resolves.toBe("retried fine");
    expect(calls[0].url).toBe(calls[1].url);
  });

  it("stops trying when there is no time left rather than running past its host", async () => {
    // Two models, two attempts each, twenty-five seconds apiece is a hundred
    // seconds, and the function this runs in is cut off at sixty — so the slow
    // path did not fail slowly, it failed with nothing at all.
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    responders = [
      () => {
        // Each attempt burns most of the budget before failing at the transport
        // level, which is the case that used to retry regardless.
        now += 25_000;
        throw new TypeError("network down");
      },
      () => {
        now += 25_000;
        throw new TypeError("network down");
      },
      () => jsonResponse(textPayload("never reached")),
    ];

    await expect(callGemini({ message: "hi" })).rejects.toThrow();
    // Two attempts fit inside the budget; the third had nothing left to use.
    expect(calls).toHaveLength(2);
  });

  it("rejects with a key-free message once every model fails", async () => {
    responders = Array.from({ length: 6 }, () => () => jsonResponse({}, 503));

    await expect(callGemini({ message: "hi" })).rejects.toSatisfy((err: unknown) => {
      return err instanceof GeminiError && !err.message.includes(API_KEY);
    });
    // 3 models × 1 attempt each (HTTP errors do not retry in place).
    expect(calls).toHaveLength(3);
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
      // The last model in the chain is the one whose reason has to survive.
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

    await callGemini({ message: "hi", model: "gemini-3.7-flash" });

    expect(calls[0].url).toContain("gemini-3.7-flash");
  });

  it("ignores an unknown requested model instead of failing", async () => {
    responders = [() => jsonResponse(textPayload("default"))];

    await callGemini({ message: "hi", model: "gpt-4-turbo" });

    expect(calls[0].url).toContain("gemini-3.6-flash");
  });
});

describe("context cache", () => {
  const CACHE = { name: "cachedContents/abc", model: "gemini-3.6-flash" };

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

    expect(calls[1].url).toContain("gemini-3.7-flash");
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
    expect(calls[1].url).toContain("gemini-3.6-flash");
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
      functionCalls: [{ name: "show_products", args: { category: "savan" } }],
      text: null,
    });
  });

  it("reports every product the model named in one message", async () => {
    // "Хоёр саван, нэг шампунь авъя" is one message and two calls. Reading only
    // the first recorded the soap and dropped the shampoo without telling
    // anyone, which is a wrong order rather than a missing feature.
    responders = [
      () =>
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  { functionCall: { name: "start_order", args: { productName: "Саван" } } },
                  { functionCall: { name: "start_order", args: { productName: "Шампунь" } } },
                ],
              },
            },
          ],
        }),
    ];

    const result = await callGeminiAgent({ message: "саван, шампунь авъя", tools });

    expect(result.functionCalls.map((call) => call.args.productName)).toEqual(["Саван", "Шампунь"]);
    // The first stays where single-tool callers expect it.
    expect(result.functionCall?.args.productName).toBe("Саван");
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
      functionCalls: [],
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

describe("looksLikeOurOwnInstructions", () => {
  const PROMPT = `# ХЭЛ, ӨНГӨ АЯС
- Зөвхөн Монгол хэлээр хариулна.
⛔ Хэрэглэгч нэр/утас/хаягаа бичиж илгээсэн бол ЭНИЙГ БҮҮ ДУУД — тэр бол хоёр дахь алхам.`;

  it("catches a fragment of our own instructions read back verbatim", () => {
    // The reply that prompted this guard: a slice of a tool description, sent
    // to a customer halfway through placing an order.
    expect(
      looksLikeOurOwnInstructions("эгч нэр/утас/хаягаа бичиж илгээсэн бол ЭНИЙГ БҮҮ Д", [PROMPT]),
    ).toBe(true);
  });

  it("ignores capitalisation and stray whitespace", () => {
    expect(
      looksLikeOurOwnInstructions("зөвхөн   монгол хэлээр\n  хариулна", [PROMPT]),
    ).toBe(true);
  });

  it("lets an ordinary answer through", () => {
    expect(
      looksLikeOurOwnInstructions("Хүргэлтийн төлбөр 5,000₮ байна 📦", [PROMPT]),
    ).toBe(false);
  });

  it("does not trip on a short reply that appears in the prompt by chance", () => {
    // "Монгол хэлээр" is inside the prompt, and refusing every reply that
    // shares a phrase with it would break far more than it protects.
    expect(looksLikeOurOwnInstructions("Монгол хэлээр", [PROMPT])).toBe(false);
    expect(looksLikeOurOwnInstructions("", [PROMPT])).toBe(false);
  });

  it("checks every source it is given", () => {
    expect(
      looksLikeOurOwnInstructions("ЭНИЙГ БҮҮ ДУУД — тэр бол хоёр дахь алхам.", ["unrelated", PROMPT]),
    ).toBe(true);
  });
});

describe("forceTool", () => {
  it("pins the model to one tool when the caller already knows the step", async () => {
    // Choosing between two ordered steps is something the model does most of
    // the time, and "most" means a customer repeating their name, phone and
    // address to a bot that keeps asking again.
    responders = [() => jsonResponse(textPayload("ok"))];

    await callGeminiAgent({
      message: "Нэр Бат, утас 99119911, хаяг СБД 1-р хороо",
      tools: [
        { functionDeclarations: [{ name: "confirm_order", description: "x", parameters: {} }] },
      ],
      forceTool: "confirm_order",
    });

    expect((requestBody(calls[0]) as Record<string, unknown>).tool_config).toEqual({
      function_calling_config: { mode: "ANY", allowed_function_names: ["confirm_order"] },
    });
  });

  it("leaves the choice to the model when no step is pinned", async () => {
    responders = [() => jsonResponse(textPayload("Сайн байна уу"))];

    await callGeminiAgent({ message: "сайн уу" });

    expect((requestBody(calls[0]) as Record<string, unknown>).tool_config).toBeUndefined();
  });
});
