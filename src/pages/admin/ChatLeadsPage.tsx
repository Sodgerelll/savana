import { useMemo, useState } from "react";
import { CheckCircle2, Facebook, Globe, Instagram, ShoppingBag, Trash2, XCircle } from "lucide-react";
import {
  convertLeadToSale,
  LeadConversionError,
  setChatLeadStatus,
  deleteChatLead,
} from "../../lib/chat/leadStore";
import type { ChatChannel, ChatLeadRecord, ChatLeadStatus } from "../../lib/chat/types";
import type { AdminCtx } from "./adminShellTypes";
import "./ChatAdmin.css";

const COPY = {
  MN: {
    kicker: "AI Chat",
    title: "Чатын хүсэлт",
    text: "Чатаас ирсэн захиалга, лавлагаа. Хянаад борлуулалт болгож хувиргана.",
    newOnly: "Зөвхөн шинэ",
    all: "Бүгд",
    empty: "Одоогоор хүсэлт алга.",
    customer: "Харилцагч",
    items: "Бараа",
    channel: "Суваг",
    status: "Төлөв",
    received: "Ирсэн",
    actions: "Үйлдэл",
    convert: "Борлуулалт болгох",
    converting: "Үүсгэж байна…",
    dismiss: "Хаах",
    remove: "Устгах",
    confirmDelete: "Энэ хүсэлтийг устгах уу?",
    missingContact: "Нэр/утас дутуу",
    converted: (n: string) => `${n} дугаартай борлуулалт үүслээ.`,
    total: "Нийт хүсэлт",
    pending: "Хүлээгдэж буй",
    convertedCount: "Борлуулалт болсон",
    statusLabels: {
      new: "Шинэ",
      processing: "Боловсруулж буй",
      converted: "Борлуулалт болсон",
      dismissed: "Хаагдсан",
    },
    typeLabels: {
      order: "Захиалга",
      inquiry: "Лавлагаа",
      complaint: "Гомдол",
      callback: "Эргэж залгах",
    },
  },
  EN: {
    kicker: "AI Chat",
    title: "Chat requests",
    text: "Orders and enquiries captured in chat. Review, then convert to a sale.",
    newOnly: "New only",
    all: "All",
    empty: "No requests yet.",
    customer: "Customer",
    items: "Items",
    channel: "Channel",
    status: "Status",
    received: "Received",
    actions: "Actions",
    convert: "Convert to sale",
    converting: "Creating…",
    dismiss: "Dismiss",
    remove: "Delete",
    confirmDelete: "Delete this request?",
    missingContact: "Name/phone missing",
    converted: (n: string) => `Sale ${n} created.`,
    total: "Requests",
    pending: "Pending",
    convertedCount: "Converted",
    statusLabels: {
      new: "New",
      processing: "In progress",
      converted: "Converted",
      dismissed: "Dismissed",
    },
    typeLabels: {
      order: "Order",
      inquiry: "Enquiry",
      complaint: "Complaint",
      callback: "Callback",
    },
  },
} as const;

const CHANNEL_ICONS: Record<ChatChannel, React.ReactNode> = {
  facebook: <Facebook size={13} />,
  instagram: <Instagram size={13} />,
  widget: <Globe size={13} />,
  admin_test: <Globe size={13} />,
};

