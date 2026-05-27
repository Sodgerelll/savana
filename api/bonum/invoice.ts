// POST /api/bonum/invoice
// Creates a Bonum payment invoice and returns { invoiceId, followUpLink }.
// The followUpLink is a URL to Bonum's hosted payment page (used as QR content).
//
// Body: { amount: number, transactionId: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
import { bonumPost } from './_client.js';

interface InvoiceRequestBody {
  amount: number;
  transactionId: string;
}

interface BonumInvoiceResponse {
  invoiceId: string;
  followUpLink: string;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { amount, transactionId } = req.body as Partial<InvoiceRequestBody>;

  if (!amount || !transactionId) {
    res.status(400).json({ error: 'amount and transactionId are required' });
    return;
  }

  // Build the webhook callback URL so Bonum can notify us when payment completes.
  const baseUrl =
    process.env.BONUM_CALLBACK_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const callbackUrl = `${baseUrl}/api/bonum/webhook`;

  try {
    const result = await bonumPost<BonumInvoiceResponse>(
      '/bonum-gateway/ecommerce/invoices',
      {
        amount,
        transactionId,
        callback: callbackUrl,
        expiresIn: 3600, // 1 hour
      },
    );
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invoice creation failed';
    res.status(500).json({ error: message });
  }
}
