import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ─── Bonum dev API plugin ─────────────────────────────────────────────────────
// Runs the Bonum API routes directly inside the Vite dev server so you don't
// need `vercel dev`. Credentials are read from .env.local at startup.

function loadLocalEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
        .split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
        .map(l => {
          const eq = l.indexOf('=')
          return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^["']|["']$/g, '')]
        }),
    )
  } catch {
    return {}
  }
}

let _devToken: { value: string; expiresAt: number } | null = null
let _adminDb: unknown | null = null

async function getDevAdminDb(env: Record<string, string>): Promise<unknown> {
  if (_adminDb) return _adminDb
  const serviceAccountJson = env['FIREBASE_SERVICE_ACCOUNT_JSON']
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set')
  const { initializeApp, getApps, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson) as object) })
  }
  _adminDb = getFirestore()
  return _adminDb
}

async function getDevBonumToken(env: Record<string, string>): Promise<string> {
  if (_devToken && Date.now() < _devToken.expiresAt) return _devToken.value

  const base = env['BONUM_BASE_URL'] ?? 'https://apis.bonum.mn'
  const res = await fetch(`${base}/bonum-gateway/ecommerce/auth/create`, {
    method: 'GET',
    headers: {
      Authorization: `AppSecret ${env['BONUM_APP_SECRET'] ?? ''}`,
      'X-TERMINAL-ID': env['BONUM_TERMINAL_ID'] ?? '',
      'Accept-Language': 'mn',
    },
  })

  if (res.status === 429 && _devToken) return _devToken.value

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new Error(String(body['message'] ?? `Bonum auth failed (${res.status})`))
  }

  const data = await res.json() as { accessToken: string; expiresIn: number }
  _devToken = { value: data.accessToken, expiresAt: Date.now() + (data.expiresIn - 300) * 1000 }
  return _devToken.value
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise(ok => {
    let buf = ''
    req.on('data', (c: Buffer) => { buf += c.toString() })
    req.on('end', () => { try { ok(JSON.parse(buf) as Record<string, unknown>) } catch { ok({}) } })
    req.on('error', () => ok({}))
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = status
  res.end(JSON.stringify(body))
}

// ─── Analytics dev API plugin ──────────────────────────────────────────────
// Mirrors api/analytics/summary.ts so `/api/analytics/summary` works under
// plain `vite` dev without needing `vercel dev`. Uses an in-memory-only cache
// (no Firestore round-trip) since this only runs locally.

interface GaSummary {
  today: number;
  last7Days: number;
  thisMonth: number;
  thisYear: number;
  updatedAt: string;
}

let _devGaClient: import('google-auth-library').JWT | null = null
let _devGaSummaryCache: { value: GaSummary; expiresAt: number } | null = null

function isoDateInUlaanbaatar(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseDevSessionCount(report: unknown, rangeName: string): number {
  const rows = ((report as { rows?: unknown[] })?.rows ?? []) as Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>
  const row = rows.find((r) => r.dimensionValues?.[0]?.value === rangeName)
  const raw = row?.metricValues?.[0]?.value
  const parsed = raw ? Number(raw) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

async function fetchDevGaSummary(env: Record<string, string>): Promise<GaSummary> {
  const propertyId = env['GA4_PROPERTY_ID']
  const serviceAccountJson = env['GA4_SERVICE_ACCOUNT_JSON'] || env['FIREBASE_SERVICE_ACCOUNT_JSON']
  if (!propertyId || !serviceAccountJson) {
    throw new Error('GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON not set in .env.local')
  }

  if (!_devGaClient) {
    const { JWT } = await import('google-auth-library')
    const key = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }
    _devGaClient = new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
  }

  const { token } = await _devGaClient.getAccessToken()
  if (!token) throw new Error('Failed to obtain a GA4 access token')

  const now = new Date()
  const monthStart = isoDateInUlaanbaatar(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
  const yearStart = isoDateInUlaanbaatar(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)))

  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [
        { startDate: 'today', endDate: 'today', name: 'today' },
        { startDate: '6daysAgo', endDate: 'today', name: 'last7Days' },
        { startDate: monthStart, endDate: 'today', name: 'thisMonth' },
        { startDate: yearStart, endDate: 'today', name: 'thisYear' },
      ],
      metrics: [{ name: 'sessions' }],
    }),
  })

  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as Record<string, unknown>
    const message = (err['error'] as Record<string, unknown> | undefined)?.['message']
    throw new Error(String(message ?? `GA4 runReport failed: ${r.status}`))
  }

  const report = await r.json()
  return {
    today: parseDevSessionCount(report, 'today'),
    last7Days: parseDevSessionCount(report, 'last7Days'),
    thisMonth: parseDevSessionCount(report, 'thisMonth'),
    thisYear: parseDevSessionCount(report, 'thisYear'),
    updatedAt: new Date().toISOString(),
  }
}

