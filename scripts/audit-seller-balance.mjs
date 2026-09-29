/**
 * Read-only audit of a contract seller's (гэрээт борлуулагч) receivable and sold amount,
 * rebuilt from the documents behind them and set next to what the Борлуулагч screen shows.
 *
 * Why this exists
 * ---------------
 * The "Нийт авлага" card prints `customers/{id}.outstandingBalance` — a running counter, not
 * a figure derived from the seller's records. Every other number on that screen is derived.
 * So when the card disagrees with the records, only a rebuild can say which one is wrong and
 * by how much. Two modules move that counter:
 *
 *   customerTransactions   delivery  +(grandTotal − paid)     src/lib/customerTransactions.ts
 *                          sale      −(discount + paid)
 *                          return    −(grandTotal − paid)
 *   transfers / payments   the older Шилжүүлэг module         src/services/transferService.ts
 *
 * The sold amount has its own trap: the "Зарсан" count includes `soldQuantity` typed straight
 * onto a delivery line, and those units carry no money of their own — so a seller whose sales
 * all went in that way can show units sold and a sold amount of 0.
 *
 * Usage
 * -----
 *   node scripts/audit-seller-balance.mjs --key=C:\path\to\serviceAccount.json --name="Монгол маркет"
 *   node scripts/audit-seller-balance.mjs --key=... --name="Монгол маркет" --expect=624000
 *   node scripts/audit-seller-balance.mjs --key=... --all
 *
 *   --key=<path>    service account JSON file. Left out, .env.local is read for
 *                   GOOGLE_APPLICATION_CREDENTIALS (a path — preferred, the key stays out of
 *                   the repo) or FIREBASE_SERVICE_ACCOUNT_JSON (the JSON itself, one line).
 *   --name=<text>   sellers whose name contains the text (case-insensitive)
 *   --all           every seller — one summary line each, drift and zero-amount flags first
 *   --expect=<₮>    what the receivable should be; every candidate definition is matched
 *                   against it so the one the shop means is obvious
 *   --db=<id>       Firestore database id (default "(default)", as VITE_FIRESTORE_DATABASE_ID)
 *
 * Never writes. Nothing here mutates a document.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.slice(name.length + 3) : null;
};
const KEY = flagValue("key");
const NAME = flagValue("name");
const ALL = args.includes("--all");
const EXPECT = flagValue("expect") === null ? null : Number(flagValue("expect"));
const DATABASE_ID = flagValue("db") ?? "(default)";

const num = (v) => Number(v ?? 0) || 0;
const money = (v) => `${Math.round(v).toLocaleString("en-US")}₮`;
const itemsOf = (data) => (Array.isArray(data.items) ? data.items : []);
const sumItems = (txs, pick) => txs.reduce((s, tx) => s + itemsOf(tx).reduce((si, it) => si + pick(it), 0), 0);

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

/**
 * Every figure the screens could mean by "авлага", and the pieces they are built from.
 * Returned rather than printed so --all can rank sellers by what it finds.
 */
