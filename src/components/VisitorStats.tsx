import { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";

interface GaSummary {
  today: number;
  last7Days: number;
  thisMonth: number;
  thisYear: number;
  updatedAt: string;
}

const CACHE_KEY = "savana_ga_summary_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function readCache(): GaSummary | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: GaSummary; expiresAt: number };
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache(value: GaSummary): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ value, expiresAt: Date.now() + CACHE_TTL_MS }));
  } catch {
    // best-effort — ignore storage failures (e.g. private browsing)
  }
}

export default function VisitorStats() {
  const { language } = useLanguage();
  const [data, setData] = useState<GaSummary | null>(() => readCache());

  useEffect(() => {
    if (data) return;
    let cancelled = false;
    fetch("/api/analytics/summary")
      .then((res) => (res.ok ? (res.json() as Promise<GaSummary>) : null))
      .then((summary) => {
        if (cancelled || !summary) return;
        writeCache(summary);
        setData(summary);
      })
      .catch(() => {
        // fail silently — the public footer must never break for this
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!data) return null;

  const mn = language === "MN";
  const formatNumber = (n: number) => n.toLocaleString(mn ? "mn-MN" : "en-US");

  const items: Array<[string, number]> = [
    [mn ? "Өнөөдөр" : "Today", data.today],
    [mn ? "7 хоног" : "7 days", data.last7Days],
    [mn ? "Сар" : "Month", data.thisMonth],
    [mn ? "Жил" : "Year", data.thisYear],
  ];

  return (
    <div className="visitor-stats" aria-label={mn ? "Сайтын хандалтын тоо" : "Site visitor stats"}>
      {items.map(([label, value]) => (
        <span key={label} className="visitor-stats-item">
          <span className="visitor-stats-label">{label}</span>
          <span className="visitor-stats-value">{formatNumber(value)}</span>
        </span>
      ))}
    </div>
  );
}
