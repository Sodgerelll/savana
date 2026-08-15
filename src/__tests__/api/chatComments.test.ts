import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  callGemini: vi.fn(),
  replyToComment: vi.fn(),
  sendPrivateReply: vi.fn(),
  markEventProcessed: vi.fn(),
}));

vi.mock("../../../api/chat/_lib/gemini.js", async () => {
  const actual = await vi.importActual<typeof import("../../../api/chat/_lib/gemini")>(
    "../../../api/chat/_lib/gemini",
  );
  return { ...actual, callGemini: mocks.callGemini };
});

vi.mock("../../../api/chat/_lib/facebook.js", () => ({
  replyToComment: mocks.replyToComment,
  sendPrivateReply: mocks.sendPrivateReply,
}));

vi.mock("../../../api/chat/_lib/guards.js", () => ({
  markEventProcessed: mocks.markEventProcessed,
}));

import { handleCommentEvent, parseCommentChange } from "../../../api/chat/_lib/comments";
import type { StorefrontContext } from "../../../api/chat/_lib/buildPrompt";

const PAGE_ID = "PAGE-1";

function storefront(): StorefrontContext {
  return {
    shop: {
      brandName: "SAVANA",
      brandDescription: "",
      contactPhone: "",
      contactEmail: "",
      location: "",
      storeHoursText: "",
      facebookUrl: "",
      instagramHandle: "",
    },
    collections: [],
    products: [],
    discounts: [],
    faqs: [],
    basePrompt: "",
    knowledgePoints: [],
    botName: "",
  };
}

