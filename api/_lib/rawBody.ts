// The exact bytes of a request body, for routes that verify a signature over them.
//
// A signature recomputed from `JSON.stringify(req.body)` only matches when the sender
// happened to serialise exactly the way V8 does — same key order, same spacing, same
// escaping of non-ASCII. The raw stream is the only thing worth hashing. Routes that use
// this must export `config = { api: { bodyParser: false } }`.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Returns null when something upstream already drained the request. */
export async function readRawBody(req: any): Promise<string | null> {
  if (typeof req.body === 'string') {
    return req.body;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body.toString('utf8');
  }

  // Already drained, or not a stream at all: either way the bytes are gone.
  if (req.readableEnded || req.readable === false || typeof req[Symbol.asyncIterator] !== 'function') {
    return null;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}
