// GET /api/analytics/charts
// Public endpoint — a small set of GA4 breakdowns (daily trend, device split,
// traffic channel, top pages) for the last 30 days, powering the admin
// Analytics dashboard's charts. No PII, safe to expose without auth.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAdminFirestore } from '../bonum/_firebaseAdmin.js';
import { isGa4Configured, runBatchReport } from './_gaClient.js';

interface ChartData {
  trend: Array<{ date: string; sessions: number }>;
  devices: Array<{ device: string; sessions: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topPages: Array<{ path: string; pageviews: number }>;
  updatedAt: string;
}

const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
const CACHE_COLLECTION = '_system';
const CACHE_DOC = 'gaChartsCache';

let _memoryCache: { value: ChartData; expiresAt: number } | null = null;

async function readPersisted(): Promise<{ value: ChartData; expiresAt: number } | null> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) return null;
  try {
    const db = await dbPromise;
    const snap = await db.collection(CACHE_COLLECTION).doc(CACHE_DOC).get();
    if (!snap.exists) return null;
    const data = snap.data() as { value?: ChartData; expiresAt?: number };
    if (!data.value || !data.expiresAt) return null;
    return { value: data.value, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

async function writePersisted(entry: { value: ChartData; expiresAt: number }): Promise<void> {
  const dbPromise = getAdminFirestore();
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    await db.collection(CACHE_COLLECTION).doc(CACHE_DOC).set(entry);
  } catch {
    // best-effort — ignore persistence failures
  }
}

function rows(report: any): Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> {
  return (report?.rows ?? []) as Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
}

function num(value: string | undefined): number {
  const parsed = value ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

// GA4 returns the `date` dimension as "YYYYMMDD" — normalize to ISO for the frontend.
function formatGaDate(value: string | undefined): string {
  if (!value || value.length !== 8) return value ?? '';
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

async function fetchFreshChartData(): Promise<ChartData> {
  const dateRange = { startDate: '29daysAgo', endDate: 'today' };

  const [trendReport, devicesReport, channelsReport, pagesReport] = await runBatchReport([
    {
      dateRanges: [dateRange],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
    {
      dateRanges: [dateRange],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    },
    {
      dateRanges: [dateRange],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '8',
    },
    {
      dateRanges: [dateRange],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: '10',
    },
  ]);

  return {
    trend: rows(trendReport).map((row) => ({
      date: formatGaDate(row.dimensionValues?.[0]?.value),
      sessions: num(row.metricValues?.[0]?.value),
    })),
    devices: rows(devicesReport).map((row) => ({
      device: row.dimensionValues?.[0]?.value ?? 'unknown',
      sessions: num(row.metricValues?.[0]?.value),
    })),
    channels: rows(channelsReport).map((row) => ({
      channel: row.dimensionValues?.[0]?.value ?? 'Unassigned',
      sessions: num(row.metricValues?.[0]?.value),
    })),
    topPages: rows(pagesReport).map((row) => ({
      path: row.dimensionValues?.[0]?.value ?? '/',
      pageviews: num(row.metricValues?.[0]?.value),
    })),
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

    const persisted = await readPersisted();
    if (persisted && Date.now() < persisted.expiresAt) {
      _memoryCache = persisted;
      res.status(200).json(persisted.value);
      return;
    }

    const value = await fetchFreshChartData();
    const entry = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    _memoryCache = entry;
    await writePersisted(entry);

    res.status(200).json(value);
  } catch (err) {
    console.error('[analytics/charts] failed:', err);
    if (_memoryCache) {
      res.status(200).json(_memoryCache.value);
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
}
