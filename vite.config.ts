import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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
  plugins: [react(), tailwindcss(), bonumDevPlugin()],
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
