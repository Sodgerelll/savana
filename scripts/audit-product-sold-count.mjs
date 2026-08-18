/**
 * Read-only audit: rebuilds every product's `soldCount` from the documents that are
 * allowed to move it, and reports where the stored figure disagrees.
 *
 * Background
 * ----------
 * `soldCount` is a running counter, not a derived field: each module adds to it when goods
 * leave and subtracts when they come back (src/lib/inventory.ts). Nothing clamps it at
 * zero — a negative figure is deliberate, and means more units were given back than the
 * counter ever recorded leaving. That is always drift, and it inflates what the shop
 * believes is on the shelf, because remaining stock is `totalStock - soldCount`.
 *
 * Every document that may move the counter is replayed here:
 *
 *   orders                 +qty  when `stockApplied === true` (payment landed)
 *   sales                  +qty  when status !== "new"        (settled offline sale)
 *   directSales            +qty  always                       (POS sale)
 *   customerTransactions   +qty  for delivery/sale, −qty for a return
 *   transfers              +qty  for a non-RETURN transfer in CONFIRMED/SHIPPED/DELIVERED,
 *                          −qty  for a RETURN transfer
 *                                (DRAFT and CANCELLED hold no stock)
 *
 * Deleted documents leave no trace, so a product whose history was deleted after the
 * counter had already been reset (a re-created product id, a wiped catalogue) shows up
 * here as "stored below rebuilt" with no document to blame — which is itself the answer.
 *
 * Finding what caused a drift
 * ---------------------------
 * A deleted sale leaves no document behind, but it does leave a reversal: every module
 * that gives stock back also posts a mirror-image journal entry, and transfers write a
 * /stockMovements row as well. `--at` prints both around a moment in time, which is how a
 * counter that went negative on a particular day is traced back to the operation that did
 * it — read the product document's `updatedAt` to get the moment.
 *
 * Usage
 * -----
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<service account json>' \
 *     node scripts/audit-product-sold-count.mjs [--product=403112] [--all] [--at=<iso>]
 *
 *   --product=<id>  audit one product and list every document that touched it
 *                   (the document id, not the "#211" code the admin table shows)
 *   --all           list every product, not only the ones that disagree
 *   --at=<iso>      list the journal entries and stock movements written around that
 *                   moment, e.g. --at=2026-08-17T09:51:29Z
 *   --window=<sec>  how wide --at reaches, either side (default 300)
 *
 * Never writes. Correcting a counter is a separate, deliberate act.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const flagValue = (name) => {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? String(flag.slice(name.length + 3)) : null;
};
const PRODUCT_FILTER = flagValue("product");
const AT = flagValue("at");
const WINDOW_SECONDS = Number(flagValue("window") ?? 300);

/** Item lists store the product id as a number in some modules and a string in others. */
function pid(value) {
  return String(value ?? "");
}

function variantKey(value) {
  return value ? String(value) : "";
}

/** One product's rebuilt position: the total, the per-variant split, and its sources. */
function emptyRebuild() {
  return { total: 0, byVariant: new Map(), sources: [] };
}

function addMovement(rebuilds, productId, variant, quantity, source) {
  if (!quantity) return;
  const key = pid(productId);
  if (!key || key === "0" || key === "undefined") return;

  let rebuild = rebuilds.get(key);
  if (!rebuild) {
    rebuild = emptyRebuild();
    rebuilds.set(key, rebuild);
  }

  rebuild.total += quantity;
  const vKey = variantKey(variant);
  rebuild.byVariant.set(vKey, (rebuild.byVariant.get(vKey) ?? 0) + quantity);
  rebuild.sources.push({ ...source, variant: vKey, quantity });
}

/** The "#211" label the admin table shows for a product document id. */
function adminCode(docId) {
  const numeric = Number(docId);
  return Number.isFinite(numeric) ? String((numeric + 99) % 1000).padStart(3, "0") : String(docId);
}

