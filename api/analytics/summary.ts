// GET /api/analytics/summary
// Public endpoint — total site visits (GA4 `sessions`) for today, last 7 days,
// this month, and this year. Powers the admin Analytics dashboard and the
// public footer visitor-stats widget. No PII, safe to expose without auth.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { isGa4Configured, runReport } from './_gaClient.js';

interface Summary {
  today: number;
  last7Days: number;
  thisMonth: number;
  thisYear: number;
  updatedAt: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_COLLECTION = '_system';
const CACHE_DOC = 'gaSummaryCache';

let _memoryCache: { value: Summary; expiresAt: number } | null = null;

// Property reporting timezone assumed for month/year boundaries. GA4 itself
// resolves "today"/"7daysAgo" using the property's own configured timezone.
const REPORT_TIMEZONE = 'Asia/Ulaanbaatar';

function isoDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function readPersistedSummary(): Promise<{ value: Summary; expiresAt: number } | null> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) return null;
  try {
    const db = await dbPromise;
    const snap = await db.collection(CACHE_COLLECTION).doc(CACHE_DOC).get();
    if (!snap.exists) return null;
    const data = snap.data() as { value?: Summary; expiresAt?: number };
    if (!data.value || !data.expiresAt) return null;
    return { value: data.value, expiresAt: data.expiresAt };
  } catch {
    return null; // best-effort — fall back to fetching fresh data
  }
}

async function writePersistedSummary(entry: { value: Summary; expiresAt: number }): Promise<void> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    await db.collection(CACHE_COLLECTION).doc(CACHE_DOC).set(entry);
  } catch {
    // best-effort — ignore persistence failures
  }
}

function parseSessionCount(report: any, rangeName: string): number {
  const rows = (report?.rows ?? []) as Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  const row = rows.find((r) => r.dimensionValues?.[0]?.value === rangeName);
  const raw = row?.metricValues?.[0]?.value;
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchFreshSummary(): Promise<Summary> {
  const now = new Date();
  const monthStart = isoDateInTimezone(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), REPORT_TIMEZONE);
  const yearStart = isoDateInTimezone(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), REPORT_TIMEZONE);

  const report = await runReport({
    dateRanges: [
      { startDate: 'today', endDate: 'today', name: 'today' },
      { startDate: '6daysAgo', endDate: 'today', name: 'last7Days' },
      { startDate: monthStart, endDate: 'today', name: 'thisMonth' },
      { startDate: yearStart, endDate: 'today', name: 'thisYear' },
    ],
    metrics: [{ name: 'sessions' }],
  });

  return {
    today: parseSessionCount(report, 'today'),
    last7Days: parseSessionCount(report, 'last7Days'),
    thisMonth: parseSessionCount(report, 'thisMonth'),
    thisYear: parseSessionCount(report, 'thisYear'),
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isGa4Configured()) {
    res.status(503).json({ error: 'Google Analytics is not configured (GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON).' });
    return;
  }

  try {
    if (_memoryCache && Date.now() < _memoryCache.expiresAt) {
      res.status(200).json(_memoryCache.value);
      return;
    }

    const persisted = await readPersistedSummary();
    if (persisted && Date.now() < persisted.expiresAt) {
      _memoryCache = persisted;
      res.status(200).json(persisted.value);
      return;
    }

    const value = await fetchFreshSummary();
    const entry = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    _memoryCache = entry;
    await writePersistedSummary(entry);

    res.status(200).json(value);
  } catch (err) {
    console.error('[analytics/summary] failed:', err);
    // Serve a stale cached value rather than breaking the public footer, if we have one.
    if (_memoryCache) {
      res.status(200).json(_memoryCache.value);
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
