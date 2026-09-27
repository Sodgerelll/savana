import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Download,
  Facebook,
  Globe,
  Instagram,
  Maximize2,
  UserRoundSearch,
  MessagesSquare,
  Minimize2,
  RotateCcw,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import { downloadCsv } from "../../lib/chat/exportCsv";
import {
  ChatApiError,
  fillFacebookNames,
  handConversationBackToBot,
  sendAdminReply,
} from "../../lib/chat/chatApi";
import { subscribeToChatMessages, STATUS_LABELS } from "../../lib/chat/conversationStore";
import type {
  ChatChannel,
  ChatConversationRecord,
  ChatConversationStatus,
  ChatMessageRecord,
  ChatTopic,
} from "../../lib/chat/types";
import { CHAT_TOPIC_LABELS, CHAT_TOPIC_VALUES } from "../../lib/chat/types";
import type { AdminCtx } from "./adminShellTypes";
import "../../components/chat/ChatPanel.css";
import "./ChatAdmin.css";

const COPY = {
  MN: {
    kicker: "AI Chat",
    title: "Ярианы түүх",
    all: "Бүгд",
    awaiting: "Хүн хүлээж буй",
    empty: "Одоогоор яриа алга.",
    noMatch: "Хайлтад тохирох яриа алга.",
    selectHint: "Зүүн талаас яриа сонгоно уу.",
    noMessages: "Энэ ярианд мессеж алга.",
    placeholder: "Хариугаа бичээд Enter дарна уу…",
    send: "Илгээх",
    sending: "Илгээж байна…",
    bot: "Бот",
    customer: "Харилцагч",
    admin: "Ажилтан",
    unnamed: "Нэргүй харилцагч",
    guest: {
      facebook: "Messenger хэрэглэгч",
      instagram: "Instagram хэрэглэгч",
      widget: "Вэб зочин",
      admin_test: "Туршилт",
    },
    handoverNote: "Шилжүүлсэн шалтгаан",
    total: "Нийт",
    botHandled: "Бот хариулж буй",
    messages: "мессеж",
    exportCsv: "Excel татах",
    fillNames: "Facebook нэр татах",
    fillingNames: "Нэр татаж байна…",
    handBack: "Ботод буцаах",
    handingBack: "Буцааж байна…",
    search: "Нэр, утас, мессежээр хайх…",
    allTopics: "Бүх сэдэв",
    topicFilter: "Сэдвээр шүүх",
    back: "Жагсаалт руу буцах",
    enterFullscreen: "Бүтэн дэлгэц",
    exitFullscreen: "Бүтэн дэлгэцээс гарах",
    today: "Өнөөдөр",
    yesterday: "Өчигдөр",
    replyWarning:
      "Та хариулмагц бот энэ ярианд дуугүй болно. Дуусмагц «Ботод буцаах» дарж бот руу шилжүүлнэ.",
  },
  EN: {
    kicker: "AI Chat",
    title: "Conversations",
    all: "All",
    awaiting: "Awaiting human",
    empty: "No conversations yet.",
    noMatch: "No conversations match your search.",
    selectHint: "Pick a conversation on the left.",
    noMessages: "No messages in this conversation.",
    placeholder: "Type your reply and press Enter…",
    send: "Send",
    sending: "Sending…",
    bot: "Bot",
    customer: "Customer",
    admin: "Staff",
    unnamed: "Unnamed customer",
    guest: {
      facebook: "Messenger user",
      instagram: "Instagram user",
      widget: "Web visitor",
      admin_test: "Test",
    },
    handoverNote: "Escalation reason",
    total: "Total",
    botHandled: "Bot handling",
    messages: "messages",
    exportCsv: "Export",
    fillNames: "Fetch Facebook names",
    fillingNames: "Fetching names…",
    handBack: "Hand back to bot",
    handingBack: "Handing back…",
    search: "Search name, phone, message…",
    allTopics: "All topics",
    topicFilter: "Filter by topic",
    back: "Back to list",
    enterFullscreen: "Full screen",
    exitFullscreen: "Exit full screen",
    today: "Today",
    yesterday: "Yesterday",
    replyWarning:
      "Once you reply the bot goes quiet on this thread. Press «Hand back to bot» when you are done.",
  },
} as const;