export function measure(customer, txs, transfers, payments) {
  const deliveries = txs.filter((t) => t.type === "delivery");
  const sales = txs.filter((t) => t.type === "sale");
  const returns = txs.filter((t) => t.type === "return");

  const transferred = deliveries.reduce((s, t) => s + num(t.totals?.grandTotal), 0);
  const deliveryPaid = deliveries.reduce((s, t) => s + num(t.payment?.paidAmount), 0);
  const saleDiscount = sales.reduce((s, t) => s + num(t.totals?.discount), 0);
  const salePaid = sales.reduce((s, t) => s + num(t.payment?.paidAmount), 0);
  const saleNet = sales.reduce((s, t) => s + num(t.totals?.grandTotal), 0);
  const saleGross = sales.reduce((s, t) => s + num(t.totals?.subtotal), 0);
  const returned = returns.reduce((s, t) => s + num(t.totals?.grandTotal), 0);
  const returnPaid = returns.reduce((s, t) => s + num(t.payment?.paidAmount), 0);

  // Units marked sold straight on a delivery line — counted as sold everywhere, but no
  // record carries their money. Valued at the price they were transferred at, which is what
  // the dashboard card does.
  const legacySoldUnits = sumItems(deliveries, (it) => num(it.soldQuantity));
  const legacySoldValue = sumItems(deliveries, (it) => num(it.soldQuantity) * num(it.unitPrice));
  const saleUnits = sumItems(sales, (it) => num(it.quantity));
  const returnUnits = sumItems(returns, (it) => num(it.quantity));
  const transferredUnits = sumItems(deliveries, (it) => num(it.quantity));

  const trDeltas = transfers.map(transferDelta).filter((d) => d !== null);
  const trBalance = trDeltas.reduce((s, d) => s + d, 0);
  const loosePaymentSum = payments.reduce((s, p) => s + num(p.amount), 0);

  const stored = num(customer.outstandingBalance);
  const rebuilt = txs.reduce((s, t) => s + balanceDelta(t), 0);

  // The readings of "авлага" that the screens and the shop could each mean. Printed side by
  // side so the one that matches the figure the shop expects identifies itself.
  const candidates = {
    stored,
    rebuilt,
    // The rule as the shop stated it: everything transferred is owed until it is paid for or
    // comes back. Differs from `rebuilt` only by the allowances granted on sale records.
    transferredLessPaidLessReturned: transferred - deliveryPaid - salePaid - returned,
    // What a consignment reading would give: only goods the seller has actually sold are owed.
    soldLessPaid: legacySoldValue + saleGross - deliveryPaid - salePaid - saleDiscount,
    // The value still sitting on the seller's shelf.
    unsoldShelfValue: transferred - returned - (legacySoldValue + saleGross),
  };

  // Payment history that cannot be true: the recorded entries add up to more than the paid
  // amount they are supposed to explain, or more is paid than was ever billed. Editing a
  // transfer down to below what had already been paid clamps `paidAmount` and leaves the
  // entries behind — see the paidAmount clamp in AdminModals.tsx.
  const paymentAnomalies = [];
  txs.forEach((t) => {
    const paid = num(t.payment?.paidAmount);
    const entriesSum = (t.payment?.entries ?? []).reduce((s, e) => s + num(e.amount), 0);
    const grandTotal = num(t.totals?.grandTotal);
    if (entriesSum - paid > 0.5) {
      paymentAnomalies.push(
        `${t.txNumber ?? t.id}: төлбөрийн бичилтүүд ${money(entriesSum)} > төлсөн дүн ${money(paid)} ` +
          `(зөрүү ${money(entriesSum - paid)})`,
      );
    }
    if (paid - grandTotal > 0.5) {
      paymentAnomalies.push(
        `${t.txNumber ?? t.id}: төлсөн ${money(paid)} > гүйлгээний дүн ${money(grandTotal)}`,
      );
    }
  });

  return {
    customer,
    counts: { deliveries: deliveries.length, sales: sales.length, returns: returns.length },
    units: { transferredUnits, legacySoldUnits, saleUnits, returnUnits },
    amounts: {
      transferred, deliveryPaid, saleGross, saleNet, saleDiscount, salePaid,
      returned, returnPaid, legacySoldValue,
      soldAmountAsShown: saleNet + legacySoldValue,
    },
    legacy: { transfers, payments, trBalance, loosePaymentSum },
    candidates,
    drift: stored - rebuilt,
    paymentAnomalies,
    txs,
  };
}

