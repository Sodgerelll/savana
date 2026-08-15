import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  createChatFaq,
  createChatFaqsBatch,
  createEmptyFaqDraft,
  deleteChatFaq,
  setChatFaqActive,
  updateChatFaq,
  type ChatFaqDraft,
} from "../../lib/chat/faqStore";
import { saveChatSettings } from "../../lib/chat/chatSettings";
import { ChatApiError, sendAssistantMessage } from "../../lib/chat/chatApi";
import { FAQ_GENERATOR_INSTRUCTION, parseGeneratedFaqs } from "../../lib/chat/faqGenerator";
import type { ChatFaqRecord, ChatSettingsRecord } from "../../lib/chat/types";
import type { AdminCtx } from "./adminShellTypes";
import "./ChatAdmin.css";

const COPY = {
  MN: {
    kicker: "AI Chat",
    title: "Мэдлэгийн сан",
    text: "Ботын үндсэн заавар, нэмэлт мэдээлэл, түгээмэл асуултууд.",
    basePromptTitle: "Ботын үндсэн заавар",
    basePromptHelp:
      "Энд бичсэн заавар автоматаар үүссэн prompt-ын ТӨГСГӨЛД нэмэгдэж, зөрчилдвөл давуу болно. Богино, тодорхой бич.",
    basePromptPlaceholder: "Жишээ: Бөөний үнэ асуувал утсаар холбогдохыг зөвлө.",
    knowledgeTitle: "Нэмэлт мэдээлэл",
    knowledgeHelp: "FAQ болгох хэмжээний биш богино баримтууд. Мөр бүр нэг баримт.",
    knowledgePlaceholder: "Жишээ: Бөөний захиалга 50 ширхэгээс эхэлнэ",
    faqTitle: "Түгээмэл асуулт",
    faqHelp: "Бот эдгээрийг үг дуустал уншиж хариултдаа ашиглана.",
    add: "Нэмэх",
    save: "Хадгалах",
    saved: "Хадгаллаа",
    cancel: "Болих",
    edit: "Засах",
    remove: "Устгах",
    question: "Асуулт",
    answer: "Хариулт",
    topic: "Сэдэв",
    order: "Дараалал",
    status: "Төлөв",
    actions: "Үйлдэл",
    active: "Идэвхтэй",
    inactive: "Идэвхгүй",
    emptyFaqs: "Одоогоор түгээмэл асуулт нэмээгүй байна.",
    generate: "AI-аар үүсгэх",
    generating: "Үүсгэж байна…",
    generateHelp:
      "Каталог, дэлгүүрийн мэдээлэлд тулгуурлан 8 асуулт-хариулт үүсгэнэ. Үүссэний дараа заавал хянаж засна уу.",
    generated: (n: number) => `${n} асуулт нэмэгдлээ. Дарааллаар нь хянаж засна уу.`,
    generateFailed: "Үүсгэж чадсангүй. Дахин оролдоно уу.",
    questionRequired: "Асуулт болон хариулт хоёуланг бөглөнө үү.",
    confirmDelete: "Энэ асуултыг устгах уу?",
  },
  EN: {
    kicker: "AI Chat",
    title: "Knowledge base",
    text: "The bot's base instructions, extra facts, and frequently asked questions.",
    basePromptTitle: "Base instructions",
    basePromptHelp:
      "Appended to the END of the generated prompt and wins any conflict. Keep it short and specific.",
    basePromptPlaceholder: "e.g. For wholesale pricing, ask the customer to call.",
    knowledgeTitle: "Extra facts",
    knowledgeHelp: "Short facts too small to be a FAQ. One fact per line.",
    knowledgePlaceholder: "e.g. Wholesale orders start at 50 units",
    faqTitle: "Frequently asked questions",
    faqHelp: "The bot reads these verbatim and uses them in its answers.",
    add: "Add",
    save: "Save",
    saved: "Saved",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    question: "Question",
    answer: "Answer",
    topic: "Topic",
    order: "Order",
    status: "Status",
    actions: "Actions",
    active: "Active",
    inactive: "Inactive",
    emptyFaqs: "No questions added yet.",
    generate: "Generate with AI",
    generating: "Generating…",
    generateHelp:
      "Generates 8 question/answer pairs from the catalog and shop details. Always review them afterwards.",
    generated: (n: number) => `Added ${n} questions. Review and edit them.`,
    generateFailed: "Could not generate. Please try again.",
    questionRequired: "Both a question and an answer are required.",
    confirmDelete: "Delete this question?",
  },
} as const;

