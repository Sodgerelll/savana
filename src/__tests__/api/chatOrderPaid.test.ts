import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bonumGet: vi.fn(),
  postOrderPaidEntry: vi.fn(),
  sendText: vi.fn(),
  appendMessage: vi.fn(),
  loadChatSettings: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("../../../api/bonum/_client.js", () => ({ bonumGet: mocks.bonumGet }));
vi.mock("../../../api/_lib/postOrderPaidEntry.js", () => ({
  postOrderPaidEntry: mocks.postOrderPaidEntry,
}));
vi.mock("../../../api/chat/_lib/facebook.js", () => ({ sendText: mocks.sendText }));
vi.mock("../../../api/chat/_lib/conversation.js", () => ({ appendMessage: mocks.appendMessage }));
vi.mock("../../../api/chat/_lib/settings.js", () => ({ loadChatSettings: mocks.loadChatSettings }));
vi.mock("../../../api/chat/_lib/guards.js", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { sweepPendingChatPayments, tellTheChatCustomer } from "../../../api/chat/_lib/orderPaid";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: "ORD-260825-AAA111",
    payment: { status: "pending", invoiceId: "inv-1" },
    chat: { conversationId: "c1", channel: "facebook", externalUserId: "PSID-1" },
    createdAt: { toDate: () => new Date(NOW - 60_000) },
    ...overrides,
  };
}

function fakeDb(pending: Array<Record<string, unknown>>, byId: Record<string, unknown> = {}) {
  return {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => ({
            docs: pending.map((data, index) => ({ id: `o${index + 1}`, data: () => data })),
          }),
        }),
      }),
      doc: (id: string) => ({
        get: async () => ({ exists: Boolean(byId[id]), data: () => byId[id] }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.loadChatSettings.mockResolvedValue({ facebook: { pageAccessToken: "PAGE-TOKEN" } });
});

describe("sweepPendingChatPayments", () => {
  it("settles an order Bonum says was paid", async () => {
    // The webhook is the fast path; this is the one that catches what it drops.
    // Without it a customer can pay and hear nothing at all.
    mocks.bonumGet.mockResolvedValue({ status: "PAID", body: { paymentVendor: "qpay" } });
    const db = fakeDb([order()], { o1: order() });

    const result = await sweepPendingChatPayments(db, { now: NOW, force: true });

    expect(result).toEqual({ checked: 1, settled: 1 });
    expect(mocks.postOrderPaidEntry).toHaveBeenCalledWith(db, "o1", {
      bonumPaymentVendor: "qpay",
    });
    expect(mocks.sendText).toHaveBeenCalledWith(
      "PAGE-TOKEN",
      "PSID-1",
      expect.stringContaining("баталгаажлаа"),
    );
  });

  it("leaves an unpaid order alone", async () => {
    mocks.bonumGet.mockResolvedValue({ status: "PENDING", body: {} });

    const result = await sweepPendingChatPayments(fakeDb([order()]), { now: NOW, force: true });

    expect(result).toEqual({ checked: 1, settled: 0 });
    expect(mocks.postOrderPaidEntry).not.toHaveBeenCalled();
  });

  it("ignores a website order, which has its own check-payment button", async () => {
    const db = fakeDb([order({ chat: undefined })]);

    expect(await sweepPendingChatPayments(db, { now: NOW, force: true })).toEqual({
      checked: 0,
      settled: 0,
    });
  });

  it("ignores an order older than the invoice it is waiting on", async () => {
    const stale = order({ createdAt: { toDate: () => new Date(NOW - 48 * 60 * 60 * 1000) } });

    expect(await sweepPendingChatPayments(fakeDb([stale]), { now: NOW, force: true })).toEqual({
      checked: 0,
      settled: 0,
    });
  });

  it("keeps checking the rest when one invoice cannot be reached", async () => {
    mocks.bonumGet
      .mockRejectedValueOnce(new Error("bonum unreachable"))
      .mockResolvedValueOnce({ status: "PAID", body: {} });
    const db = fakeDb([order(), order({ orderNumber: "ORD-B" })], { o2: order() });

    const result = await sweepPendingChatPayments(db, { now: NOW, force: true });

    expect(result).toEqual({ checked: 2, settled: 1 });
  });

  it("does nothing when it has swept too recently", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    expect(await sweepPendingChatPayments(fakeDb([order()]), { now: NOW })).toEqual({
      checked: 0,
      settled: 0,
    });
    expect(mocks.bonumGet).not.toHaveBeenCalled();
  });
});

describe("tellTheChatCustomer", () => {
  it("says nothing about an order that did not come from a chat", async () => {
    const db = fakeDb([], { o1: order({ chat: undefined }) });

    await tellTheChatCustomer(db, "o1");

    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it("records the message even when Facebook has no token to send it with", async () => {
    // The thread and the admin panel should still show what the customer was
    // meant to be told.
    mocks.loadChatSettings.mockResolvedValue({ facebook: { pageAccessToken: "" } });
    const db = fakeDb([], { o1: order() });

    await tellTheChatCustomer(db, "o1");

    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.appendMessage).toHaveBeenCalledWith(db, "c1", expect.objectContaining({
      role: "assistant",
    }));
  });
});
