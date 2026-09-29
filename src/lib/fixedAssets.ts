import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import { ACCOUNT_CODES, type AccountCode } from "./accounting/chartOfAccounts";
import {
  buildDepreciationEntry,
  buildFixedAssetAcquisitionEntry,
  buildFixedAssetDisposalEntry,
  buildReversalEntry,
  type JournalLine,
} from "./accounting/entryBuilders";
import {
  generateJournalEntryNumber,
  postJournalEntry,
  readJournalEntryLines,
  JOURNAL_ENTRIES_COLLECTION,
} from "./accounting/postEntryClient";
import { BUSINESS_TIME_ZONE, reserveDocumentNumber } from "./documentNumbers";

/**
 * Fixed assets (Үндсэн хөрөнгө): the register, straight-line depreciation, disposals, and
 * the reports built on them.
 *
 * How it ties into the ledger:
 * - Registering an asset posts its cost to the asset-class account (1510–1560). A purchase
 *   is paid from cash/bank; an asset the company already owned before this system (the
 *   opening register) is balanced against equity, with the depreciation it had already
 *   accumulated by the cut-over month charged to retained earnings.
 * - Depreciation is posted once a month for every asset together (Dr 5200 / Cr 1590),
 *   dated the last day of that month. Each run tops every asset up to where its schedule
 *   says it should be, so an asset entered late catches up on the next run instead of
 *   being skipped for the months that were already closed.
 * - A disposal charges any depreciation still missing, removes cost and accumulated
 *   depreciation, and books the difference to proceeds as a gain or a loss.
 *
 * Every write reverses (never edits) the journal entries it replaces, like the rest of the
 * ledger. The schedule and report maths are pure functions below so they can be tested.
 */

export const FIXED_ASSETS_COLLECTION = "fixedAssets";
export const DEPRECIATION_RUNS_COLLECTION = "fixedAssetDepreciationRuns";

// ─── Classes ──────────────────────────────────────────────────────────────────

export type FixedAssetCategory = "buildings" | "machinery" | "vehicles" | "furniture" | "computers" | "other";

export interface FixedAssetCategoryInfo {
  mn: string;
  en: string;
  accountCode: AccountCode;
  /**
   * Suggested useful life. Taken from the depreciation periods of the Corporate Income Tax
   * law (ААНОАТ-ын тухай хууль, 24.2) since most Mongolian SMEs keep one set of books —
   * a suggestion only; every asset can carry its own.
   */
  defaultLifeYears: number;
}

export const FIXED_ASSET_CATEGORIES: Record<FixedAssetCategory, FixedAssetCategoryInfo> = {
  buildings: { mn: "Барилга, байгууламж", en: "Buildings & structures", accountCode: ACCOUNT_CODES.FA_BUILDINGS, defaultLifeYears: 25 },
  machinery: { mn: "Машин, тоног төхөөрөмж", en: "Machinery & equipment", accountCode: ACCOUNT_CODES.FA_MACHINERY, defaultLifeYears: 10 },
  vehicles: { mn: "Тээврийн хэрэгсэл", en: "Vehicles", accountCode: ACCOUNT_CODES.FA_VEHICLES, defaultLifeYears: 10 },
  furniture: { mn: "Тавилга, эд хогшил", en: "Furniture & fixtures", accountCode: ACCOUNT_CODES.FA_FURNITURE, defaultLifeYears: 10 },
  computers: { mn: "Компьютер, дагалдах хэрэгсэл", en: "Computers & peripherals", accountCode: ACCOUNT_CODES.FA_COMPUTERS, defaultLifeYears: 2 },
  other: { mn: "Бусад үндсэн хөрөнгө", en: "Other fixed assets", accountCode: ACCOUNT_CODES.FA_OTHER, defaultLifeYears: 10 },
};

export const FIXED_ASSET_CATEGORY_KEYS = Object.keys(FIXED_ASSET_CATEGORIES) as FixedAssetCategory[];

function isCategory(value: unknown): value is FixedAssetCategory {
  return typeof value === "string" && value in FIXED_ASSET_CATEGORIES;
}

// ─── Records ──────────────────────────────────────────────────────────────────

/** How the asset came onto the books: bought with cash/bank, or carried over from before. */
export type FixedAssetFunding = "cash" | "bank" | "opening";

export type FixedAssetDisposalReason = "sold" | "scrapped";

export interface FixedAssetDisposal {
  /** YYYY-MM-DD. No depreciation is charged for the month of disposal. */
  date: string;
  reason: FixedAssetDisposalReason;
  proceeds: number;
  paymentMethod: string | null;
  note: string;
  /** Accumulated depreciation removed with the asset (through the month before disposal). */
  accumulatedDepreciation: number;
  /** The part of it charged by the disposal itself because no run had covered it yet. */
  depreciationCatchUp: number;
  /** Proceeds minus carrying amount: positive is a gain (4950), negative a loss (5950). */
  gainLoss: number;
  journalEntryId: string | null;
}

