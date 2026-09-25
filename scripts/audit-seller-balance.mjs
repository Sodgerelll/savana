/**
 * Read-only audit: one contract seller's (гэрээт борлуулагч) receivable and sales, rebuilt
 * from the documents behind them, next to what the Борлуулагч screen shows.
 *
 * Background
 * ----------
 * The "Нийт авлага" card shows `customers/{id}.outstandingBalance`, a running counter — not
 * a figure derived from the seller's records. Two modules move it:
 *
 *   customerTransactions   delivery  +(grandTotal − paid)
 *                          sale      −(discount + paid)
 *                          return    −(grandTotal − paid)
 *   transfers / payments   the older Шилжүүлэг module (src/services/transferService.ts)
 *
 * so the counter can hold debt that no record on the seller's screen accounts for.
 *
 * The "Борлуулсан дүн" / "Төлсөн дүн" figures sum `type: "sale"` records only, while the
 * "Зарсан" count (and the Excel export) also includes `soldQuantity` typed straight onto a
 * delivery line. Those units carry no money, which is how a seller can show units sold and
 * a sold amount of 0.
 *
 * Usage
 * -----
 *   FIREBASE_SERVICE_ACCOUNT_JSON='<service account json>' \
 *     node scripts/audit-seller-balance.mjs --name="Монгол маркет"
 *
 *   --name=<text>  matches seller names containing the text (case-insensitive)
 *   --all          every seller, one summary line each
 *
 * Never writes.
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? String(flag.slice(name.length + 3)) : null;
};
const NAME = flagValue("name");
const ALL = args.includes("--all");

const num = (v) => Number(v ?? 0) || 0;
const money = (v) => `${Math.round(v).toLocaleString("en-US")}₮`;
const itemsOf = (data) => (Array.isArray(data.items) ? data.items : []);

/** What one customerTransactions document did to the customer's outstandingBalance. */
function balanceDelta(tx) {
  const totals = tx.totals ?? {};
  const paid = num(tx.payment?.paidAmount);
  if (tx.type === "return") return -(num(totals.grandTotal) - paid);
  if (tx.type === "sale") return -(num(totals.discount) + paid);
  return num(totals.grandTotal) - paid;
}

/** What one transfers-module document left on the balance (see outstandingDeltaFor). */
function transferDelta(tr) {
  if (tr.type === "RETURN") return null; // returns are reported separately, see below
  if (!["CONFIRMED", "SHIPPED", "DELIVERED"].includes(tr.status)) return 0;
  if (tr.paymentStatus === "PAID") return 0;
  if (tr.paymentStatus === "PARTIAL") return num(tr.remainingAmount);
  return num(tr.totalAmount);
}

