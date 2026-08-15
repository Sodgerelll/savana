import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { RotateCcw, Send, TriangleAlert } from "lucide-react";
import { ChatApiError, sendAssistantMessage, toApiHistory } from "../../lib/chat/chatApi";
import { CHAT_LIMITS, type ChatMessageRole } from "../../lib/chat/types";
import "./ChatPanel.css";

interface PanelMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  /** Round-trip time in ms, shown under assistant turns so slow prompts are visible. */
  latencyMs?: number;
}

export interface ChatPanelProps {
  /**
   * Ask the server to build the live customer-facing prompt. Preferred over
   * `systemPrompt` so the panel exercises the real thing.
   */
  useStorefrontPrompt?: boolean;
  /** Explicit prompt, used only when `useStorefrontPrompt` is false. */
  systemPrompt?: string;
  /** First assistant bubble, shown before anything is sent. */
  welcomeMessage: string;
  model?: string;
  temperature?: number;
  language: "MN" | "EN";
  /** Extra note under the header, e.g. which prompt build is being tested. */
  hint?: string;
}

const COPY = {
  MN: {
    title: "Туршилтын чат",
    subtitle: "Ботын хариултыг нийтэд гаргахаас өмнө энд шалгана.",
    placeholder: "Асуултаа бичээд Enter дарна уу…",
    send: "Илгээх",
    reset: "Шинээр эхлэх",
    thinking: "Бодож байна…",
    tooFast: "Түр хүлээнэ үү.",
    tooLong: `Мессеж ${CHAT_LIMITS.MAX_MESSAGE_LENGTH} тэмдэгтээс хэтэрч болохгүй.`,
    you: "Та",
    bot: "Бот",
    emptyHint: "Жишээ: «Хуурай арьсанд ямар саван тохирох вэ?»",
  },
  EN: {
    title: "Test chat",
    subtitle: "Check the bot's answers here before it goes live.",
    placeholder: "Type a question and press Enter…",
    send: "Send",
    reset: "Start over",
    thinking: "Thinking…",
    tooFast: "Please wait a moment.",
    tooLong: `Messages cannot exceed ${CHAT_LIMITS.MAX_MESSAGE_LENGTH} characters.`,
    you: "You",
    bot: "Bot",
    emptyHint: 'Try: "Which soap suits dry skin?"',
  },
} as const;

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `panel-${messageCounter}`;
}

export default function ChatPanel({
  useStorefrontPrompt = false,
  systemPrompt,
  welcomeMessage,
  model,
  temperature,
  language,
  hint,
}: ChatPanelProps) {
  const copy = COPY[language];
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lastSentAtRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const transcript = useMemo<PanelMessage[]>(() => {
    if (messages.length > 0) {
      return messages;
    }
    return welcomeMessage
      ? [{ id: "welcome", role: "assistant" as ChatMessageRole, content: welcomeMessage }]
      : [];
  }, [messages, welcomeMessage]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [transcript, pending]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || pending) {
      return;
    }
    if (message.length > CHAT_LIMITS.MAX_MESSAGE_LENGTH) {
      setError(copy.tooLong);
      return;
    }

    const now = Date.now();
    if (now - lastSentAtRef.current < CHAT_LIMITS.CLIENT_RATE_LIMIT_MS) {
      setError(copy.tooFast);
      return;
    }
    lastSentAtRef.current = now;

    // The welcome bubble is presentational only — never send it as history.
    const history = toApiHistory(messages);
    const userMessage: PanelMessage = { id: nextMessageId(), role: "user", content: message };

    setMessages((previous) => [...previous, userMessage]);
    setDraft("");
    setError("");
    setPending(true);

    try {
      const result = await sendAssistantMessage({
        message,
        history,
        useStorefrontPrompt,
        systemPrompt: useStorefrontPrompt ? undefined : systemPrompt,
        model: model || undefined,
        temperature,
      });
      setMessages((previous) => [
        ...previous,
        {
          id: nextMessageId(),
          role: "assistant",
          content: result.reply,
          latencyMs: result.latencyMs,
        },
      ]);
    } catch (caught) {
      setError(
        caught instanceof ChatApiError ? caught.message : "Хариу авч чадсангүй. Дахин оролдоно уу.",
      );
      // Drop the unanswered turn so retrying does not duplicate it in history.
      setMessages((previous) => previous.filter((entry) => entry.id !== userMessage.id));
      setDraft(message);
    } finally {
      setPending(false);
    }
  }, [
    copy.tooFast,
    copy.tooLong,
    draft,
    messages,
    model,
    pending,
    systemPrompt,
    temperature,
    useStorefrontPrompt,
  ]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  function reset() {
    setMessages([]);
    setDraft("");
    setError("");
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-head">
        <div>
          <h3>{copy.title}</h3>
          <p>{hint || copy.subtitle}</p>
        </div>
        <button
          type="button"
          className="admin-icon-btn admin-icon-btn-neutral"
          onClick={reset}
          disabled={pending || messages.length === 0}
          aria-label={copy.reset}
          title={copy.reset}
        >
          <RotateCcw size={15} />
        </button>
      </div>

      <div className="chat-panel-scroll" ref={scrollRef}>
        {transcript.map((entry) => (
          <div key={entry.id} className={`chat-bubble-row chat-bubble-row-${entry.role}`}>
            <div className={`chat-bubble chat-bubble-${entry.role}`}>
              <span className="chat-bubble-author">
                {entry.role === "user" ? copy.you : copy.bot}
              </span>
              <p>{entry.content}</p>
              {typeof entry.latencyMs === "number" && entry.latencyMs > 0 && (
                <small className="chat-bubble-meta">{(entry.latencyMs / 1000).toFixed(1)}s</small>
              )}
            </div>
          </div>
        ))}

        {pending && (
          <div className="chat-bubble-row chat-bubble-row-assistant">
            <div className="chat-bubble chat-bubble-assistant chat-bubble-pending">
              <span className="chat-typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p>{copy.thinking}</p>
            </div>
          </div>
        )}

        {transcript.length === 0 && !pending && <p className="chat-panel-empty">{copy.emptyHint}</p>}
      </div>

      {error && (
        <div className="chat-panel-error" role="alert">
          <TriangleAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="chat-panel-composer">
        <textarea
          className="admin-input chat-panel-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={copy.placeholder}
          rows={2}
          maxLength={CHAT_LIMITS.MAX_MESSAGE_LENGTH}
          disabled={pending}
        />
        <button
          type="button"
          className="btn btn-primary chat-panel-send"
          onClick={() => void send()}
          disabled={pending || draft.trim().length === 0}
        >
          <Send size={15} />
          {copy.send}
        </button>
      </div>
    </div>
  );
}
