// POST /api/bonum/invoice
// Creates a Bonum payment invoice and returns { invoiceId, followUpLink }.
// The followUpLink is a URL to Bonum's hosted payment page (used as QR content).
//
// Body: { amount: number, transactionId: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
import { bonumCallbackUrl, bonumPost } from './_client.js';

interface InvoiceRequestBody {
  amount: number;
  transactionId: string;
  /** What the payment is for. Ends up on the statement, where an amount alone says nothing. */
  description?: string;
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

  const { amount, transactionId, description } = req.body as Partial<InvoiceRequestBody>;

  if (!amount || !transactionId) {
    res.status(400).json({ error: 'amount and transactionId are required' });
    return;
  }


  try {
    const result = await bonumPost<BonumInvoiceResponse>(
      '/bonum-gateway/ecommerce/invoices',
      {
        amount,
        transactionId,
        // Bonum ignores a field it does not know, so this is safe either way —
        // and where it is shown, a line reading "ORD-260825-YD2KI7 · Messenger"
        // is the difference between a statement anyone can reconcile and a
        // column of amounts.
        ...(description ? { description: String(description).slice(0, 120) } : {}),
        callback: bonumCallbackUrl(),
        expiresIn: 3600, // 1 hour
      },
    );
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invoice creation failed';
    console.error('[bonum/invoice] failed:', err);
    res.status(500).json({ error: message });
  }
}
