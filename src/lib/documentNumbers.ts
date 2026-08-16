import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Sequential document numbers reserved through a Firestore transaction on a per-series
 * counter, so two admins saving at the same moment can never land on the same number.
 *
 * This replaces two older approaches that both broke under concurrency: random suffixes
 * (which collide silently) and "read the whole collection and take max + 1" (which returns
 * the same value to every concurrent caller, and costs a full collection read).
 *
 * Each series lives at `counters/{series}` and holds `{ lastNumber, year, prefix }`.
 * Year-scoped series restart at 1 each January; flat series count up forever.
 */
export const COUNTERS_COLLECTION = "counters";

export interface NumberSeries {
  /** Document id under `counters/`. */
  counterId: string;
  prefix: string;
  /** Restart the sequence at the beginning of each calendar year and embed the year. */
  yearScoped: boolean;
  padding: number;
}

export const NUMBER_SERIES = {
  sale: { counterId: "sales", prefix: "SL", yearScoped: true, padding: 5 },
  directSale: { counterId: "directSales", prefix: "DS", yearScoped: true, padding: 5 },
  customerTransaction: { counterId: "customerTransactions", prefix: "TX", yearScoped: false, padding: 6 },
  productionBatch: { counterId: "productionBatches", prefix: "BATCH", yearScoped: true, padding: 4 },
  customer: { counterId: "customers", prefix: "CUS", yearScoped: false, padding: 4 },
  crmContact: { counterId: "crmContacts", prefix: "HAR", yearScoped: false, padding: 4 },
  transfer: { counterId: "transfers", prefix: "TRF", yearScoped: true, padding: 5 },
  journalEntry: { counterId: "journalEntries", prefix: "JE", yearScoped: true, padding: 6 },
} as const satisfies Record<string, NumberSeries>;

export type NumberSeriesName = keyof typeof NUMBER_SERIES;

/** The shop's own timezone — every date a document number embeds is read in it. */
export const BUSINESS_TIME_ZONE = "Asia/Ulaanbaatar";

/**
 * The current year in the shop's timezone.
 *
 * `new Date().getFullYear()` reads the *host's* year, and this sequence is advanced from
 * two hosts: an admin's browser (Ulaanbaatar) and the Vercel serverless runtime (UTC).
 * For the first eight hours of every January the two disagree, and since a year-scoped
 * series restarts whenever the stored year differs, each host would keep resetting the
 * counter the other had just advanced — handing out the same number twice.
 */
export function businessYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en", { timeZone: BUSINESS_TIME_ZONE, year: "numeric" }).format(now),
  );
}

function formatNumber(series: NumberSeries, value: number, year: number): string {
  const body = String(value).padStart(series.padding, "0");
  return series.yearScoped ? `${series.prefix}-${year}-${body}` : `${series.prefix}-${body}`;
}

/**
 * Reserves the next number in a series. Runs its own transaction, so it must be awaited
 * *before* a caller opens the business transaction or batch that will use the number —
 * a Firestore transaction cannot read after it has written.
 */
/**
 * A collision-free number for a document a *shopper* creates.
 *
 * Storefront checkouts cannot use a counter: reserving one means writing to `counters/`,
 * which only admins may do, and opening that up would let anyone bump the sequence. The
 * document's own Firestore id is already globally unique, so the number is derived from it
 * — unique without a shared write, and still readable and sortable by date.
 */
export function documentNumberFromId(prefix: string, documentId: string): string {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const at = (type: string) => dateParts.find((part) => part.type === type)?.value ?? "00";

  const suffix = documentId.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase();
  return `${prefix}-${at("year")}${at("month")}${at("day")}-${suffix}`;
}

export async function reserveDocumentNumber(name: NumberSeriesName): Promise<string> {
  const series: NumberSeries = NUMBER_SERIES[name];
  const currentYear = businessYear();
  const counterRef = doc(db, COUNTERS_COLLECTION, series.counterId);

  return runTransaction(db, async (t) => {
    const snap = await t.get(counterRef);
    let lastNumber = 0;

    if (snap.exists()) {
      const data = snap.data();
      // A year-scoped series restarts whenever the stored year is not the current one.
      if (!series.yearScoped || data.year === currentYear) {
        lastNumber = Number(data.lastNumber ?? 0);
      }
    }

    const nextNumber = lastNumber + 1;
    t.set(counterRef, { lastNumber: nextNumber, year: currentYear, prefix: series.prefix });
    return formatNumber(series, nextNumber, currentYear);
  });
}
