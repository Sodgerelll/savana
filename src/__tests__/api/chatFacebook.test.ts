import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  applyMessengerProfile,
  forgetPostContext,
  forgetRecentPosts,
  getPostContext,
  getRecentPosts,
  getUserName,
  sendCarousel,
  sendQuickReplies,
  sendText,
  sendTypingOff,
  sendTypingOn,
  splitText,
  TEXT_LIMIT,
} from "../../../api/chat/_lib/facebook";

const TOKEN = "PAGE-TOKEN-SECRET";

interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];
let responder: (call: FetchCall) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Loosely typed because each endpoint sends a differently shaped payload. */
type SentBody = Record<string, never> & {
  [key: string]: unknown;
};

function body(index = 0): SentBody {
  return JSON.parse(String(calls[index].init.body)) as SentBody;
}

beforeEach(() => {
  calls = [];
  responder = () => jsonResponse({ message_id: "m_1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return Promise.resolve(responder(call));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("splitText", () => {
  it("returns a short message unchanged", () => {
    expect(splitText("Сайн байна уу")).toEqual(["Сайн байна уу"]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitText("")).toEqual([]);
  });

  it("splits at a newline when one is available", () => {
    const text = `${"а".repeat(40)}\n${"б".repeat(40)}`;
    expect(splitText(text, 50)).toEqual(["а".repeat(40), "б".repeat(40)]);
  });

  it("splits at a sentence end when there is no newline", () => {
    const text = `${"а".repeat(40)}. ${"б".repeat(40)}`;
    expect(splitText(text, 50)).toEqual([`${"а".repeat(40)}.`, "б".repeat(40)]);
  });

  it("splits at a space rather than mid-word", () => {
    const text = `${"а".repeat(40)} ${"б".repeat(40)}`;
    expect(splitText(text, 50)).toEqual(["а".repeat(40), "б".repeat(40)]);
  });

  it("hard-splits a single unbroken run that has no break point", () => {
    const chunks = splitText("а".repeat(120), 50);

    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
    expect(chunks.join("")).toBe("а".repeat(120));
  });

  it("never splits an emoji in half", () => {
    // 🧼 is a surrogate pair; cutting between its halves yields a broken glyph.
    const text = "🧼".repeat(60);
    const chunks = splitText(text, 51);

    for (const chunk of chunks) {
      expect(chunk).toBe(chunk.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, ""));
      expect(chunk).toBe(chunk.replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1"));
    }
    expect(chunks.join("")).toBe(text);
  });

  it("keeps every chunk inside the limit", () => {
    const text = Array.from({ length: 200 }, (_, i) => `өгүүлбэр ${i}.`).join(" ");
    for (const chunk of splitText(text, 200)) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it("loses no words across the split", () => {
    const text = Array.from({ length: 80 }, (_, i) => `үг${i}`).join(" ");
    const rejoined = splitText(text, 100).join(" ");

    expect(rejoined.split(/\s+/)).toEqual(text.split(/\s+/));
  });
});

describe("applyMessengerProfile menu", () => {
  it("nests a submenu rather than dropping what will not fit", async () => {
    // Messenger shows three entries at the top level. A fourth used to be sliced
    // off without a word, which is how a menu item gets added, deployed, and
    // never appears — the way "Ботруу буцах" did.
    await applyMessengerProfile(TOKEN, {
      menuItems: [
        { title: "Бүтээгдэхүүн", payload: "SHOW_PRODUCTS" },
        { title: "Хямдрал", payload: "SHOW_PROMOTIONS" },
        {
          title: "Тусламж",
          items: [
            { title: "Ажилтантай ярих", payload: "TRANSFER_TO_STAFF" },
            { title: "Ботруу буцах", payload: "RESUME_BOT" },
          ],
        },
      ],
    });

    const menu = body().persistent_menu as Array<{ call_to_actions: Array<Record<string, unknown>> }>;
    const actions = menu[0].call_to_actions;

    expect(actions).toHaveLength(3);
    expect(actions[2]).toMatchObject({ type: "nested", title: "Тусламж" });
    expect((actions[2].call_to_actions as Array<{ payload: string }>).map((a) => a.payload)).toEqual([
      "TRANSFER_TO_STAFF",
      "RESUME_BOT",
    ]);
  });

  it("says so when more top-level items are given than Messenger will show", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await applyMessengerProfile(TOKEN, {
      menuItems: [
        { title: "A", payload: "A" },
        { title: "B", payload: "B" },
        { title: "C", payload: "C" },
        { title: "D", payload: "D" },
      ],
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("top-level"));
  });
});

describe("sendText", () => {
  it("posts the message to the Send API", async () => {
    await sendText(TOKEN, "PSID-1", "Сайн байна уу");

    expect(calls[0].url).toContain("/me/messages");
    expect(body()).toMatchObject({
      recipient: { id: "PSID-1" },
      message: { text: "Сайн байна уу" },
      messaging_type: "RESPONSE",
    });
  });

  it("sends the page token as a header, never in the URL", async () => {
    await sendText(TOKEN, "PSID-1", "hi");

    expect(calls[0].url).not.toContain(TOKEN);
    expect(calls[0].url).not.toContain("access_token");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("sends a long reply as several ordered messages", async () => {
    await sendText(TOKEN, "PSID-1", "а".repeat(TEXT_LIMIT + 500));

    expect(calls.length).toBeGreaterThan(1);
    const rejoined = calls.map((_, i) => body(i).message.text).join("");
    expect(rejoined).toBe("а".repeat(TEXT_LIMIT + 500));
  });

  it("switches to MESSAGE_TAG when a tag is supplied", async () => {
    await sendText(TOKEN, "PSID-1", "hi", { tag: "HUMAN_AGENT" });

    expect(body()).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  });

  it("retries with the fallback tag only after an untagged send is refused", async () => {
    // Inside the 24-hour window RESPONSE is the correct send; the tag is what
    // reopens a thread outside it. Leading with the tag fails on an app that
    // has no App Review, which is every shop on its first day.
    responder = () =>
      calls.length === 1
        ? jsonResponse({ error: { message: "(#10) outside allowed window" } }, 400)
        : jsonResponse({ message_id: "m_1" });

    await sendText(TOKEN, "PSID-1", "hi", { fallbackTag: "HUMAN_AGENT" });

    expect(calls).toHaveLength(2);
    expect(body(0)).toMatchObject({ messaging_type: "RESPONSE" });
    expect(body(1)).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });
  });

  it("does not retry when the untagged send succeeds", async () => {
    await sendText(TOKEN, "PSID-1", "hi", { fallbackTag: "HUMAN_AGENT" });

    expect(calls).toHaveLength(1);
    expect(body()).toMatchObject({ messaging_type: "RESPONSE" });
  });

  it("reports the refusal when the tagged retry fails too", async () => {
    responder = () => jsonResponse({ error: { message: "(#200) permission missing" } }, 400);

    await expect(sendText(TOKEN, "PSID-1", "hi", { fallbackTag: "HUMAN_AGENT" })).rejects.toThrow(
      "permission missing",
    );
    expect(calls).toHaveLength(2);
  });

  it("retries each chunk on its own rather than resending the whole reply", async () => {
    // A long reply goes out in pieces. Retrying the lot would deliver the first
    // piece twice, so the fallback is per chunk.
    let seen = 0;
    responder = () => {
      seen += 1;
      return seen === 1
        ? jsonResponse({ error: { message: "(#10) outside allowed window" } }, 400)
        : jsonResponse({ message_id: "m_1" });
    };

    await sendText(TOKEN, "PSID-1", "а".repeat(TEXT_LIMIT + 500), { fallbackTag: "HUMAN_AGENT" });

    // Chunk one twice (refused, then tagged), chunk two once.
    expect(calls).toHaveLength(3);
    expect(body(0).message.text).toBe(body(1).message.text);
    expect(body(2).message.text).not.toBe(body(0).message.text);
  });

  it("sends nothing for empty text", async () => {
    await sendText(TOKEN, "PSID-1", "");

    expect(calls).toHaveLength(0);
  });

  it("refuses to send without a token", async () => {
    await expect(sendText("", "PSID-1", "hi")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("refuses to send without a recipient", async () => {
    await expect(sendText(TOKEN, "", "hi")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("throws a Mongolian error carrying Graph's reason when the send fails", async () => {
    responder = () => jsonResponse({ error: { message: "Invalid OAuth access token" } }, 400);

    await expect(sendText(TOKEN, "PSID-1", "hi")).rejects.toThrow(/Invalid OAuth access token/);
  });
});

describe("sendTypingOn", () => {
  it("posts the typing indicator", async () => {
    await sendTypingOn(TOKEN, "PSID-1");

    expect(body()).toEqual({ recipient: { id: "PSID-1" }, sender_action: "typing_on" });
  });

  it("never throws — a failed indicator must not break the reply", async () => {
    responder = () => jsonResponse({ error: { message: "nope" } }, 500);

    await expect(sendTypingOn(TOKEN, "PSID-1")).resolves.toBeUndefined();
  });

  it("does nothing without a token or recipient", async () => {
    await sendTypingOn("", "PSID-1");
    await sendTypingOn(TOKEN, "");

    expect(calls).toHaveLength(0);
  });
});

describe("getRecentPosts", () => {
  beforeEach(() => {
    forgetRecentPosts();
  });

  it("returns what the page has been announcing, newest first as Meta sends it", () => {
    responder = () =>
      jsonResponse({
        data: [
          { message: "Шинэ жилийн багц", created_time: "2026-08-20T09:00:00+0800" },
          {
            message: "Саван ирлээ",
            created_time: "2026-08-18T09:00:00+0800",
            attachments: { data: [{ title: "Сүүлэн тос", description: "8800₮" }] },
          },
        ],
      });

    return expect(getRecentPosts(TOKEN)).resolves.toEqual([
      { postedAt: "2026-08-20", text: "Шинэ жилийн багц" },
      { postedAt: "2026-08-18", text: "Саван ирлээ · Сүүлэн тос · 8800₮" },
    ]);
  });

  it("drops a post with no words in it", async () => {
    // A bare photo says nothing the model can use.
    responder = () =>
      jsonResponse({ data: [{ created_time: "2026-08-20T09:00:00+0800" }] });

    await expect(getRecentPosts(TOKEN)).resolves.toEqual([]);
  });

  it("asks once a quarter hour, not once a turn", async () => {
    // The prompt goes to a shared context cache; a feed that changed per
    // request would throw that away for the sake of a post nobody made.
    responder = () => jsonResponse({ data: [{ message: "Саван", created_time: "2026-08-20" }] });

    await getRecentPosts(TOKEN);
    await getRecentPosts(TOKEN);

    expect(calls).toHaveLength(1);
  });

  it("remembers a refusal too, so no turn pays the timeout twice", async () => {
    responder = () => jsonResponse({ error: { message: "no permission" } }, 403);

    await expect(getRecentPosts(TOKEN)).resolves.toEqual([]);
    await expect(getRecentPosts(TOKEN)).resolves.toEqual([]);

    expect(calls).toHaveLength(1);
  });

  it("does nothing without a token", async () => {
    await expect(getRecentPosts("")).resolves.toEqual([]);

    expect(calls).toHaveLength(0);
  });
});

describe("getPostContext", () => {
  beforeEach(() => {
    // Per-instance and would otherwise carry an answer between cases.
    forgetPostContext();
  });

  it("returns the post's own words, attachment included", async () => {
    responder = () =>
      jsonResponse({
        message: "Шинэ саван ирлээ",
        attachments: { data: [{ title: "Сүүлэн тостой саван", description: "8800₮" }] },
      });

    await expect(getPostContext(TOKEN, "p1")).resolves.toBe(
      "Шинэ саван ирлээ · Сүүлэн тостой саван · 8800₮",
    );
    expect(calls[0].url).toContain("/p1?fields=message,attachments");
  });

  it("asks Instagram for a caption, which is what a media object has", async () => {
    responder = () => jsonResponse({ caption: "Шинэ багц" });

    await expect(getPostContext(TOKEN, "m1", "instagram")).resolves.toBe("Шинэ багц");
    expect(calls[0].url).toContain("fields=caption");
  });

  it("asks once for a post however many comments it collects", async () => {
    responder = () => jsonResponse({ message: "Шинэ саван ирлээ" });

    await getPostContext(TOKEN, "p1");
    await getPostContext(TOKEN, "p1");

    expect(calls).toHaveLength(1);
  });

  it("remembers a refusal too, so every comment does not pay for it again", async () => {
    // A post the token cannot read will not become readable within the minute.
    responder = () => jsonResponse({ error: { message: "no permission" } }, 403);

    await expect(getPostContext(TOKEN, "p1")).resolves.toBeNull();
    await expect(getPostContext(TOKEN, "p1")).resolves.toBeNull();

    expect(calls).toHaveLength(1);
  });

  it("is null rather than throwing when the post has nothing to say", async () => {
    responder = () => jsonResponse({});

    await expect(getPostContext(TOKEN, "p1")).resolves.toBeNull();
  });

  it("does nothing without a token or a post", async () => {
    await getPostContext("", "p1");
    await getPostContext(TOKEN, "");

    expect(calls).toHaveLength(0);
  });
});

describe("sendTypingOff", () => {
  it("takes the indicator back down", async () => {
    // A thread a person has taken over ends without a reply. Leaving the dots
    // to expire on their own is twenty seconds of a promise nobody will keep.
    await sendTypingOff(TOKEN, "PSID-1");

    expect(body()).toEqual({ recipient: { id: "PSID-1" }, sender_action: "typing_off" });
  });

  it("never throws — a failed indicator must not break anything", async () => {
    responder = () => jsonResponse({ error: { message: "nope" } }, 500);

    await expect(sendTypingOff(TOKEN, "PSID-1")).resolves.toBeUndefined();
  });

  it("does nothing without a token or recipient", async () => {
    await sendTypingOff("", "PSID-1");
    await sendTypingOff(TOKEN, "");

    expect(calls).toHaveLength(0);
  });
});

describe("sendQuickReplies", () => {
  const replies = [
    { title: "Бүтээгдэхүүн", payload: "SHOW_PRODUCTS" },
    { title: "Хямдрал", payload: "SHOW_PROMOS" },
  ];

  it("attaches the replies to the message", async () => {
    await sendQuickReplies(TOKEN, "PSID-1", "Юу сонирхож байна?", replies);

    expect(body().message.quick_replies).toEqual([
      { content_type: "text", title: "Бүтээгдэхүүн", payload: "SHOW_PRODUCTS" },
      { content_type: "text", title: "Хямдрал", payload: "SHOW_PROMOS" },
    ]);
  });

  it("caps the list at the 13 Messenger allows", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, payload: `P${i}` }));

    await sendQuickReplies(TOKEN, "PSID-1", "hi", many);

    expect(body().message.quick_replies).toHaveLength(13);
  });

  it("truncates a title past the 20-character limit", async () => {
    await sendQuickReplies(TOKEN, "PSID-1", "hi", [
      { title: "а".repeat(40), payload: "P" },
    ]);

    expect(body().message.quick_replies[0].title).toHaveLength(20);
  });

  it("falls back to a plain message when there are no replies", async () => {
    await sendQuickReplies(TOKEN, "PSID-1", "Зөвхөн текст", []);

    expect(body().message).toEqual({ text: "Зөвхөн текст" });
  });

  it("never throws — quick replies are a nicety, not the answer", async () => {
    responder = () => jsonResponse({ error: { message: "nope" } }, 400);

    await expect(sendQuickReplies(TOKEN, "PSID-1", "hi", replies)).resolves.toBeUndefined();
  });
});

describe("sendCarousel", () => {
  const cards = [
    {
      title: "Хужирт саван",
      subtitle: "25,000₮",
      imageUrl: "https://example.com/a.jpg",
      buttons: [{ title: "Захиалах", payload: "ORDER_1" }],
    },
  ];

  it("sends a generic template with the card fields mapped", async () => {
    await sendCarousel(TOKEN, "PSID-1", cards);

    const payload = body().message.attachment.payload;
    expect(payload.template_type).toBe("generic");
    expect(payload.elements[0]).toEqual({
      title: "Хужирт саван",
      subtitle: "25,000₮",
      image_url: "https://example.com/a.jpg",
      buttons: [{ type: "postback", title: "Захиалах", payload: "ORDER_1" }],
    });
  });

  it("renders a link button as web_url and the card link as default_action", async () => {
    await sendCarousel(TOKEN, "PSID-1", [
      {
        title: "Хужирт саван",
        url: "https://savana.mn/product/1",
        buttons: [
          { title: "Захиалах", payload: "ORDER_1" },
          { title: "Дэлгэрэнгүй", url: "https://savana.mn/product/1" },
        ],
      },
    ]);

    const element = body().message.attachment.payload.elements[0];
    expect(element.default_action).toEqual({
      type: "web_url",
      url: "https://savana.mn/product/1",
    });
    expect(element.buttons).toEqual([
      { type: "postback", title: "Захиалах", payload: "ORDER_1" },
      // A url button sent as a postback is silently ignored by Messenger, so
      // the type has to follow the button, not the card.
      { type: "web_url", title: "Дэлгэрэнгүй", url: "https://savana.mn/product/1" },
    ]);
  });

  it("still renders a card that has no image", async () => {
    await sendCarousel(TOKEN, "PSID-1", [{ title: "Зурaггүй бараа" }]);

    const element = body().message.attachment.payload.elements[0];
    expect(element.title).toBe("Зурaггүй бараа");
    expect(element.image_url).toBeUndefined();
  });

  it("caps the carousel at 10 cards", async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ title: `Бараа ${i}` }));

    await sendCarousel(TOKEN, "PSID-1", many);

    expect(body().message.attachment.payload.elements).toHaveLength(10);
  });

  it("caps each card at 3 buttons", async () => {
    await sendCarousel(TOKEN, "PSID-1", [
      {
        title: "Бараа",
        buttons: Array.from({ length: 5 }, (_, i) => ({ title: `B${i}`, payload: `P${i}` })),
      },
    ]);

    expect(body().message.attachment.payload.elements[0].buttons).toHaveLength(3);
  });

  it("truncates an over-long card title", async () => {
    await sendCarousel(TOKEN, "PSID-1", [{ title: "а".repeat(200) }]);

    expect(body().message.attachment.payload.elements[0].title).toHaveLength(80);
  });

  it("substitutes a placeholder for an empty title so the card still renders", async () => {
    await sendCarousel(TOKEN, "PSID-1", [{ title: "" }]);

    expect(body().message.attachment.payload.elements[0].title).toBe("—");
  });

  it("sends nothing when there are no cards", async () => {
    await sendCarousel(TOKEN, "PSID-1", []);

    expect(calls).toHaveLength(0);
  });
});

describe("getUserName", () => {
  it("returns the profile name", async () => {
    responder = () => jsonResponse({ name: "Батбаяр" });

    await expect(getUserName(TOKEN, "PSID-1")).resolves.toBe("Батбаяр");
  });

  it("falls back to joining first and last name", async () => {
    responder = () => jsonResponse({ first_name: "Бат", last_name: "Баяр" });

    await expect(getUserName(TOKEN, "PSID-1")).resolves.toBe("Бат Баяр");
  });

  it("returns null when the profile is not readable", async () => {
    responder = () => jsonResponse({ error: { message: "unsupported" } }, 400);

    await expect(getUserName(TOKEN, "PSID-1")).resolves.toBeNull();
  });

  it("returns null rather than throwing on a network failure", async () => {
    responder = () => {
      throw new TypeError("network");
    };

    await expect(getUserName(TOKEN, "PSID-1")).resolves.toBeNull();
  });

  it("keeps the token out of the URL", async () => {
    responder = () => jsonResponse({ name: "Бат" });

    await getUserName(TOKEN, "PSID-1");

    expect(calls[0].url).not.toContain(TOKEN);
  });
});

describe("applyMessengerProfile", () => {
  it("always installs the Get Started button", async () => {
    await applyMessengerProfile(TOKEN, {});

    expect(calls[0].url).toContain("/me/messenger_profile");
    expect(body().get_started).toEqual({ payload: "GET_STARTED" });
  });

  it("installs the greeting and persistent menu", async () => {
    await applyMessengerProfile(TOKEN, {
      greeting: "Сайн байна уу!",
      menuItems: [{ title: "Бүтээгдэхүүн", payload: "SHOW_PRODUCTS" }],
    });

    expect(body().greeting).toEqual([{ locale: "default", text: "Сайн байна уу!" }]);
    expect(body().persistent_menu[0].call_to_actions).toEqual([
      { type: "postback", title: "Бүтээгдэхүүн", payload: "SHOW_PRODUCTS" },
    ]);
  });

  it("caps the persistent menu at 3 entries", async () => {
    await applyMessengerProfile(TOKEN, {
      menuItems: Array.from({ length: 6 }, (_, i) => ({ title: `M${i}`, payload: `P${i}` })),
    });

    expect(body().persistent_menu[0].call_to_actions).toHaveLength(3);
  });

  it("refuses to run without a token", async () => {
    await expect(applyMessengerProfile("", {})).rejects.toThrow();
  });

  it("surfaces a Graph failure so the admin sees the setup did not apply", async () => {
    responder = () => jsonResponse({ error: { message: "Requires pages_messaging" } }, 403);

    await expect(applyMessengerProfile(TOKEN, {})).rejects.toThrow(/pages_messaging/);
  });
});
