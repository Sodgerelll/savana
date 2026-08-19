import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminFirestore: vi.fn(),
  requirePrivilegedCaller: vi.fn(),
  sendText: vi.fn(),
  appendMessage: vi.fn(),
  setConversationStatus: vi.fn(),
}));

vi.mock("../../../api/bonum/_firebaseAdmin.js", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));
vi.mock("../../../api/chat/_lib/auth.js", () => ({
  requirePrivilegedCaller: mocks.requirePrivilegedCaller,
}));
vi.mock("../../../api/chat/_lib/facebook.js", () => ({ sendText: mocks.sendText }));
vi.mock("../../../api/chat/_lib/conversation.js", () => ({
  appendMessage: mocks.appendMessage,
  setConversationStatus: mocks.setConversationStatus,
}));

import handler from "../../../api/chat/reply";

const PAGE_TOKEN = "PAGE-TOKEN";

function mockRes() {
  const captured = { status: 0, body: {} as Record<string, unknown> };
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

function fakeDb(
  conversation: Record<string, unknown> | null,
  settings: Record<string, unknown> = {
    isActive: true,
    facebook: { isActive: true, pageAccessToken: PAGE_TOKEN },
  },
) {
  return {
    doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => settings }) }),
    collection: () => ({
      doc: () => ({
        get: () =>
          Promise.resolve({ exists: conversation !== null, data: () => conversation ?? undefined }),
      }),
    }),
  };
}

function post(body: Record<string, unknown>) {
  return { method: "POST", headers: { authorization: "Bearer t" }, body };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requirePrivilegedCaller.mockResolvedValue({
    ok: true,
    caller: { uid: "u1", role: "admin", email: "a@savana.mn", displayName: "Сод" },
  });
  mocks.getAdminFirestore.mockReturnValue(
    Promise.resolve(fakeDb({ channel: "facebook", externalUserId: "PSID-1" })),
  );
});

describe("POST /api/chat/reply", () => {
  it("delivers the reply on Messenger and records it as an admin message", async () => {
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "Сайн байна уу" }), res);

    expect(captured.status).toBe(200);
    expect(mocks.sendText).toHaveBeenCalledWith(PAGE_TOKEN, "PSID-1", "Сайн байна уу", {
      fallbackTag: "HUMAN_AGENT",
    });
    expect(mocks.appendMessage).toHaveBeenCalledWith(expect.anything(), "c1", {
      role: "admin",
      content: "Сайн байна уу",
      authorName: "Сод",
    });
  });

  it("silences the bot on that thread afterwards", async () => {
    const { res } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(mocks.setConversationStatus).toHaveBeenCalledWith(expect.anything(), "c1", "admin_active");
  });

  it("holds the HUMAN_AGENT tag back as a fallback rather than leading with it", async () => {
    // The tag reopens a thread outside the 24-hour window, but it needs a
    // permission only App Review grants — so sending it first fails every reply
    // an unreviewed app makes, which is the state every shop starts in.
    const { res } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(mocks.sendText.mock.calls[0][3]).toEqual({ fallbackTag: "HUMAN_AGENT" });
  });

  it("hands the thread back to the bot without sending anything", async () => {
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", handBack: true }), res);

    expect(captured.status).toBe(200);
    expect(mocks.setConversationStatus).toHaveBeenCalledWith(expect.anything(), "c1", "active");
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it("still requires a message when it is not a hand-back", async () => {
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "  " }), res);

    expect(captured.status).toBe(400);
  });

  it("passes Facebook's own refusal through to the admin", async () => {
    // "Could not send" alone left nobody anything to act on; the reason a send
    // was refused is the whole of what an admin needs.
    mocks.sendText.mockRejectedValueOnce(
      new Error("Facebook рүү илгээж чадсангүй: (#10) message tag not allowed"),
    );
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(502);
    expect(String(captured.body?.error)).toContain("message tag not allowed");
  });

  it("falls back to the caller's email when they have no display name", async () => {
    mocks.requirePrivilegedCaller.mockResolvedValue({
      ok: true,
      caller: { uid: "u1", role: "admin", email: "a@savana.mn", displayName: null },
    });
    const { res } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(mocks.appendMessage.mock.calls[0][2].authorName).toBe("a@savana.mn");
  });

  it("delivers an Instagram reply through the same Send API", async () => {
    mocks.getAdminFirestore.mockReturnValue(
      Promise.resolve(fakeDb({ channel: "instagram", externalUserId: "IGSID-1" })),
    );
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(200);
    expect(mocks.sendText).toHaveBeenCalledWith(PAGE_TOKEN, "IGSID-1", "hi", {
      fallbackTag: "HUMAN_AGENT",
    });
  });

  it("records a widget reply without calling Facebook", async () => {
    mocks.getAdminFirestore.mockReturnValue(
      Promise.resolve(fakeDb({ channel: "widget", externalUserId: null })),
    );
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(200);
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.appendMessage).toHaveBeenCalled();
  });

  it("rejects a non-POST method", async () => {
    const { res, captured } = mockRes();

    await handler({ method: "GET", headers: {}, body: {} }, res);

    expect(captured.status).toBe(405);
  });

  it("requires an authorized caller before touching the conversation", async () => {
    mocks.requirePrivilegedCaller.mockResolvedValue({ ok: false, status: 403, error: "Эрхгүй." });
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(403);
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it("rejects a missing conversation id", async () => {
    const { res, captured } = mockRes();

    await handler(post({ message: "hi" }), res);

    expect(captured.status).toBe(400);
  });

  it("rejects an empty message", async () => {
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "   " }), res);

    expect(captured.status).toBe(400);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("rejects a message past the length limit", async () => {
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "а".repeat(2001) }), res);

    expect(captured.status).toBe(400);
  });

  it("returns 404 for a conversation that does not exist", async () => {
    mocks.getAdminFirestore.mockReturnValue(Promise.resolve(fakeDb(null)));
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "missing", message: "hi" }), res);

    expect(captured.status).toBe(404);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("returns 409 when the thread has no recipient id", async () => {
    mocks.getAdminFirestore.mockReturnValue(
      Promise.resolve(fakeDb({ channel: "facebook", externalUserId: "" })),
    );
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(409);
  });

  it("returns 409 when no page token is configured", async () => {
    mocks.getAdminFirestore.mockReturnValue(
      Promise.resolve(
        fakeDb(
          { channel: "facebook", externalUserId: "PSID-1" },
          { isActive: true, facebook: { isActive: true, pageAccessToken: "" } },
        ),
      ),
    );
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(409);
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it("returns 503 without a service account", async () => {
    mocks.getAdminFirestore.mockReturnValue(null);
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(503);
  });

  it("does not record a reply that failed to send", async () => {
    mocks.sendText.mockRejectedValue(new Error("Invalid OAuth token"));
    const { res, captured } = mockRes();

    await handler(post({ conversationId: "c1", message: "hi" }), res);

    expect(captured.status).toBe(502);
    expect(mocks.appendMessage).not.toHaveBeenCalled();
    expect(mocks.setConversationStatus).not.toHaveBeenCalled();
  });
});