const CHANNEL_ICONS: Record<ChatChannel, React.ReactNode> = {
  facebook: <Facebook size={11} />,
  instagram: <Instagram size={11} />,
  widget: <Globe size={11} />,
  admin_test: <Bot size={11} />,
};

const CHANNEL_LABELS: Record<ChatChannel, string> = {
  facebook: "Messenger",
  instagram: "Instagram",
  widget: "Web",
  admin_test: "Test",
};

function statusClass(status: ChatConversationStatus): string {
  if (status === "handover") return "chat-thread-status chat-thread-status-urgent";
  if (status === "admin_active") return "chat-thread-status chat-thread-status-human";
  return "chat-thread-status";
}

function localeFor(language: "MN" | "EN"): string {
  return language === "MN" ? "mn-MN" : "en-GB";
}

function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(iso: string | null, language: "MN" | "EN"): string {
  const date = parseDate(iso);
  if (!date) return "—";
  return date.toLocaleString(localeFor(language), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(iso: string | null, language: "MN" | "EN"): string {
  const date = parseDate(iso);
  if (!date) return "";
  return date.toLocaleTimeString(localeFor(language), { hour: "2-digit", minute: "2-digit" });
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Short stamp for the thread list: clock time today, a date otherwise. */
function formatListTime(iso: string | null, language: "MN" | "EN"): string {
  const date = parseDate(iso);
  if (!date) return "";
  if (dayKey(date) === dayKey(new Date())) return formatClock(iso, language);
  return date.toLocaleDateString(localeFor(language), { month: "short", day: "numeric" });
}

function formatDayLabel(date: Date, copy: (typeof COPY)[keyof typeof COPY], language: "MN" | "EN"): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return copy.today;
  if (dayKey(date) === dayKey(yesterday)) return copy.yesterday;
  return date.toLocaleDateString(localeFor(language), {
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * What to call a thread. A name when we have one; otherwise the phone the
 * customer left, and failing that the channel with a short tag from the id —
 * so two nameless visitors are still two different rows, not two identical
 * «Нэргүй харилцагч».
 */
function threadLabel(conversation: ChatConversationRecord, copy: (typeof COPY)[keyof typeof COPY]): string {
  const name = conversation.customerName?.trim();
  if (name) return name;
  const phone = conversation.customerPhone?.trim();
  if (phone) return phone;
  const tag = conversation.id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `${copy.guest[conversation.channel] ?? copy.unnamed} · ${tag}`;
}

function initials(name: string | null): string {
  // Leading symbols dropped, so "@bold_mn" reads as "B" rather than "@".
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Avatar({ conversation, size = "md" }: { conversation: ChatConversationRecord; size?: "md" | "lg" }) {
  return (
    <span className={`chat-avatar chat-avatar-${size}`} aria-hidden="true">
      {initials(conversation.customerName)}
      <span className={`chat-avatar-channel chat-avatar-channel-${conversation.channel}`}>
        {CHANNEL_ICONS[conversation.channel]}
      </span>
    </span>
  );
}

export default function ChatConversationsPage({ ctx }: { ctx: AdminCtx }) {
  const { chatConversations, chatConversationsError } = ctx;
  const language: "MN" | "EN" = ctx.language === "EN" ? "EN" : "MN";
  const statusLang = language === "EN" ? "en" : "mn";
  const copy = COPY[language];
  const conversations = useMemo(
    () => (chatConversations ?? []) as ChatConversationRecord[],
    [chatConversations],
  );

  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const [topicFilter, setTopicFilter] = useState<ChatTopic | "">("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [messagesError, setMessagesError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [handingBack, setHandingBack] = useState(false);
  const [fillingNames, setFillingNames] = useState(false);
  const [namesNotice, setNamesNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // Phones show one pane at a time; this says which.
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversations
      .filter((c) => (onlyAwaiting ? c.status === "handover" : true))
      .filter((c) => (topicFilter ? c.topic === topicFilter : true))
      .filter((c) =>
        needle
          ? [c.customerName, c.customerPhone, c.lastMessagePreview]
              .filter(Boolean)
              .some((field) => String(field).toLowerCase().includes(needle))
          : true,
      );
  }, [conversations, onlyAwaiting, topicFilter, query]);

  // Derived from the loaded threads rather than from the full vocabulary, so
  // the filter only ever offers something that will match.
  const presentTopics = useMemo(() => {
    const seen = new Set<ChatTopic>();
    for (const conversation of conversations) {
      if (conversation.topic) seen.add(conversation.topic);
    }
    return CHAT_TOPIC_VALUES.filter((topic) => seen.has(topic));
  }, [conversations]);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Keep a valid selection as the list streams in and filters change.
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    setMessages([]);
    setSendError("");
    return subscribeToChatMessages(selectedId, {
      onData: (nextMessages) => {
        setMessages(nextMessages);
        setMessagesError("");
      },
      onError: (error) => setMessagesError(error.message),
    });
  }, [selectedId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  // Full screen is an overlay over the admin shell: Esc leaves it, and the page
  // underneath must not scroll behind it.
  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const counts = useMemo(
    () => ({
      total: conversations.length,
      awaiting: conversations.filter((c) => c.status === "handover").length,
      bot: conversations.filter((c) => c.status === "active").length,
      // Facebook threads still without a name — what the name fetch would work on.
      unnamedFacebook: conversations.filter((c) => c.channel === "facebook" && !c.customerName?.trim()).length,
    }),
    [conversations],
  );

  // Messages grouped under a day divider, so a long transcript reads as a timeline.
  const messageGroups = useMemo(() => {
    const groups: { key: string; label: string; items: ChatMessageRecord[] }[] = [];
    for (const message of messages) {
      const date = parseDate(message.createdAt);
      const key = date ? dayKey(date) : "unknown";
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(message);
      } else {
        groups.push({ key, label: date ? formatDayLabel(date, copy, language) : "", items: [message] });
      }
    }
    return groups;
  }, [messages, copy, language]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobileView("thread");
  }

  async function submitReply() {
    const message = draft.trim();
    if (!message || !selectedId || sending) return;

    setSending(true);
    setSendError("");
    try {
      await sendAdminReply(selectedId, message);
      setDraft("");
      composerRef.current?.focus();
    } catch (error) {
      setSendError(error instanceof ChatApiError ? error.message : "Илгээж чадсангүй.");
    } finally {
      setSending(false);
    }
  }

  /** Exports the thread list as shown, filters included. */
  function exportVisible() {
    downloadCsv(
      "chat-conversations",
      [copy.customer, copy.total, copy.handoverNote, "channel", "status", "updated"],
      visible.map((conversation) => [
        threadLabel(conversation, copy),
        conversation.messageCount,
        conversation.handoverReason ?? "",
        conversation.channel,
        STATUS_LABELS[conversation.status][statusLang],
        formatTime(conversation.lastMessageAt, language),
      ]),
    );
  }

  /** Asks the server to read the missing Facebook names from the page's inbox. */
  async function fetchNames() {
    if (fillingNames) return;

    setFillingNames(true);
    setNamesNotice(null);
    try {
      const result = await fillFacebookNames();
      setNamesNotice({ tone: "ok", text: result.message });
    } catch (error) {
      setNamesNotice({
        tone: "error",
        text: error instanceof ChatApiError ? error.message : "Нэр татаж чадсангүй.",
      });
    } finally {
      setFillingNames(false);
    }
  }

  async function handBack() {
    if (!selectedId || handingBack) return;

    setHandingBack(true);
    setSendError("");
    try {
      await handConversationBackToBot(selectedId);
    } catch (error) {
      setSendError(error instanceof ChatApiError ? error.message : "Буцааж чадсангүй.");
    } finally {
      setHandingBack(false);
    }
  }

  return (
    <div className={`chat-inbox-page ${fullscreen ? "is-fullscreen" : ""}`}>
      <header className="chat-inbox-top">
        <div className="chat-inbox-title">
          <p className="admin-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
        </div>

        <div className="chat-inbox-stats">
          <span className="chat-inbox-stat">
            <strong>{counts.total}</strong>
            {copy.total}
          </span>
          <span className={`chat-inbox-stat ${counts.awaiting > 0 ? "is-urgent" : ""}`}>
            <strong>{counts.awaiting}</strong>
            {copy.awaiting}
          </span>
          <span className="chat-inbox-stat">
            <strong>{counts.bot}</strong>
            {copy.botHandled}
          </span>
        </div>

        <div className="chat-inbox-actions">
          {/* Only while there is something to fetch; the webhook names new
              threads itself, so this is for the ones from before it could. */}
          {counts.unnamedFacebook > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => void fetchNames()}
              disabled={fillingNames}
              title={copy.fillNames}
            >
              <UserRoundSearch size={15} />
              <span className="chat-inbox-action-label">
                {fillingNames ? copy.fillingNames : `${copy.fillNames} (${counts.unnamedFacebook})`}
              </span>
            </button>
          )}
          <button type="button" className="btn" onClick={exportVisible} disabled={visible.length === 0}>
            <Download size={15} />
            <span className="chat-inbox-action-label">{copy.exportCsv}</span>
          </button>
          <button
            type="button"
            className="btn chat-inbox-icon-btn"
            onClick={() => setFullscreen((value) => !value)}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? copy.exitFullscreen : copy.enterFullscreen}
            title={fullscreen ? `${copy.exitFullscreen} (Esc)` : copy.enterFullscreen}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {chatConversationsError && <div className="admin-sync-error">{chatConversationsError}</div>}
      {messagesError && <div className="admin-sync-error">{messagesError}</div>}
      {namesNotice && (
        <div className={namesNotice.tone === "error" ? "admin-sync-error" : "chat-inbox-notice"} role="status">
          {namesNotice.text}
        </div>
      )}

      <div className="chat-inbox" data-mobile-view={mobileView}>
        <aside className="chat-inbox-list">
          <div className="chat-inbox-list-head">
            <div className="chat-inbox-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!onlyAwaiting}
                className={!onlyAwaiting ? "is-active" : ""}
                onClick={() => setOnlyAwaiting(false)}
              >
                {copy.all}
                <span className="chat-inbox-tab-count">{counts.total}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={onlyAwaiting}
                className={onlyAwaiting ? "is-active" : ""}
                onClick={() => setOnlyAwaiting(true)}
              >
                {copy.awaiting}
                {counts.awaiting > 0 && (
                  <span className="chat-inbox-tab-count is-urgent">{counts.awaiting}</span>
                )}
              </button>
            </div>

            <label className="chat-inbox-search">
              <Search size={15} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.search}
                aria-label={copy.search}
              />
            </label>

            {/* Only the topics that actually appear: a dropdown of seven when six
                of them match nothing is a list to read rather than a filter. */}
            {presentTopics.length > 0 && (
              <select
                className="admin-input chat-inbox-topic"
                value={topicFilter}
                onChange={(event) => setTopicFilter(event.target.value as ChatTopic | "")}
                aria-label={copy.topicFilter}
              >
                <option value="">{copy.allTopics}</option>
                {presentTopics.map((topic) => (
                  <option key={topic} value={topic}>
                    {CHAT_TOPIC_LABELS[topic]}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="chat-inbox-list-scroll">
            {visible.length === 0 ? (
              <p className="chat-inbox-empty">{conversations.length === 0 ? copy.empty : copy.noMatch}</p>
            ) : (
              visible.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`chat-thread ${conversation.id === selectedId ? "is-selected" : ""} ${
                    conversation.status === "handover" ? "is-urgent" : ""
                  }`}
                  onClick={() => selectConversation(conversation.id)}
                >
                  <Avatar conversation={conversation} />
                  <span className="chat-thread-body">
                    <span className="chat-thread-head">
                      <span className="chat-thread-name">{threadLabel(conversation, copy)}</span>
                      <small>{formatListTime(conversation.lastMessageAt, language)}</small>
                    </span>
                    <span className="chat-thread-preview">{conversation.lastMessagePreview || "—"}</span>
                    <span className="chat-thread-tags">
                      <span className={statusClass(conversation.status)}>
                        {STATUS_LABELS[conversation.status][statusLang]}
                      </span>
                      {conversation.topic && (
                        <span className="chat-thread-topic">{CHAT_TOPIC_LABELS[conversation.topic]}</span>
                      )}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="chat-thread-view">
          {!selected ? (
            <div className="chat-inbox-placeholder">
              <MessagesSquare size={36} strokeWidth={1.4} />
              <p>{copy.selectHint}</p>
            </div>
          ) : (
            <>
              <div className="chat-thread-view-head">
                <button
                  type="button"
                  className="chat-inbox-back"
                  onClick={() => setMobileView("list")}
                  aria-label={copy.back}
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar conversation={selected} size="lg" />
                <div className="chat-thread-view-title">
                  <h3>{threadLabel(selected, copy)}</h3>
                  <p>
                    <span className={statusClass(selected.status)}>
                      {STATUS_LABELS[selected.status][statusLang]}
                    </span>
                    <span>{CHANNEL_LABELS[selected.channel]}</span>
                    {selected.customerPhone && <span>{selected.customerPhone}</span>}
                    <span>
                      {selected.messageCount} {copy.messages}
                    </span>
                  </p>
                </div>
                {/* Replying silences the bot for good, so the way back has to be
                    a control rather than something the admin waits for. */}
                {selected.status !== "active" && (
                  <button
                    type="button"
                    className="btn btn-outline chat-thread-handback"
                    onClick={() => void handBack()}
                    disabled={handingBack}
                  >
                    <RotateCcw size={15} />
                    <span className="chat-inbox-action-label">
                      {handingBack ? copy.handingBack : copy.handBack}
                    </span>
                  </button>
                )}
              </div>

              {selected.handoverReason && (
                <div className="chat-thread-reason">
                  <TriangleAlert size={15} />
                  <span>
                    <strong>{copy.handoverNote}:</strong> {selected.handoverReason}
                  </span>
                </div>
              )}

              <div className="chat-panel-scroll chat-thread-messages" ref={scrollRef}>
                {messages.length === 0 ? (
                  <p className="chat-inbox-empty">{copy.noMessages}</p>
                ) : (
                  messageGroups.map((group) => (
                    <div key={group.key} className="chat-day-group">
                      {group.label && (
                        <div className="chat-day-divider">
                          <span>{group.label}</span>
                        </div>
                      )}
                      {group.items.map((message) => (
                        <div key={message.id} className={`chat-bubble-row chat-bubble-row-${message.role}`}>
                          <div className={`chat-bubble chat-bubble-${message.role}`}>
                            <span className="chat-bubble-author">
                              {message.role === "user"
                                ? copy.customer
                                : message.role === "admin"
                                  ? message.authorName || copy.admin
                                  : copy.bot}
                            </span>
                            <p>{message.content}</p>
                            <small className="chat-bubble-meta">{formatClock(message.createdAt, language)}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              <div className="chat-thread-composer">
                {sendError && (
                  <div className="chat-panel-error" role="alert">
                    <TriangleAlert size={15} />
                    <span>{sendError}</span>
                  </div>
                )}
                <div className="chat-panel-composer">
                  <textarea
                    ref={composerRef}
                    className="admin-input chat-panel-input"
                    rows={2}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitReply();
                      }
                    }}
                    placeholder={copy.placeholder}
                    disabled={sending}
                  />
                  <button
                    type="button"
                    className="btn btn-primary chat-panel-send"
                    onClick={() => void submitReply()}
                    disabled={sending || draft.trim().length === 0}
                  >
                    <Send size={15} />
                    {sending ? copy.sending : copy.send}
                  </button>
                </div>
                {selected.status !== "admin_active" && (
                  <p className="chat-reply-warning">{copy.replyWarning}</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
