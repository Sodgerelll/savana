// Server-side (Admin SDK) mirroring of a storefront buyer into the CRM customer
// directory (/crmContacts), so everyone who ordered online is searchable there next to
// the customers an admin registered by hand. Called when an order is placed
// (/api/orders/register-contact) and again when it is paid (Bonum webhook, mark-paid).
//
// This runs in Vercel's Node serverless runtime, which is why it re-implements the small
// bits of src/lib/crmContacts.ts it needs (phone normalization, HAR- code numbering)
// instead of importing that browser-SDK module — the same split postOrderPaidEntry.ts uses.
//
// It has to run server-side: /crmContacts is admin-only in firestore.rules, so a shopper's
// browser cannot write there. The Admin SDK bypasses those rules.

/* eslint-disable @typescript-eslint/no-explicit-any */

const CONTACTS_COLLECTION = 'crmContacts';
const CONTACT_SCHEMA_VERSION = 1;

/**
 * Digits only, so "9900-1234", "+976 99001234" and "99001234" identify the same person.
 * Must stay identical to normalizeContactPhone() in src/lib/crmContacts.ts — the two write
 * the same `phoneDigits` field and this file now looks contacts up by it.
 */
function phoneDigitsOf(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  const dialled = digits.replace(/^0+/, '');

  if (dialled.length === 11 && dialled.startsWith('976')) return dialled.slice(3);

  return digits;
}

/**
 * Reserves the next HAR- code from the same `counters/crmContacts` document the admin UI
 * draws from (src/lib/documentNumbers.ts).
 *
 * This used to scan every contact for the highest code and add one, without advancing the
 * counter — so a contact this file created took a number the counter still considered
 * free, and the next contact an admin registered was handed the very same code.
 *
 * Runs in its own transaction, before the caller's, since a Firestore transaction cannot
 * read after it has written.
 */
async function reserveContactCode(db: any): Promise<string> {
  const counterRef = db.collection('counters').doc('crmContacts');

  return db.runTransaction(async (t: any) => {
    const snap = await t.get(counterRef);
    const lastNumber = snap.exists ? Number(snap.data().lastNumber ?? 0) : 0;
    const nextNumber = lastNumber + 1;
    // `crmContacts` is a flat series, so no year is involved — the field is written only to
    // keep the document shape identical to every other counter.
    t.set(counterRef, {
      lastNumber: nextNumber,
      year: Number(
        new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric' }).format(new Date()),
      ),
      prefix: 'HAR',
    });
    return `HAR-${String(nextNumber).padStart(4, '0')}`;
  });
}

function buildAddress(source: Record<string, unknown>): Record<string, string> | null {
  const address = {
    region: String(source.region ?? ''),
    districtOrSoum: String(source.districtOrSoum ?? ''),
    khorooOrBag: String(source.khorooOrBag ?? ''),
    streetAddress: String(source.streetAddress ?? ''),
  };

  return Object.values(address).some((part) => part.trim() !== '') ? address : null;
}

/**
 * Records the buyer of `orderId` in the customer directory. Payment is not a condition —
 * this runs when the order is placed, so someone who ordered and never paid is still
 * registered, and runs again when payment lands.
 *
 * Matching is on the phone number's digits — the one field checkout always requires. A
 * buyer who already has a contact (registered by an admin or by an earlier order) is not
 * duplicated: only the fields the directory is still missing get filled in, so an admin's
 * own edits are never overwritten. That makes it safe to call as often as it is.
 *
 * Returns the contact's document id, or null when there was nothing to record.
 */
export async function upsertOrderContact(db: any, orderId: string): Promise<string | null> {
  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return null;

  const order = orderSnap.data() as Record<string, unknown>;
  const customer = (order.customer as Record<string, unknown>) ?? {};
  const digits = phoneDigitsOf(customer.phoneNumber);

  // Without a phone there is nothing to match a buyer on, and a directory full of
  // unmatchable duplicates is worse than a missing row.
  if (!digits) return null;

  const fullName = String(customer.fullName ?? '').trim();
  const email = String(customer.email ?? '').trim();
  const address = buildAddress((order.address as Record<string, unknown>) ?? {});
  const { FieldValue } = await import('firebase-admin/firestore');

  // Reserved before the transaction opens, and only when one might be needed. A skipped
  // number costs nothing; a duplicate one costs an afternoon of untangling.
  const codePromise = reserveContactCode(db);

  return db.runTransaction(async (t: any) => {
    // Matched with an indexed equality query rather than by reading the whole directory:
    // this runs inside a transaction on the checkout path, and a full-collection read there
    // both grows without bound and makes concurrent orders contend with each other.
    // `phoneDigits` is written by every contact this file and the admin UI create, and is
    // backfilled below on any older contact that is matched some other way.
    const matches = await t.get(
      db.collection(CONTACTS_COLLECTION).where('phoneDigits', '==', digits).limit(1),
    );
    const existing = matches.docs[0];

    if (existing) {
      const data = existing.data() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};

      if (!String(data.fullName ?? '').trim() && fullName) patch.fullName = fullName;
      if (!String(data.email ?? '').trim() && email) patch.email = email;
      if (!data.address && address) patch.address = address;
      // Backfills the lookup key on contacts written before it existed.
      if (!data.phoneDigits) patch.phoneDigits = digits;

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = FieldValue.serverTimestamp();
        t.update(existing.ref, patch);
      }

      return existing.id;
    }

    const contactRef = db.collection(CONTACTS_COLLECTION).doc();
    t.set(contactRef, {
      schemaVersion: CONTACT_SCHEMA_VERSION,
      code: await codePromise,
      // A storefront checkout is always a person buying for themselves.
      type: 'individual',
      fullName,
      organizationName: '',
      registrationNumber: '',
      phoneNumber: String(customer.phoneNumber ?? '').trim(),
      phoneDigits: digits,
      secondaryPhone: '',
      email: email || null,
      address,
      note: '',
      status: 'active',
      // Marks who created the row, so a directory entry that appeared on its own is
      // distinguishable from one an admin typed.
      createdFrom: 'order',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return contactRef.id;
  });
}
