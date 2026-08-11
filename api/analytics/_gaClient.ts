// Google Analytics 4 (GA4) Data API client — runs server-side in Vercel
// serverless functions only. Required environment variables:
//   GA4_PROPERTY_ID          — numeric GA4 property ID (Admin → Property Settings)
//   GA4_SERVICE_ACCOUNT_JSON — Service Account JSON key, granted Viewer access
//                              on the GA4 property (Admin → Property Access
//                              Management). Falls back to
//                              FIREBASE_SERVICE_ACCOUNT_JSON if that account
//                              was also granted GA4 Viewer access.

import { JWT } from 'google-auth-library';

const DATA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

let _client: JWT | null = null;

function getServiceAccountJson(): string | null {
  return process.env.GA4_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null;
}

export function isGa4Configured(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID) && Boolean(getServiceAccountJson());
}

function getClient(): JWT {
  if (_client) return _client;

  const serviceAccountJson = getServiceAccountJson();
  if (!serviceAccountJson) {
    throw new Error(
      'GA4 is not configured. Set GA4_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT_JSON) in the Vercel project environment variables.',
    );
  }

  const key = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
  _client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  });
  return _client;
}

async function getAccessToken(): Promise<string> {
  const client = getClient();
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error('Failed to obtain a GA4 access token.');
  }
  return token;
}

export async function runReport(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error('GA4_PROPERTY_ID is not configured in the Vercel project environment variables.');
  }

  const token = await getAccessToken();

  const res = await fetch(`${DATA_API_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message = (err['error'] as Record<string, unknown> | undefined)?.['message'];
    throw new Error(String(message ?? `GA4 runReport failed: ${res.status}`));
  }

  return res.json() as Promise<Record<string, unknown>>;
}

/** Runs several report requests in one HTTP round-trip. Returns each report in request order. */
export async function runBatchReport(requests: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    throw new Error('GA4_PROPERTY_ID is not configured in the Vercel project environment variables.');
  }

  const token = await getAccessToken();

  const res = await fetch(`${DATA_API_BASE}/properties/${propertyId}:batchRunReports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message = (err['error'] as Record<string, unknown> | undefined)?.['message'];
    throw new Error(String(message ?? `GA4 batchRunReports failed: ${res.status}`));
  }

  const data = (await res.json()) as { reports?: Record<string, unknown>[] };
  return data.reports ?? [];
}
