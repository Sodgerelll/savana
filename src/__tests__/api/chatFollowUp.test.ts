import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  sendText: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("../../../api/chat/_lib/facebook.js", () => ({ sendText: mocks.sendText }));
vi.mock("../../../api/chat/_lib/guards.js", () => ({ checkRateLimit: mocks.checkRateLimit }));

import {
  isDueForNudge,
  NUDGE_AFTER_MS,
  NUDGE_GIVE_UP_AFTER_MS,
  sweepStaleLeads,
} from "../../../api/chat/_lib/followUp";

const NOW = Date.parse("2026-08-16T10:00:00.000Z");

function lead(overrides: Record<string, unknown> = {}) {
  return {
    status: "new",
    customerPhone: "",
    customerName: "Бат",
    conversationId: "c1",
    channel: "facebook",
    createdAt: new Date(NOW - NUDGE_AFTER_MS - 1000),
    ...overrides,
  };
}

/** Firestore stand-in holding leads and one conversation. */
function fakeDb(
  leads: Array<Record<string, unknown>>,
  conversation: Record<string, unknown> | null = { externalUserId: "PSID-1", status: "active" },
) {
  const written: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];

  const leadDocs = leads.map((data, index) => ({
    id: `lead-${index}`,
    data: () => data,
    ref: {
      set: (patch: Record<string, unknown>) => {
        written.push(patch);
        return Promise.resolve();
      },
    },
  }));

  const leadQuery: Record<string, unknown> = {};
  leadQuery.where = () => leadQuery;
  leadQuery.orderBy = () => leadQuery;
  leadQuery.limit = () => leadQuery;
  leadQuery.get = () => Promise.resolve({ docs: leadDocs });

  return {
    written,
    messages,
    db: {
      collection: (path: string) => {
        if (path === "chat_leads") return leadQuery;
        return {
          doc: () => ({
            get: () =>
              Promise.resolve({
                exists: conversation !== null,
                data: () => conversation ?? undefined,
              }),
            collection: () => ({
              doc: () => ({
                set: (data: Record<string, unknown>) => {
                  messages.push(data);
                  return Promise.resolve();
                },
              }),
            }),
          }),
        };
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.sendText.mockResolvedValue(undefined);
});

describe("isDueForNudge", () => {
  it("is due once the wait has elapsed", () => {
    expect(isDueForNudge(lead(), NOW)).toBe(true);
  });

  it("is not due before the wait elapses", () => {
    expect(isDueForNudge(lead({ createdAt: new Date(NOW - 60_000) }), NOW)).toBe(false);
  });

  it("gives up on a lead older than a day", () => {
    const ancient = lead({ createdAt: new Date(NOW - NUDGE_GIVE_UP_AFTER_MS - 1000) });
    expect(isDueForNudge(ancient, NOW)).toBe(false);
  });

  it("skips a lead that already has a phone number", () => {
    expect(isDueForNudge(lead({ customerPhone: "99119911" }), NOW)).toBe(false);
  });

  it("treats a whitespace phone as missing", () => {
    expect(isDueForNudge(lead({ customerPhone: "   " }), NOW)).toBe(true);
  });

  it("nudges only once, ever", () => {
    expect(isDueForNudge(lead({ followUpSentAt: new Date() }), NOW)).toBe(false);
  });

  it("skips a lead that is no longer new", () => {
    for (const status of ["converted", "dismissed", "processing"]) {
      expect(isDueForNudge(lead({ status }), NOW)).toBe(false);
    }
  });

  it("accepts a Firestore Timestamp createdAt", () => {
    const timestamp = { toMillis: () => NOW - NUDGE_AFTER_MS - 1000 };
    expect(isDueForNudge(lead({ createdAt: timestamp }), NOW)).toBe(true);
  });

  it("accepts an ISO string createdAt", () => {
    const iso = new Date(NOW - NUDGE_AFTER_MS - 1000).toISOString();
    expect(isDueForNudge(lead({ createdAt: iso }), NOW)).toBe(true);
  });

  it("does not nudge a lead with an unreadable createdAt", () => {
    expect(isDueForNudge(lead({ createdAt: null }), NOW)).toBe(false);
  });
});

describe("sweepStaleLeads", () => {
  it("sends the nudge and records it on the transcript", async () => {
    const { db, messages } = fakeDb([lead()]);

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.nudged).toBe(1);
    expect(mocks.sendText).toHaveBeenCalledWith("T", "PSID-1", expect.stringContaining("Захиалгаа"));
    expect(messages[0]).toMatchObject({ role: "assistant", toolName: "follow_up" });
  });

  it("stamps followUpSentAt so it never nudges twice", async () => {
    const { db, written } = fakeDb([lead()]);

    await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(written[0].followUpSentAt).toBeInstanceOf(Date);
  });

  it("stamps even when the send failed, so it is not retried forever", async () => {
    const { db, written } = fakeDb([lead()], null);

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.nudged).toBe(0);
    expect(result.skipped).toBe(1);
    expect(written[0].followUpSentAt).toBeInstanceOf(Date);
  });

  it("leaves a lead that is not yet due untouched", async () => {
    const { db, written } = fakeDb([lead({ createdAt: new Date(NOW - 60_000) })]);

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.nudged).toBe(0);
    expect(written).toHaveLength(0);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("never interrupts a thread an admin has taken over", async () => {
    const { db } = fakeDb([lead()], { externalUserId: "PSID-1", status: "admin_active" });

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.nudged).toBe(0);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("never interrupts a thread the bot just handed to a person", async () => {
    // The customer was told a person would answer. Following that with "shall
    // we carry on with your order?" reads as the shop having forgotten what it
    // told them a moment ago.
    const { db } = fakeDb([lead()], { externalUserId: "PSID-1", status: "handover" });

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.nudged).toBe(0);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("cannot reach a widget visitor, so it skips them", async () => {
    const { db } = fakeDb([lead({ channel: "widget" })]);

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.nudged).toBe(0);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("nudges an Instagram lead too", async () => {
    const { db } = fakeDb([lead({ channel: "instagram" })]);

    expect((await sweepStaleLeads(db, { token: "T", now: NOW })).nudged).toBe(1);
  });

  it("does nothing when the throttle says a sweep ran recently", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    const { db } = fakeDb([lead()]);

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result).toEqual({ scanned: 0, nudged: 0, skipped: 0 });
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("ignores the throttle when forced by a scheduler", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    const { db } = fakeDb([lead()]);

    const result = await sweepStaleLeads(db, { token: "T", now: NOW, force: true });

    expect(result.nudged).toBe(1);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("caps how many nudges one sweep can send", async () => {
    const { db } = fakeDb(Array.from({ length: 40 }, () => lead()));

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.nudged).toBe(20);
  });

  it("skips a lead with no conversation to reply on", async () => {
    const { db } = fakeDb([lead({ conversationId: "" })]);

    const result = await sweepStaleLeads(db, { token: "T", now: NOW });

    expect(result.skipped).toBe(1);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("returns an empty result rather than throwing when the scan fails", async () => {
    const failingQuery: Record<string, unknown> = {};
    failingQuery.where = () => failingQuery;
    failingQuery.orderBy = () => failingQuery;
    failingQuery.limit = () => failingQuery;
    failingQuery.get = () => Promise.reject(new Error("index missing"));

    const result = await sweepStaleLeads({ collection: () => failingQuery }, { token: "T", now: NOW });

    expect(result).toEqual({ scanned: 0, nudged: 0, skipped: 0 });
  });
});
