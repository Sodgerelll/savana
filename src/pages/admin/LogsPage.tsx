import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Download, RotateCcw, Search, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { downloadCsv } from "../../lib/chat/exportCsv";
import {
  ERROR_LOG_LIMIT,
  ERROR_LOG_SOURCES,
  ERROR_LOG_SOURCE_LABELS,
  deleteErrorLog,
  deleteErrorLogs,
  setErrorLogStatus,
  subscribeToErrorLogs,
  type ErrorLogRecord,
  type ErrorLogSeverity,
  type ErrorLogSource,
  type ErrorLogStatus,
} from "../../lib/errorLogs";
import type { AdminCtx } from "./adminShellTypes";

type Period = "24h" | "7d" | "30d" | "all";

const PERIOD_MS: Record<Exclude<Period, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const COPY = {
  MN: {
    kicker: "Нийтлэг",
    title: "Системийн лог",
    text: "Чат, захиалга, төлбөр, бүртгэл, нэвтрэлт зэрэг системд хийгдсэн үйлдлийн алдаа энд хадгалагдана. Ижил алдаа өдөрт нэг мөрөөр нэгтгэгдэж, давтамж нь тоологдоно.",
    open: "Нээлттэй",
    last24h: "Сүүлийн 24 цаг",
    occurrences: "Нийт давтамж (хүснэгтэд)",
    resolved: "Шийдвэрлэсэн",
    search: "Алдаа, үйлдэл, ID хайх…",
    allSources: "Бүх төрөл",
    allSeverities: "Бүх түвшин",
    error: "Алдаа",
    warning: "Анхааруулга",
    allStatuses: "Бүх төлөв",
    statusOpen: "Нээлттэй",
    statusResolved: "Шийдвэрлэсэн",
    periods: { "24h": "Сүүлийн 24 цаг", "7d": "Сүүлийн 7 хоног", "30d": "Сүүлийн 30 хоног", all: "Бүх хугацаа" },
    lastSeen: "Сүүлд",
    type: "Төрөл",
    action: "Үйлдэл",
    message: "Алдаа",
    count: "Давтамж",
    status: "Төлөв",
    empty: "Лог алга. Систем алдаагүй ажиллаж байна 🎉",
    noMatch: "Шүүлтүүрт тохирох лог алга.",
    resolve: "Шийдвэрлэсэн",
    reopen: "Дахин нээх",
    remove: "Устгах",
    resolveAll: "Харагдаж буйг шийдвэрлэх",
    removeResolved: "Шийдвэрлэснийг устгах",
    export: "CSV татах",
    confirmResolveAll: (n: number) => `Харагдаж буй ${n} логийг шийдвэрлэсэн гэж тэмдэглэх үү?`,
    confirmRemoveResolved: (n: number) => `Шийдвэрлэсэн ${n} логийг бүрмөсөн устгах уу? Үүнийг буцаах боломжгүй.`,
    confirmRemove: "Энэ логийг бүрмөсөн устгах уу?",
    firstSeen: "Анх үүссэн",
    origin: "Эх үүсвэр",
    originServer: "Сервер",
    originClient: "Хөтөч",
    page: "Хуудас",
    user: "Хэрэглэгч (uid)",
    device: "Төхөөрөмж",
    details: "Нөхцөл байдал",
    stack: "Дэлгэрэнгүй (stack)",
    capped: (n: number) => `Хамгийн сүүлийн ${n} мөрийг харуулж байна. Хуучин мөрийг устгаснаар шинийг харна.`,
    failed: "Үйлдэл амжилтгүй боллоо.",
    resolvedBy: "Шийдвэрлэсэн",
  },
  EN: {
    kicker: "Common",
    title: "System log",
    text: "Failed actions across chat, orders, payments, accounts and sign-in are kept here. The same error is merged into one row per day, with a count.",
    open: "Open",
    last24h: "Last 24 hours",
    occurrences: "Occurrences (in table)",
    resolved: "Resolved",
    search: "Search error, action, id…",
    allSources: "All types",
    allSeverities: "All levels",
    error: "Error",
    warning: "Warning",
    allStatuses: "All statuses",
    statusOpen: "Open",
    statusResolved: "Resolved",
    periods: { "24h": "Last 24 hours", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" },
    lastSeen: "Last seen",
    type: "Type",
    action: "Action",
    message: "Error",
    count: "Count",
    status: "Status",
    empty: "The log is empty. Nothing has gone wrong 🎉",
    noMatch: "No log entries match the filters.",
    resolve: "Resolve",
    reopen: "Reopen",
    remove: "Delete",
    resolveAll: "Resolve what is shown",
    removeResolved: "Delete resolved",
    export: "Download CSV",
    confirmResolveAll: (n: number) => `Mark the ${n} entries shown as resolved?`,
    confirmRemoveResolved: (n: number) => `Permanently delete ${n} resolved entries? This cannot be undone.`,
    confirmRemove: "Permanently delete this entry?",
    firstSeen: "First seen",
    origin: "Origin",
    originServer: "Server",
    originClient: "Browser",
    page: "Page",
    user: "User (uid)",
    device: "Device",
    details: "Context",
    stack: "Details (stack)",
    capped: (n: number) => `Showing the latest ${n} entries. Delete old ones to see newer.`,
    failed: "The action failed.",
    resolvedBy: "Resolved by",
  },
} as const;

function matches(log: ErrorLogRecord, needle: string): boolean {
  if (!needle) return true;
  const haystack = [
    log.action,
    log.message,
    log.source,
    log.url ?? "",
    log.actorUid ?? "",
    log.context ? JSON.stringify(log.context) : "",
  ]
    .join(" ")
    .toLowerCase();
  return needle
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

/**
 * The system error log: everything that failed anywhere — chat, orders, payments, accounts,
 * sign-in, the storefront and this panel — in one list an admin can filter, work through and
 * clear. Rows are written by the server only (api/_lib/errorLog.ts); this page reads them and
 * may mark one resolved or delete it.
 */
export default function LogsPage({ ctx }: { ctx: AdminCtx }) {
  const { language, formatAdminDateTime } = ctx;
  const t = COPY[language === "EN" ? "EN" : "MN"];
  const lang = language === "EN" ? "EN" : "MN";
  const { user } = useAuth();

  const [logs, setLogs] = useState<ErrorLogRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<ErrorLogSource | "all">("all");
  const [severity, setSeverity] = useState<ErrorLogSeverity | "all">("all");
  const [status, setStatus] = useState<ErrorLogStatus | "all">("open");
  const [period, setPeriod] = useState<Period>("7d");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeToErrorLogs(
        (next) => {
          setLogs(next);
          setLoaded(true);
          setError("");
        },
        (err) => {
          setLoaded(true);
          setError(err.message);
        },
      ),
    [],
  );

  // A snapshot of "now" per render pass is enough: the list refreshes on every change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [logs]);

  const visible = useMemo(
    () =>
      logs.filter((log) => {
        if (source !== "all" && log.source !== source) return false;
        if (severity !== "all" && log.severity !== severity) return false;
        if (status !== "all" && log.status !== status) return false;
        if (period !== "all") {
          const seen = log.lastAt ? new Date(log.lastAt).getTime() : 0;
          if (now - seen > PERIOD_MS[period]) return false;
        }
        return matches(log, search.trim());
      }),
    [logs, source, severity, status, period, search, now],
  );

  const openCount = logs.filter((log) => log.status === "open").length;
  const resolvedCount = logs.length - openCount;
  const last24hCount = logs.filter(
    (log) => log.status === "open" && log.lastAt && now - new Date(log.lastAt).getTime() <= PERIOD_MS["24h"],
  ).length;
  const occurrenceTotal = visible.reduce((sum, log) => sum + log.count, 0);

  const openBySource = useMemo(() => {
    const counts = new Map<ErrorLogSource, number>();
    for (const log of logs) {
      if (log.status === "open") counts.set(log.source, (counts.get(log.source) ?? 0) + 1);
    }
    return counts;
  }, [logs]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  const resolveOne = (log: ErrorLogRecord) =>
    run(() => setErrorLogStatus(log.id, log.status === "open" ? "resolved" : "open", user?.uid ?? ""));

  const removeOne = (log: ErrorLogRecord) => {
    if (!window.confirm(t.confirmRemove)) return Promise.resolve();
    return run(() => deleteErrorLog(log.id));
  };

  const resolveShown = () => {
    const targets = visible.filter((log) => log.status === "open");
    if (targets.length === 0 || !window.confirm(t.confirmResolveAll(targets.length))) return;
    void run(async () => {
      for (const log of targets) {
        await setErrorLogStatus(log.id, "resolved", user?.uid ?? "");
      }
    });
  };

  const removeResolved = () => {
    const targets = logs.filter((log) => log.status === "resolved");
    if (targets.length === 0 || !window.confirm(t.confirmRemoveResolved(targets.length))) return;
    void run(() => deleteErrorLogs(targets.map((log) => log.id)));
  };

  const exportCsv = () =>
    downloadCsv(
      "system-log",
      ["lastAt", "createdAt", "status", "severity", "source", "action", "message", "count", "origin", "url", "actorUid", "context"],
      visible.map((log) => [
        log.lastAt,
        log.createdAt,
        log.status,
        log.severity,
        log.source,
        log.action,
        log.message,
        log.count,
        log.origin,
        log.url,
        log.actorUid,
        log.context ? JSON.stringify(log.context) : "",
      ]),
    );

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{t.kicker}</p>
          <h1>{t.title}</h1>
          <p>{t.text}</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={visible.length === 0}>
            <Download size={16} />
            {t.export}
          </button>
        </div>
      </div>

      {error && <div className="admin-sync-error">{error}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{t.open}</span>
          <strong>{openCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{t.last24h}</span>
          <strong>{last24hCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{t.occurrences}</span>
          <strong>{occurrenceTotal}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{t.resolved}</span>
          <strong>{resolvedCount}</strong>
        </div>
      </div>

      <div className="admin-log-sources">
        <button
          type="button"
          className={`admin-log-source-chip ${source === "all" ? "active" : ""}`}
          onClick={() => setSource("all")}
        >
          {t.allSources}
          <span>{openCount}</span>
        </button>
        {ERROR_LOG_SOURCES.map((key) => (
          <button
            key={key}
            type="button"
            className={`admin-log-source-chip ${source === key ? "active" : ""}`}
            onClick={() => setSource(source === key ? "all" : key)}
          >
            {ERROR_LOG_SOURCE_LABELS[key][lang]}
            <span>{openBySource.get(key) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-search">
          <Search size={15} className="admin-filter-search-icon" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.search}
          />
        </div>
        <select
          className="admin-search-input"
          value={severity}
          onChange={(event) => setSeverity(event.target.value as ErrorLogSeverity | "all")}
        >
          <option value="all">{t.allSeverities}</option>
          <option value="error">{t.error}</option>
          <option value="warning">{t.warning}</option>
        </select>
        <select
          className="admin-search-input"
          value={status}
          onChange={(event) => setStatus(event.target.value as ErrorLogStatus | "all")}
        >
          <option value="all">{t.allStatuses}</option>
          <option value="open">{t.statusOpen}</option>
          <option value="resolved">{t.statusResolved}</option>
        </select>
        <select
          className="admin-search-input"
          value={period}
          onChange={(event) => setPeriod(event.target.value as Period)}
        >
          {(Object.keys(t.periods) as Period[]).map((key) => (
            <option key={key} value={key}>
              {t.periods[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{t.title}</h2>
            {logs.length >= ERROR_LOG_LIMIT && <p>{t.capped(ERROR_LOG_LIMIT)}</p>}
          </div>
          <div className="admin-log-bulk">
            <button
              type="button"
              className="btn btn-outline"
              onClick={resolveShown}
              disabled={busy || !visible.some((log) => log.status === "open")}
            >
              <CheckCircle2 size={16} />
              {t.resolveAll}
            </button>
            <button type="button" className="btn btn-outline" onClick={removeResolved} disabled={busy || resolvedCount === 0}>
              <Trash2 size={16} />
              {t.removeResolved}
            </button>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table admin-logs-table">
            <thead>
              <tr>
                <th />
                <th>{t.lastSeen}</th>
                <th>{t.type}</th>
                <th>{t.action}</th>
                <th>{t.message}</th>
                <th>{t.count}</th>
                <th>{t.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-table-empty">
                    {!loaded ? "…" : logs.length === 0 ? t.empty : t.noMatch}
                  </td>
                </tr>
              ) : (
                visible.map((log) => {
                  const isOpen = expanded === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr
                        className={`admin-log-row ${log.status === "resolved" ? "resolved" : ""}`}
                        onClick={() => setExpanded(isOpen ? null : log.id)}
                      >
                        <td className="admin-log-toggle">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                        <td>
                          <div className="admin-table-primary">
                            <strong>{formatAdminDateTime(log.lastAt, language)}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="admin-table-primary">
                            <span className={`admin-log-badge source-${log.source}`}>
                              {ERROR_LOG_SOURCE_LABELS[log.source][lang]}
                            </span>
                            {log.severity === "warning" && <small className="admin-log-warning">{t.warning}</small>}
                          </div>
                        </td>
                        <td>
                          <code className="admin-log-action">{log.action}</code>
                        </td>
                        <td>
                          <div className="admin-table-primary admin-table-cell-wrap">
                            <span className="admin-log-message">{log.message}</span>
                          </div>
                        </td>
                        <td>
                          <strong>{log.count}</strong>
                        </td>
                        <td>
                          <span className={`admin-status-badge ${log.status === "resolved" ? "active" : "inactive"}`}>
                            {log.status === "resolved" ? t.statusResolved : t.statusOpen}
                          </span>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-neutral"
                              onClick={() => void resolveOne(log)}
                              disabled={busy}
                              title={log.status === "open" ? t.resolve : t.reopen}
                              aria-label={log.status === "open" ? t.resolve : t.reopen}
                            >
                              {log.status === "open" ? <CheckCircle2 size={15} /> : <RotateCcw size={15} />}
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-danger"
                              onClick={() => void removeOne(log)}
                              disabled={busy}
                              title={t.remove}
                              aria-label={t.remove}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-log-detail-row">
                          <td colSpan={8}>
                            <div className="admin-log-detail">
                              <p className="admin-log-detail-message">{log.message}</p>
                              <dl>
                                <div>
                                  <dt>{t.firstSeen}</dt>
                                  <dd>{formatAdminDateTime(log.createdAt, language)}</dd>
                                </div>
                                <div>
                                  <dt>{t.lastSeen}</dt>
                                  <dd>{formatAdminDateTime(log.lastAt, language)}</dd>
                                </div>
                                <div>
                                  <dt>{t.origin}</dt>
                                  <dd>{log.origin === "client" ? t.originClient : t.originServer}</dd>
                                </div>
                                {log.url && (
                                  <div>
                                    <dt>{t.page}</dt>
                                    <dd>{log.url}</dd>
                                  </div>
                                )}
                                {log.actorUid && (
                                  <div>
                                    <dt>{t.user}</dt>
                                    <dd>{log.actorUid}</dd>
                                  </div>
                                )}
                                {log.userAgent && (
                                  <div>
                                    <dt>{t.device}</dt>
                                    <dd>{log.userAgent}</dd>
                                  </div>
                                )}
                                {log.status === "resolved" && log.resolvedAt && (
                                  <div>
                                    <dt>{t.resolvedBy}</dt>
                                    <dd>
                                      {formatAdminDateTime(log.resolvedAt, language)}
                                      {log.resolvedBy ? ` · ${log.resolvedBy}` : ""}
                                    </dd>
                                  </div>
                                )}
                              </dl>
                              {log.context && (
                                <>
                                  <h4>{t.details}</h4>
                                  <pre>{JSON.stringify(log.context, null, 2)}</pre>
                                </>
                              )}
                              {log.stack && (
                                <>
                                  <h4>{t.stack}</h4>
                                  <pre>{log.stack}</pre>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
