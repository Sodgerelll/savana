import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Facebook, Globe, Instagram, Send, TriangleAlert, UserCheck } from "lucide-react";
import { ChatApiError, sendAdminReply } from "../../lib/chat/chatApi";
import { subscribeToChatMessages, STATUS_LABELS } from "../../lib/chat/conversationStore";
import type {
  ChatChannel,
  ChatConversationRecord,
  ChatConversationStatus,
  ChatMessageRecord,
} from "../../lib/chat/types";
import type { AdminCtx } from "./adminShellTypes";
import "../../components/chat/ChatPanel.css";
import "./ChatAdmin.css";

const COPY = {
  MN: {
    kicker: "AI Chat",
    title: "Ярианы түүх",
    text: "Бүх сувгийн яриа. Хүн рүү шилжсэн хүсэлтэд эндээс шууд хариулна.",
    all: "Бүгд",
    awaiting: "Хүн хүлээж буй",
    empty: "Одоогоор яриа алга.",
    selectHint: "Зүүн талаас яриа сонгоно уу.",
    placeholder: "Хариугаа бичээд Enter дарна уу…",
    send: "Илгээх",
    sending: "Илгээж байна…",
    you: "Та",
    bot: "Бот",
    customer: "Харилцагч",
    admin: "Ажилтан",
    unnamed: "Нэргүй харилцагч",
    handoverNote: "Шилжүүлсэн шалтгаан",
    total: "Нийт яриа",
    awaitingCount: "Хүн хүлээж буй",
    botHandled: "Бот хариулж буй",
    replyWarning:
      "Та хариулмагц бот энэ ярианд дуугүй болно. Ботод буцааж өгөх бол харилцагч дахин бичихийг хүлээнэ.",
  },
  EN: {
    kicker: "AI Chat",
    title: "Conversations",
    text: "Threads from every channel. Reply here to anything escalated to a human.",
    all: "All",
    awaiting: "Awaiting human",
    empty: "No conversations yet.",
    selectHint: "Pick a conversation on the left.",
    placeholder: "Type your reply and press Enter…",
    send: "Send",
    sending: "Sending…",
    you: "You",
    bot: "Bot",
    customer: "Customer",
    admin: "Staff",
    unnamed: "Unnamed customer",
    handoverNote: "Escalation reason",
    total: "Conversations",
    awaitingCount: "Awaiting human",
    botHandled: "Bot handling",
    replyWarning:
      "Once you reply the bot goes quiet on this thread until the customer writes again.",
  },
} as const;

const CHANNEL_ICONS: Record<ChatChannel, React.ReactNode> = {
  facebook: <Facebook size={13} />,
  instagram: <Instagram size={13} />,
  widget: <Globe size={13} />,
  admin_test: <Bot size={13} />,
};

function statusClass(status: ChatConversationStatus): string {
  if (status === "handover") return "chat-thread-status chat-thread-status-urgent";
  if (status === "admin_active") return "chat-thread-status chat-thread-status-human";
  return "chat-thread-status";
}

function formatTime(iso: string | null, language: "MN" | "EN"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(language === "MN" ? "mn-MN" : "en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatConversationsPage({ ctx }: { ctx: AdminCtx }) {
  const { language, chatConversations, chatConversationsError } = ctx;
  const copy = COPY[(language as "MN" | "EN") ?? "MN"] ?? COPY.MN;
  const conversations = useMemo(
    () => (chatConversations ?? []) as ChatConversationRecord[],
    [chatConversations],
  );

  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [messagesError, setMessagesError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(
    () => (onlyAwaiting ? conversations.filter((c) => c.status === "handover") : conversations),
    [conversations, onlyAwaiting],
  );

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

  const counts = useMemo(
    () => ({
      total: conversations.length,
      awaiting: conversations.filter((c) => c.status === "handover").length,
      bot: conversations.filter((c) => c.status === "active").length,
    }),
    [conversations],
  );

  async function submitReply() {
    const message = draft.trim();
    if (!message || !selectedId || sending) return;

    setSending(true);
    setSendError("");
    try {
      await sendAdminReply(selectedId, message);
      setDraft("");
    } catch (error) {
      setSendError(error instanceof ChatApiError ? error.message : "Илгээж чадсангүй.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
        </div>
        <div className="admin-topbar-actions">
          <button
            type="button"
            className={`btn ${onlyAwaiting ? "btn-primary" : ""}`}
            onClick={() => setOnlyAwaiting((value) => !value)}
          >
            <UserCheck size={16} />
            {onlyAwaiting ? copy.all : copy.awaiting}
          </button>
        </div>
      </div>

      {chatConversationsError && <div className="admin-sync-error">{chatConversationsError}</div>}
      {messagesError && <div className="admin-sync-error">{messagesError}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.total}</span>
          <strong>{counts.total}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.awaitingCount}</span>
          <strong>{counts.awaiting}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.botHandled}</span>
          <strong>{counts.bot}</strong>
        </div>
      </div>

      <div className="chat-inbox">
        <aside className="chat-thread-list">
          {visible.length === 0 ? (
            <p className="chat-panel-empty">{copy.empty}</p>
          ) : (
            visible.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={`chat-thread ${conversation.id === selectedId ? "is-selected" : ""}`}
                onClick={() => setSelectedId(conversation.id)}
              >
                <div className="chat-thread-head">
                  <span className="chat-thread-channel">
                    {CHANNEL_ICONS[conversation.channel]}
                    {conversation.customerName || copy.unnamed}
                  </span>
                  <small>{formatTime(conversation.lastMessageAt, language as "MN" | "EN")}</small>
                </div>
                <p className="chat-thread-preview">{conversation.lastMessagePreview || "—"}</p>
                <span className={statusClass(conversation.status)}>
                  {STATUS_LABELS[conversation.status][language === "EN" ? "en" : "mn"]}
                </span>
              </button>
            ))
          )}
        </aside>

        <section className="chat-thread-view">
          {!selected ? (
            <p className="chat-panel-empty">{copy.selectHint}</p>
          ) : (
            <>
              <div className="chat-panel-head">
                <div>
                  <h3>{selected.customerName || copy.unnamed}</h3>
                  <p>
                    {STATUS_LABELS[selected.status][language === "EN" ? "en" : "mn"]}
                    {selected.handoverReason ? ` · ${copy.handoverNote}: ${selected.handoverReason}` : ""}
                  </p>
                </div>
              </div>

              <div className="chat-panel-scroll" ref={scrollRef}>
                {messages.map((message) => (
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
                      <small className="chat-bubble-meta">
                        {formatTime(message.createdAt, language as "MN" | "EN")}
                      </small>
                    </div>
                  </div>
                ))}
              </div>

              {sendError && (
                <div className="chat-panel-error" role="alert">
                  <TriangleAlert size={15} />
                  <span>{sendError}</span>
                </div>
              )}

              <p className="chat-reply-warning">{copy.replyWarning}</p>

              <div className="chat-panel-composer">
                <textarea
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
            </>
          )}
        </section>
      </div>
    </>
  );
}
