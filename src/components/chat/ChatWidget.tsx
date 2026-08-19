import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { useStorefront } from "../../context/StorefrontContext";
import { useCart } from "../../context/CartContext";
import { formatStorePrice } from "../../lib/storefrontHelpers";
import { CHAT_LIMITS } from "../../lib/chat/types";
import "./ChatWidget.css";

interface WidgetProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  inStock: boolean;
}

interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: WidgetProduct[];
  /** Bonum's payment page, when this turn produced an order. */
  payUrl?: string;
  /** The thread is with a human, so the way back to the bot is offered. */
  handedOver?: boolean;
}

const SESSION_STORAGE_KEY = "savana.chat.session";
const MAX_MESSAGE_LENGTH = 600;
/** Longer than any real answer takes, short enough to be a failure and not a hang. */
const REQUEST_TIMEOUT_MS = 45_000;

const COPY = {
  MN: {
    open: "Асуулт байна уу?",
    title: "SAVANA туслах",
    subtitle: "Бүтээгдэхүүн, хүргэлт, захиалгын талаар асууна уу.",
    placeholder: "Асуултаа бичнэ үү…",
    send: "Илгээх",
    close: "Хаах",
    thinking: "Бичиж байна…",
    failed: "Хариу авч чадсангүй. Дахин оролдоно уу.",
    tooFast: "Түр хүлээнэ үү.",
    addToCart: "Сагсанд хийх",
    pay: "Төлбөр төлөх",
    backToBot: "Ботруу буцах 🤖",
    soldOut: "Дууссан",
    handedOver: "Ажилтан руу шилжүүллээ.",
  },
  EN: {
    open: "Questions?",
    title: "SAVANA assistant",
    subtitle: "Ask about products, delivery or your order.",
    placeholder: "Type your question…",
    send: "Send",
    close: "Close",
    thinking: "Typing…",
    failed: "Could not get a reply. Please try again.",
    tooFast: "Please wait a moment.",
    addToCart: "Add to cart",
    pay: "Pay now",
    backToBot: "Back to the bot 🤖",
    soldOut: "Sold out",
    handedOver: "Handed over to our team.",
  },
} as const;

/**
 * Stable per-visitor id. Generated in the browser and therefore not trustworthy
 * on its own — the server rate-limits by IP as well for exactly that reason.
 */
function readSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && /^[a-z0-9]{16,40}$/i.test(existing)) {
      return existing;
    }
  } catch {
    // Private mode or blocked storage — fall through to an in-memory id.
  }

  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // Not persisting just means a new thread next visit.
  }

  return id;
}

let messageCounter = 0;
function nextId(): string {
  messageCounter += 1;
  return `w${messageCounter}`;
}

