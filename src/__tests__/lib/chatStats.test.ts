import { describe, it, expect } from "vitest";

import { computeChatStats, STATS_WINDOW_DAYS } from "../../lib/chat/chatStats";
import type {
  ChatChannel,
  ChatConversationRecord,
  ChatConversationStatus,
  ChatLeadRecord,
  ChatLeadStatus,
} from "../../lib/chat/types";

const NOW = Date.parse("2026-08-16T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function isoAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function conversation(
  status: ChatConversationStatus,
  channel: ChatChannel = "facebook",
  lastMessageAgoMs = 0,
): ChatConversationRecord {
  return {
    id: Math.random().toString(36).slice(2),
    schemaVersion: 1,
    channel,
    status,
    externalUserId: "u",
    userId: null,
    customerName: null,
    customerPhone: null,
    messageCount: 2,
    lastMessagePreview: "",
    lastMessageAt: isoAgo(lastMessageAgoMs),
    handoverReason: null,
    createdAt: isoAgo(lastMessageAgoMs),
    updatedAt: null,
  };
}

function lead(
  status: ChatLeadStatus,
  overrides: Partial<ChatLeadRecord> = {},
): ChatLeadRecord {
  return {
    id: Math.random().toString(36).slice(2),
    schemaVersion: 1,
    type: "order",
    status,
    conversationId: "c1",
    channel: "facebook",
    customerName: "Бат",
    customerPhone: "99119911",
    note: "",
    items: [],
    convertedOrderId: status === "converted" ? "sale-1" : null,
    createdAt: isoAgo(0),
    updatedAt: null,
    ...overrides,
  };
}

describe("computeChatStats", () => {
  it("returns zeroes for an empty shop without dividing by zero", () => {
    const stats = computeChatStats([], [], NOW);

    expect(stats).toMatchObject({
      totalConversations: 0,
      handoverRate: 0,
      totalLeads: 0,
      conversionRate: 0,
    });
    expect(stats.byChannel).toEqual([]);
  });

  it("counts conversations and those inside the window", () => {
    const stats = computeChatStats(
      [
        conversation("active", "facebook", 0),
        conversation("active", "facebook", 3 * DAY),
        conversation("active", "facebook", 30 * DAY),
      ],
      [],
      NOW,
    );

    expect(stats.totalConversations).toBe(3);
    expect(stats.recentConversations).toBe(2);
  });

  it("counts threads waiting on a human", () => {
    const stats = computeChatStats(
      [conversation("handover"), conversation("handover"), conversation("active")],
      [],
      NOW,
    );

    expect(stats.awaitingHuman).toBe(2);
  });

  it("counts an admin-handled thread as escalated even though nobody is waiting", () => {
    const stats = computeChatStats(
      [conversation("handover"), conversation("admin_active"), conversation("active")],
      [],
      NOW,
    );

    expect(stats.awaitingHuman).toBe(1);
    expect(stats.handoverRate).toBe(67);
  });

  it("reports a 0% escalation rate when the bot handled everything", () => {
    const stats = computeChatStats([conversation("active"), conversation("resolved")], [], NOW);

    expect(stats.handoverRate).toBe(0);
  });

  it("breaks conversations down by channel, busiest first", () => {
    const stats = computeChatStats(
      [
        conversation("active", "facebook"),
        conversation("active", "facebook"),
        conversation("active", "widget"),
        conversation("active", "instagram"),
        conversation("active", "instagram"),
        conversation("active", "instagram"),
      ],
      [],
      NOW,
    );

    expect(stats.byChannel).toEqual([
      { channel: "instagram", count: 3 },
      { channel: "facebook", count: 2 },
      { channel: "widget", count: 1 },
    ]);
  });

  it("computes the lead conversion rate", () => {
    const stats = computeChatStats(
      [],
      [lead("converted"), lead("converted"), lead("new"), lead("dismissed")],
      NOW,
    );

    expect(stats.totalLeads).toBe(4);
    expect(stats.convertedLeads).toBe(2);
    expect(stats.pendingLeads).toBe(1);
    expect(stats.conversionRate).toBe(50);
  });

  it("counts leads the bot could not finish capturing", () => {
    const stats = computeChatStats(
      [],
      [
        lead("new", { customerPhone: "" }),
        lead("new", { customerName: "  " }),
        lead("new"),
        // Already converted, so an empty phone is no longer a gap to chase.
        lead("converted", { customerPhone: "" }),
      ],
      NOW,
    );

    expect(stats.incompleteLeads).toBe(2);
  });

  it("counts only leads raised inside the window", () => {
    const stats = computeChatStats(
      [],
      [
        lead("new", { createdAt: isoAgo(0) }),
        lead("new", { createdAt: isoAgo(2 * DAY) }),
        lead("new", { createdAt: isoAgo(20 * DAY) }),
      ],
      NOW,
    );

    expect(stats.recentLeads).toBe(2);
    expect(stats.totalLeads).toBe(3);
  });

  it("treats a record with no timestamp as outside the window", () => {
    const stats = computeChatStats(
      [{ ...conversation("active"), lastMessageAt: null }],
      [lead("new", { createdAt: null })],
      NOW,
    );

    expect(stats.recentConversations).toBe(0);
    expect(stats.recentLeads).toBe(0);
  });

  it("ignores an unparseable timestamp rather than throwing", () => {
    const stats = computeChatStats(
      [{ ...conversation("active"), lastMessageAt: "өчигдөр" }],
      [],
      NOW,
    );

    expect(stats.recentConversations).toBe(0);
    expect(stats.totalConversations).toBe(1);
  });

  it("honours a custom window", () => {
    const conversations = [conversation("active", "facebook", 5 * DAY)];

    expect(computeChatStats(conversations, [], NOW, 7).recentConversations).toBe(1);
    expect(computeChatStats(conversations, [], NOW, 1).recentConversations).toBe(0);
  });

  it("defaults to a 7-day window", () => {
    expect(STATS_WINDOW_DAYS).toBe(7);
    expect(
      computeChatStats([conversation("active", "facebook", 6 * DAY)], [], NOW).recentConversations,
    ).toBe(1);
  });

  it("rounds rates to whole percent", () => {
    const stats = computeChatStats(
      [conversation("handover"), conversation("active"), conversation("active")],
      [],
      NOW,
    );

    expect(stats.handoverRate).toBe(33);
  });
});
