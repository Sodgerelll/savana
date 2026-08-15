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

/** Digits only, so "9900-1234" and "99001234" identify the same person. */
function phoneDigitsOf(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function nextContactCode(existingCodes: unknown[]): string {
  let maxNumber = 0;
  for (const code of existingCodes) {
    const match = /HAR-(\d+)/.exec(String(code ?? ''));
    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  }
  return `HAR-${String(maxNumber + 1).padStart(4, '0')}`;
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

  return db.runTransaction(async (t: any) => {
    // The whole directory is read rather than queried by phoneDigits so that contacts
    // created before that field existed still match — and the codes are needed anyway to
    // number a new contact.
    const contactsSnap = await t.get(db.collection(CONTACTS_COLLECTION));
    const existing = contactsSnap.docs.find((docSnap: any) => {
      const data = docSnap.data() as Record<string, unknown>;
      return phoneDigitsOf(data.phoneDigits ?? data.phoneNumber) === digits;
    });

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
      code: nextContactCode(contactsSnap.docs.map((docSnap: any) => docSnap.data().code)),
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