export interface FixedAsset {
  id: string;
  /** FA-0001 … */
  code: string;
  name: string;
  category: FixedAssetCategory;
  accountCode: AccountCode;
  quantity: number;
  unitCost: number;
  /** Capitalised cost in whole ₮ — quantity × unit cost, rounded; the amount on the ledger. */
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  /** YYYY-MM-DD. Depreciation starts the month after. */
  acquisitionDate: string;
  funding: FixedAssetFunding;
  /** Opening register only: the cut-over month (YYYY-MM) the opening figures are as of. */
  openingAsOf: string | null;
  /** Opening register only: depreciation already accumulated by the end of `openingAsOf`. */
  openingAccumulatedDepreciation: number;
  location: string;
  responsible: string;
  note: string;
  status: "active" | "disposed";
  disposal: FixedAssetDisposal | null;
  /** The acquisition / opening journal entry — reversed when the asset is edited or removed. */
  journalEntryId: string | null;
  createdByUid: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FixedAssetInput {
  name: string;
  category: FixedAssetCategory;
  quantity: number;
  unitCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  acquisitionDate: string;
  funding: FixedAssetFunding;
  openingAsOf: string | null;
  openingAccumulatedDepreciation: number;
  location: string;
  responsible: string;
  note: string;
}

export interface DepreciationRunLine {
  assetId: string;
  amount: number;
}

export interface DepreciationRun {
  /** Same as `period` — one run per month. */
  id: string;
  /** YYYY-MM */
  period: string;
  /** YYYY-MM-DD, the last day of the period — the business date of its journal entry. */
  date: string;
  lines: DepreciationRunLine[];
  totalAmount: number;
  journalEntryId: string | null;
  createdByUid: string;
  createdAt: string | null;
}

// ─── Month arithmetic (YYYY-MM keys compare correctly as plain strings) ─────────

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1);
}

function monthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(month: string, count: number): string {
  return monthFromIndex(monthIndex(month) + count);
}

/** Whole months from `from` to `to` (positive when `to` is later). */
export function monthsBetween(from: string, to: string): number {
  return monthIndex(to) - monthIndex(from);
}

