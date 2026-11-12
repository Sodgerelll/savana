/**
 * The system error log, browser side.
 *
 * Writing happens on the server (api/_lib/errorLog.ts): `reportClientError` posts a failure
 * to /api/logs/report, which stores it. Reading is for admins only — the Лог page subscribes
 * to /errorLogs, which firestore.rules open to admin and sysadmin alone.
 *
 * Reporting is a courtesy to the admin and must never be a problem for the shopper: it is
 * fire-and-forget, never throws, and caps itself so a page stuck in a failure loop cannot
 * flood the server.
 */
import {
  collection,
  deleteDoc,
  doc,
  limit as limitTo,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export const ERROR_LOGS_COLLECTION = "errorLogs";

/** Mirrors ERROR_LOG_SOURCES in api/_lib/errorLog.ts. */
export const ERROR_LOG_SOURCES = [
  "chat",
  "order",
  "payment",
  "account",
  "auth",
  "notification",
  "storefront",
  "admin",
  "system",
] as const;

export type ErrorLogSource = (typeof ERROR_LOG_SOURCES)[number];
export type ErrorLogSeverity = "error" | "warning";
export type ErrorLogStatus = "open" | "resolved";

export const ERROR_LOG_SOURCE_LABELS: Record<ErrorLogSource, { MN: string; EN: string }> = {
  chat: { MN: "Чат", EN: "Chat" },
  order: { MN: "Захиалга", EN: "Orders" },
  payment: { MN: "Төлбөр", EN: "Payments" },
  account: { MN: "Бүртгэл, мэдээлэл", EN: "Accounts & data" },
  auth: { MN: "Нэвтрэлт", EN: "Sign-in" },
  notification: { MN: "Мэдэгдэл", EN: "Notifications" },
  storefront: { MN: "Вэбсайт", EN: "Storefront" },
  admin: { MN: "Админ", EN: "Admin" },
  system: { MN: "Систем", EN: "System" },
};

export interface ErrorLogRecord {
  id: string;
  source: ErrorLogSource;
  action: string;
  message: string;
  stack: string;
  severity: ErrorLogSeverity;
  status: ErrorLogStatus;
  origin: "server" | "client";
  count: number;
  context: Record<string, unknown> | null;
  actorUid: string | null;
  url: string | null;
  userAgent: string | null;
  createdAt: string | null;
  lastAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

function toIso(value: unknown): string | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

function asSource(value: unknown): ErrorLogSource {
  return (ERROR_LOG_SOURCES as readonly string[]).includes(String(value)) ? (value as ErrorLogSource) : "system";
}

function deserialize(snapshot: QueryDocumentSnapshot<DocumentData>): ErrorLogRecord {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    source: asSource(data.source),
    action: String(data.action ?? ""),
    message: String(data.message ?? ""),
    stack: String(data.stack ?? ""),
    severity: data.severity === "warning" ? "warning" : "error",
    status: data.status === "resolved" ? "resolved" : "open",
    origin: data.origin === "client" ? "client" : "server",
    count: Number(data.count ?? 1),
    context:
      data.context && typeof data.context === "object" && !Array.isArray(data.context)
        ? (data.context as Record<string, unknown>)
        : null,
    actorUid: typeof data.actorUid === "string" ? data.actorUid : null,
    url: typeof data.url === "string" ? data.url : null,
    userAgent: typeof data.userAgent === "string" ? data.userAgent : null,
    createdAt: toIso(data.createdAt),
    lastAt: toIso(data.lastAt),
    resolvedAt: toIso(data.resolvedAt),
    resolvedBy: typeof data.resolvedBy === "string" ? data.resolvedBy : null,
  };
}

/** The most recent rows, newest first. The page filters them in memory. */
export const ERROR_LOG_LIMIT = 500;

export function subscribeToErrorLogs(
  onData: (logs: ErrorLogRecord[]) => void,
  onError: (error: FirestoreError) => void,
): () => void {
  return onSnapshot(
    query(collection(db, ERROR_LOGS_COLLECTION), orderBy("lastAt", "desc"), limitTo(ERROR_LOG_LIMIT)),
    (snapshot) => onData(snapshot.docs.map(deserialize)),
    onError,
  );
}

export async function setErrorLogStatus(id: string, status: ErrorLogStatus, adminUid: string): Promise<void> {
  await updateDoc(doc(db, ERROR_LOGS_COLLECTION, id), {
    status,
    resolvedAt: status === "resolved" ? serverTimestamp() : null,
    resolvedBy: status === "resolved" ? adminUid : null,
  });
}

export async function deleteErrorLog(id: string): Promise<void> {
  await deleteDoc(doc(db, ERROR_LOGS_COLLECTION, id));
}

/** Deletes in batches under Firestore's 500-write limit. */
export async function deleteErrorLogs(ids: string[]): Promise<void> {
  for (let start = 0; start < ids.length; start += 400) {
    const batch = writeBatch(db);
    for (const id of ids.slice(start, start + 400)) {
      batch.delete(doc(db, ERROR_LOGS_COLLECTION, id));
    }
    await batch.commit();
  }
}

// ── Reporting from the browser ───────────────────────────────────────────────

export interface ClientErrorReport {
  source: Exclude<ErrorLogSource, "payment" | "system">;
  /** Short, stable name of the step that failed — `checkout/submit`, `auth/sign-in`. */
  action: string;
  /** The thrown value. Its message and stack are what gets recorded. */
  error?: unknown;
  /** Used when there is no thrown value, or to say what the user was doing. */
  message?: string;
  severity?: ErrorLogSeverity;
  /** Ids and flags only — never what the shopper typed, and never a secret. */
  context?: Record<string, unknown>;
}

const SESSION_REPORT_CAP = 25;
let reported = 0;
const seen = new Set<string>();

function describe(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? "" };
  if (typeof error === "string") return { message: error, stack: "" };
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown };
    const message = typeof record.message === "string" ? record.message : "";
    return { message: record.code ? `${String(record.code)} ${message}`.trim() : message, stack: "" };
  }
  return { message: "", stack: "" };
}

