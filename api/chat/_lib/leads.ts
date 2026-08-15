// Capturing chat requests as leads, and the phone/name parsing that fills them.
//
// A lead is deliberately NOT an order: the bot never creates one in `orders`.
// An admin reviews the lead and converts it, so a misparsed chat cannot put a
// bogus row into the ledger.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const LEADS_COLLECTION = 'chat_leads';

export type ChatLeadType = 'order' | 'inquiry' | 'complaint' | 'callback';

export interface ChatLeadItemInput {
  productId: number | null;
  name: string;
  variant: string | null;
  quantity: number;
}

export interface CreateChatLeadInput {
  type: ChatLeadType;
  conversationId: string;
  channel: string;
  customerName: string;
  customerPhone: string;
  note: string;
  items: ChatLeadItemInput[];
}

/**
 * A Mongolian mobile number: exactly 8 digits starting 6, 7, 8 or 9.
 *
 * Customers type these with spaces, dashes or a +976 prefix, and often inside a
 * sentence that also holds a quantity or a date — so we strip separators, drop
 * a leading country code, then look for an 8-digit run that is not glued to
 * more digits on either side.
 */
export function extractPhone(text: string): string | null {
  if (!text) {
    return null;
  }

  // Collapse the separators people put inside a number, but keep other
  // characters so neighbouring numbers stay separate tokens.
  const normalized = String(text).replace(/[\s\-()]/g, '');

  // Longest-first so +976 is consumed before the bare 8-digit match runs.
  const withCountryCode = /(?:\+?976)(\d{8})(?!\d)/.exec(normalized);
  if (withCountryCode && /^[6789]/.test(withCountryCode[1])) {
    return withCountryCode[1];
  }

  const matches = normalized.match(/(?<!\d)[6789]\d{7}(?!\d)/g);
  return matches && matches.length > 0 ? matches[0] : null;
}

/**
 * Best-effort name extraction from a line like "Нэр: Бат" or "Батаа 99119911".
 * Returns null rather than guessing — an admin filling in a blank is better
 * than an order addressed to the wrong person.
 */
export function extractName(text: string): string | null {
  if (!text) {
    return null;
  }

  const labelled = /(?:нэр|name)\s*[:：]\s*([^\n,;]{2,60})/i.exec(text);
  if (labelled) {
    const value = labelled[1].trim();
    if (value) {
      return value;
    }
  }

  // "Бат 99119911" — a short Cyrillic run immediately before a phone number.
  const beforePhone = /([Ѐ-ӿ][Ѐ-ӿ\s.]{1,40}?)\s*(?:\+?976)?[6789]\d{7}/.exec(
    String(text).replace(/[-()]/g, ''),
  );
  if (beforePhone) {
    const value = beforePhone[1].trim().replace(/\s+/g, ' ');
    // Reject conversational lead-ins that happen to sit before the number.
    if (value.length >= 2 && !/(утас|дугаар|байна|болно|за|тийм)$/i.test(value)) {
      return value;
    }
  }

  return null;
}

/** Everything needed to raise a lead is present. */
export function isLeadComplete(lead: { customerName: string; customerPhone: string }): boolean {
  return lead.customerName.trim().length > 0 && lead.customerPhone.trim().length > 0;
}

/**
 * Writes the lead. Server-side only — the Firestore rules deny client creates
 * precisely so a forged lead cannot appear as if it came from a real chat.
 */
export async function createChatLead(db: any, input: CreateChatLeadInput): Promise<string> {
  const now = new Date();
  const ref = db.collection(LEADS_COLLECTION).doc();

  await ref.set({
    schemaVersion: 1,
    type: input.type,
    status: 'new',
    conversationId: input.conversationId,
    channel: input.channel,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    note: input.note.trim(),
    items: input.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      variant: item.variant,
      quantity: item.quantity,
    })),
    convertedOrderId: null,
    createdAt: now,
    updatedAt: now,
  });

  return ref.id;
}

/**
 * Finds the open order lead on a conversation, so a customer who sends their
 * name and phone across several messages tops up one lead rather than creating
 * a new one per message.
 */
export async function findOpenLead(db: any, conversationId: string): Promise<
  { id: string; data: Record<string, unknown> } | null
> {
  try {
    const snapshot = await db
      .collection(LEADS_COLLECTION)
      .where('conversationId', '==', conversationId)
      .where('status', '==', 'new')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return { id: snapshot.docs[0].id, data: snapshot.docs[0].data() };
  } catch (err) {
    console.error('[chat/leads] open lead lookup failed:', (err as Error).message);
    return null;
  }
}

export async function updateChatLead(
  db: any,
  leadId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .set({ ...patch, updatedAt: new Date() }, { merge: true });
}