interface GaChartData {
  trend: Array<{ date: string; sessions: number }>;
  devices: Array<{ device: string; sessions: number }>;
  channels: Array<{ channel: string; sessions: number }>;
  topPages: Array<{ path: string; pageviews: number }>;
  updatedAt: string;
}

let _devGaChartsCache: { value: GaChartData; expiresAt: number } | null = null

function devRows(report: unknown): Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> {
  return ((report as { rows?: unknown[] })?.rows ?? []) as Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>
}

function devNum(value: string | undefined): number {
  const parsed = value ? Number(value) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDevGaDate(value: string | undefined): string {
  if (!value || value.length !== 8) return value ?? ''
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

async function fetchDevGaChartData(env: Record<string, string>): Promise<GaChartData> {
  const propertyId = env['GA4_PROPERTY_ID']
  const serviceAccountJson = env['GA4_SERVICE_ACCOUNT_JSON'] || env['FIREBASE_SERVICE_ACCOUNT_JSON']
  if (!propertyId || !serviceAccountJson) {
    throw new Error('GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON not set in .env.local')
  }

  if (!_devGaClient) {
    const { JWT } = await import('google-auth-library')
    const key = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }
    _devGaClient = new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] })
  }

  const { token } = await _devGaClient.getAccessToken()
  if (!token) throw new Error('Failed to obtain a GA4 access token')

  const dateRange = { startDate: '29daysAgo', endDate: 'today' }

  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
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
      ],
    }),
  })

  if (!r.ok) {
    const err = await r.json().catch(() => ({})) as Record<string, unknown>
    const message = (err['error'] as Record<string, unknown> | undefined)?.['message']
    throw new Error(String(message ?? `GA4 batchRunReports failed: ${r.status}`))
  }

  const data = await r.json() as { reports?: unknown[] }
  const [trendReport, devicesReport, channelsReport, pagesReport] = data.reports ?? []

  return {
    trend: devRows(trendReport).map((row) => ({
      date: formatDevGaDate(row.dimensionValues?.[0]?.value),
      sessions: devNum(row.metricValues?.[0]?.value),
    })),
    devices: devRows(devicesReport).map((row) => ({
      device: row.dimensionValues?.[0]?.value ?? 'unknown',
      sessions: devNum(row.metricValues?.[0]?.value),
    })),
    channels: devRows(channelsReport).map((row) => ({
      channel: row.dimensionValues?.[0]?.value ?? 'Unassigned',
      sessions: devNum(row.metricValues?.[0]?.value),
    })),
    topPages: devRows(pagesReport).map((row) => ({
      path: row.dimensionValues?.[0]?.value ?? '/',
      pageviews: devNum(row.metricValues?.[0]?.value),
    })),
    updatedAt: new Date().toISOString(),
  }
}

