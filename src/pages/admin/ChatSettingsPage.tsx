import { useCallback, useEffect, useState } from "react";
import { Check, Facebook, Link2, Power, RefreshCw, TriangleAlert } from "lucide-react";
import { saveChatSettings } from "../../lib/chat/chatSettings";
import {
  applyFacebookSetup,
  ChatApiError,
  fetchFacebookStatus,
  type FacebookStatus,
} from "../../lib/chat/chatApi";
import type { ChatSettingsRecord } from "../../lib/chat/types";
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
    botName: "Ботын нэр",
    welcome: "Мэндчилгээ",
    welcomeHelp: "Get Started товч дарсан хэрэглэгчид харагдана. Facebook-д мөн энэ бичигдэнэ.",
    model: "Загвар",
    modelAuto: "Автомат (санал болгосон)",
    temperature: "Temperature",
    temperatureHelp:
      "0 = тогтвортой, 1 = уран сэтгэмжтэй. Дэлгүүрт 0.5-0.7 тохиромжтой. Gemini 3 загварууд энэ утгыг хүлээж авдаггүй тул зөвхөн 2.5-д үйлчилнэ.",
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
    botName: "Bot name",
    welcome: "Welcome message",
    welcomeHelp: "Shown after Get Started, and installed as the Facebook greeting.",
    model: "Model",
    modelAuto: "Automatic (recommended)",
    temperature: "Temperature",
    temperatureHelp:
      "0 = consistent, 1 = creative. 0.5–0.7 suits a shop. Gemini 3 models reject this field, so it only applies to 2.5.",
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