export default function ChatKnowledgePage({ ctx }: { ctx: AdminCtx }) {
  const { language, chatSettings, chatFaqs, chatFaqsError } = ctx;
  const copy = COPY[(language as "MN" | "EN") ?? "MN"] ?? COPY.MN;
  const settings = chatSettings as ChatSettingsRecord;
  const faqs = useMemo(() => (chatFaqs ?? []) as ChatFaqRecord[], [chatFaqs]);

  const [basePrompt, setBasePrompt] = useState(settings.basePrompt);
  const [basePromptSaving, setBasePromptSaving] = useState(false);
  const [basePromptSaved, setBasePromptSaved] = useState(false);

  const [knowledgeDraft, setKnowledgeDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [faqDraft, setFaqDraft] = useState<ChatFaqDraft | null>(null);
  const [faqError, setFaqError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");

  // Adopt server changes only while the field is untouched, so a save landing
  // from another tab cannot wipe what the admin is mid-way through typing.
  useEffect(() => {
    setBasePrompt((current) => (current === "" ? settings.basePrompt : current));
  }, [settings.basePrompt]);

  const nextOrder = useMemo(
    () => faqs.reduce((max, faq) => Math.max(max, faq.order), 0) + 10,
    [faqs],
  );

  async function saveBasePrompt() {
    setBasePromptSaving(true);
    setBasePromptSaved(false);
    try {
      await saveChatSettings({ basePrompt: basePrompt.trim() });
      setBasePromptSaved(true);
    } finally {
      setBasePromptSaving(false);
    }
  }

  async function addKnowledgePoint() {
    const point = knowledgeDraft.trim();
    if (!point) return;
    await saveChatSettings({ knowledgePoints: [...settings.knowledgePoints, point] });
    setKnowledgeDraft("");
  }

  async function removeKnowledgePoint(index: number) {
    await saveChatSettings({
      knowledgePoints: settings.knowledgePoints.filter((_, i) => i !== index),
    });
  }

  function startCreate() {
    setEditingId("new");
    setFaqDraft(createEmptyFaqDraft(nextOrder));
    setFaqError("");
  }

  function startEdit(faq: ChatFaqRecord) {
    setEditingId(faq.id);
    setFaqDraft({
      question: faq.question,
      answer: faq.answer,
      topic: faq.topic,
      order: faq.order,
      isActive: faq.isActive,
    });
    setFaqError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setFaqDraft(null);
    setFaqError("");
  }

  async function submitFaq() {
    if (!faqDraft) return;
    if (!faqDraft.question.trim() || !faqDraft.answer.trim()) {
      setFaqError(copy.questionRequired);
      return;
    }

    setBusy(true);
    try {
      if (editingId === "new") {
        await createChatFaq(faqDraft);
      } else if (editingId) {
        await updateChatFaq(editingId, faqDraft);
      }
      cancelEdit();
    } catch (error) {
      setFaqError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeFaq(faq: ChatFaqRecord) {
    if (!window.confirm(copy.confirmDelete)) return;
    setBusy(true);
    try {
      await deleteChatFaq(faq.id);
    } finally {
      setBusy(false);
    }
  }

  async function generateFaqs() {
    setGenerating(true);
    setNotice("");
    try {
      const result = await sendAssistantMessage({
        message: FAQ_GENERATOR_INSTRUCTION,
        // The storefront prompt supplies the catalog the generator reads from.
        useStorefrontPrompt: true,
        maxOutputTokens: 4000,
        temperature: 0.4,
      });

      const generated = parseGeneratedFaqs(result.reply);
      if (generated.length === 0) {
        setNotice(copy.generateFailed);
        return;
      }

      // Land them inactive: generated text must be reviewed before the bot
      // starts quoting it to customers.
      const created = await createChatFaqsBatch(
        generated.map((entry, index) => ({
          question: entry.question,
          answer: entry.answer,
          topic: entry.topic,
          order: nextOrder + index * 10,
          isActive: false,
        })),
      );
      setNotice(copy.generated(created));
    } catch (error) {
      setNotice(error instanceof ChatApiError ? error.message : copy.generateFailed);
    } finally {
      setGenerating(false);
    }
  }

  const editorRow = faqDraft && (
    <div className="admin-section-card">
      <div className="admin-form-grid">
        <label className="admin-field admin-field-wide">
          <span>{copy.question}</span>
          <input
            className="admin-input"
            value={faqDraft.question}
            onChange={(event) => setFaqDraft({ ...faqDraft, question: event.target.value })}
            placeholder="Хүргэлт хэдэн хоног вэ?"
          />
        </label>
        <label className="admin-field admin-field-wide">
          <span>{copy.answer}</span>
          <textarea
            className="admin-input"
            rows={3}
            value={faqDraft.answer}
            onChange={(event) => setFaqDraft({ ...faqDraft, answer: event.target.value })}
            placeholder="Улаанбаатар дотор 1-2 ажлын өдөрт хүргэнэ."
          />
        </label>
        <label className="admin-field">
          <span>{copy.topic}</span>
          <input
            className="admin-input"
            value={faqDraft.topic}
            onChange={(event) => setFaqDraft({ ...faqDraft, topic: event.target.value })}
            placeholder="Хүргэлт"
          />
        </label>
        <label className="admin-field">
          <span>{copy.order}</span>
          <input
            className="admin-input"
            type="number"
            value={faqDraft.order}
            onChange={(event) =>
              setFaqDraft({ ...faqDraft, order: Number(event.target.value) || 0 })
            }
          />
        </label>
        <label className="admin-field admin-field-toggle">
          <input
            type="checkbox"
            checked={faqDraft.isActive}
            onChange={(event) => setFaqDraft({ ...faqDraft, isActive: event.target.checked })}
          />
          <span>{copy.active}</span>
        </label>
      </div>

      {faqError && <div className="admin-field-error">{faqError}</div>}

      <div className="admin-editor-actions">
        <button type="button" className="btn btn-primary" onClick={() => void submitFaq()} disabled={busy}>
          <Check size={15} />
          {copy.save}
        </button>
        <button type="button" className="btn" onClick={cancelEdit} disabled={busy}>
          <X size={15} />
          {copy.cancel}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn" onClick={() => void generateFaqs()} disabled={generating}>
            <Sparkles size={16} />
            {generating ? copy.generating : copy.generate}
          </button>
          <button type="button" className="btn btn-primary" onClick={startCreate} disabled={busy}>
            <Plus size={16} />
            {copy.add}
          </button>
        </div>
      </div>

      {chatFaqsError && <div className="admin-sync-error">{chatFaqsError}</div>}
      {notice && <div className="admin-sync-error">{notice}</div>}

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.basePromptTitle}</h2>
            <p>{copy.basePromptHelp}</p>
          </div>
        </div>
        <textarea
          className="admin-input"
          rows={5}
          value={basePrompt}
          onChange={(event) => {
            setBasePrompt(event.target.value);
            setBasePromptSaved(false);
          }}
          placeholder={copy.basePromptPlaceholder}
        />
        <div className="admin-editor-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void saveBasePrompt()}
            disabled={basePromptSaving || basePrompt === settings.basePrompt}
          >
            <Check size={15} />
            {basePromptSaved ? copy.saved : copy.save}
          </button>
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.knowledgeTitle}</h2>
            <p>{copy.knowledgeHelp}</p>
          </div>
        </div>

        {settings.knowledgePoints.length > 0 && (
          <ul className="chat-knowledge-list">
            {settings.knowledgePoints.map((point, index) => (
              <li key={`${point}-${index}`}>
                <span>{point}</span>
                <button
                  type="button"
                  className="admin-icon-btn"
                  onClick={() => void removeKnowledgePoint(index)}
                  aria-label={copy.remove}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="chat-knowledge-add">
          <input
            className="admin-input"
            value={knowledgeDraft}
            onChange={(event) => setKnowledgeDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addKnowledgePoint();
              }
            }}
            placeholder={copy.knowledgePlaceholder}
          />
          <button
            type="button"
            className="btn"
            onClick={() => void addKnowledgePoint()}
            disabled={knowledgeDraft.trim().length === 0}
          >
            <Plus size={15} />
            {copy.add}
          </button>
        </div>
      </div>

      {editingId && editorRow}

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.faqTitle}</h2>
            <p>{copy.generateHelp}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.order}</th>
                <th>{copy.question}</th>
                <th>{copy.answer}</th>
                <th>{copy.topic}</th>
                <th>{copy.status}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {faqs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    {copy.emptyFaqs}
                  </td>
                </tr>
              ) : (
                faqs.map((faq) => (
                  <tr key={faq.id}>
                    <td>{faq.order}</td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>{faq.question}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">{faq.answer}</div>
                    </td>
                    <td>{faq.topic || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={`admin-status-badge ${faq.isActive ? "is-active" : ""}`}
                        onClick={() => void setChatFaqActive(faq.id, !faq.isActive)}
                        title={faq.isActive ? copy.active : copy.inactive}
                      >
                        {faq.isActive ? copy.active : copy.inactive}
                      </button>
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={() => startEdit(faq)}
                          aria-label={copy.edit}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => void removeFaq(faq)}
                          aria-label={copy.remove}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
