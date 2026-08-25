import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Check,
  Facebook,
  Link2,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  alertPermission,
  requestAlertPermission,
  type AlertPermission,
} from "../../lib/chat/chatAlerts";
import { saveChatSettings } from "../../lib/chat/chatSettings";
import {
  applyFacebookSetup,
  ChatApiError,
  fetchFacebookStatus,
  type FacebookStatus,
} from "../../lib/chat/chatApi";
import {
  CHAT_BUTTON_ACTIONS,
  type ChatButton,
  type ChatButtonAction,
  type ChatSettingsRecord,
} from "../../lib/chat/types";
import type { AdminCtx } from "./adminShellTypes";
import "./ChatAdmin.css";

const COPY = {
  MN: {
    kicker: "AI Chat",
    title: "Чат тохиргоо",
    text: "Ботыг асаах, мэндчилгээ болон загварын тохиргоо.",
    botSection: "Ерөнхий",
    botActive: "Ботыг асаах",
    botActiveHelp: "Унтраалттай үед ямар ч суваг дээр бот хариулахгүй. Туршилтын чат ажиллана.",
    alerts: "Ажилтанд мэдэгдэх",
    alertsHelp:
      "Хүн хүлээж буй яриа, шинэ захиалгын хүсэлт гарахад энэ компьютерт мэдэгдэл гаргана. " +
      "Админ хуудсыг өөр таб дээр нээлттэй үлдээхэд ажиллана.",
    alertsOn: "Асаах",
    alertsGranted: "Асаалттай ✅",
    alertsDenied: "Хөтөч хориглосон — хөтчийн тохиргооноос зөвшөөрнө үү",
    alertsUnsupported: "Энэ хөтөч дэмждэггүй",
    webChat: "Вэб сайтын чат",
    webChatHelp:
      "Дэлгүүрийн сайт дээрх чат цонх. Унтраавал Messenger, Instagram дээр хэвээр хариулна.",
    botName: "Ботын нэр",
    welcome: "Мэндчилгээ",
    welcomeHelp: "Get Started товч дарсан хэрэглэгчид харагдана. Facebook-д мөн энэ бичигдэнэ.",
    model: "Загвар",
    modelAuto: "Автомат (санал болгосон)",
    temperature: "Temperature",
    temperatureHelp:
      "0 = тогтвортой, 1 = уран сэтгэмжтэй. Дэлгүүрт 0.5-0.7 тохиромжтой. Gemini 3 загварууд энэ утгыг хүлээж авдаггүй тул зөвхөн 2.5-д үйлчилнэ.",
    menuSection: "Товчнууд",
    menuButtons: "Facebook-ийн байнгын цэс",
    menuHelp:
      "Гурав нь дээд түвшинд харагдана; түүнээс олон бол сүүлийнхүүд «Бусад» дэд цэсэнд орно. " +
      "Өөрчилсний дараа доорх «Facebook-д цэс суулгах» дарж хадгална.",
    quickReplies: "Мэндчилгээний товчнууд",
    quickRepliesHelp: "Get Started дарсан хэрэглэгчид нэг удаа харагдана.",
    addButton: "Товч нэмэх",
    connSection: "Холболт",
    connText: "Facebook, Instagram, Webhook-ийг серверийн орчинд тохируулсан. Энд оруулах зүйл байхгүй.",
    connMessenger: "Messenger",
    connInstagram: "Instagram Direct",
    connComments: "Сэтгэгдэлд хариулах",
    connChecking: "Шалгаж байна…",
    connOn: "Холбогдсон",
    connOff: "Холбогдоогүй",
    connBadToken: "Токен хүчингүй — Facebook хүлээж авсангүй",
    refresh: "Дахин шалгах",
    applySetup: "Facebook-д цэс суулгах",
    applying: "Суулгаж байна…",
    applyHelp:
      "Facebook хуудсанд мэндчилгээ, Get Started, байнгын цэсийг суулгана. Холболт зөв эсэхийг мөн шалгана.",
    save: "Хадгалах",
    saved: "Хадгаллаа",
    saving: "Хадгалж байна…",
  },
  EN: {
    kicker: "AI Chat",
    title: "Chat settings",
    text: "Switch the bot on, set the greeting, and tune the model.",
    botSection: "General",
    botActive: "Enable the bot",
    botActiveHelp: "While off the bot answers on no channel. The test chat still works.",
    alerts: "Notify staff",
    alertsHelp:
      "Shows a desktop notification on this computer when a conversation is waiting for a " +
      "person or a new order request arrives. Works while the admin page is open in any tab.",
    alertsOn: "Turn on",
    alertsGranted: "On ✅",
    alertsDenied: "Blocked by the browser — allow it in the browser's settings",
    alertsUnsupported: "This browser does not support it",
    webChat: "Website chat",
    webChatHelp: "The chat bubble on the storefront. Off leaves Messenger and Instagram answering.",
    botName: "Bot name",
    welcome: "Welcome message",
    welcomeHelp: "Shown after Get Started, and installed as the Facebook greeting.",
    model: "Model",
    modelAuto: "Automatic (recommended)",
    temperature: "Temperature",
    temperatureHelp:
      "0 = consistent, 1 = creative. 0.5–0.7 suits a shop. Gemini 3 models reject this field, so it only applies to 2.5.",
    menuSection: "Buttons",
    menuButtons: "Facebook persistent menu",
    menuHelp:
      "Three show at the top level; any beyond that share an «Other» submenu. " +
      "Press «Install menu on Facebook» below to apply a change.",
    quickReplies: "Welcome buttons",
    quickRepliesHelp: "Shown once, to a customer who pressed Get Started.",
    addButton: "Add button",
    connSection: "Connection",
    connText: "Facebook, Instagram and the webhook are configured in the server environment. Nothing to fill in here.",
    connMessenger: "Messenger",
    connInstagram: "Instagram Direct",
    connComments: "Reply to comments",
    connChecking: "Checking…",
    connOn: "Connected",
    connOff: "Not connected",
    connBadToken: "Token rejected by Facebook",
    refresh: "Re-check",
    applySetup: "Install menu on Facebook",
    applying: "Installing…",
    applyHelp:
      "Installs the greeting, Get Started button and persistent menu on the page — and verifies the connection works.",
    save: "Save",
    saved: "Saved",
    saving: "Saving…",
  },
} as const;