function formatDate(iso: string | null, language: "MN" | "EN"): string {
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

export default function ChatLeadsPage({ ctx }: { ctx: AdminCtx }) {
  const { language, chatLeads, chatLeadsError, products, user, profile, settings } = ctx;
  const copy = COPY[(language as "MN" | "EN") ?? "MN"] ?? COPY.MN;
  const leads = useMemo(() => (chatLeads ?? []) as ChatLeadRecord[], [chatLeads]);

  const [newOnly, setNewOnly] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const visible = useMemo(
    () => (newOnly ? leads.filter((lead) => lead.status === "new") : leads),
    [leads, newOnly],
  );

  const counts = useMemo(
    () => ({
      total: leads.length,
      pending: leads.filter((lead) => lead.status === "new").length,
      converted: leads.filter((lead) => lead.status === "converted").length,
    }),
    [leads],
  );

  async function convert(lead: ChatLeadRecord) {
    setBusyId(lead.id);
    setError("");
    setNotice("");
    try {
      const result = await convertLeadToSale(
        lead,
        products ?? [],
        {
          uid: user?.uid ?? "",
          name: profile?.displayName ?? profile?.email ?? "Админ",
        },
        settings.shippingFee,
      );
      setNotice(copy.converted(result.saleNumber));
    } catch (caught) {
      setError(
        caught instanceof LeadConversionError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : String(caught),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(lead: ChatLeadRecord, status: ChatLeadStatus) {
    setBusyId(lead.id);
    try {
      await setChatLeadStatus(lead.id, status);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(lead: ChatLeadRecord) {
    if (!window.confirm(copy.confirmDelete)) return;
    setBusyId(lead.id);
    try {
      await deleteChatLead(lead.id);
    } finally {
      setBusyId(null);
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
            className={`btn ${newOnly ? "btn-primary" : ""}`}
            onClick={() => setNewOnly((value) => !value)}
          >
            {newOnly ? copy.all : copy.newOnly}
          </button>
        </div>
      </div>

      {chatLeadsError && <div className="admin-sync-error">{chatLeadsError}</div>}
      {error && <div className="admin-sync-error">{error}</div>}
      {notice && <div className="admin-sync-error">{notice}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.total}</span>
          <strong>{counts.total}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.pending}</span>
          <strong>{counts.pending}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.convertedCount}</span>
          <strong>{counts.converted}</strong>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.title}</h2>
            <p>{copy.text}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.received}</th>
                <th>{copy.customer}</th>
                <th>{copy.items}</th>
                <th>{copy.channel}</th>
                <th>{copy.status}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    {copy.empty}
                  </td>
                </tr>
              ) : (
                visible.map((lead) => {
                  const contactReady =
                    lead.customerName.trim().length > 0 && lead.customerPhone.trim().length > 0;
                  const busy = busyId === lead.id;

                  return (
                    <tr key={lead.id}>
                      <td>
                        <div className="admin-table-primary">
                          <strong>{formatDate(lead.createdAt, language as "MN" | "EN")}</strong>
                          <small>{copy.typeLabels[lead.type]}</small>
                        </div>
                      </td>
                      <td>
                        <div className="admin-table-primary">
                          <strong>{lead.customerName || "—"}</strong>
                          <small>
                            {lead.customerPhone || (
                              <span style={{ color: "var(--color-sale, #d72c0d)" }}>
                                {copy.missingContact}
                              </span>
                            )}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div className="admin-table-primary admin-table-cell-wrap">
                          {lead.items.length === 0
                            ? "—"
                            : lead.items
                                .map((item) => `${item.name} × ${item.quantity}`)
                                .join(", ")}
                          {lead.note && <small>{lead.note}</small>}
                        </div>
                      </td>
                      <td>
                        <span className="chat-thread-channel">
                          {CHANNEL_ICONS[lead.channel]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`chat-thread-status ${
                            lead.status === "converted" ? "chat-thread-status-human" : ""
                          }`}
                        >
                          {copy.statusLabels[lead.status]}
                        </span>
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          {lead.status === "new" && (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => void convert(lead)}
                                disabled={busy || !contactReady || lead.items.length === 0}
                                title={contactReady ? copy.convert : copy.missingContact}
                              >
                                <ShoppingBag size={15} />
                                {busy ? copy.converting : copy.convert}
                              </button>
                              <button
                                type="button"
                                className="admin-icon-btn admin-icon-btn-neutral"
                                onClick={() => void changeStatus(lead, "dismissed")}
                                disabled={busy}
                                aria-label={copy.dismiss}
                              >
                                <XCircle size={15} />
                              </button>
                            </>
                          )}
                          {lead.status === "converted" && (
                            <span className="chat-lead-done">
                              <CheckCircle2 size={15} />
                            </span>
                          )}
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() => void remove(lead)}
                            disabled={busy}
                            aria-label={copy.remove}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