function auditSeller(customer, txs, transfers, payments) {
  const deliveries = txs.filter((t) => t.type === "delivery");
  const sales = txs.filter((t) => t.type === "sale");
  const returns = txs.filter((t) => t.type === "return");

  const txBalance = txs.reduce((s, t) => s + balanceDelta(t), 0);
  const transferred = deliveries.reduce((s, t) => s + num(t.totals?.grandTotal), 0);
  const deliveryPaid = deliveries.reduce((s, t) => s + num(t.payment?.paidAmount), 0);
  const saleNet = sales.reduce((s, t) => s + num(t.totals?.grandTotal), 0);
  const saleDiscount = sales.reduce((s, t) => s + num(t.totals?.discount), 0);
  const salePaid = sales.reduce((s, t) => s + num(t.payment?.paidAmount), 0);
  const returned = returns.reduce((s, t) => s + num(t.totals?.grandTotal), 0);

  // "Зарсан" units typed onto delivery lines — counted as sold, never given a value.
  let legacySoldUnits = 0;
  let legacySoldValue = 0;
  deliveries.forEach((t) =>
    itemsOf(t).forEach((it) => {
      legacySoldUnits += num(it.soldQuantity);
      legacySoldValue += num(it.soldQuantity) * num(it.unitPrice);
    }),
  );
  const saleUnits = sales.reduce((s, t) => s + itemsOf(t).reduce((si, it) => si + num(it.quantity), 0), 0);
  const saleValue = sales.reduce((s, t) => s + num(t.totals?.subtotal), 0);

  const trDeltas = transfers.map(transferDelta).filter((d) => d !== null);
  const trBalance = trDeltas.reduce((s, d) => s + d, 0);
  const trReturns = transfers.filter((t) => t.type === "RETURN");
  const paymentSum = payments.reduce((s, p) => s + num(p.amount), 0);

  const stored = num(customer.outstandingBalance);

  console.log(`\n══ ${customer.name}  (${customer.code ?? "—"}, id ${customer.id})`);
  console.log(`  Хадгалсан авлага (Нийт авлага карт) ........ ${money(stored)}`);
  console.log(`  customerTransactions-аас дахин тооцсон ..... ${money(txBalance)}`);
  console.log(`    шилжүүлсэн ${money(transferred)} − шилжүүлэг дээр төлсөн ${money(deliveryPaid)}`);
  console.log(`    − борлуулалтын хөнгөлөлт ${money(saleDiscount)} − борлуулалтаар төлсөн ${money(salePaid)}`);
  console.log(`    − буцаалт ${money(returned)}`);
  if (transfers.length || payments.length) {
    console.log(`  Хуучин Шилжүүлэг модуль: ${transfers.length} шилжүүлэг (${trReturns.length} буцаалт), ${payments.length} төлбөр`);
    console.log(`    шилжүүлгийн үлдэгдэл ${money(trBalance)}, шилжүүлэггүй төлбөр ${money(paymentSum)}`);
  }
  console.log(`  Зөрүү (хадгалсан − дахин тооцсон) ........... ${money(stored - txBalance)}`);
  console.log("");
  console.log(`  Борлуулалт бичлэг: ${sales.length} ш, ${saleUnits} нэгж, нийт ${money(saleValue)}, цэвэр ${money(saleNet)}`);
  console.log(`  Шилжүүлгийн мөрөнд шууд бичсэн "Зарсан": ${legacySoldUnits} нэгж ≈ ${money(legacySoldValue)} (мөнгөгүй)`);
  const zeroSales = sales.filter((t) => num(t.totals?.grandTotal) === 0);
  if (zeroSales.length) {
    console.log(`  0 дүнтэй борлуулалт бичлэг: ${zeroSales.map((t) => t.txNumber ?? t.id).join(", ")}`);
  }

  console.log("\n  Гүйлгээнүүд (огноогоор):");
  txs
    .slice()
    .sort((a, b) => String(a.transactionDate ?? "").localeCompare(String(b.transactionDate ?? "")))
    .forEach((t) => {
      const units = itemsOf(t).reduce((s, it) => s + num(it.quantity), 0);
      const sold = itemsOf(t).reduce((s, it) => s + num(it.soldQuantity), 0);
      console.log(
        `    ${String(t.transactionDate ?? "").slice(0, 10).padEnd(10)} ${String(t.txNumber ?? t.id).padEnd(14)} ` +
          `${t.type.padEnd(8)} ${String(units).padStart(4)}ш` +
          (t.type === "delivery" ? ` (зарсан ${sold})` : "") +
          `  нийт ${money(num(t.totals?.grandTotal))}  хөнг ${money(num(t.totals?.discount))}` +
          `  төлсөн ${money(num(t.payment?.paidAmount))}  → авлага ${money(balanceDelta(t))}`,
      );
    });
}

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set — cannot reach Firestore.");
    process.exit(1);
  }
  if (!NAME && !ALL) {
    console.error('Pass --name="<seller name>" or --all.');
    process.exit(1);
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }
  const db = getFirestore();

  const customersSnap = await db.collection("customers").get();
  const customers = customersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => ALL || String(c.name ?? "").toLowerCase().includes(NAME.toLowerCase()));
  if (customers.length === 0) {
    console.error(`No seller matches "${NAME}".`);
    process.exit(1);
  }

  for (const customer of customers) {
    const [txSnap, trSnap, paySnap] = await Promise.all([
      db.collection("customerTransactions").where("customerId", "==", customer.id).get(),
      db.collection("transfers").where("customerId", "==", customer.id).get(),
      db.collection("payments").where("customerId", "==", customer.id).get(),
    ]);
    const txs = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const transfers = trSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Payments tied to a transfer are already inside that transfer's remainingAmount.
    const loosePayments = paySnap.docs.map((d) => d.data()).filter((p) => !p.transferId);
    auditSeller(customer, txs, transfers, loosePayments);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
