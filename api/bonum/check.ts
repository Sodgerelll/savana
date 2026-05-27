// GET /api/bonum/check?invoiceId=xxx
// Checks invoice payment status with Bonum.
// Returns { paid: boolean, paymentVendor?, completedAt?, terminalId?, bonumAmount? }.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { bonumGet } from './_client';

interface BonumInvoiceBody {
  status?: string;
  invoiceStatus?: string;
  paymentVendor?: string;
  completedAt?: string;
  terminalId?: string | number;
  amount?: number;
  [key: string]: unknown;
}

interface BonumInvoiceStatus {
  status?: string;
  body?: BonumInvoiceBody;
  [key: string]: unknown;
}

export interface BonumCheckResult {
  paid: boolean;
  paymentVendor?: string;
  completedAt?: string;
  terminalId?: string;
  bonumAmount?: number;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { invoiceId } = req.query as { invoiceId?: string };

  if (!invoiceId) {
    res.status(400).json({ error: 'invoiceId query param is required' });
    return;
  }

  try {
    const result = await bonumGet<BonumInvoiceStatus>(
      `/bonum-gateway/ecommerce/invoices/${invoiceId}`,
    );

    const body = result?.body as BonumInvoiceBody | undefined;
    const topStatus = String(result?.status ?? '').toUpperCase();
    const bodyStatus = String(body?.status ?? body?.invoiceStatus ?? '').toUpperCase();
    const paid = topStatus === 'PAID' || bodyStatus === 'PAID' || topStatus === 'SUCCESS' || bodyStatus === 'SUCCESS';

    const response: BonumCheckResult = { paid };
    if (body?.paymentVendor) response.paymentVendor = String(body.paymentVendor);
    if (body?.completedAt) response.completedAt = String(body.completedAt);
    if (body?.terminalId != null) response.terminalId = String(body.terminalId);
    if (body?.amount != null) response.bonumAmount = Number(body.amount);

    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status check failed';
    res.status(500).json({ error: message });
  }
}