/** Last calendar day of a YYYY-MM month, as YYYY-MM-DD. */
export function monthEndDate(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

/** The current month in the shop's own timezone. */
export function businessMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidMonth(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// ─── Depreciation schedule (straight line, monthly) ────────────────────────────

type DepreciationBasis = Pick<
  FixedAsset,
  "cost" | "salvageValue" | "usefulLifeMonths" | "acquisitionDate" | "openingAsOf" | "openingAccumulatedDepreciation"
>;

/** Cost less residual value, in whole ₮ — never negative. */
export function depreciableAmount(asset: Pick<FixedAsset, "cost" | "salvageValue">): number {
  return Math.max(0, Math.round(asset.cost) - Math.round(asset.salvageValue));
}

/** First month depreciation is charged for: the one after the acquisition month. */
export function depreciationStartMonth(asset: Pick<FixedAsset, "acquisitionDate">): string {
  return addMonths(monthOf(asset.acquisitionDate), 1);
}

/** Opening accumulated depreciation as stored, clamped into [0, depreciable amount]. */
export function openingAccumulated(asset: DepreciationBasis): number {
  if (!asset.openingAsOf) return 0;
  return Math.max(0, Math.min(Math.round(asset.openingAccumulatedDepreciation), depreciableAmount(asset)));
}

/**
 * The textbook schedule with no opening figure applied: after k months of the useful life,
 * round(depreciable × k / life). Used to suggest an opening accumulated depreciation, and
 * for report months before an opening register's cut-over.
 */
export function plainScheduledAccumulated(asset: DepreciationBasis, month: string): number {
  const life = Math.max(0, Math.round(asset.usefulLifeMonths));
  if (life === 0) return 0;
  const elapsed = Math.max(0, Math.min(life, monthsBetween(depreciationStartMonth(asset), month) + 1));
  return Math.round((depreciableAmount(asset) * elapsed) / life);
}

/**
 * Where the schedule is anchored. Without an opening figure it starts from zero the month
 * before depreciation begins. With one it starts from the opening figure at the cut-over
 * and spreads what is left over the months of life that are left — so an opening number
 * that differs from the textbook one (it came from the old books) is honoured, not undone.
 */
function scheduleAnchor(asset: DepreciationBasis) {
  const life = Math.max(0, Math.round(asset.usefulLifeMonths));
  const start = depreciationStartMonth(asset);
  const beforeStart = addMonths(start, -1);
  const pivot = asset.openingAsOf && asset.openingAsOf > beforeStart ? asset.openingAsOf : beforeStart;
  const elapsed = Math.min(life, Math.max(0, monthsBetween(start, pivot) + 1));
  const opening = openingAccumulated(asset);
  return { pivot, opening, remainingBase: depreciableAmount(asset) - opening, remainingMonths: life - elapsed };
}

/** Accumulated depreciation the schedule says the asset should have reached by the end of `month`. */
export function scheduledAccumulated(asset: DepreciationBasis, month: string): number {
  const { pivot, opening, remainingBase, remainingMonths } = scheduleAnchor(asset);
  if (month <= pivot) return opening;
  // Life already over at the anchor but not fully written down: the rest is due at once.
  if (remainingMonths <= 0) return opening + remainingBase;
  const months = Math.min(monthsBetween(pivot, month), remainingMonths);
  return opening + Math.round((remainingBase * months) / remainingMonths);
}

/** The schedule's charge for one month. Rounded cumulatively, so a full life sums exactly. */
export function scheduledDepreciationForMonth(asset: DepreciationBasis, month: string): number {
  return scheduledAccumulated(asset, month) - scheduledAccumulated(asset, addMonths(month, -1));
}

/** Average monthly charge over what is left of the life — for display. */
export function monthlyDepreciationRate(asset: DepreciationBasis): number {
  const { remainingBase, remainingMonths } = scheduleAnchor(asset);
  return remainingMonths > 0 ? remainingBase / remainingMonths : 0;
}

/** Last month the schedule charges anything. */
export function depreciationEndMonth(asset: DepreciationBasis): string {
  const { pivot, remainingMonths } = scheduleAnchor(asset);
  return addMonths(pivot, Math.max(remainingMonths, 1));
}

// ─── Posted figures (what is actually on the ledger) ───────────────────────────

export function latestRun(runs: DepreciationRun[]): DepreciationRun | null {
  return runs.reduce<DepreciationRun | null>((latest, run) => (!latest || run.period > latest.period ? run : latest), null);
}

/**
 * Accumulated depreciation posted to 1590 for this asset: the opening figure plus every run
 * up to `throughMonth` (all runs when omitted). A disposed asset carries what it left with.
 */
export function postedAccumulated(asset: FixedAsset, runs: DepreciationRun[], throughMonth?: string): number {
  if (asset.status === "disposed" && asset.disposal && (!throughMonth || throughMonth >= monthOf(asset.disposal.date))) {
    return asset.disposal.accumulatedDepreciation;
  }
  let total = openingAccumulated(asset);
  for (const run of runs) {
    if (throughMonth && run.period > throughMonth) continue;
    for (const runLine of run.lines) {
      if (runLine.assetId === asset.id) total += runLine.amount;
    }
  }
  return total;
}

/** Once depreciation has been posted against an asset its cost, life and dates are history. */
export function isFinanciallyLocked(asset: FixedAsset, runs: DepreciationRun[]): boolean {
  return asset.status === "disposed" || runs.some((run) => run.lines.some((runLine) => runLine.assetId === asset.id));
}

/**
 * What a run for `period` would post: every active asset topped up to its scheduled
 * accumulated depreciation for that month. Assets that are already there get no line.
 */
export function computeDepreciationRun(
  assets: FixedAsset[],
  runs: DepreciationRun[],
  period: string,
): { lines: DepreciationRunLine[]; totalAmount: number } {
  const lines: DepreciationRunLine[] = [];
  for (const asset of assets) {
    if (asset.status !== "active") continue;
    if (monthOf(asset.acquisitionDate) >= period) continue;
    const due = scheduledAccumulated(asset, period) - postedAccumulated(asset, runs);
    if (due > 0) lines.push({ assetId: asset.id, amount: due });
  }
  return { lines, totalAmount: lines.reduce((sum, runLine) => sum + runLine.amount, 0) };
}

/**
 * Months that can be posted now, oldest first, each with the amount it would post given the
 * ones before it: from the month after the latest run (or the first month anything is due)
 * through `lastMonth` — normally the last closed month. Months with nothing due are left out.
 */
export function pendingDepreciationMonths(
  assets: FixedAsset[],
  runs: DepreciationRun[],
  lastMonth: string,
): Array<{ period: string; totalAmount: number; assetCount: number }> {
  const latest = latestRun(runs);
  let first: string | null = latest ? addMonths(latest.period, 1) : null;
  if (!first) {
    for (const asset of assets) {
      if (asset.status !== "active") continue;
      const candidate = addMonths(scheduleAnchor(asset).pivot, 1);
      if (!first || candidate < first) first = candidate;
    }
  }
  if (!first || first > lastMonth) return [];

  const simulated = [...runs];
  const result: Array<{ period: string; totalAmount: number; assetCount: number }> = [];
  for (let period = first; period <= lastMonth; period = addMonths(period, 1)) {
    const run = computeDepreciationRun(assets, simulated, period);
    if (run.totalAmount <= 0) continue;
    result.push({ period, totalAmount: run.totalAmount, assetCount: run.lines.length });
    simulated.push({ id: period, period, date: monthEndDate(period), lines: run.lines, totalAmount: run.totalAmount, journalEntryId: null, createdByUid: "", createdAt: null });
  }
  return result;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function assetCostFor(input: Pick<FixedAssetInput, "quantity" | "unitCost">): number {
  return Math.round(input.quantity * input.unitCost);
}

/** Returns an error message (Mongolian) or null when the input can be saved. */
export function validateFixedAssetInput(input: FixedAssetInput): string | null {
  if (!input.name.trim()) return "Хөрөнгийн нэрийг оруулна уу.";
  if (!isCategory(input.category)) return "Ангиллаа сонгоно уу.";
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return "Тоо ширхэг 0-ээс их байх ёстой.";
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) return "Нэгжийн өртөг сөрөг байж болохгүй.";
  const cost = assetCostFor(input);
  if (cost <= 0) return "Үндсэн өртөг 0-ээс их байх ёстой.";
  if (!Number.isFinite(input.salvageValue) || input.salvageValue < 0 || input.salvageValue > cost) {
    return "Үлдэх өртөг 0-ээс үндсэн өртөг хүртэл байна.";
  }
  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1) return "Ашиглах хугацаа дор хаяж 1 сар байна.";
  if (!isValidDate(input.acquisitionDate)) return "Олж авсан огноо буруу байна.";
  if (input.funding === "opening") {
    if (!isValidMonth(input.openingAsOf)) return "Эхний үлдэгдлийн огноог (сар) оруулна уу.";
    if (input.openingAsOf < monthOf(input.acquisitionDate)) return "Эхний үлдэгдлийн сар олж авсан огнооноос өмнө байж болохгүй.";
    const depreciable = depreciableAmount({ cost, salvageValue: input.salvageValue });
    if (!Number.isFinite(input.openingAccumulatedDepreciation) || input.openingAccumulatedDepreciation < 0 || Math.round(input.openingAccumulatedDepreciation) > depreciable) {
      return "Хуримтлагдсан элэгдэл 0-ээс элэгдүүлэх дүн хүртэл байна.";
    }
  } else if (input.funding !== "cash" && input.funding !== "bank") {
    return "Санхүүжилтийн эх үүсвэрээ сонгоно уу.";
  }
  return null;
}

/** Fields that are pure description — editable even after depreciation has been posted. */
const DESCRIPTIVE_FIELDS = ["name", "location", "responsible", "note"] as const;

function financialFieldsChanged(asset: FixedAsset, input: FixedAssetInput): boolean {
  const opening = input.funding === "opening";
  return (
    asset.category !== input.category ||
    asset.quantity !== input.quantity ||
    asset.unitCost !== input.unitCost ||
    asset.salvageValue !== input.salvageValue ||
    asset.usefulLifeMonths !== input.usefulLifeMonths ||
    asset.acquisitionDate !== input.acquisitionDate ||
    asset.funding !== input.funding ||
    (opening && (asset.openingAsOf !== input.openingAsOf || asset.openingAccumulatedDepreciation !== input.openingAccumulatedDepreciation))
  );
}

// ─── Firestore (de)serialisation ───────────────────────────────────────────────

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deserializeAsset(snapshot: QueryDocumentSnapshot<DocumentData>): FixedAsset {
  const data = snapshot.data() as Record<string, unknown>;
  const category = isCategory(data.category) ? data.category : "other";
  const disposalData = data.disposal as Record<string, unknown> | null | undefined;
  return {
    id: snapshot.id,
    code: String(data.code ?? snapshot.id),
    name: String(data.name ?? ""),
    category,
    accountCode: FIXED_ASSET_CATEGORIES[category].accountCode,
    quantity: num(data.quantity) || 1,
    unitCost: num(data.unitCost),
    cost: num(data.cost),
    salvageValue: num(data.salvageValue),
    usefulLifeMonths: num(data.usefulLifeMonths),
    acquisitionDate: String(data.acquisitionDate ?? ""),
    funding: data.funding === "bank" || data.funding === "opening" ? data.funding : "cash",
    openingAsOf: typeof data.openingAsOf === "string" ? data.openingAsOf : null,
    openingAccumulatedDepreciation: num(data.openingAccumulatedDepreciation),
    location: String(data.location ?? ""),
    responsible: String(data.responsible ?? ""),
    note: String(data.note ?? ""),
    status: data.status === "disposed" ? "disposed" : "active",
    disposal: disposalData
      ? {
          date: String(disposalData.date ?? ""),
          reason: disposalData.reason === "sold" ? "sold" : "scrapped",
          proceeds: num(disposalData.proceeds),
          paymentMethod: typeof disposalData.paymentMethod === "string" ? disposalData.paymentMethod : null,
          note: String(disposalData.note ?? ""),
          accumulatedDepreciation: num(disposalData.accumulatedDepreciation),
          depreciationCatchUp: num(disposalData.depreciationCatchUp),
          gainLoss: num(disposalData.gainLoss),
          journalEntryId: typeof disposalData.journalEntryId === "string" ? disposalData.journalEntryId : null,
        }
      : null,
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

function deserializeRun(snapshot: QueryDocumentSnapshot<DocumentData>): DepreciationRun {
  const data = snapshot.data() as Record<string, unknown>;
  const period = String(data.period ?? snapshot.id);
  return {
    id: snapshot.id,
    period,
    date: String(data.date ?? monthEndDate(period)),
    lines: Array.isArray(data.lines)
      ? (data.lines as Array<Record<string, unknown>>).map((runLine) => ({ assetId: String(runLine.assetId ?? ""), amount: num(runLine.amount) }))
      : [],
    totalAmount: num(data.totalAmount),
    journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
    createdByUid: String(data.createdByUid ?? ""),
    createdAt: parseTimestamp(data.createdAt),
  };
}

function assetFields(input: FixedAssetInput) {
  const opening = input.funding === "opening";
  return {
    name: input.name.trim(),
    category: input.category,
    accountCode: FIXED_ASSET_CATEGORIES[input.category].accountCode,
    quantity: input.quantity,
    unitCost: input.unitCost,
    cost: assetCostFor(input),
    salvageValue: Math.round(input.salvageValue),
    usefulLifeMonths: input.usefulLifeMonths,
    acquisitionDate: input.acquisitionDate,
    funding: input.funding,
    openingAsOf: opening ? input.openingAsOf : null,
    openingAccumulatedDepreciation: opening ? Math.round(input.openingAccumulatedDepreciation) : 0,
    location: input.location.trim(),
    responsible: input.responsible.trim(),
    note: input.note.trim(),
  };
}

/** Business date of an asset's acquisition entry: the purchase day, or the cut-over month's end. */
function acquisitionEntryDate(fields: Pick<FixedAsset, "funding" | "acquisitionDate" | "openingAsOf">): string {
  return fields.funding === "opening" && fields.openingAsOf ? monthEndDate(fields.openingAsOf) : fields.acquisitionDate;
}

type Batch = ReturnType<typeof writeBatch>;

/**
 * Queues a mirror image of a previously posted entry, dated on the same business day as the
 * original so the period it was in ends up exactly as if the original had never been posted.
 */
async function queueReversal(batch: Batch, journalEntryId: string, meta: { sourceType: "fixedAsset" | "fixedAssetDisposal"; sourceId: string; sourceNumber: string; description: string; createdBy: string }) {
  const snapshot = await getDoc(doc(db, JOURNAL_ENTRIES_COLLECTION, journalEntryId));
  if (!snapshot.exists()) return;
  const data = snapshot.data() as { lines?: JournalLine[]; date?: string };
  const entryNumber = await generateJournalEntryNumber();
  postJournalEntry(batch, entryNumber, buildReversalEntry(data.lines ?? []), {
    ...meta,
    reversalOf: journalEntryId,
    date: typeof data.date === "string" ? data.date : undefined,
  });
}

function postAcquisition(batch: Batch, entryNumber: string, assetId: string, code: string, fields: ReturnType<typeof assetFields>, createdBy: string) {
  return postJournalEntry(
    batch,
    entryNumber,
    buildFixedAssetAcquisitionEntry({
      assetAccount: fields.accountCode,
      cost: fields.cost,
      funding: fields.funding,
      openingAccumulatedDepreciation: fields.openingAccumulatedDepreciation,
    }),
    {
      sourceType: "fixedAsset",
      sourceId: assetId,
      sourceNumber: code,
      description:
        fields.funding === "opening"
          ? `Үндсэн хөрөнгийн эхний үлдэгдэл — ${code} ${fields.name}`
          : `Үндсэн хөрөнгө худалдан авсан — ${code} ${fields.name}`,
      date: acquisitionEntryDate(fields),
      createdBy,
    },
  );
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createFixedAsset(input: FixedAssetInput, createdByUid: string): Promise<string> {
  const error = validateFixedAssetInput(input);
  if (error) throw new Error(error);

  const fields = assetFields(input);
  const code = await reserveDocumentNumber("fixedAsset");
  const entryNumber = await generateJournalEntryNumber();
  const assetRef = doc(collection(db, FIXED_ASSETS_COLLECTION));

  const batch = writeBatch(db);
  const posted = postAcquisition(batch, entryNumber, assetRef.id, code, fields, createdByUid);
  const now = new Date().toISOString();
  batch.set(assetRef, {
    ...fields,
    code,
    status: "active",
    disposal: null,
    journalEntryId: posted.id,
    createdByUid,
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();
  return assetRef.id;
}

/**
 * Edits an asset. Before any depreciation has been posted against it, the acquisition entry
 * is reversed and re-posted with the new figures. After that only descriptive fields can
 * change — altering cost or life then would leave the posted depreciation inconsistent.
 */
export async function updateFixedAsset(asset: FixedAsset, input: FixedAssetInput, runs: DepreciationRun[], editedByUid: string): Promise<void> {
  const error = validateFixedAssetInput(input);
  if (error) throw new Error(error);

  const assetRef = doc(db, FIXED_ASSETS_COLLECTION, asset.id);
  const fields = assetFields(input);
  const now = new Date().toISOString();

  if (!financialFieldsChanged(asset, input)) {
    const descriptive = Object.fromEntries(DESCRIPTIVE_FIELDS.map((key) => [key, fields[key]]));
    const batch = writeBatch(db);
    batch.update(assetRef, { ...descriptive, updatedAt: now });
    await batch.commit();
    return;
  }

  if (isFinanciallyLocked(asset, runs)) {
    throw new Error("Элэгдэл байгуулагдсан тул өртөг, хугацаа, огноо, ангиллыг засах боломжгүй. Зөвхөн нэр, байршил, хариуцагч, тэмдэглэл засна.");
  }

  const batch = writeBatch(db);
  if (asset.journalEntryId) {
    await queueReversal(batch, asset.journalEntryId, {
      sourceType: "fixedAsset",
      sourceId: asset.id,
      sourceNumber: asset.code,
      description: `Үндсэн хөрөнгө засварласан — хуучин бичилтийг цуцаллаа (${asset.code})`,
      createdBy: editedByUid,
    });
  }
  const entryNumber = await generateJournalEntryNumber();
  const posted = postAcquisition(batch, entryNumber, asset.id, asset.code, fields, editedByUid);
  batch.update(assetRef, { ...fields, journalEntryId: posted.id, updatedAt: now });
  await batch.commit();
}

/** Removes a mistaken registration. Only possible while nothing has been depreciated or disposed. */
export async function deleteFixedAsset(asset: FixedAsset, runs: DepreciationRun[], deletedByUid: string): Promise<void> {
  if (isFinanciallyLocked(asset, runs)) {
    throw new Error("Элэгдэл байгуулагдсан эсвэл данснаас хасагдсан хөрөнгийг устгах боломжгүй — «Данснаас хасах» үйлдлийг ашиглана уу.");
  }
  const batch = writeBatch(db);
  if (asset.journalEntryId) {
    await queueReversal(batch, asset.journalEntryId, {
      sourceType: "fixedAsset",
      sourceId: asset.id,
      sourceNumber: asset.code,
      description: `Үндсэн хөрөнгө устгасан — бичилтийг цуцаллаа (${asset.code})`,
      createdBy: deletedByUid,
    });
  }
  batch.delete(doc(db, FIXED_ASSETS_COLLECTION, asset.id));
  await batch.commit();
}

export interface FixedAssetDisposalInput {
  date: string;
  reason: FixedAssetDisposalReason;
  proceeds: number;
  paymentMethod: "cash" | "bank";
  note: string;
}

/** Figures a disposal on `date` would book — shown in the dialog before it is confirmed. */
export function previewDisposal(asset: FixedAsset, runs: DepreciationRun[], date: string, proceeds: number) {
  const accumulatedDepreciation = Math.min(scheduledAccumulated(asset, addMonths(monthOf(date), -1)), depreciableAmount(asset));
  const posted = postedAccumulated(asset, runs);
  const carryingAmount = Math.round(asset.cost) - accumulatedDepreciation;
  return {
    accumulatedDepreciation,
    depreciationCatchUp: accumulatedDepreciation - posted,
    postedAccumulated: posted,
    carryingAmount,
    gainLoss: Math.max(0, Math.round(proceeds)) - carryingAmount,
  };
}

export async function disposeFixedAsset(asset: FixedAsset, runs: DepreciationRun[], input: FixedAssetDisposalInput, disposedByUid: string): Promise<void> {
  if (asset.status !== "active") throw new Error("Энэ хөрөнгө аль хэдийн данснаас хасагдсан байна.");
  if (!isValidDate(input.date)) throw new Error("Данснаас хасах огноо буруу байна.");
  if (input.date < asset.acquisitionDate) throw new Error("Данснаас хасах огноо олж авсан огнооноос өмнө байж болохгүй.");
  if (!Number.isFinite(input.proceeds) || input.proceeds < 0) throw new Error("Борлуулсан үнэ сөрөг байж болохгүй.");
  const proceeds = input.reason === "sold" ? Math.round(input.proceeds) : 0;

  const preview = previewDisposal(asset, runs, input.date, proceeds);
  const entryNumber = await generateJournalEntryNumber();
  const batch = writeBatch(db);
  const posted = postJournalEntry(
    batch,
    entryNumber,
    buildFixedAssetDisposalEntry({
      assetAccount: asset.accountCode,
      cost: asset.cost,
      postedAccumulated: preview.postedAccumulated,
      accumulatedAtDisposal: preview.accumulatedDepreciation,
      proceeds,
      paymentMethod: input.paymentMethod,
    }),
    {
      sourceType: "fixedAssetDisposal",
      sourceId: asset.id,
      sourceNumber: asset.code,
      description: `Үндсэн хөрөнгө данснаас хассан (${input.reason === "sold" ? "борлуулсан" : "актласан"}) — ${asset.code} ${asset.name}`,
      date: input.date,
      createdBy: disposedByUid,
    },
  );
  const disposal: FixedAssetDisposal = {
    date: input.date,
    reason: input.reason,
    proceeds,
    paymentMethod: input.reason === "sold" ? input.paymentMethod : null,
    note: input.note.trim(),
    accumulatedDepreciation: preview.accumulatedDepreciation,
    depreciationCatchUp: preview.depreciationCatchUp,
    gainLoss: preview.gainLoss,
    journalEntryId: posted.id,
  };
  batch.update(doc(db, FIXED_ASSETS_COLLECTION, asset.id), { status: "disposed", disposal, updatedAt: new Date().toISOString() });
  await batch.commit();
}

/** Undoes a disposal recorded by mistake: its entry is reversed and the asset is active again. */
export async function restoreDisposedAsset(asset: FixedAsset, restoredByUid: string): Promise<void> {
  if (asset.status !== "disposed" || !asset.disposal) throw new Error("Энэ хөрөнгө данснаас хасагдаагүй байна.");
  const batch = writeBatch(db);
  if (asset.disposal.journalEntryId) {
    await queueReversal(batch, asset.disposal.journalEntryId, {
      sourceType: "fixedAssetDisposal",
      sourceId: asset.id,
      sourceNumber: asset.code,
      description: `Данснаас хасалтыг цуцалсан — ${asset.code} ${asset.name}`,
      createdBy: restoredByUid,
    });
  }
  batch.update(doc(db, FIXED_ASSETS_COLLECTION, asset.id), { status: "active", disposal: null, updatedAt: new Date().toISOString() });
  await batch.commit();
}

/**
 * Posts one month's depreciation. Months go strictly in order — a run always tops assets up
 * to their schedule, which only adds up if no later month has been posted before it.
 */
export async function createDepreciationRun(assets: FixedAsset[], runs: DepreciationRun[], period: string, createdByUid: string): Promise<DepreciationRun> {
  if (!isValidMonth(period)) throw new Error("Сар буруу байна.");
  if (period > businessMonth()) throw new Error("Ирээдүйн сарын элэгдэл байгуулах боломжгүй.");
  const latest = latestRun(runs);
  if (latest && period <= latest.period) {
    throw new Error(`${latest.period}-ийн элэгдэл аль хэдийн байгуулагдсан. Дараагийн сар нь ${addMonths(latest.period, 1)}.`);
  }
  const { lines, totalAmount } = computeDepreciationRun(assets, runs, period);
  if (totalAmount <= 0) throw new Error(`${period}-д байгуулах элэгдэл алга.`);

  const date = monthEndDate(period);
  const entryNumber = await generateJournalEntryNumber();
  const runRef = doc(db, DEPRECIATION_RUNS_COLLECTION, period);

  await runTransaction(db, async (t) => {
    const existing = await t.get(runRef);
    if (existing.exists()) throw new Error(`${period}-ийн элэгдэл аль хэдийн байгуулагдсан.`);
    const posted = postJournalEntry(t, entryNumber, buildDepreciationEntry({ amount: totalAmount }), {
      sourceType: "fixedAssetDepreciation",
      sourceId: period,
      sourceNumber: `DEP-${period}`,
      description: `Үндсэн хөрөнгийн элэгдэл — ${period} (${lines.length} хөрөнгө)`,
      date,
      createdBy: createdByUid,
    });
    t.set(runRef, { period, date, lines, totalAmount, journalEntryId: posted.id, createdByUid, createdAt: new Date().toISOString() });
  });

  return { id: period, period, date, lines, totalAmount, journalEntryId: null, createdByUid, createdAt: null };
}

/** Why the latest run cannot be undone, or null when it can. */
export function depreciationRunDeleteBlocker(run: DepreciationRun, runs: DepreciationRun[], assets: FixedAsset[]): string | null {
  const latest = latestRun(runs);
  if (!latest || latest.id !== run.id) return "Зөвхөн хамгийн сүүлийн сарын элэгдлийг буцаах боломжтой.";
  const disposedIds = new Set(assets.filter((asset) => asset.status === "disposed").map((asset) => asset.id));
  if (run.lines.some((runLine) => disposedIds.has(runLine.assetId))) {
    return "Энэ сарын элэгдэлд орсон хөрөнгө данснаас хасагдсан тул буцаах боломжгүй.";
  }
  return null;
}

export async function deleteDepreciationRun(run: DepreciationRun, runs: DepreciationRun[], assets: FixedAsset[], deletedByUid: string): Promise<void> {
  const blocker = depreciationRunDeleteBlocker(run, runs, assets);
  if (blocker) throw new Error(blocker);

  const entryNumber = run.journalEntryId ? await generateJournalEntryNumber() : null;
  const runRef = doc(db, DEPRECIATION_RUNS_COLLECTION, run.id);
  await runTransaction(db, async (t) => {
    const snap = await t.get(runRef);
    if (!snap.exists()) return;
    const lines = run.journalEntryId ? await readJournalEntryLines(t, run.journalEntryId) : null;
    if (lines && entryNumber) {
      postJournalEntry(t, entryNumber, buildReversalEntry(lines), {
        sourceType: "fixedAssetDepreciation",
        sourceId: run.period,
        sourceNumber: `DEP-${run.period}`,
        description: `Элэгдлийг буцаасан — ${run.period}`,
        reversalOf: run.journalEntryId,
        date: run.date,
        createdBy: deletedByUid,
      });
    }
    t.delete(runRef);
  });
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function subscribeToFixedAssets({ onData, onError }: { onData: (assets: FixedAsset[]) => void; onError?: (error: FirestoreError) => void }) {
  return onSnapshot(
    query(collection(db, FIXED_ASSETS_COLLECTION), orderBy("code", "asc")),
    (snapshot) => onData(snapshot.docs.map(deserializeAsset)),
    onError,
  );
}

export function subscribeToDepreciationRuns({ onData, onError }: { onData: (runs: DepreciationRun[]) => void; onError?: (error: FirestoreError) => void }) {
  return onSnapshot(
    query(collection(db, DEPRECIATION_RUNS_COLLECTION), orderBy("period", "asc")),
    (snapshot) => onData(snapshot.docs.map(deserializeRun)),
    onError,
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

/** Whether the asset was on the books at the end of `month`. */
export function isHeldAt(asset: FixedAsset, month: string): boolean {
  if (monthOf(asset.acquisitionDate) > month) return false;
  if (asset.status === "disposed" && asset.disposal && monthOf(asset.disposal.date) <= month) return false;
  return true;
}

/**
 * Accumulated depreciation at the end of `month` as the books show it: the posted figure,
 * except before an opening register's cut-over — the system holds no postings for that time,
 * so the textbook schedule stands in.
 */
export function accumulatedAsOf(asset: FixedAsset, runs: DepreciationRun[], month: string): number {
  if (asset.openingAsOf && month < asset.openingAsOf) return plainScheduledAccumulated(asset, month);
  return postedAccumulated(asset, runs, month);
}

export interface RegisterRow {
  asset: FixedAsset;
  cost: number;
  accumulated: number;
  carryingAmount: number;
  /** Depreciation the schedule expects by then but no run has posted yet. */
  unposted: number;
}

/** The register at the end of `month`: every asset held then, with its figures. */
export function registerAsOf(assets: FixedAsset[], runs: DepreciationRun[], month: string): RegisterRow[] {
  return assets
    .filter((asset) => isHeldAt(asset, month))
    .map((asset) => {
      const accumulated = accumulatedAsOf(asset, runs, month);
      const scheduled = asset.openingAsOf && month < asset.openingAsOf ? accumulated : scheduledAccumulated(asset, month);
      return {
        asset,
        cost: Math.round(asset.cost),
        accumulated,
        carryingAmount: Math.round(asset.cost) - accumulated,
        unposted: Math.max(0, scheduled - accumulated),
      };
    });
}

export interface MovementRow {
  category: FixedAssetCategory | "total";
  costOpening: number;
  additions: number;
  disposalsCost: number;
  costClosing: number;
  accOpening: number;
  depreciationCharge: number;
  disposalsAccumulated: number;
  accClosing: number;
  nbvOpening: number;
  nbvClosing: number;
}

function emptyMovement(category: MovementRow["category"]): MovementRow {
  return { category, costOpening: 0, additions: 0, disposalsCost: 0, costClosing: 0, accOpening: 0, depreciationCharge: 0, disposalsAccumulated: 0, accClosing: 0, nbvOpening: 0, nbvClosing: 0 };
}

/**
 * The movement schedule for a calendar year (the Үндсэн хөрөнгө note to the financial
 * statements): opening cost + additions − disposals = closing cost, and the same for
 * accumulated depreciation. The year's charge is derived so the two always reconcile.
 */
export function movementForYear(assets: FixedAsset[], runs: DepreciationRun[], year: number): MovementRow[] {
  const openingMonth = `${year - 1}-12`;
  const closingMonth = `${year}-12`;
  const byCategory = new Map<FixedAssetCategory, MovementRow>();

  for (const asset of assets) {
    const row = byCategory.get(asset.category) ?? emptyMovement(asset.category);
    const cost = Math.round(asset.cost);
    const heldOpening = isHeldAt(asset, openingMonth);
    const heldClosing = isHeldAt(asset, closingMonth);
    const acquiredInYear = asset.acquisitionDate.startsWith(`${year}-`);
    const disposedInYear = asset.status === "disposed" && !!asset.disposal && asset.disposal.date.startsWith(`${year}-`);
    if (!heldOpening && !acquiredInYear) continue;

    const accOpening = heldOpening ? accumulatedAsOf(asset, runs, openingMonth) : 0;
    const accClosing = heldClosing ? accumulatedAsOf(asset, runs, closingMonth) : 0;
    const disposedAcc = disposedInYear && asset.disposal ? asset.disposal.accumulatedDepreciation : 0;

    if (heldOpening) row.costOpening += cost;
    if (acquiredInYear) row.additions += cost;
    if (disposedInYear) row.disposalsCost += cost;
    if (heldClosing) row.costClosing += cost;
    row.accOpening += accOpening;
    row.accClosing += accClosing;
    row.disposalsAccumulated += disposedAcc;
    row.depreciationCharge += accClosing - accOpening + disposedAcc;
    byCategory.set(asset.category, row);
  }

  const rows = FIXED_ASSET_CATEGORY_KEYS.filter((key) => byCategory.has(key)).map((key) => byCategory.get(key) as MovementRow);
  const total = emptyMovement("total");
  for (const row of rows) {
    row.nbvOpening = row.costOpening - row.accOpening;
    row.nbvClosing = row.costClosing - row.accClosing;
    for (const key of Object.keys(total) as Array<keyof MovementRow>) {
      if (key !== "category") (total[key] as number) += row[key] as number;
    }
  }
  return [...rows, total];
}

export interface ScheduleCell {
  amount: number;
  /** True when a run has posted this month; false for a projection (no run yet / before the system). */
  posted: boolean;
}

/**
 * Depreciation month by month through `year` for every asset held at some point in it —
 * posted amounts where a run exists, the schedule's projection elsewhere.
 */
export function depreciationScheduleForYear(assets: FixedAsset[], runs: DepreciationRun[], year: number): Array<{ asset: FixedAsset; months: ScheduleCell[]; total: number }> {
  const runByPeriod = new Map(runs.map((run) => [run.period, run]));
  const rows: Array<{ asset: FixedAsset; months: ScheduleCell[]; total: number }> = [];
  for (const asset of assets) {
    const disposedBy = asset.status === "disposed" && asset.disposal ? monthOf(asset.disposal.date) : null;
    // Held at some point during the year: bought by its end and not gone before its start.
    if (monthOf(asset.acquisitionDate) > `${year}-12` || (disposedBy && disposedBy < `${year}-01`)) continue;

    const months: ScheduleCell[] = [];
    for (let m = 1; m <= 12; m += 1) {
      const period = `${year}-${String(m).padStart(2, "0")}`;
      if (disposedBy && period >= disposedBy) {
        // The disposal itself charges whatever no run had covered, in the month it happens.
        const catchUp = period === disposedBy && asset.disposal ? asset.disposal.depreciationCatchUp : 0;
        months.push({ amount: catchUp, posted: catchUp !== 0 });
        continue;
      }
      if (asset.openingAsOf && period <= asset.openingAsOf) {
        months.push({ amount: plainScheduledAccumulated(asset, period) - plainScheduledAccumulated(asset, addMonths(period, -1)), posted: false });
        continue;
      }
      const run = runByPeriod.get(period);
      if (run) {
        const amount = run.lines.filter((runLine) => runLine.assetId === asset.id).reduce((sum, runLine) => sum + runLine.amount, 0);
        months.push({ amount, posted: true });
      } else {
        months.push({ amount: scheduledDepreciationForMonth(asset, period), posted: false });
      }
    }
    rows.push({ asset, months, total: months.reduce((sum, cell) => sum + cell.amount, 0) });
  }
  return rows;
}

// ─── Import (rows pasted straight from Excel) ──────────────────────────────────

export interface ParsedImportRow {
  name: string;
  /** YYYY-MM-DD, or "" when the cell could not be read as a date — must be filled in. */
  acquisitionDate: string;
  /** Only the year was given; the date was set to 1 July (half-year convention). */
  dateIsYearOnly: boolean;
  quantity: number;
  unitCost: number;
  category: FixedAssetCategory;
}

const CATEGORY_KEYWORDS: Array<[FixedAssetCategory, RegExp]> = [
  ["computers", /компьют|нөүт|ноут|notebook|laptop|принтер|printer|монитор|сервер|сканн|проектор|dell|lenovo|macbook/i],
  ["vehicles", /автомашин|суудлын|ачааны машин|тээврийн хэрэгсэл|мотоцикл|портер|приус/i],
  ["buildings", /барилга|байгууламж|байшин|гарааш|контейнер/i],
  ["furniture", /тавиур|ширээ|шкаф|сандал|тавилга|буйдан|лангуу|вешалка|хорго/i],
  ["machinery", /төхөөрөмж|тоног|машин|хөргөгч|шүүгч|нэрэгч|зуух|аппарат|холигч|миксер|генератор|насос|жин/i],
];

export function guessCategory(name: string): FixedAssetCategory {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(name)) return category;
  }
  return "other";
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s₮]/g, "").replace(/ш\.?$/i, "");
  if (!cleaned) return Number.NaN;
  // "1,873,274.80" → thousands commas; "1873274,8" → a decimal comma.
  const normalised = /,\d{1,2}$/.test(cleaned) && !cleaned.includes(".") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const match = normalised.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function parseImportDate(raw: string): { date: string; yearOnly: boolean } | null {
  const text = raw.trim();
  if (/^\d{4}$/.test(text)) return { date: `${text}-07-01`, yearOnly: true };
  const match = text.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (match) {
    const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    return isValidDate(date) ? { date, yearOnly: false } : null;
  }
  return null;
}

/**
 * Parses rows copied out of the register spreadsheet — columns in the order the shop's
 * sheet has them: Авсан огноо | Нэр | Тоо (хэмжих нэгж) | Үндсэн өртөг (нэгж) | [Нийт].
 * Header, total and signature rows are skipped. When the unit cost is blank the total is
 * divided by the quantity.
 */
export function parseAssetImport(text: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const cells = rawLine.split("\t").map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const parsedDate = parseImportDate(cells[0] ?? "");
    const name = (cells[1] ?? "").replace(/\s+/g, " ").trim();
    if (!name || /^нийт/i.test(name)) continue;
    const quantity = parseAmount(cells[2] ?? "") || 1;
    let unitCost = parseAmount(cells[3] ?? "");
    const total = parseAmount(cells[4] ?? "");
    if (!Number.isFinite(unitCost) && Number.isFinite(total)) unitCost = total / quantity;
    if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
    rows.push({ name, acquisitionDate: parsedDate?.date ?? "", dateIsYearOnly: parsedDate?.yearOnly ?? false, quantity, unitCost, category: guessCategory(name) });
  }
  return rows;
}
