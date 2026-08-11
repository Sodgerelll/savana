import { useEffect, useState } from "react";
import { Activity, CalendarDays, CalendarRange, TrendingUp } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

interface GaSummary {
  today: number;
  last7Days: number;
  thisMonth: number;
  thisYear: number;
  updatedAt: string;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; data: GaSummary }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

export default function AnalyticsPage({ ctx }: { ctx: AdminCtx }) {
  const { language } = ctx;
  const mn = language === "MN";
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analytics/summary")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 503) {
          setState({ status: "unconfigured" });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed: ${res.status}`);
        }
        const data = (await res.json()) as GaSummary;
        setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formatNumber = (n: number) => n.toLocaleString(mn ? "mn-MN" : "en-US");

  const cards = [
    { icon: <CalendarDays size={18} />, label: mn ? "Өнөөдөр" : "Today", value: "today" as const },
    { icon: <CalendarRange size={18} />, label: mn ? "Сүүлийн 7 хоног" : "Last 7 days", value: "last7Days" as const },
    { icon: <TrendingUp size={18} />, label: mn ? "Энэ сар" : "This month", value: "thisMonth" as const },
    { icon: <Activity size={18} />, label: mn ? "Энэ жил" : "This year", value: "thisYear" as const },
  ];

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{mn ? "Google Analytics" : "Google Analytics"}</p>
          <h1>{mn ? "Хандалтын аналитик" : "Visitor analytics"}</h1>
          <p>
            {mn
              ? "Сайтын нийт хандалтыг (sessions) Google Analytics 4-ээс уншиж харуулна."
              : "Total site visits (sessions) pulled live from Google Analytics 4."}
          </p>
        </div>
      </div>

      {state.status === "loading" && (
        <div className="admin-section-card">
          <p>{mn ? "Ачааллаж байна..." : "Loading..."}</p>
        </div>
      )}

      {state.status === "unconfigured" && (
        <div className="admin-section-card">
          <div className="admin-section-head">
            <div>
              <h2>{mn ? "Google Analytics тохируулагдаагүй байна" : "Google Analytics is not configured"}</h2>
              <p>
                {mn
                  ? "Хандалтын статистик харуулахын тулд дараах орчны хувьсагчдыг тохируулна уу:"
                  : "Set the following environment variables to enable visitor analytics:"}
              </p>
            </div>
          </div>
          <div className="admin-structure-list">
            <code>GA4_PROPERTY_ID</code>
            <code>GA4_SERVICE_ACCOUNT_JSON</code>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="admin-section-card">
          <div className="admin-sync-error">{state.message}</div>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className="admin-stat-grid">
            {cards.map((card) => (
              <div key={card.value} className="admin-stat-card" aria-label={card.label}>
                <span>{card.label}</span>
                <strong>{formatNumber(state.data[card.value])}</strong>
              </div>
            ))}
          </div>
          <div className="admin-section-card">
            <p className="admin-kicker">
              {mn ? "Сүүлд шинэчилсэн" : "Last updated"}: {new Date(state.data.updatedAt).toLocaleString(mn ? "mn-MN" : "en-US")}
            </p>
          </div>
        </>
      )}
    </>
  );
}