function reportSeller(m) {
  const { customer: c, amounts: a, units: u, candidates: cand } = m;
  const hit = (v) => (EXPECT !== null && Math.abs(v - EXPECT) < 1 ? "  ← ХҮЛЭЭЖ БАЙГАА ДҮН" : "");

  console.log(`\n══════ ${c.name}  (${c.code ?? "—"}, id ${c.id})`);
  console.log(
    `  ${m.counts.deliveries} шилжүүлэг, ${m.counts.sales} борлуулалт, ${m.counts.returns} буцаалт`,
  );

  console.log("\n  ── Авлагын тооцоо ──");
  console.log(`  Дэлгэц дээр (хадгалсан тоолуур) ................. ${money(cand.stored)}${hit(cand.stored)}`);
  console.log(`  Бичлэгүүдээс дахин бодсон (кодын дүрэм) ......... ${money(cand.rebuilt)}${hit(cand.rebuilt)}`);
  console.log(`  Шилжүүлсэн − төлсөн − буцаасан ................. ${money(cand.transferredLessPaidLessReturned)}${hit(cand.transferredLessPaidLessReturned)}`);
  console.log(`  Зарсан − төлсөн (консигнацийн уншлага) ......... ${money(cand.soldLessPaid)}${hit(cand.soldLessPaid)}`);
  console.log(`  Зарагдаагүй лангуун дээрх барааны дүн .......... ${money(cand.unsoldShelfValue)}${hit(cand.unsoldShelfValue)}`);
  console.log(`  ЗӨРҮҮ (хадгалсан − дахин бодсон) ............... ${money(m.drift)}`);
  if (Math.abs(m.drift) < 0.5) {
    console.log("    → тоолуур бичлэгүүдтэйгээ тохирч байна: асуудал нь тоолуур биш, тооцооны дүрэм.");
  } else {
    console.log("    → тоолуур бичлэгүүдээсээ хазайсан: доорх гүйлгээний жагсаалтаас хаана гарсныг хар.");
  }

  console.log("\n  ── Бүрдүүлэгч дүнгүүд ──");
  console.log(`  Шилжүүлсэн (grandTotal) ........................ ${money(a.transferred)}  (${u.transferredUnits} ш)`);
  console.log(`  Шилжүүлэг дээр төлсөн .......................... ${money(a.deliveryPaid)}`);
  console.log(`  Борлуулалт: бохир ${money(a.saleGross)} − хөнгөлөлт ${money(a.saleDiscount)} = цэвэр ${money(a.saleNet)}  (${u.saleUnits} ш)`);
  console.log(`  Борлуулалтаар хүлээн авсан ..................... ${money(a.salePaid)}`);
  console.log(`  Буцаалт ........................................ ${money(a.returned)}  (${u.returnUnits} ш)`);
  console.log(`  Шилжүүлгийн мөрөнд шууд бичсэн "Зарсан" ........ ${u.legacySoldUnits} ш ≈ ${money(a.legacySoldValue)} (мөнгөгүй)`);

  console.log("\n  ── \"Борлуулсан дүн\" карт ──");
  console.log(`  Дэлгэц дээр гарах дүн (цэвэр + мөрийн зарсан) ... ${money(a.soldAmountAsShown)}`);
  console.log(`  Зарсан нийт нэгж ............................... ${u.legacySoldUnits + u.saleUnits} ш`);
  if (u.legacySoldUnits + u.saleUnits > 0 && a.soldAmountAsShown < 1) {
    console.log("    ⚠ зарсан нэгж байгаа мөртлөө дүн 0 — доорх борлуулалтын бичлэгүүдийг хар.");
  }
  const zeroSales = m.txs.filter((t) => t.type === "sale" && num(t.totals?.grandTotal) === 0);
  if (zeroSales.length) {
    console.log(`    ⚠ 0 цэвэр дүнтэй борлуулалтын бичлэг: ${zeroSales.map((t) => t.txNumber ?? t.id).join(", ")}`);
    console.log("      (бүтэн хөнгөлөлт эсвэл 0 нэгж үнэ — карт цэвэр дүнг нэмдэг тул 0 болдог)");
  }

  if (m.legacy.transfers.length || m.legacy.payments.length) {
    console.log("\n  ── Хуучин Шилжүүлэг модуль (/admin/customers) ──");
    console.log(
      `  ${m.legacy.transfers.length} шилжүүлэг, ${m.legacy.payments.length} бие даасан төлбөр — ` +
        `үлдэгдэл ${money(m.legacy.trBalance)}, төлбөр ${money(m.legacy.loosePaymentSum)}`,
    );
    console.log("    → эдгээр ижил тоолуурыг хөдөлгөдөг ч Борлуулагч цэсэнд харагддаггүй.");
  }

  if (m.paymentAnomalies.length) {
    console.log("\n  ── Төлбөрийн бичилтийн зөрчил ──");
    m.paymentAnomalies.forEach((line) => console.log(`  ⚠ ${line}`));
  }

  console.log("\n  ── Гүйлгээнүүд (огноогоор, авлагад нөлөөлснөөр) ──");
  let running = 0;
  m.txs
    .slice()
    .sort((a, b) => String(a.transactionDate ?? "").localeCompare(String(b.transactionDate ?? "")))
    .forEach((t) => {
      const units = itemsOf(t).reduce((s, it) => s + num(it.quantity), 0);
      const sold = itemsOf(t).reduce((s, it) => s + num(it.soldQuantity), 0);
      const delta = balanceDelta(t);
      running += delta;
      console.log(
        `    ${String(t.transactionDate ?? "").slice(0, 10).padEnd(10)} ` +
          `${String(t.txNumber ?? t.id).padEnd(14)} ${String(t.type).padEnd(8)} ` +
          `${String(units).padStart(4)}ш${t.type === "delivery" ? ` (зарсан ${String(sold).padStart(3)})` : "          "}` +
          `  нийт ${money(num(t.totals?.grandTotal)).padStart(12)}` +
          `  хөнг ${money(num(t.totals?.discount)).padStart(10)}` +
          `  төлсөн ${money(num(t.payment?.paidAmount)).padStart(12)}` +
          `  → ${money(delta).padStart(12)}  Σ ${money(running).padStart(12)}`,
      );
    });
}

