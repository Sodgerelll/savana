/**
 * Backfill: puts the buyers of past storefront orders into the CRM customer directory
 * (/crmContacts), and stamps the phone lookup key on contacts written before it existed.
 *
 * Background
 * ----------
 * From now on every paid online order registers its buyer automatically — see
 * api/_lib/upsertOrderContact.ts, called from the Bonum webhook and /api/orders/mark-paid.
 * Orders that were already paid before that shipped have no contact, so this script walks
 * them once. It applies the same rules as the live path:
 *
 *   - Matching is on the phone number's digits, so one person is never duplicated.
 *   - An existing contact is only filled in where the directory is blank — an admin's own
 *     edits are never overwritten.
 *   - Orders without a phone are skipped; there is nothing to match them on.
 *
 * Only paid orders count. An abandoned checkout that never got paid is not a customer.
 *
 * Re-running is safe: a buyer who already has a contact is matched, not duplicated.
 *
 * Usage
 * -----
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<service account json>' node scripts/backfill-order-contacts.mjs
 *
 * Runs as a dry run by default and only reports what it would do. Pass --apply to write.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const CONTACTS_COLLECTION = "crmContacts";
const CONTACT_SCHEMA_VERSION = 1;

/** Digits only, so "9900-1234" and "99001234" identify the same person. */
function phoneDigitsOf(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function nextContactCode(existingCodes) {
  let maxNumber = 0;
  for (const code of existingCodes) {
    const match = /HAR-(\d+)/.exec(String(code ?? ""));
    if (match) {
      maxNumber = Math.max(maxNumber, Number(match[1]));
    }
  }
  return `HAR-${String(maxNumber + 1).padStart(4, "0")}`;
}

function buildAddress(source = {}) {
  const address = {
    region: String(source.region ?? ""),
    districtOrSoum: String(source.districtOrSoum ?? ""),
    khorooOrBag: String(source.khorooOrBag ?? ""),
    streetAddress: String(source.streetAddress ?? ""),
  };

  return Object.values(address).some((part) => part.trim() !== "") ? address : null;
}

function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is required.");
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }

  return run(getFirestore());
}

async function run(db) {
  // The directory is held in memory for the whole run: it is small, and every order has
  // to be matched against contacts this script may itself have just created.
  const contactsSnapshot = await db.collection(CONTACTS_COLLECTION).get();
  const contacts = contactsSnapshot.docs.map((docSnapshot) => ({
    id: docSnapshot.id,
    ref: docSnapshot.ref,
    ...docSnapshot.data(),
  }));

  if (!APPLY) {
    console.log("Dry run — pass --apply to write.");
  }

  // 1. Stamp the phone lookup key on contacts registered before it existed.
  let stamped = 0;
  for (const contact of contacts) {
    const digits = phoneDigitsOf(contact.phoneNumber);
    if (contact.phoneDigits || !digits) continue;

    console.log(`  ${APPLY ? "stamp" : "would stamp"} ${contact.code ?? contact.id} phoneDigits=${digits}`);
    if (APPLY) {
      await contact.ref.update({ phoneDigits: digits, updatedAt: FieldValue.serverTimestamp() });
    }
    contact.phoneDigits = digits;
    stamped += 1;
  }

  // 2. Register the buyer of every paid storefront order.
  const ordersSnapshot = await db.collection("orders").get();
  const paidOrders = ordersSnapshot.docs
    .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
    .filter((order) => !order.isManual && order.status !== "new")
    // Oldest first, so the earliest order is the one that names a new contact.
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

  console.log(`${paidOrders.length} paid storefront order(s) to walk.`);

  let created = 0;
  let filled = 0;
  let skipped = 0;

  for (const order of paidOrders) {
    const customer = order.customer ?? {};
    const digits = phoneDigitsOf(customer.phoneNumber);

    if (!digits) {
      console.log(`  skip ${order.orderNumber ?? order.id} — no phone number`);
      skipped += 1;
      continue;
    }

    const fullName = String(customer.fullName ?? "").trim();
    const email = String(customer.email ?? "").trim();
    const address = buildAddress(order.address);
    const existing = contacts.find((contact) => phoneDigitsOf(contact.phoneDigits ?? contact.phoneNumber) === digits);

    if (existing) {
      const patch = {};
      if (!String(existing.fullName ?? "").trim() && fullName) patch.fullName = fullName;
      if (!String(existing.email ?? "").trim() && email) patch.email = email;
      if (!existing.address && address) patch.address = address;

      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }

      console.log(
        `  ${APPLY ? "fill" : "would fill"} ${existing.code ?? existing.id} from ${order.orderNumber ?? order.id}: ` +
          Object.keys(patch).join(", "),
      );
      if (APPLY) {
        await existing.ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
      }
      Object.assign(existing, patch);
      filled += 1;
      continue;
    }

    const code = nextContactCode(contacts.map((contact) => contact.code));
    const contact = {
      schemaVersion: CONTACT_SCHEMA_VERSION,
      code,
      type: "individual",
      fullName,
      organizationName: "",
      registrationNumber: "",
      phoneNumber: String(customer.phoneNumber ?? "").trim(),
      phoneDigits: digits,
      secondaryPhone: "",
      email: email || null,
      address,
      note: "",
      status: "active",
      createdFrom: "order",
    };

    console.log(`  ${APPLY ? "create" : "would create"} ${code} — ${fullName || "(нэргүй)"} ${digits}`);

    const ref = db.collection(CONTACTS_COLLECTION).doc();
    if (APPLY) {
      await ref.set({
        ...contact,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    // Held in memory either way, so a dry run reports the same codes and match results
    // an --apply run would produce.
    contacts.push({ ...contact, id: ref.id, ref });
    created += 1;
  }

  console.log(
    `${APPLY ? "Stamped" : "Would stamp"} ${stamped}, ` +
      `${APPLY ? "created" : "would create"} ${created}, ` +
      `${APPLY ? "filled" : "would fill"} ${filled}, skipped ${skipped}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