function analyticsDevPlugin(): Plugin {
  const env = loadLocalEnv()

  return {
    name: 'analytics-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''

        if (url.startsWith('/api/analytics/summary') && req.method === 'GET') {
          const propertyId = env['GA4_PROPERTY_ID']
          const serviceAccountJson = env['GA4_SERVICE_ACCOUNT_JSON'] || env['FIREBASE_SERVICE_ACCOUNT_JSON']
          if (!propertyId || !serviceAccountJson) {
            json(res, 503, { error: 'Google Analytics is not configured (GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON).' })
            return
          }
          try {
            if (_devGaSummaryCache && Date.now() < _devGaSummaryCache.expiresAt) {
              json(res, 200, _devGaSummaryCache.value)
              return
            }
            const value = await fetchDevGaSummary(env)
            _devGaSummaryCache = { value, expiresAt: Date.now() + 10 * 60 * 1000 }
            json(res, 200, value)
          } catch (e) {
            json(res, 500, { error: e instanceof Error ? e.message : 'Analytics summary failed' })
          }
          return
        }

        if (url.startsWith('/api/analytics/charts') && req.method === 'GET') {
          const propertyId = env['GA4_PROPERTY_ID']
          const serviceAccountJson = env['GA4_SERVICE_ACCOUNT_JSON'] || env['FIREBASE_SERVICE_ACCOUNT_JSON']
          if (!propertyId || !serviceAccountJson) {
            json(res, 503, { error: 'Google Analytics is not configured (GA4_PROPERTY_ID / GA4_SERVICE_ACCOUNT_JSON).' })
            return
          }
          try {
            if (_devGaChartsCache && Date.now() < _devGaChartsCache.expiresAt) {
              json(res, 200, _devGaChartsCache.value)
              return
            }
            const value = await fetchDevGaChartData(env)
            _devGaChartsCache = { value, expiresAt: Date.now() + 20 * 60 * 1000 }
            json(res, 200, value)
          } catch (e) {
            json(res, 500, { error: e instanceof Error ? e.message : 'Analytics charts failed' })
          }
          return
        }

        next()
      })
    },
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function bonumDevPlugin(): Plugin {
  const env = loadLocalEnv()

  return {
    name: 'bonum-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''
        const base = env['BONUM_BASE_URL'] ?? 'https://apis.bonum.mn'

        // ── POST /api/bonum/invoice ──────────────────────────────────────
        if (url === '/api/bonum/invoice' && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const { amount, transactionId } = body as { amount?: number; transactionId?: string }

            if (!amount || !transactionId) {
              json(res, 400, { error: 'amount and transactionId are required' })
              return
            }

            const token = await getDevBonumToken(env)
            const callbackUrl = `http://localhost:5173/api/bonum/webhook`

            const r = await fetch(`${base}/bonum-gateway/ecommerce/invoices`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept-Language': 'mn',
              },
              body: JSON.stringify({ amount, transactionId, callback: callbackUrl, expiresIn: 3600 }),
            })

            if (!r.ok) {
              const err = await r.json().catch(() => ({})) as Record<string, unknown>
              json(res, 500, { error: String(err['message'] ?? `Bonum invoice error: ${r.status}`) })
              return
            }

            json(res, 200, await r.json())
          } catch (e) {
            json(res, 500, { error: e instanceof Error ? e.message : 'Invoice creation failed' })
          }
          return
        }

        // ── GET /api/bonum/check?invoiceId=xxx ───────────────────────────
        if (url.startsWith('/api/bonum/check') && req.method === 'GET') {
          try {
            const invoiceId = new URL(url, 'http://localhost').searchParams.get('invoiceId')

            if (!invoiceId) {
              json(res, 400, { error: 'invoiceId required' })
              return
            }

            const token = await getDevBonumToken(env)
            const r = await fetch(`${base}/bonum-gateway/ecommerce/invoices/${invoiceId}`, {
              headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'mn' },
            })

            if (!r.ok) {
              const err = await r.json().catch(() => ({})) as Record<string, unknown>
              json(res, 500, { error: String(err['message'] ?? `Check failed: ${r.status}`) })
              return
            }

            const data = await r.json() as Record<string, unknown>
            const body = (data['body'] ?? data) as Record<string, unknown>
            const statusStr = String(
              (data['status'] ?? body['status'] ?? body['invoiceStatus'] ?? ''),
            ).toUpperCase()
            const paid = statusStr === 'PAID' || statusStr === 'SUCCESS'

            const result: Record<string, unknown> = { paid }
            if (body['paymentVendor']) result['paymentVendor'] = String(body['paymentVendor'])
            if (body['completedAt']) result['completedAt'] = String(body['completedAt'])
            if (body['terminalId'] != null) result['terminalId'] = String(body['terminalId'])
            if (body['amount'] != null) result['bonumAmount'] = Number(body['amount'])

            json(res, 200, result)
          } catch (e) {
            json(res, 500, { error: e instanceof Error ? e.message : 'Status check failed' })
          }
          return
        }

        // ── GET /api/orders/lookup?orderNumber=xxx ───────────────────────
        if (url.startsWith('/api/orders/lookup') && req.method === 'GET') {
          try {
            const orderNumber = new URL(url, 'http://localhost').searchParams.get('orderNumber')
            if (!orderNumber?.trim()) {
              json(res, 400, { error: 'orderNumber is required' })
              return
            }
            const db = await getDevAdminDb(env) as {
              collection: (name: string) => {
                where: (...args: unknown[]) => { limit: (n: number) => { get: () => Promise<{ empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> }> } }
              }
            }
            const snapshot = await db.collection('orders')
              .where('orderNumber', '==', orderNumber.toUpperCase().trim())
              .limit(1)
              .get()
            if (snapshot.empty) {
              json(res, 404, { error: 'Order not found' })
              return
            }
            const data = snapshot.docs[0].data()
            json(res, 200, {
              orderNumber: data['orderNumber'],
              status: data['status'],
              items: ((data['items'] ?? []) as Record<string, unknown>[]).map((item) => ({
                productId: item['productId'],
                name: item['name'],
                image: item['image'] ?? null,
                variant: item['variant'] ?? null,
                quantity: item['quantity'],
                unitPrice: item['unitPrice'],
                lineTotal: item['lineTotal'],
              })),
              totals: {
                subtotal: (data['totals'] as Record<string, unknown>)?.['subtotal'] ?? 0,
                shippingFee: (data['totals'] as Record<string, unknown>)?.['shippingFee'] ?? 0,
                grandTotal: (data['totals'] as Record<string, unknown>)?.['grandTotal'] ?? 0,
              },
              createdAt: data['createdAt'] ?? null,
            })
          } catch (e) {
            json(res, 500, { error: e instanceof Error ? e.message : 'Order lookup failed' })
          }
          return
        }

        next()
      })
    },
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    bonumDevPlugin(),
    analyticsDevPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'vite.svg'],
      manifest: {
        name: 'SAVANA — Natural Handcrafted Soap & Skincare',
        short_name: 'SAVANA',
        description: 'SAVANA дэлгүүр ба админ удирдлагын систем',
        lang: 'mn',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#f3efe6',
        background_color: '#f3efe6',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Админ самбар',
            short_name: 'Админ',
            url: '/account',
            icons: [{ src: '/pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'Захиалгууд',
            short_name: 'Захиалга',
            url: '/account/orders',
            icons: [{ src: '/pwa-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Never serve the SPA shell for API or Firebase traffic. The /__/ paths
        // are the proxied Firebase auth helper — the service worker must let
        // them hit the network or redirect sign-in breaks in the installed PWA.
        navigateFallbackDenylist: [/^\/api\//, /^\/__\//],
        runtimeCaching: [
          {
            // Firestore/Firebase realtime traffic must always hit the network
            urlPattern: /^https:\/\/(firestore|firebasestorage|identitytoolkit|securetoken)\.googleapis\.com\/.*/,
            handler: 'NetworkOnly',
          },
          {
            // Uploaded storefront images
            urlPattern: /^https:\/\/.*\.(?:googleusercontent|firebasestorage)\.com\/.*\.(?:png|jpg|jpeg|webp|gif)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'remote-images',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // Vitest defaults to five seconds. The webhook and widget suites drive a
    // whole request through fake Firestore and fake Graph calls, which is fast
    // on an idle machine and not always fast on a busy one — two of them failed
    // intermittently for no reason but load. None of these tests wait on
    // anything real, so a generous ceiling costs nothing and stops the suite
    // reporting a problem that is not there.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