function fakeDb() {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    db: {
      collection: () => ({
        doc: (id: string) => ({
          set: (data: Record<string, unknown>) => {
            store.set(id, data);
            return Promise.resolve();
          },
        }),
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.markEventProcessed.mockResolvedValue(true);
  mocks.callGemini.mockResolvedValue("25,000₮ байна. Дэлгэрэнгүйг мессежээр илгээлээ 📩");
  mocks.replyToComment.mockResolvedValue(true);
  mocks.sendPrivateReply.mockResolvedValue(true);
});

describe("parseCommentChange", () => {
  function fbChange(value: Record<string, unknown>) {
    return { field: "feed", value: { item: "comment", verb: "add", ...value } };
  }

  it("reads a new Facebook comment", () => {
    const event = parseCommentChange(
      fbChange({
        comment_id: "c1",
        post_id: "p1",
        message: "Үнэ хэд вэ?",
        from: { id: "u1", name: "Бат" },
      }),
      PAGE_ID,
      "facebook",
    );

    expect(event).toEqual({
      commentId: "c1",
      postId: "p1",
      authorId: "u1",
      authorName: "Бат",
      message: "Үнэ хэд вэ?",
      channel: "facebook",
    });
  });

  it("ignores a like or share on the feed", () => {
    expect(
      parseCommentChange(
        { field: "feed", value: { item: "like", verb: "add", comment_id: "c1", message: "x" } },
        PAGE_ID,
        "facebook",
      ),
    ).toBeNull();
  });

  it("ignores an edited or removed comment", () => {
    for (const verb of ["edited", "remove", "hide"]) {
      expect(
        parseCommentChange(
          { field: "feed", value: { item: "comment", verb, comment_id: "c1", message: "x" } },
          PAGE_ID,
          "facebook",
        ),
      ).toBeNull();
    }
  });

  it("ignores our own reply so the bot cannot answer itself", () => {
    expect(
      parseCommentChange(
        fbChange({ comment_id: "c1", message: "Баярлалаа", from: { id: PAGE_ID } }),
        PAGE_ID,
        "facebook",
      ),
    ).toBeNull();
  });

  it("ignores a comment with no text", () => {
    expect(
      parseCommentChange(fbChange({ comment_id: "c1", message: "  " }), PAGE_ID, "facebook"),
    ).toBeNull();
  });

  it("ignores a change with no comment id", () => {
    expect(parseCommentChange(fbChange({ message: "hi" }), PAGE_ID, "facebook")).toBeNull();
  });

  it("reads an Instagram comment, which has no verb field", () => {
    const event = parseCommentChange(
      {
        field: "comments",
        value: { id: "ig1", text: "Захиалж болох уу?", from: { id: "u9", username: "batbayar" }, media: { id: "m1" } },
      },
      PAGE_ID,
      "instagram",
    );

    expect(event).toMatchObject({
      commentId: "ig1",
      postId: "m1",
      authorName: "batbayar",
      message: "Захиалж болох уу?",
      channel: "instagram",
    });
  });

  it("truncates a very long comment", () => {
    const event = parseCommentChange(
      fbChange({ comment_id: "c1", message: "а".repeat(900) }),
      PAGE_ID,
      "facebook",
    );

    expect(event?.message).toHaveLength(500);
  });

  it("returns null for a change with no value", () => {
    expect(parseCommentChange({ field: "feed" }, PAGE_ID, "facebook")).toBeNull();
  });
});

describe("handleCommentEvent", () => {
  const event = {
    commentId: "c1",
    postId: "p1",
    authorId: "u1",
    authorName: "Бат",
    message: "Үнэ хэд вэ?",
    channel: "facebook" as const,
  };

  function options() {
    return { token: "PAGE-TOKEN", storefront: storefront(), temperature: 0.7 };
  }

  it("answers publicly and follows up privately", async () => {
    const { db } = fakeDb();

    await expect(handleCommentEvent(db, event, options())).resolves.toBe(true);

    expect(mocks.replyToComment).toHaveBeenCalledWith("PAGE-TOKEN", "c1", expect.any(String));
    expect(mocks.sendPrivateReply).toHaveBeenCalledWith("PAGE-TOKEN", "c1", expect.any(String));
  });

  it("claims the comment id so a redelivery cannot burn the single private reply", async () => {
    const { db } = fakeDb();

    await handleCommentEvent(db, event, options());

    expect(mocks.markEventProcessed).toHaveBeenCalledWith(db, "comment_c1");
  });

  it("does nothing on a duplicate delivery", async () => {
    mocks.markEventProcessed.mockResolvedValue(false);
    const { db } = fakeDb();

    await expect(handleCommentEvent(db, event, options())).resolves.toBe(false);
    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(mocks.replyToComment).not.toHaveBeenCalled();
  });

  it("instructs the model to keep the public reply short and give the price", async () => {
    const { db } = fakeDb();

    await handleCommentEvent(db, event, options());

    const prompt = mocks.callGemini.mock.calls[0][0].systemPrompt;
    expect(prompt).toContain("НИЙТИЙН ХАРИУ");
    expect(prompt).toContain("1-2 богино өгүүлбэр");
    expect(prompt).toContain("инбокс бичнэ үү");
  });

  it("caps the generated reply length", async () => {
    const { db } = fakeDb();

    await handleCommentEvent(db, event, options());

    expect(mocks.callGemini.mock.calls[0][0].maxOutputTokens).toBe(120);
  });

  it("logs what it said and whether each channel landed", async () => {
    const { db, store } = fakeDb();

    await handleCommentEvent(db, event, options());

    expect(store.get("c1")).toMatchObject({
      commentId: "c1",
      comment: "Үнэ хэд вэ?",
      publicReplySent: true,
      privateReplySent: true,
      channel: "facebook",
    });
  });

  it("still counts as handled when only the public reply lands", async () => {
    mocks.sendPrivateReply.mockResolvedValue(false);
    const { db, store } = fakeDb();

    await expect(handleCommentEvent(db, event, options())).resolves.toBe(true);
    expect(store.get("c1")).toMatchObject({ publicReplySent: true, privateReplySent: false });
  });

  it("reports failure when neither reply lands", async () => {
    mocks.replyToComment.mockResolvedValue(false);
    mocks.sendPrivateReply.mockResolvedValue(false);
    const { db } = fakeDb();

    await expect(handleCommentEvent(db, event, options())).resolves.toBe(false);
  });

  it("sends nothing when generation fails", async () => {
    mocks.callGemini.mockRejectedValue(new Error("gemini down"));
    const { db } = fakeDb();

    await expect(handleCommentEvent(db, event, options())).resolves.toBe(false);
    expect(mocks.replyToComment).not.toHaveBeenCalled();
  });
});