function summaryLine(m) {
  const flags = [];
  if (Math.abs(m.drift) >= 0.5) flags.push(`ЗӨРҮҮ ${money(m.drift)}`);
  if (m.units.legacySoldUnits + m.units.saleUnits > 0 && m.amounts.soldAmountAsShown < 1) {
    flags.push("БОРЛУУЛСАН ДҮН 0");
  }
  if (m.paymentAnomalies.length) flags.push(`төлбөрийн зөрчил ${m.paymentAnomalies.length}`);
  if (m.legacy.transfers.length || m.legacy.payments.length) flags.push("хуучин модуль");
  return (
    `${String(m.customer.name).slice(0, 26).padEnd(28)} ` +
    `авлага ${money(m.candidates.stored).padStart(13)}  ` +
    `дахин бодсон ${money(m.candidates.rebuilt).padStart(13)}  ` +
    `борлуулсан ${money(m.amounts.soldAmountAsShown).padStart(13)}` +
    (flags.length ? `   ⚠ ${flags.join("; ")}` : "")
  );
}

/**
 * Loads .env.local the way Vite does for the app, so the credential can live there instead of
 * having to be exported into the shell first. Absent or unreadable is fine — the caller may be
 * passing --key, or have the variables exported already.
 */
function loadEnvLocal() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // no such file, or not parseable — the next credential source gets its turn
    }
  }
}

/**
 * Which principal the run is authenticating as — project and service-account address only,
 * never the key. Reported when Firestore refuses the read, because "insufficient permissions"
 * is otherwise silent about which account needs the role.
 */
const principal = { projectId: null, clientEmail: null, source: null };

function notePrincipal(json, source) {
  principal.projectId = json.project_id ?? null;
  principal.clientEmail = json.client_email ?? null;
  principal.source = source;
}

function resolveCredential() {
  if (KEY) {
    const json = JSON.parse(readFileSync(KEY, "utf8"));
    notePrincipal(json, `--key=${KEY}`);
    return cert(json);
  }
  loadEnvLocal();
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    notePrincipal(json, "FIREBASE_SERVICE_ACCOUNT_JSON");
    return cert(json);
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    try {
      notePrincipal(JSON.parse(readFileSync(path, "utf8")), `GOOGLE_APPLICATION_CREDENTIALS=${path}`);
    } catch {
      principal.source = `GOOGLE_APPLICATION_CREDENTIALS=${path}`;
    }
    return applicationDefault();
  }
  console.error(
    "Firestore-д хүрэх эрх байхгүй. Дараахаас нэгийг гүйцээнэ үү:\n" +
      "  • .env.local дотор  GOOGLE_APPLICATION_CREDENTIALS=C:\\зам\\serviceAccount.json\n" +
      "  • .env.local дотор  FIREBASE_SERVICE_ACCOUNT_JSON={...}   (нэг мөрөнд)\n" +
      "  • эсвэл шууд         --key=C:\\зам\\serviceAccount.json",
  );
  process.exit(1);
}

