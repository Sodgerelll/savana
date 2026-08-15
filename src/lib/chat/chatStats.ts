// Chat metrics for the admin overview.
//
// Computed from the conversation and lead lists the admin shell already
// subscribes to, so the dashboard costs no extra Firestore reads.

import type { ChatChannel, ChatConversationRecord, ChatLeadRecord } from "./types";

export interface ChatStats {
  totalConversations: number;
  /** Conversations whose last message falls inside the window. */
  recentConversations: number;
  awaitingHuman: number;
  /** Share of conversations the bot escalated, 0–100. */
  handoverRate: number;
  byChannel: Array<{ channel: ChatChannel; count: number }>;
  totalLeads: number;
  recentLeads: number;
  pendingLeads: number;
  convertedLeads: number;
  /** Share of leads turned into a sale, 0–100. */
  conversionRate: number;
  /** Leads still missing a name or phone — the bot could not finish capture. */
  incompleteLeads: number;
}

export const STATS_WINDOW_DAYS = 7;

function withinWindow(iso: string | null, now: number, days: number): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return !Number.isNaN(time) && now - time <= days * 24 * 60 * 60 * 1000;
}

function percentage(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/**
 * `now` is injected rather than read from the clock so the numbers are testable
 * and so a render mid-second cannot shift a boundary.
 */
export function computeChatStats(
  conversations: ChatConversationRecord[],
  leads: ChatLeadRecord[],
  now: number,
  windowDays = STATS_WINDOW_DAYS,
): ChatStats {
  const channelCounts = new Map<ChatChannel, number>();
  let awaitingHuman = 0;
  let escalated = 0;
  let recentConversations = 0;

  for (const conversation of conversations) {
    channelCounts.set(conversation.channel, (channelCounts.get(conversation.channel) ?? 0) + 1);

    if (conversation.status === "handover") {
      awaitingHuman += 1;
    }
    // A thread a human touched is one the bot could not finish, whether or not
    // it is still open — both states count toward the escalation rate.
    if (conversation.status === "handover" || conversation.status === "admin_active") {
      escalated += 1;
    }
    if (withinWindow(conversation.lastMessageAt, now, windowDays)) {
      recentConversations += 1;
    }
  }

  const pendingLeads = leads.filter((lead) => lead.status === "new").length;
  const convertedLeads = leads.filter((lead) => lead.status === "converted").length;
  const incompleteLeads = leads.filter(
    (lead) =>
      lead.status === "new" &&
      (lead.customerName.trim().length === 0 || lead.customerPhone.trim().length === 0),
  ).length;
  const recentLeads = leads.filter((lead) => withinWindow(lead.createdAt, now, windowDays)).length;

  return {
    totalConversations: conversations.length,
    recentConversations,
    awaitingHuman,
    handoverRate: percentage(escalated, conversations.length),
    byChannel: [...channelCounts.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
    totalLeads: leads.length,
    recentLeads,
    pendingLeads,
    convertedLeads,
    conversionRate: percentage(convertedLeads, leads.length),
    incompleteLeads,
  };
}
