import { useEffect, useState } from "react";
import { Check, Facebook, Instagram, Link2, Power, TriangleAlert } from "lucide-react";
import { saveChatSettings } from "../../lib/chat/chatSettings";
import { applyFacebookSetup, ChatApiError } from "../../lib/chat/chatApi";
import type { ChatSettingsRecord } from "../../lib/chat/types";
import type { AdminCtx } from "./adminShellTypes";
import "./ChatAdmin.css";

const COPY = {
  MN: {
    kicker: "AI Chat",
    title: "Чат тохиргоо",
    text: "Ботыг асаах, Facebook/Instagram холбох, загварын тохиргоо.",
    botSection: "Ерөнхий",
    botActive: "Ботыг асаах",
    botActiveHelp: "Унтраалттай үед ямар ч суваг дээр бот хариулахгүй. Туршилтын чат ажиллана.",
    botName: "Ботын нэр",
    welcome: "Мэндчилгээ",
    welcomeHelp: "Get Started товч дарсан хэрэглэгчид харагдана. Facebook-д мөн энэ бичигдэнэ.",
    model: "Загвар",
    modelAuto: "Автомат (санал болгосон)",
    temperature: "Temperature",
    temperatureHelp: "0 = тогтвортой, 1 = уран сэтгэмжтэй. Дэлгүүрт 0.5-0.7 тохиромжтой.",
    fbSection: "Facebook + Instagram",
    fbActive: "Messenger идэвхжүүлэх",
    igActive: "Instagram Direct идэвхжүүлэх",
    igHelp: "Instagram Business хаяг Facebook хуудастай холбогдсон байх шаардлагатай.",
    pageId: "Page ID",
    pageToken: "Page Access Token",
    pageTokenHelp:
      "Facebook Developer Console → Messenger → Access Tokens. 60 хоногийн настай — дуусахаас өмнө шинэчилнэ үү.",
    tokenStored: "Хадгалагдсан",
    tokenChange: "Солих",
    applySetup: "Facebook-д цэс суулгах",
    applying: "Суулгаж байна…",
    applyHelp:
      "Хадгалсан token-оор Facebook хуудсанд мэндчилгээ, Get Started, байнгын цэсийг суулгана. Token зөв эсэхийг мөн шалгана.",
    webhookSection: "Webhook",
    webhookHelp:
      "Facebook Developer Console → Webhooks дээр доорх URL болон Verify Token-ыг бүртгэнэ. Verify Token нь Vercel дээрх FB_VERIFY_TOKEN орчны хувьсагчийн утга.",
    webhookUrl: "Callback URL",
    webhookFields: "Subscribe хийх талбарууд",
    save: "Хадгалах",
    saved: "Хадгаллаа",
    saving: "Хадгалж байна…",
  },
  EN: {
    kicker: "AI Chat",
    title: "Chat settings",
    text: "Switch the bot on, connect Facebook/Instagram, and tune the model.",
    botSection: "General",
    botActive: "Enable the bot",
    botActiveHelp: "While off the bot answers on no channel. The test chat still works.",
    botName: "Bot name",
    welcome: "Welcome message",
    welcomeHelp: "Shown after Get Started, and installed as the Facebook greeting.",
    model: "Model",
    modelAuto: "Automatic (recommended)",
    temperature: "Temperature",
    temperatureHelp: "0 = consistent, 1 = creative. 0.5–0.7 suits a shop.",
    fbSection: "Facebook + Instagram",
    fbActive: "Enable Messenger",
    igActive: "Enable Instagram Direct",
    igHelp: "The Instagram Business account must be linked to the Facebook page.",
    pageId: "Page ID",
    pageToken: "Page Access Token",
    pageTokenHelp:
      "Facebook Developer Console → Messenger → Access Tokens. Valid for 60 days — refresh before it expires.",
    tokenStored: "Stored",
    tokenChange: "Replace",
    applySetup: "Install menu on Facebook",
    applying: "Installing…",
    applyHelp:
      "Uses the saved token to install the greeting, Get Started button and persistent menu — and verifies the token works.",
    webhookSection: "Webhook",
    webhookHelp:
      "Register the URL and verify token below under Facebook Developer Console → Webhooks. The verify token is the FB_VERIFY_TOKEN environment variable on Vercel.",
    webhookUrl: "Callback URL",
    webhookFields: "Fields to subscribe",
    save: "Save",
    saved: "Saved",
    saving: "Saving…",
  },
} as const;