async function main() {
  if (!NAME && !ALL) {
    console.error('Pass --name="<seller name>" or --all.');
    process.exit(1);
  }
  if (!getApps().length) {
    initializeApp({ credential: resolveCredential() });
  }
  const db = getFirestore(DATABASE_ID);

  const customersSnap = await db.collection("customers").get();
  const customers = customersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => !NAME || String(c.name ?? "").toLowerCase().includes(NAME.toLowerCase()));
  if (customers.length === 0) {
    console.error(NAME ? `"${NAME}"-д тохирох борлуулагч олдсонгүй.` : "Борлуулагч байхгүй.");
    process.exit(1);
  }

  // One read of each collection, then grouped in memory: a per-seller query per collection
  // costs three round trips each and this is a small ledger.
  const [txSnap, trSnap, paySnap] = await Promise.all([
    db.collection("customerTransactions").get(),
    db.collection("transfers").get().catch(() => ({ docs: [] })),
    db.collection("payments").get().catch(() => ({ docs: [] })),
  ]);
  const byCustomer = (snap) => {
    const map = new Map();
    snap.docs.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      const key = String(data.customerId ?? "");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(data);
    });
    return map;
  };
  const txByCustomer = byCustomer(txSnap);
  const trByCustomer = byCustomer(trSnap);
  const payByCustomer = byCustomer(paySnap);

  const measured = customers.map((customer) =>
    measure(
      customer,
      txByCustomer.get(customer.id) ?? [],
      trByCustomer.get(customer.id) ?? [],
      // Payments tied to a transfer are already inside that transfer's remainingAmount.
      (payByCustomer.get(customer.id) ?? []).filter((p) => !p.transferId),
    ),
  );

  if (EXPECT !== null) {
    console.log(`\nХүлээж байгаа авлага: ${money(EXPECT)} — тохирох тооцоог "←" тэмдэглэнэ.`);
  }

  if (ALL && !NAME) {
    console.log(`\n${customers.length} борлуулагч — зөрүүтэй нь дээр:\n`);
    measured
      .slice()
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
      .forEach((m) => console.log("  " + summaryLine(m)));
    const drifted = measured.filter((m) => Math.abs(m.drift) >= 0.5);
    const zeroSold = measured.filter(
      (m) => m.units.legacySoldUnits + m.units.saleUnits > 0 && m.amounts.soldAmountAsShown < 1,
    );
    console.log(
      `\n  Тоолуур хазайсан: ${drifted.length} борлуулагч, нийт зөрүү ` +
        `${money(drifted.reduce((s, m) => s + m.drift, 0))}`,
    );
    console.log(`  Зарсан нэгж байгаа ч дүн 0: ${zeroSold.length} борлуулагч`);
    return;
  }

  measured.forEach(reportSeller);
}

// Guarded so the arithmetic above can be exercised from a test without reaching Firestore.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // A refused read says nothing about which account was refused, so name it here — the fix
    // is a role on that one principal, not a different key.
    if (error?.code === 7 || /PERMISSION_DENIED|insufficient permissions/i.test(String(error?.message))) {
      console.error("Firestore уншихыг зөвшөөрөөгүй (PERMISSION_DENIED).\n");
      console.error(`  Эрхийн үүсвэр ....... ${principal.source ?? "тодорхойгүй"}`);
      console.error(`  Project ............. ${principal.projectId ?? "тодорхойгүй"}`);
      console.error(`  Service account ..... ${principal.clientEmail ?? "тодорхойгүй"}`);
      console.error(`  Database ............ ${DATABASE_ID}`);
      console.error(
        "\n  Энэ account-д Firestore уншах эрх дутуу байна. Google Cloud Console →\n" +
          "  IAM & Admin → IAM → тэр account → роль нэмэх: \"Cloud Datastore User\"\n" +
          "  (эсвэл \"Cloud Datastore Viewer\" — унших л хэрэгтэй).\n" +
          "  Firebase Admin SDK-ийн default account-д энэ эрх аль хэдийн байдаг.",
      );
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  });
}