/**
 * Tells the server something went wrong. Never throws, never waits for an answer, and gives
 * up quietly: after 25 reports in a page's lifetime, or for a failure it has already sent.
 */
export function reportClientError(report: ClientErrorReport): void {
  try {
    if (typeof window === "undefined" || reported >= SESSION_REPORT_CAP) return;

    const described = describe(report.error);
    const message = (
      report.message && described.message && report.message !== described.message
        ? `${report.message}: ${described.message}`
        : report.message || described.message || "Unknown error"
    ).slice(0, 400);

    const key = `${report.source}|${report.action}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    reported += 1;

    void (async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        // Reported as a guest; the report matters more than who sent it.
      }

      await fetch("/api/logs/report", {
        method: "POST",
        headers,
        keepalive: true,
        body: JSON.stringify({
          source: report.source,
          action: report.action,
          message,
          stack: described.stack.slice(0, 1500),
          url: `${window.location.pathname}${window.location.search}`.slice(0, 300),
          severity: report.severity ?? "error",
          context: report.context,
        }),
      });
    })().catch(() => undefined);
  } catch {
    // Reporting is never allowed to be the failure.
  }
}

function currentSource(): "admin" | "storefront" {
  const path = window.location.pathname;
  return path.startsWith("/account") || path.startsWith("/admin") ? "admin" : "storefront";
}

/** Noise a browser raises that no code of ours can fix and no admin can act on. */
function isIgnorable(message: string): boolean {
  return (
    !message ||
    /ResizeObserver loop/i.test(message) ||
    /^Script error\.?$/i.test(message) ||
    /Loading chunk|Failed to fetch dynamically imported module|importing a module script failed/i.test(message) ||
    /extension:\/\/|moz-extension|chrome-extension/i.test(message)
  );
}

let installed = false;

/** Catches what nothing else did: uncaught errors and promises rejected with no handler. */
export function installGlobalErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const message = event.message || describe(event.error).message;
    if (isIgnorable(message)) return;
    reportClientError({
      source: currentSource(),
      action: "window/error",
      error: event.error ?? message,
      message,
      context: event.filename ? { file: event.filename.split("/").pop(), line: event.lineno, column: event.colno } : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = describe(event.reason).message;
    if (isIgnorable(message)) return;
    reportClientError({
      source: currentSource(),
      action: "window/unhandled-rejection",
      error: event.reason,
      message: message || "Unhandled promise rejection",
    });
  });
}