function itemsOf(data) {
  return Array.isArray(data.items) ? data.items : [];
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

  const [products, orders, sales, directSales, customerTransactions, transfers] = await Promise.all([
    db.collection("products").get(),
    db.collection("orders").get(),
    db.collection("sales").get(),
    db.collection("directSales").get(),
    db.collection("customerTransactions").get(),
    db.collection("transfers").get(),
  ]);

  const rebuilds = new Map();
  /** Documents that claim to be settled but never took stock — the classic drift source. */
  const suspicious = [];

  for (const snap of orders.docs) {
    const data = snap.data();
    const paid = String(data.payment?.status ?? "") === "paid" || String(data.status ?? "") !== "new";
    const applied = data.stockApplied === true;

    if (paid && !applied) {
      suspicious.push(
        `order ${data.orderNumber ?? snap.id} — status "${data.status}" but stockApplied is ${String(data.stockApplied)}: ` +
          "the goods were never taken off the shelf, so anything that later gives them back drives soldCount negative",
      );
    }

    if (!applied) continue;
    for (const item of itemsOf(data)) {
      addMovement(rebuilds, item.productId, item.variant, Number(item.quantity ?? 0), {
        collection: "orders",
        id: snap.id,
        label: data.orderNumber ?? snap.id,
        detail: `status=${data.status}`,
      });
    }
  }

  for (const snap of sales.docs) {
    const data = snap.data();
    if (String(data.status ?? "new") === "new") continue;

    if (data.migratedFromOrderNumber) {
      suspicious.push(
        `sale ${data.saleNumber ?? snap.id} — migrated from order ${data.migratedFromOrderNumber}: ` +
          "the migration copied the status but not the order's stockApplied flag, so Sales assumes it is holding stock it may never have taken",
      );
    }

    for (const item of itemsOf(data)) {
      addMovement(rebuilds, item.productId, item.variant, Number(item.quantity ?? 0), {
        collection: "sales",
        id: snap.id,
        label: data.saleNumber ?? snap.id,
        detail: `status=${data.status}, channel=${data.channel}`,
      });
    }
  }

  for (const snap of directSales.docs) {
    const data = snap.data();
    addMovement(rebuilds, data.productId, data.variant, Number(data.quantity ?? 0), {
      collection: "directSales",
      id: snap.id,
      label: data.saleNumber ?? snap.id,
      detail: data.createdAt ? `createdAt=${data.createdAt}` : "",
    });
  }

  for (const snap of customerTransactions.docs) {
    const data = snap.data();
    const sign = String(data.type ?? "") === "return" ? -1 : 1;
    for (const item of itemsOf(data)) {
      addMovement(rebuilds, item.productId, item.variant, sign * Number(item.quantity ?? 0), {
        collection: "customerTransactions",
        id: snap.id,
        label: data.txNumber ?? snap.id,
        detail: `type=${data.type}, customer=${data.customerSnapshot?.name ?? data.customerId}`,
      });
    }
  }

  for (const snap of transfers.docs) {
    const data = snap.data();
    const status = String(data.status ?? "");
    const isReturn = String(data.type ?? "") === "RETURN";
    const holdsStock = isReturn || ["CONFIRMED", "SHIPPED", "DELIVERED"].includes(status);
    if (!holdsStock) continue;

    const sign = isReturn ? -1 : 1;
    for (const item of itemsOf(data)) {
      addMovement(rebuilds, item.productId, item.variant, sign * Number(item.quantity ?? 0), {
        collection: "transfers",
        id: snap.id,
        label: data.transferNumber ?? snap.id,
        detail: `type=${data.type}, status=${status}, customer=${data.customerName ?? data.customerId}`,
      });
    }
  }

  // ── Report ──
  const rows = [];

  for (const snap of products.docs) {
    // The admin table labels a product "#211", which is not its id — see getProductCode()
    // in src/pages/admin/adminHelpers.ts. Both forms are accepted so the figure on screen
    // can be typed in directly.
    if (PRODUCT_FILTER && snap.id !== PRODUCT_FILTER && adminCode(snap.id) !== PRODUCT_FILTER) continue;

    const data = snap.data();
    const stored = Number(data.soldCount ?? 0);
    const rebuild = rebuilds.get(snap.id) ?? emptyRebuild();
    const drift = stored - rebuild.total;

    if (!ALL && !PRODUCT_FILTER && drift === 0 && stored >= 0) continue;

    rows.push({ id: snap.id, name: String(data.name ?? ""), data, stored, rebuild, drift });
  }

  if (PRODUCT_FILTER && rows.length === 0) {
    console.log(
      `No product matches "${PRODUCT_FILTER}" by document id or by its "#" code — ` +
        "the document was deleted, or the id is wrong.",
    );
  }

  for (const row of rows) {
    const variantStock = Array.isArray(row.data.variants)
      ? row.data.variants.reduce((sum, v) => sum + Number(v.quantity ?? 0), 0)
      : null;
    const stock = variantStock ?? Number(row.data.totalStock ?? 0);

    console.log(`\n${row.id} (shown as #${adminCode(row.id)}) - ${row.name}`);
    console.log(`  stored soldCount : ${row.stored}${row.stored < 0 ? "   ← negative: more given back than ever recorded as sold" : ""}`);
    console.log(`  rebuilt from documents: ${row.rebuild.total}`);
    console.log(`  drift (stored − rebuilt): ${row.drift}${row.drift === 0 ? " — the counter agrees with the surviving documents" : ""}`);
    console.log(`  totalStock ${stock}, so the shop shows ${stock - row.stored} remaining (should be ${stock - row.rebuild.total})`);

    if (Array.isArray(row.data.variants)) {
      for (const variant of row.data.variants) {
        const name = String(variant.name ?? "");
        const rebuilt = row.rebuild.byVariant.get(name) ?? 0;
        console.log(
          `    variant "${name}": quantity ${Number(variant.quantity ?? 0)}, ` +
            `soldCount ${Number(variant.soldCount ?? 0)}, rebuilt ${rebuilt}`,
        );
      }
    }

    if (PRODUCT_FILTER || ALL) {
      if (row.rebuild.sources.length === 0) {
        console.log("  no surviving document moves this product's stock");
      } else {
        console.log("  documents that moved it:");
        for (const source of row.rebuild.sources) {
          const sign = source.quantity > 0 ? "+" : "";
          console.log(
            `    ${sign}${source.quantity}  ${source.collection}/${source.label}` +
              `${source.variant ? ` [${source.variant}]` : ""}${source.detail ? `  (${source.detail})` : ""}`,
          );
        }
      }
    }
  }

  if (!PRODUCT_FILTER) {
    console.log(`\n${rows.length} product(s) ${ALL ? "listed" : "with drift or a negative counter"}.`);
  }

  if (suspicious.length > 0) {
    console.log(`\nRecords whose stock provenance does not hold up (${suspicious.length}):`);
    for (const note of suspicious) console.log(`  - ${note}`);
  }

  if (AT) await reportMoment(db, AT);
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value === "string") return Date.parse(value);
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value._seconds === "number") return value._seconds * 1000;
  return null;
}

