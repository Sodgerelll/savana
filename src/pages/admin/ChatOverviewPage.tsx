import { useEffect, useMemo, useState } from "react";
import { Bot, Facebook, Globe, Instagram } from "lucide-react";
import ChatPanel from "../../components/chat/ChatPanel";
import { fetchFacebookStatus, type FacebookStatus } from "../../lib/chat/chatApi";
import { computeChatStats, STATS_WINDOW_DAYS } from "../../lib/chat/chatStats";
import { CHANNEL_LABELS } from "../../lib/chat/conversationStore";
import { CHAT_TOPIC_LABELS } from "../../lib/chat/types";
import type {
  ChatConversationRecord,
  ChatLeadRecord,
  ChatSettingsRecord,
} from "../../lib/chat/types";
import type { AdminCtx } from "./adminShellTypes";

const COPY = {
  MN: {
    kicker: "AI Chat",
    title: "Хяналт",
    text: "Ботын төлөв, холбогдсон суваг, туршилтын чат.",
    botStatus: "Ботын төлөв",
    on: "Идэвхтэй",
    off: "Унтраалттай",
    channels: "Холбогдсон суваг",
    noChannels: "Суваг холбогдоогүй",
    model: "Загвар",
    defaultModel: "Автомат (default chain)",
    notConfigured: "Тохируулаагүй",
    setupHint:
      "Бот унтраалттай байна — Чат тохиргоо хэсгээс асааж, Facebook хуудсаа холбоно уу. Туршилтын чат тохиргооноос үл хамааран ажиллана.",
    panelHint:
      "Энэ чат зөвхөн танд харагдана. Каталог, хямдрал, FAQ-аас угсарсан ЖИНХЭНЭ prompt-оор ажиллана. Гэхдээ энд зөвхөн ТЕКСТ — зурагтай карусель, захиалга шалгах, ажилтан руу шилжүүлэх зэрэг нь Messenger дээр л ажиллана. Тиймээс энд «зураг илгээх боломжгүй» гэвэл зөв, Messenger дээр карусель ирнэ.",
    facebook: "Facebook",
    instagram: "Instagram",
    widget: "Вэб виджет",
    statsTitle: `Сүүлийн ${STATS_WINDOW_DAYS} хоног`,
    statsHelp: "Ярианы урсгал, хүн рүү шилжүүлсэн хувь, хүсэлтийн хөрвүүлэлт.",
    conversations: "Яриа",
    recent: "сүүлийн 7 хоногт",
    awaiting: "Хүн хүлээж буй",
    handoverRate: "Хүн рүү шилжсэн",
    ofAll: "нийт ярианаас",
    leads: "Хүсэлт",
    conversionRate: "Борлуулалт болсон",
    incomplete: "Мэдээлэл дутуу",
    incompleteHelp: "нэр эсвэл утас дутуу — бот бүрэн авч чадаагүй",
    noData: "Одоогоор өгөгдөл алга.",
  },
  EN: {
    kicker: "AI Chat",
    title: "Overview",
    text: "Bot status, connected channels, and the test chat.",
    botStatus: "Bot status",
    on: "Active",
    off: "Off",
    channels: "Connected channels",
    noChannels: "No channel connected",
    model: "Model",
    defaultModel: "Automatic (default chain)",
    notConfigured: "Not configured",
    setupHint:
      "The bot is switched off — turn it on and connect your Facebook page under Chat settings. The test chat works regardless.",
    panelHint:
      "Visible only to you. It runs the REAL prompt built from the catalog, discounts and FAQs — but text only. Product carousels, order lookup and handover run on Messenger, not here, so “I can’t send pictures” is true of this panel and not of a real thread.",
    facebook: "Facebook",
    instagram: "Instagram",
    widget: "Web widget",
    statsTitle: `Last ${STATS_WINDOW_DAYS} days`,
    statsHelp: "Conversation volume, escalation rate, and request conversion.",
    conversations: "Conversations",
    recent: "in the last 7 days",
    awaiting: "Awaiting human",
    handoverRate: "Escalated",
    ofAll: "of all conversations",
    leads: "Requests",
    conversionRate: "Converted",
    incomplete: "Missing details",
    incompleteHelp: "no name or phone — the bot could not finish capture",
    noData: "No data yet.",
  },
} as const;

