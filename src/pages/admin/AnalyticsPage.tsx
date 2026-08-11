/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Activity, CalendarDays, CalendarRange, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { AdminCtx } from "./adminShellTypes";

interface GaSummary {
  today: number;
  last7Days: number;
  thisMonth: number;
  thisYear: number;
  updatedAt: string;
}

interface GaChartData {
  trend: Array<{ date: string; sessions: number }>;
  devices: Array<{ device: string; sessions: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topPages: Array<{ path: string; pageviews: number }>;
  updatedAt: string;
}

type FetchState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "unconfigured" }
  | { status: "error"; message: string };

// One brand hue for every magnitude/trend chart (matches --color-accent), and a
// validated 3-hue categorical set (see dataviz skill palette.md) reserved for the
// one true identity chart on this page — the device part-to-whole breakdown.
const ACCENT = "#5A5103";
const GRIDLINE = "#D8D9CD";
const AXIS_INK = "#8a8579";
const TEXT_SECONDARY = "#57524a";
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a"];

const CHANNEL_LABELS_MN: Record<string, string> = {
  Direct: "Шууд хандалт",
  "Organic Search": "Байгалийн хайлт",
  "Paid Search": "Төлбөртэй хайлт",
  "Organic Social": "Сошиал (байгалийн)",
  "Paid Social": "Сошиал (реклам)",
  Referral: "Холбоос сайт",
  Email: "И-мэйл",
  Affiliates: "Түншлэл",
  Display: "Display реклам",
  Unassigned: "Тодорхойгүй",
  "Organic Video": "Видео (байгалийн)",
  "Paid Video": "Видео (реклам)",
  Audio: "Аудио",
  SMS: "SMS",
};

function useAnalyticsFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(url)
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
        const data = (await res.json()) as T;
        setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: "error", message: err instanceof Error ? err.message : "Unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

function formatNumber(n: number, mn: boolean): string {
  return n.toLocaleString(mn ? "mn-MN" : "en-US");
}

function formatShortDate(iso: string, mn: boolean): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(mn ? "mn-MN" : "en-US", { month: "2-digit", day: "2-digit" });
}

function deviceLabel(device: string, mn: boolean): string {
  const key = device.toLowerCase();
  if (!mn) return device.charAt(0).toUpperCase() + device.slice(1);
  if (key === "desktop") return "Компьютер";
  if (key === "mobile") return "Гар утас";
  if (key === "tablet") return "Таблет";
  return "Бусад";
}

function channelLabel(channel: string, mn: boolean): string {
  if (!mn) return channel;
  return CHANNEL_LABELS_MN[channel] ?? channel;
}