const MODEL_OPTIONS = [
  "",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
];

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
  // The stored token is never shown; the field only ever carries a new value.
  const [replacingToken, setReplacingToken] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");

  // Adopt server updates only while the form is untouched, so a save from
  // another tab cannot overwrite what is being typed here.
  useEffect(() => {
    if (!dirty) {
      setDraft(settings);
    }
  }, [settings, dirty]);

  function patch(next: Partial<ChatSettingsRecord>) {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
    setSaved(false);
  }

  function patchFacebook(next: Partial<ChatSettingsRecord["facebook"]>) {
    setDraft((current) => ({ ...current, facebook: { ...current.facebook, ...next } }));
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
        facebook: {
          ...draft.facebook,
          // Only overwrite the token when a replacement was actually typed.
          pageAccessToken: replacingToken && tokenDraft.trim()
            ? tokenDraft.trim()
            : settings.facebook.pageAccessToken,
        },
      });
      setDirty(false);
      setSaved(true);
      setReplacingToken(false);
      setTokenDraft("");
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
    } catch (caught) {
      setError(caught instanceof ChatApiError ? caught.message : "Суулгаж чадсангүй.");
    } finally {
      setApplying(false);
    }
  }

  const webhookUrl =
    typeof window === "undefined" ? "/api/chat/webhook" : `${window.location.origin}/api/chat/webhook`;
  const hasStoredToken = settings.facebook.pageAccessToken.length > 0;

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

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>
              <Facebook size={17} style={{ verticalAlign: "-3px", marginRight: 6 }} />
              {copy.fbSection}
            </h2>
            <p>{copy.pageTokenHelp}</p>
          </div>
        </div>

        <label className="admin-field admin-field-toggle">
          <input
            type="checkbox"
            checked={draft.facebook.isActive}
            onChange={(event) => patchFacebook({ isActive: event.target.checked })}
          />
          <span>{copy.fbActive}</span>
        </label>

        <label className="admin-field admin-field-toggle">
          <input
            type="checkbox"
            checked={draft.facebook.instagramIsActive}
            onChange={(event) => patchFacebook({ instagramIsActive: event.target.checked })}
          />
          <span>
            <Instagram size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {copy.igActive}
          </span>
        </label>
        <small style={{ opacity: 0.6 }}>{copy.igHelp}</small>

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{copy.pageId}</span>
            <input
              className="admin-input"
              value={draft.facebook.pageId}
              onChange={(event) => patchFacebook({ pageId: event.target.value.trim() })}
              placeholder="1234567890"
            />
          </label>

          <label className="admin-field">
            <span>{copy.pageToken}</span>
            {hasStoredToken && !replacingToken ? (
              <div className="chat-token-row">
                <span className="chat-token-stored">••••••••••••  {copy.tokenStored}</span>
                <button type="button" className="btn" onClick={() => setReplacingToken(true)}>
                  {copy.tokenChange}
                </button>
              </div>
            ) : (
              <input
                className="admin-input"
                type="password"
                autoComplete="off"
                value={tokenDraft}
                onChange={(event) => {
                  setTokenDraft(event.target.value);
                  setDirty(true);
                  setSaved(false);
                }}
                placeholder="EAAG…"
              />
            )}
          </label>
        </div>

        <div className="admin-editor-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void runSetup()}
            disabled={applying || !hasStoredToken}
          >
            <Link2 size={15} />
            {applying ? copy.applying : copy.applySetup}
          </button>
        </div>
        <small style={{ opacity: 0.6 }}>{copy.applyHelp}</small>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.webhookSection}</h2>
            <p>{copy.webhookHelp}</p>
          </div>
        </div>
        <div className="admin-structure-list">
          <code>
            {copy.webhookUrl}: {webhookUrl}
          </code>
          <code>
            {copy.webhookFields}: messages, messaging_postbacks
          </code>
        </div>
      </div>
    </>
  );
}
