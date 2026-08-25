import { readFileSync, writeFileSync } from 'node:fs';

function edit(file, pairs) {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.split('\r\n').join('\n');
  for (const [from, to] of pairs) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${file}: expected 1, found ${count} for:\n${from.slice(0, 110)}`);
    text = text.replace(from, to);
  }
  writeFileSync(file, crlf ? text.split('\n').join('\r\n') : text);
  console.log('patched', file);
}

edit('api/chat/widget.ts', [
  [
`import { placeChatOrder } from './_lib/chatOrder.js';`,
`import { placeChatOrder } from './_lib/chatOrder.js';
import { sweepPendingChatPayments } from './_lib/orderPaid.js';`,
  ],
  [
`    timing.mark('tools');
    res.setHeader('Server-Timing', timing.header());
    res.status(200).json({ reply: text, products, handedOver, payUrl });`,
`    timing.mark('tools');

    // The same net the Messenger webhook casts. A shop whose customers arrive
    // through the site would otherwise never run it, and a payment the webhook
    // dropped would sit unnoticed until somebody asked where their soap was.
    try {
      await sweepPendingChatPayments(db);
    } catch (err) {
      console.warn('[chat/widget] payment sweep failed:', (err as Error).message);
    }

    res.setHeader('Server-Timing', timing.header());
    res.status(200).json({ reply: text, products, handedOver, payUrl });`,
  ],
]);