function pageLabel(path: string, mn: boolean): string {
  if (path === "/") return mn ? "Нүүр хуудас" : "Home";
  return path;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Ranked horizontal bar chart — reused for both the channel and top-pages breakdowns. */
function RankedBarChart({
  rows,
  nameKey,
  valueKey,
  formatName,
  formatValue,
}: {
  rows: Array<Record<string, string | number>>;
  nameKey: string;
  valueKey: string;
  formatName: (raw: string) => string;
  formatValue: (n: number) => string;
}) {
  const height = Math.max(120, rows.length * 34 + 16);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRIDLINE} horizontal={false} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey={nameKey}
          tickFormatter={(value: unknown) => truncate(formatName(String(value)), 26)}
          width={150}
          tick={{ fontSize: 11, fill: TEXT_SECONDARY }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value: any) => [formatValue(Number(value)), ""]}
          labelFormatter={(value: any) => formatName(String(value))}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRIDLINE}` }}
        />
        <Bar dataKey={valueKey} fill={ACCENT} radius={[0, 4, 4, 0]} barSize={16}>
          <LabelList
            dataKey={valueKey}
            position="right"
            formatter={(value: any) => formatValue(Number(value))}
            style={{ fontSize: 11, fill: TEXT_SECONDARY }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AnalyticsPage({ ctx }: { ctx: AdminCtx }) {
  const { language } = ctx;
  const mn = language === "MN";

  const summaryState = useAnalyticsFetch<GaSummary>("/api/analytics/summary");
  const chartsState = useAnalyticsFetch<GaChartData>("/api/analytics/charts");

  const cards = [
    { icon: <CalendarDays size={18} />, label: mn ? "Өнөөдөр" : "Today", value: "today" as const },
    { icon: <CalendarRange size={18} />, label: mn ? "Сүүлийн 7 хоног" : "Last 7 days", value: "last7Days" as const },
    { icon: <TrendingUp size={18} />, label: mn ? "Энэ сар" : "This month", value: "thisMonth" as const },
    { icon: <Activity size={18} />, label: mn ? "Энэ жил" : "This year", value: "thisYear" as const },
  ];

  const isUnconfigured = summaryState.status === "unconfigured" || chartsState.status === "unconfigured";

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">Google Analytics</p>
          <h1>{mn ? "Хандалтын аналитик" : "Visitor analytics"}</h1>
          <p>
            {mn
              ? "Сайтын хандалтыг (sessions) Google Analytics 4-ээс уншиж, өдөр, төхөөрөмж, эх сурвалж, хуудсаар нь харуулна."
              : "Site visits (sessions) pulled live from Google Analytics 4 — broken down by day, device, channel, and page."}
          </p>
        </div>
      </div>

      {isUnconfigured && (
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

      {!isUnconfigured && (
        <>
          {summaryState.status === "loading" && (
            <div className="admin-section-card">
              <p>{mn ? "Ачааллаж байна..." : "Loading..."}</p>
            </div>
          )}

          {summaryState.status === "error" && (
            <div className="admin-section-card">
              <div className="admin-sync-error">{summaryState.message}</div>
            </div>
          )}

          {summaryState.status === "ready" && (
            <>
              <div className="admin-stat-grid">
                {cards.map((card) => (
                  <div key={card.value} className="admin-stat-card" aria-label={card.label}>
                    <span>{card.label}</span>
                    <strong>{formatNumber(summaryState.data[card.value], mn)}</strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {chartsState.status === "loading" && (
            <div className="admin-section-card">
              <p>{mn ? "Чартууд ачааллаж байна..." : "Loading charts..."}</p>
            </div>
          )}

          {chartsState.status === "error" && (
            <div className="admin-section-card">
              <div className="admin-sync-error">{chartsState.message}</div>
            </div>
          )}

          {chartsState.status === "ready" && (
            <>
              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{mn ? "Хандалтын хандлага (сүүлийн 30 хоног)" : "Visit trend (last 30 days)"}</h2>
                    <p>{mn ? "Өдөр тутмын нийт хандалт (sessions)." : "Daily total sessions."}</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartsState.data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gaTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRIDLINE} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: any) => formatShortDate(String(value), mn)}
                      tick={{ fontSize: 11, fill: AXIS_INK }}
                      tickLine={false}
                      axisLine={{ stroke: GRIDLINE }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: AXIS_INK }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                      allowDecimals={false}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatNumber(Number(value), mn), mn ? "Хандалт" : "Sessions"]}
                      labelFormatter={(value: any) => formatShortDate(String(value), mn)}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRIDLINE}` }}
                    />
                    <Area type="monotone" dataKey="sessions" stroke={ACCENT} strokeWidth={2} fill="url(#gaTrendFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{mn ? "Төхөөрөмжийн төрөл" : "Device breakdown"}</h2>
                    <p>{mn ? "Сүүлийн 30 хоногийн хандалтын төхөөрөмжөөрх хуваарилалт." : "Last 30 days of sessions split by device."}</p>
                  </div>
                </div>
                {(() => {
                  const devices = chartsState.data.devices;
                  const total = devices.reduce((sum, d) => sum + d.sessions, 0);
                  const row: Record<string, string | number> = { name: "devices" };
                  devices.forEach((d) => {
                    row[d.device] = d.sessions;
                  });
                  return (
                    <>
                      <div className="visitor-chart-stack-wrap">
                        <ResponsiveContainer width="100%" height={56}>
                          <BarChart layout="vertical" data={[row]} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" hide />
                            <Tooltip
                              formatter={(value: any, key: any) => [formatNumber(Number(value), mn), deviceLabel(String(key), mn)]}
                              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${GRIDLINE}` }}
                            />
                            {devices.map((d, i) => (
                              <Bar key={d.device} dataKey={d.device} stackId="devices" fill={CATEGORICAL[i % CATEGORICAL.length]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="visitor-chart-legend">
                        {devices.map((d, i) => (
                          <span key={d.device} className="visitor-chart-legend-item">
                            <span className="visitor-chart-legend-dot" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                            <span>{deviceLabel(d.device, mn)}</span>
                            <strong>{formatNumber(d.sessions, mn)}</strong>
                            <small>{total > 0 ? Math.round((d.sessions / total) * 100) : 0}%</small>
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{mn ? "Хандалтын эх сурвалж" : "Traffic channel"}</h2>
                    <p>{mn ? "Хэрэглэгч ямар сувгаар ирснийг харуулна." : "Which channels sessions came through."}</p>
                  </div>
                </div>
                <RankedBarChart
                  rows={chartsState.data.channels}
                  nameKey="channel"
                  valueKey="sessions"
                  formatName={(raw) => channelLabel(raw, mn)}
                  formatValue={(n) => formatNumber(n, mn)}
                />
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{mn ? "Хамгийн их үзсэн хуудас" : "Top pages"}</h2>
                    <p>{mn ? "Сүүлийн 30 хоногт хамгийн их үзэгдсэн 10 хуудас." : "The 10 most-viewed pages in the last 30 days."}</p>
                  </div>
                </div>
                <RankedBarChart
                  rows={chartsState.data.topPages}
                  nameKey="path"
                  valueKey="pageviews"
                  formatName={(raw) => pageLabel(raw, mn)}
                  formatValue={(n) => formatNumber(n, mn)}
                />
              </div>

              <div className="admin-section-card">
                <p className="admin-kicker">
                  {mn ? "Сүүлд шинэчилсэн" : "Last updated"}:{" "}
                  {new Date(chartsState.data.updatedAt).toLocaleString(mn ? "mn-MN" : "en-US")}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