export default function ChatWidget() {
  const { products } = useStorefront();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { addItem, setIsCartOpen } = useCart();
  const copy = COPY[language === "EN" ? "EN" : "MN"];

  const [config, setConfig] = useState<{ enabled: boolean; welcomeMessage: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sessionIdRef = useRef<string>("");
  const lastSentAtRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // The enabled flag lives behind the API because chat_settings is admin-only.
  // A failed probe leaves the widget hidden rather than showing a dead launcher.
  useEffect(() => {
    let active = true;

    fetch("/api/chat/widget")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (active && payload && typeof payload.enabled === "boolean") {
          setConfig({
            enabled: payload.enabled,
            welcomeMessage:
              typeof payload.welcomeMessage === "string" ? payload.welcomeMessage : "",
          });
        }
      })
      .catch(() => {
        // Offline or route unavailable — stay hidden.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (open && !sessionIdRef.current) {
      sessionIdRef.current = readSessionId();
    }
  }, [open]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending]);

  /**
   * Asks for the bot back. A thread handed to a human otherwise stays that way
   * for three hours, which is right while someone is answering and wrong the
   * moment the customer has a different, simpler question.
   */
  const resumeBot = useCallback(async () => {
    if (pending) return;

    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/chat/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, resume: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : copy.failed);
        return;
      }

      setMessages((previous) => [
        ...previous,
        {
          id: nextId(),
          role: "assistant",
          content: typeof payload.reply === "string" ? payload.reply : "",
        },
      ]);
    } catch {
      setError(copy.failed);
    } finally {
      setPending(false);
    }
  }, [copy.failed, pending]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || pending) return;

    const now = Date.now();
    if (now - lastSentAtRef.current < CHAT_LIMITS.CLIENT_RATE_LIMIT_MS) {
      setError(copy.tooFast);
      return;
    }
    lastSentAtRef.current = now;

    setMessages((previous) => [...previous, { id: nextId(), role: "user", content: message }]);
    setDraft("");
    setError("");
    setPending(true);

    // Without this the "typing…" bubble is permanent when a request stalls:
    // nothing else ever clears `pending`, and the visitor is left with no reply
    // and no way to try again. Generous, because a model turn is not quick.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/chat/widget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          message,
          userId: user?.uid ?? null,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : copy.failed);
        return;
      }

      const reply = typeof payload.reply === "string" ? payload.reply : "";
      const products = Array.isArray(payload.products) ? (payload.products as WidgetProduct[]) : [];

      setMessages((previous) => [
        ...previous,
        {
          id: nextId(),
          role: "assistant",
          content: payload.handedOver === true && !reply ? copy.handedOver : reply,
          products,
          payUrl: typeof payload.payUrl === "string" ? payload.payUrl : undefined,
          handedOver: payload.handedOver === true,
        },
      ]);
    } catch {
      setError(copy.failed);
    } finally {
      clearTimeout(timer);
      setPending(false);
    }
  }, [copy.failed, copy.handedOver, copy.tooFast, draft, pending, user]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  /**
   * Adds the catalog product, not the card. The cart enforces stock and variant
   * pricing from the real record, so handing it a synthetic object would bypass
   * both — the card is only ever a display of what the bot found.
   */
  function addProductToCart(card: WidgetProduct) {
    const product = products.find((entry) => entry.id === card.id);
    if (!product) {
      setError(copy.failed);
      return;
    }

    addItem(product);
    setIsCartOpen(true);
  }

  if (!config?.enabled) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        className="chat-widget-launcher"
        onClick={() => setOpen(true)}
        aria-label={copy.open}
      >
        <MessageCircle size={20} />
        <span>{copy.open}</span>
      </button>
    );
  }

  return (
    <div className="chat-widget" role="dialog" aria-label={copy.title}>
      <header className="chat-widget-head">
        <div>
          <strong>{copy.title}</strong>
          <small>{copy.subtitle}</small>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label={copy.close}>
          <X size={18} />
        </button>
      </header>

      <div className="chat-widget-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="chat-widget-empty">{config.welcomeMessage || copy.subtitle}</p>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`chat-widget-row chat-widget-row-${message.role}`}>
            {message.content && <div className="chat-widget-bubble">{message.content}</div>}

            {message.handedOver && (
              <button
                type="button"
                className="btn chat-widget-pay"
                disabled={pending}
                onClick={() => void resumeBot()}
              >
                {copy.backToBot}
              </button>
            )}

            {message.payUrl && (
              <a
                className="btn btn-primary chat-widget-pay"
                href={message.payUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {copy.pay}
              </a>
            )}

            {message.products && message.products.length > 0 && (
              <div className="chat-widget-cards">
                {message.products.map((product) => (
                  <article key={product.id} className="chat-widget-card">
                    {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" />}
                    <div>
                      <strong>{product.name}</strong>
                      <span>{formatStorePrice(product.price)}</span>
                      <button
                        type="button"
                        className="btn"
                        disabled={!product.inStock}
                        onClick={() => addProductToCart(product)}
                      >
                        {product.inStock ? copy.addToCart : copy.soldOut}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ))}

        {pending && (
          <div className="chat-widget-row chat-widget-row-assistant">
            <div className="chat-widget-bubble chat-widget-pending">{copy.thinking}</div>
          </div>
        )}
      </div>

      {error && <p className="chat-widget-error">{error}</p>}

      <div className="chat-widget-composer">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={copy.placeholder}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={pending}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={pending || draft.trim().length === 0}
          aria-label={copy.send}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