// Mirrors ALLOWED_REQUESTED in api/chat/_lib/gemini.ts. The 2.5 line is gone:
// those models 404 for keys issued after their deprecation, so offering them
// here would only let an admin pick a model that cannot answer.
const MODEL_OPTIONS = ["", "gemini-3.7-flash", "gemini-3.6-flash"];

/** Titles the shop can read; the payloads behind them are fixed. */
const ACTION_LABELS: Record<ChatButtonAction, { mn: string; en: string }> = {
  SHOW_PRODUCTS: { mn: "Бүтээгдэхүүн үзүүлэх", en: "Show products" },
  SHOW_PROMOTIONS: { mn: "Хямдрал үзүүлэх", en: "Show promotions" },
  TRANSFER_TO_STAFF: { mn: "Ажилтан руу шилжүүлэх", en: "Transfer to staff" },
  RESUME_BOT: { mn: "Ботруу буцаах", en: "Back to the bot" },
};

/**
 * Edits one list of buttons.
 *
 * The action is a dropdown rather than a text field: each one runs a tool, and
 * a button whose payload the webhook does not recognise is a button that does
 * nothing when a customer presses it.
 */
function ButtonListEditor({
  buttons,
  language,
  addLabel,
  onChange,
}: {
  buttons: ChatButton[];
  language: string;
  addLabel: string;
  onChange: (next: ChatButton[]) => void;
}) {
  const locale = language === "EN" ? "en" : "mn";

  return (
    <div className="chat-button-editor">
      {buttons.map((button, index) => (
        <div className="chat-button-row" key={`${button.action}-${index}`}>
          <input
            className="admin-input"
            value={button.title}
            maxLength={30}
            onChange={(event) =>
              onChange(buttons.map((b, i) => (i === index ? { ...b, title: event.target.value } : b)))
            }
          />
          <select
            className="admin-select"
            value={button.action}
            onChange={(event) =>
              onChange(
                buttons.map((b, i) =>
                  i === index ? { ...b, action: event.target.value as ChatButtonAction } : b,
                ),
              )
            }
          >
            {CHAT_BUTTON_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action][locale]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn-neutral"
            onClick={() => onChange(buttons.filter((_, i) => i !== index))}
            disabled={buttons.length <= 1}
            aria-label="—"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => onChange([...buttons, { title: "", action: "SHOW_PRODUCTS" }])}
      >
        <Plus size={15} />
        {addLabel}
      </button>
    </div>
  );
}


export default function ChatSettingsPage({ ctx }: { ctx: AdminCtx }) {
  const { language, chatSettings, chatSettingsError } = ctx;
  const copy = COPY[(language as "MN" | "EN") ?? "MN"] ?? COPY.MN;
  const settings = chatSettings as ChatSettingsRecord;

  const [draft, setDraft] = useState(settings);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [alerts, setAlerts] = useState<AlertPermission>("default");
  const [statusLoading, setStatusLoading] = useState(true);

  // Adopt server updates only while the form is untouched, so a save from
  // another tab cannot overwrite what is being typed here.
  useEffect(() => {
    if (!dirty) {
      setDraft(settings);
    }
  }, [settings, dirty]);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      setStatus(await fetchFacebookStatus());
    } catch {
      // A connection the server cannot describe is reported as no connection —
      // there is nothing actionable to say here that the label does not.
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    setAlerts(alertPermission());
  }, []);

  function patch(next: Partial<ChatSettingsRecord>) {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveChatSettings({
        isActive: draft.isActive,
        botName: draft.botName,
        welcomeMessage: draft.welcomeMessage,
        model: draft.model,
        temperature: draft.temperature,
        widget: draft.widget,
        // Blank titles are dropped rather than saved: a nameless button is a
        // gap on the customer's screen.
        menuButtons: draft.menuButtons.filter((button) => button.title.trim().length > 0),
        quickReplies: draft.quickReplies.filter((button) => button.title.trim().length > 0),
      });
      setDirty(false);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function runSetup() {
    setApplying(true);
    setNotice("");
    setError("");
    try {
      setNotice(await applyFacebookSetup());
      // The install proves the token works, so refresh the label it feeds.
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof ChatApiError ? caught.message : "Суулгаж чадсангүй.");
    } finally {
      setApplying(false);
    }
  }

  // "Connected" is only ever claimed on the strength of a page name, which
  // Facebook returns for a working token and nothing else.
  const messengerLabel = statusLoading
    ? copy.connChecking
    : !status?.connected
      ? copy.connOff
      : status.pageName
        ? `${copy.connOn} — ${status.pageName}`
        : copy.connBadToken;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
            <Check size={16} />
            {saving ? copy.saving : saved ? copy.saved : copy.save}
          </button>
        </div>
      </div>

      {chatSettingsError && <div className="admin-sync-error">{chatSettingsError}</div>}
      {error && (
        <div className="chat-panel-error" role="alert">
          <TriangleAlert size={15} />
          <span>{error}</span>
        </div>
      )}
      {notice && <div className="admin-sync-error">{notice}</div>}

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>
              <Power size={17} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {copy.botSection}
            </h2>
            <p>{copy.botActiveHelp}</p>
          </div>
        </div>

        <label className="admin-field admin-field-toggle">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) => patch({ isActive: event.target.checked })}
          />
          <span>{copy.botActive}</span>
        </label>

        <div className="admin-field admin-field-wide">
          <span>{copy.alerts}</span>
          {alerts === "granted" ? (
            <strong>{copy.alertsGranted}</strong>
          ) : alerts === "denied" ? (
            <strong>{copy.alertsDenied}</strong>
          ) : alerts === "unsupported" ? (
            <strong>{copy.alertsUnsupported}</strong>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              // Browsers refuse a permission request that is not tied to a
              // click, so this is the only place it can be asked for.
              onClick={() => void requestAlertPermission().then(setAlerts)}
            >
              <Bell size={15} />
              {copy.alertsOn}
            </button>
          )}
          <small>{copy.alertsHelp}</small>
        </div>

        <label className="admin-field admin-field-toggle">
          <input
            type="checkbox"
            checked={draft.widget.isActive}
            disabled={!draft.isActive}
            onChange={(event) => patch({ widget: { ...draft.widget, isActive: event.target.checked } })}
          />
          <span>{copy.webChat}</span>
          <small>{copy.webChatHelp}</small>
        </label>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{copy.botName}</span>
            <input
              className="admin-input"
              value={draft.botName}
              onChange={(event) => patch({ botName: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>{copy.model}</span>
            <select
              className="admin-select"
              value={draft.model}
              onChange={(event) => patch({ model: event.target.value })}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option || "auto"} value={option}>
                  {option || copy.modelAuto}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field admin-field-wide">
            <span>{copy.welcome}</span>
            <textarea
              className="admin-input"
              rows={2}
              value={draft.welcomeMessage}
              onChange={(event) => patch({ welcomeMessage: event.target.value })}
            />
            <small>{copy.welcomeHelp}</small>
          </label>
          <label className="admin-field">
            <span>
              {copy.temperature}: {draft.temperature.toFixed(1)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={draft.temperature}
              onChange={(event) => patch({ temperature: Number(event.target.value) })}
            />
            <small>{copy.temperatureHelp}</small>
          </label>
        </div>
      </div>

      {/* Read-only on purpose. The page token, the verify token and the app
          secret are all deployment configuration; the admin needs to know
          whether they work, never what they are. */}
      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.menuSection}</h2>
          </div>
        </div>

        <div className="admin-field admin-field-wide">
          <span>{copy.menuButtons}</span>
          <ButtonListEditor
            buttons={draft.menuButtons}
            language={language}
            addLabel={copy.addButton}
            onChange={(menuButtons) => patch({ menuButtons })}
          />
          <small>{copy.menuHelp}</small>
        </div>

        <div className="admin-field admin-field-wide">
          <span>{copy.quickReplies}</span>
          <ButtonListEditor
            buttons={draft.quickReplies}
            language={language}
            addLabel={copy.addButton}
            onChange={(quickReplies) => patch({ quickReplies })}
          />
          <small>{copy.quickRepliesHelp}</small>
        </div>
      </div>
      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>
              <Facebook size={17} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {copy.connSection}
            </h2>
            <p>{copy.connText}</p>
          </div>
          <button type="button" className="btn" onClick={() => void loadStatus()} disabled={statusLoading}>
            <RefreshCw size={15} />
            {copy.refresh}
          </button>
        </div>

        <div className="admin-structure-list">
          <code>
            {copy.connMessenger}: {messengerLabel}
          </code>
          <code>
            {copy.connInstagram}: {status?.instagram ? copy.connOn : copy.connOff}
          </code>
          <code>
            {copy.connComments}: {status?.comments ? copy.connOn : copy.connOff}
          </code>
        </div>

        <div className="admin-editor-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void runSetup()}
            disabled={applying || !status?.connected}
          >
            <Link2 size={15} />
            {applying ? copy.applying : copy.applySetup}
          </button>
        </div>
        <small style={{ opacity: 0.6 }}>{copy.applyHelp}</small>
      </div>
    </>
  );
}
