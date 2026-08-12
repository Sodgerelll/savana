/**
 * One-off migration: moves hand-registered orders out of /orders and into /sales.
 *
 * Background
 * ----------
 * Before the Sales module existed, an admin could register an offline sale from the
 * Orders page. Those documents live in /orders with isManual === true. The Orders page
 * is now storefront-only, so they need to move to /sales to stay visible.
 *
 * What it does per migrated order
 * -------------------------------
 *   1. Writes /sales/<same-doc-id> with the sale schema (channel + customer type).
 *   2. Re-points the order's journal entries from sourceType "order" to "sale" so the
 *      Finance reconciliation still finds them. The posted debit/credit lines are left
 *      untouched — the ledger is not rewritten. Those legacy entries credit online
 *      revenue (4100) rather than direct revenue (4300), which the reconciliation view
 *      accounts for by netting both revenue accounts for sale rows.
 *   3. Deletes the original /orders document.
 *
 * The sale keeps the order's document id, so a re-run is idempotent: an order whose
 * sale already exists is skipped.
 *
 * Usage
 * -----
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<service account json>' node scripts/migrate-manual-orders-to-sales.mjs
 *
 * Runs as a dry run by default and only reports what it would do. Pass --apply to write.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");

/** Order sources map onto sale channels one-to-one, except walk_in → store. */
const CHANNEL_BY_ORDER_SOURCE = {
  walk_in: "store",
  messenger: "messenger",
  facebook: "facebook",
  instagram: "instagram",
  phone: "phone",
  email: "email",
  gift: "gift",
  // The order module called goods taken for internal use "usage".
  usage: "own_use",
  // A manual order stamped "web" was not a storefront checkout — the admin just left
  // the default in place, so it lands in the catch-all channel.
  web: "other",
  other: "other",
};

function toSaleNumber(orderNumber) {
  // ORD-260812A01 → SL-260812A01, so the sale is still traceable to the old order.
  return typeof orderNumber === "string" && orderNumber.startsWith("ORD-")
    ? `SL-${orderNumber.slice(4)}`
    : `SL-${orderNumber ?? ""}`;
}

function buildSale(order) {
  const customer = order.customer ?? {};
  const payment = order.payment ?? {};
  const settled = order.status && order.status !== "new";

  return {
    saleNumber: toSaleNumber(order.orderNumber),
    schemaVersion: 1,
    status: order.status ?? "new",
    channel: CHANNEL_BY_ORDER_SOURCE[order.source] ?? "other",
    currency: order.currency ?? "MNT",
    customer: {
      // Manual orders had no buyer type; everything migrates as an individual and can
      // be switched to an organization from the Sales page.
      type: "individual",
      fullName: customer.fullName ?? "",
      organizationName: "",
      registrationNumber: "",
      phoneNumber: customer.phoneNumber ?? "",
      email: typeof customer.email === "string" ? customer.email : null,
      note: customer.note ?? "",
    },
    address: order.address ?? {
      region: "",
      districtOrSoum: "",
      khorooOrBag: "",
      streetAddress: "",
      additionalAddress: "",
    },
    items: Array.isArray(order.items) ? order.items : [],
    totals: order.totals ?? { subtotal: 0, shippingFee: 0, grandTotal: 0, discountTotal: 0 },
    paymentMethod: payment.method === "bank_transfer" || payment.method === "bonum" ? payment.method : "cash",
    paidAt: settled ? (payment.paidAt ?? null) : null,
    createdByUid: order.createdByUid ?? "",
    createdByName: "",
    journalEntryId: order.journalEntryId ?? null,
    createdAt: order.createdAt ?? null,
    updatedAt: order.updatedAt ?? null,
    /** Provenance so a migrated sale is distinguishable from one registered natively. */
    migratedFromOrderNumber: order.orderNumber ?? null,
  };
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set — cannot reach Firestore.");
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }
  const db = getFirestore();

  const snapshot = await db.collection("orders").where("isManual", "==", true).get();

  if (snapshot.empty) {
    console.log("No hand-registered orders found — nothing to migrate.");
    return;
  }

  console.log(`${snapshot.size} hand-registered order(s) found.${APPLY ? "" : " (dry run — pass --apply to write)"}`);

  let migrated = 0;
  let skipped = 0;

  for (const orderDoc of snapshot.docs) {
    const order = orderDoc.data();
    const saleRef = db.collection("sales").doc(orderDoc.id);

    if ((await saleRef.get()).exists) {
      console.log(`  skip ${order.orderNumber ?? orderDoc.id} — already migrated`);
      skipped += 1;
      continue;
    }

    const sale = buildSale(order);
    const entries = await db
      .collection("journalEntries")
      .where("sourceType", "==", "order")
      .where("sourceId", "==", orderDoc.id)
      .get();

    console.log(
      `  ${APPLY ? "move" : "would move"} ${order.orderNumber ?? orderDoc.id} → ${sale.saleNumber} ` +
        `(${sale.channel}, ${sale.status}, ${entries.size} journal entr${entries.size === 1 ? "y" : "ies"})`,
    );

    if (!APPLY) {
      migrated += 1;
      continue;
    }

    const batch = db.batch();
    batch.set(saleRef, sale);
    for (const entry of entries.docs) {
      batch.update(entry.ref, { sourceType: "sale", sourceNumber: sale.saleNumber });
    }
    batch.delete(orderDoc.ref);
    await batch.commit();
    migrated += 1;
  }

  console.log(
    `${APPLY ? "Migrated" : "Would migrate"} ${migrated} sale(s)` + (skipped ? `, skipped ${skipped}.` : "."),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