export default function ChatOverviewPage({ ctx }: { ctx: AdminCtx }) {
  const { language, chatSettings, chatSettingsError, chatConversations, chatLeads } = ctx;
  const copy = COPY[language as "MN" | "EN"] ?? COPY.MN;
  const settings = chatSettings as ChatSettingsRecord;

  // The 7-day window needs a clock, but reading it during render is impure.
  // Held in state and refreshed slowly so a dashboard left open overnight does
  // not keep measuring against yesterday's boundary.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Facebook and Instagram are configured in the server environment, so their
  // state is not in the settings document the rest of this page reads.
  const [facebook, setFacebook] = useState<FacebookStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFacebookStatus()
      .then((result) => {
        if (!cancelled) setFacebook(result);
      })
      .catch(() => {
        if (!cancelled) setFacebook(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () =>
      computeChatStats(
        (chatConversations ?? []) as ChatConversationRecord[],
        (chatLeads ?? []) as ChatLeadRecord[],
        now,
      ),
    [chatConversations, chatLeads, now],
  );

  const channels = [
    { key: "facebook", label: copy.facebook, icon: <Facebook size={14} />, on: facebook?.connected === true },
    {
      key: "instagram",
      label: copy.instagram,
      icon: <Instagram size={14} />,
      on: facebook?.instagram === true,
    },
    { key: "widget", label: copy.widget, icon: <Globe size={14} />, on: settings.widget.isActive },
  ].filter((channel) => channel.on);

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
        </div>
      </div>

      {chatSettingsError && <div className="admin-sync-error">{chatSettingsError}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span>{copy.botStatus}</span>
          <strong>{settings.isActive ? copy.on : copy.off}</strong>
          <small>{settings.botName}</small>
        </div>
        <div className="admin-summary-card">
          <span>{copy.channels}</span>
          <strong>{channels.length > 0 ? channels.length : "—"}</strong>
          <small>
            {channels.length > 0
              ? channels.map((channel) => channel.label).join(" · ")
              : copy.noChannels}
          </small>
        </div>
        <div className="admin-summary-card">
          <span>{copy.model}</span>
          <strong>{settings.model || copy.defaultModel}</strong>
          <small>temperature {settings.temperature}</small>
        </div>
      </div>

      {!settings.isActive && (
        <div className="admin-section-card">
          <div className="admin-section-head">
            <div>
              <h2>
                <Bot size={17} style={{ verticalAlign: "-3px", marginRight: 6 }} />
                {copy.botStatus}
              </h2>
              <p>{copy.setupHint}</p>
            </div>
          </div>
        </div>
      )}

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.statsTitle}</h2>
            <p>{copy.statsHelp}</p>
          </div>
        </div>
        {stats.totalConversations === 0 && stats.totalLeads === 0 ? (
          <p className="admin-table-empty" style={{ padding: "0 1.4rem 1.4rem" }}>
            {copy.noData}
          </p>
        ) : (
          <div className="admin-summary-grid" style={{ padding: "0 1.4rem 1.4rem" }}>
            <div className="admin-summary-card">
              <span>{copy.conversations}</span>
              <strong>{stats.recentConversations}</strong>
              <small>
                {copy.recent} · {stats.totalConversations} нийт
              </small>
            </div>
            <div className="admin-summary-card">
              <span>{copy.awaiting}</span>
              <strong>{stats.awaitingHuman}</strong>
              <small>
                {copy.handoverRate}: {stats.handoverRate}% {copy.ofAll}
              </small>
            </div>
            <div className="admin-summary-card">
              <span>{copy.leads}</span>
              <strong>{stats.recentLeads}</strong>
              <small>
                {copy.recent} · {stats.pendingLeads} хүлээгдэж буй
              </small>
            </div>
            <div className="admin-summary-card">
              <span>{copy.conversionRate}</span>
              <strong>{stats.conversionRate}%</strong>
              <small>
                {stats.convertedLeads}/{stats.totalLeads}
              </small>
            </div>
            <div className="admin-summary-card">
              <span>{copy.incomplete}</span>
              <strong>{stats.incompleteLeads}</strong>
              <small>{copy.incompleteHelp}</small>
            </div>
            {stats.byChannel.map((entry) => (
              <div key={entry.channel} className="admin-summary-card admin-summary-card-compact">
                <span>{CHANNEL_LABELS[entry.channel]}</span>
                <strong>{entry.count}</strong>
              </div>
            ))}
          </div>
        )}

        {/* What people are actually asking about. Hidden until something has been
            tagged, so a fresh shop is not shown an empty row of zeroes. */}
        {stats.byTopic.length > 0 && (
          <div className="admin-summary-grid" style={{ padding: "0 1.4rem 1.4rem" }}>
            {stats.byTopic.map((entry) => (
              <div key={entry.topic} className="admin-summary-card admin-summary-card-compact">
                <span>{CHAT_TOPIC_LABELS[entry.topic]}</span>
                <strong>{entry.count}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <ChatPanel
        useStorefrontPrompt
        welcomeMessage={settings.welcomeMessage}
        model={settings.model}
        temperature={settings.temperature}
        language={(language as "MN" | "EN") ?? "MN"}
        hint={copy.panelHint}
      />
    </>
  );
}