/**
 * What was written around one moment. A stock counter that moved leaves no note on the
 * product itself beyond `updatedAt`, but the operation behind it does: a deletion or an
 * un-settling posts a reversal entry, and a transfer writes a stock movement. Both name
 * the document they came from, which is the whole point of looking here.
 */
async function reportMoment(db, at) {
  const centre = Date.parse(at);
  if (Number.isNaN(centre)) {
    console.log(`\n--at="${at}" is not a date I can read — use an ISO moment, e.g. 2026-08-17T09:51:29Z.`);
    return;
  }

  const from = centre - WINDOW_SECONDS * 1000;
  const to = centre + WINDOW_SECONDS * 1000;
  const inWindow = (value) => {
    const ms = toMillis(value);
    return ms !== null && ms >= from && ms <= to;
  };

  console.log(
    `\nWritten within ${WINDOW_SECONDS}s of ${new Date(centre).toISOString()} ` +
      `(${new Date(from).toISOString()} … ${new Date(to).toISOString()}):`,
  );

  const [entries, movements] = await Promise.all([
    db.collection("journalEntries").get(),
    db.collection("stockMovements").get(),
  ]);

  const hits = entries.docs.filter((snap) => {
    const data = snap.data();
    return inWindow(data.createdAt) || inWindow(data.date);
  });

  if (hits.length === 0) {
    console.log("  no journal entry — the operation posted nothing to the ledger");
  }
  for (const snap of hits) {
    const data = snap.data();
    console.log(
      `  journalEntry ${data.entryNumber ?? snap.id}  ${data.sourceType}/${data.sourceNumber ?? data.sourceId}` +
        `${data.reversalOf ? "  [reversal]" : ""}\n      ${data.description ?? ""}` +
        `${data.createdByName ? `  — ${data.createdByName}` : ""}`,
    );
  }

  const movementHits = movements.docs.filter((snap) => inWindow(snap.data().createdAt));
  for (const snap of movementHits) {
    const data = snap.data();
    console.log(
      `  stockMovement ${data.type} ${data.quantity > 0 ? "+" : ""}${data.quantity}  ` +
        `product ${data.productId} (${data.productName ?? ""})  ${data.reason ?? ""}` +
        `${data.createdByName ? `  — ${data.createdByName}` : ""}`,
    );
  }
  if (movementHits.length === 0) {
    console.log("  no stock movement — so it was not a transfer, a transfer return, or a recount");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
