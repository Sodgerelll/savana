import { describe, it, expect, vi } from "vitest";

// ─── The schedule and report maths are pure, but the module imports firebase ───

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import {
  accumulatedAsOf,
  addMonths,
  computeDepreciationRun,
  depreciationScheduleForYear,
  guessCategory,
  monthEndDate,
  movementForYear,
  parseAssetImport,
  pendingDepreciationMonths,
  plainScheduledAccumulated,
  previewDisposal,
  registerAsOf,
  scheduledAccumulated,
  scheduledDepreciationForMonth,
  validateFixedAssetInput,
  type DepreciationRun,
  type FixedAsset,
  type FixedAssetInput,
} from "../../lib/fixedAssets";
import {
  buildDepreciationEntry,
  buildFixedAssetAcquisitionEntry,
  buildFixedAssetDisposalEntry,
  type BuiltEntry,
} from "../../lib/accounting/entryBuilders";
import { ACCOUNT_CODES } from "../../lib/accounting/chartOfAccounts";

function asset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: "a1",
    code: "FA-0001",
    name: "Dell компьютер",
    category: "computers",
    accountCode: ACCOUNT_CODES.FA_COMPUTERS,
    quantity: 1,
    unitCost: 1_200_000,
    cost: 1_200_000,
    salvageValue: 0,
    usefulLifeMonths: 24,
    acquisitionDate: "2025-01-15",
    funding: "cash",
    openingAsOf: null,
    openingAccumulatedDepreciation: 0,
    location: "",
    responsible: "",
    note: "",
    status: "active",
    disposal: null,
    journalEntryId: null,
    createdByUid: "u",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function run(period: string, lines: Array<[string, number]>): DepreciationRun {
  const mapped = lines.map(([assetId, amount]) => ({ assetId, amount }));
  return {
    id: period,
    period,
    date: monthEndDate(period),
    lines: mapped,
    totalAmount: mapped.reduce((sum, l) => sum + l.amount, 0),
    journalEntryId: null,
    createdByUid: "u",
    createdAt: null,
  };
}

function expectBalanced(entry: BuiltEntry) {
  const debit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const credit = entry.lines.reduce((sum, l) => sum + l.credit, 0);
  expect(debit).toBe(credit);
}

function net(entry: BuiltEntry, accountCode: string) {
  return entry.lines.filter((l) => l.accountCode === accountCode).reduce((sum, l) => sum + l.debit - l.credit, 0);
}

// ─── Month helpers ─────────────────────────────────────────────────────────────

describe("month helpers", () => {
  it("adds months across year ends", () => {
    expect(addMonths("2024-12", 1)).toBe("2025-01");
    expect(addMonths("2025-01", -1)).toBe("2024-12");
    expect(addMonths("2024-07", 24)).toBe("2026-07");
  });

  it("knows the last day of a month, leap years included", () => {
    expect(monthEndDate("2024-02")).toBe("2024-02-29");
    expect(monthEndDate("2025-02")).toBe("2025-02-28");
    expect(monthEndDate("2024-12")).toBe("2024-12-31");
  });
});

// ─── Straight-line schedule ────────────────────────────────────────────────────

describe("straight-line schedule", () => {
  it("starts the month after acquisition and charges nothing in the acquisition month", () => {
    const a = asset();
    expect(scheduledDepreciationForMonth(a, "2025-01")).toBe(0);
    expect(scheduledDepreciationForMonth(a, "2025-02")).toBe(50_000);
  });

  it("writes an awkward cost down to exactly zero over its life — rounding never drifts", () => {
    const a = asset({ cost: 1_717_169, unitCost: 1_717_169 });
    let total = 0;
    for (let i = 1; i <= 24; i += 1) total += scheduledDepreciationForMonth(a, addMonths("2025-01", i));
    expect(total).toBe(1_717_169);
    expect(scheduledAccumulated(a, "2027-01")).toBe(1_717_169);
    expect(scheduledDepreciationForMonth(a, "2027-02")).toBe(0);
  });

  it("stops at the residual value", () => {
    const a = asset({ salvageValue: 200_000 });
    expect(scheduledAccumulated(a, "2030-01")).toBe(1_000_000);
  });

  it("spreads what is left of an opening figure over what is left of the life", () => {
    // 24-month life from 2024-08; the old books say 600 000 by the 2024-12 cut-over
    // (the textbook figure would be 5/24 × 1.2m = 250 000).
    const a = asset({ acquisitionDate: "2024-07-01", funding: "opening", openingAsOf: "2024-12", openingAccumulatedDepreciation: 600_000 });
    expect(plainScheduledAccumulated(a, "2024-12")).toBe(250_000);
    expect(scheduledAccumulated(a, "2024-12")).toBe(600_000);
    // 19 months left for the remaining 600 000.
    expect(scheduledAccumulated(a, addMonths("2024-12", 19))).toBe(1_200_000);
    expect(scheduledDepreciationForMonth(a, "2025-01")).toBe(Math.round(600_000 / 19));
  });

  it("charges the whole remainder at once when the life ran out before the cut-over", () => {
    const a = asset({ acquisitionDate: "2020-07-01", funding: "opening", openingAsOf: "2024-12", openingAccumulatedDepreciation: 1_000_000 });
    expect(scheduledDepreciationForMonth(a, "2025-01")).toBe(200_000);
    expect(scheduledDepreciationForMonth(a, "2025-02")).toBe(0);
  });
});

// ─── Monthly runs ──────────────────────────────────────────────────────────────

describe("depreciation runs", () => {
  it("tops a backdated asset up to its schedule on the next run", () => {
    const early = asset({ id: "early" });
    const late = asset({ id: "late", acquisitionDate: "2025-01-20" });
    // Runs for Feb and Mar were posted before "late" was registered.
    const runs = [run("2025-02", [["early", 50_000]]), run("2025-03", [["early", 50_000]])];
    const april = computeDepreciationRun([early, late], runs, "2025-04");
    expect(april.lines).toEqual([
      { assetId: "early", amount: 50_000 },
      { assetId: "late", amount: 150_000 },
    ]);
  });

  it("leaves disposed assets and assets bought in the run month out", () => {
    const disposed = asset({ id: "gone", status: "disposed", disposal: { date: "2025-03-10", reason: "scrapped", proceeds: 0, paymentMethod: null, note: "", accumulatedDepreciation: 50_000, depreciationCatchUp: 0, gainLoss: -1_150_000, journalEntryId: null } });
    const fresh = asset({ id: "fresh", acquisitionDate: "2025-04-02" });
    expect(computeDepreciationRun([disposed, fresh], [], "2025-04").lines).toEqual([]);
  });

  it("lists the months still to post, in order, adding up to the schedule", () => {
    const a = asset();
    const pending = pendingDepreciationMonths([a], [run("2025-02", [["a1", 50_000]])], "2025-06");
    expect(pending.map((p) => p.period)).toEqual(["2025-03", "2025-04", "2025-05", "2025-06"]);
    expect(pending.reduce((sum, p) => sum + p.totalAmount, 0)).toBe(200_000);
  });

  it("starts an opening register's first run the month after the cut-over", () => {
    const a = asset({ acquisitionDate: "2024-07-01", funding: "opening", openingAsOf: "2024-12", openingAccumulatedDepreciation: 250_000 });
    const pending = pendingDepreciationMonths([a], [], "2025-02");
    expect(pending.map((p) => p.period)).toEqual(["2025-01", "2025-02"]);
    expect(pending[0].totalAmount).toBe(50_000);
  });
});

// ─── Journal entries ───────────────────────────────────────────────────────────

describe("fixed-asset journal entries", () => {
  it("a purchase moves money into the asset account", () => {
    const entry = buildFixedAssetAcquisitionEntry({ assetAccount: ACCOUNT_CODES.FA_MACHINERY, cost: 2_178_000, funding: "bank" });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.FA_MACHINERY)).toBe(2_178_000);
    expect(net(entry, ACCOUNT_CODES.BANK)).toBe(-2_178_000);
  });

  it("an opening register is balanced against equity, earlier depreciation against retained earnings", () => {
    const entry = buildFixedAssetAcquisitionEntry({ assetAccount: ACCOUNT_CODES.FA_FURNITURE, cost: 6_200_000, funding: "opening", openingAccumulatedDepreciation: 1_860_000 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.FA_FURNITURE)).toBe(6_200_000);
    expect(net(entry, ACCOUNT_CODES.EQUITY)).toBe(-6_200_000);
    expect(net(entry, ACCOUNT_CODES.RETAINED_EARNINGS)).toBe(1_860_000);
    expect(net(entry, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION)).toBe(-1_860_000);
    // No cash moved.
    expect(net(entry, ACCOUNT_CODES.CASH)).toBe(0);
  });

  it("depreciation is an expense against the contra-asset", () => {
    const entry = buildDepreciationEntry({ amount: 123_456 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.DEPRECIATION_EXPENSE)).toBe(123_456);
    expect(net(entry, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION)).toBe(-123_456);
  });

  it("a sale above carrying amount books a gain and clears cost and depreciation", () => {
    const entry = buildFixedAssetDisposalEntry({ assetAccount: ACCOUNT_CODES.FA_COMPUTERS, cost: 1_200_000, postedAccumulated: 900_000, accumulatedAtDisposal: 900_000, proceeds: 500_000, paymentMethod: "cash" });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.FA_COMPUTERS)).toBe(-1_200_000);
    expect(net(entry, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION)).toBe(900_000);
    expect(net(entry, ACCOUNT_CODES.CASH)).toBe(500_000);
    expect(net(entry, ACCOUNT_CODES.GAIN_ON_ASSET_DISPOSAL)).toBe(-200_000);
  });

  it("a write-off charges the missing months first, then books the rest as a loss", () => {
    const entry = buildFixedAssetDisposalEntry({ assetAccount: ACCOUNT_CODES.FA_COMPUTERS, cost: 1_200_000, postedAccumulated: 400_000, accumulatedAtDisposal: 500_000, proceeds: 0 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.DEPRECIATION_EXPENSE)).toBe(100_000);
    // 1590 ends at zero for this asset: its 400 000 credit, plus the 100 000 catch-up, less 500 000 removed.
    expect(-400_000 + net(entry, ACCOUNT_CODES.ACCUMULATED_DEPRECIATION)).toBe(0);
    expect(net(entry, ACCOUNT_CODES.LOSS_ON_ASSET_DISPOSAL)).toBe(700_000);
  });

  it("a disposal dated before a posted run gives the excess depreciation back", () => {
    const entry = buildFixedAssetDisposalEntry({ assetAccount: ACCOUNT_CODES.FA_COMPUTERS, cost: 1_200_000, postedAccumulated: 600_000, accumulatedAtDisposal: 500_000, proceeds: 0 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.DEPRECIATION_EXPENSE)).toBe(-100_000);
    expect(net(entry, ACCOUNT_CODES.LOSS_ON_ASSET_DISPOSAL)).toBe(700_000);
  });

  it("previewDisposal takes depreciation through the month before disposal", () => {
    const a = asset();
    const preview = previewDisposal(a, [run("2025-02", [["a1", 50_000]])], "2025-05-20", 0);
    expect(preview.accumulatedDepreciation).toBe(150_000); // Feb–Apr
    expect(preview.depreciationCatchUp).toBe(100_000);
    expect(preview.carryingAmount).toBe(1_050_000);
    expect(preview.gainLoss).toBe(-1_050_000);
  });
});

// ─── Reports ───────────────────────────────────────────────────────────────────

describe("reports", () => {
  const opening = asset({ id: "op", acquisitionDate: "2024-07-01", funding: "opening", openingAsOf: "2024-12", openingAccumulatedDepreciation: 250_000 });
  const bought = asset({ id: "new", category: "machinery", accountCode: ACCOUNT_CODES.FA_MACHINERY, cost: 2_400_000, unitCost: 2_400_000, usefulLifeMonths: 120, acquisitionDate: "2025-03-10" });
  const sold = asset({ id: "sold", acquisitionDate: "2024-01-10", funding: "opening", openingAsOf: "2024-12", openingAccumulatedDepreciation: 550_000, status: "disposed", disposal: { date: "2025-06-15", reason: "sold", proceeds: 400_000, paymentMethod: "cash", note: "", accumulatedDepreciation: 800_000, depreciationCatchUp: 0, gainLoss: 0, journalEntryId: null } });
  const runs = [1, 2, 3, 4, 5].map((m) => {
    const period = `2025-0${m}`;
    const lines: Array<[string, number]> = [["op", 50_000], ["sold", 50_000]];
    if (m >= 4) lines.push(["new", 20_000]);
    return run(period, lines);
  });
  const assets = [opening, bought, sold];

  it("the year's movement reconciles for cost and for depreciation", () => {
    const rows = movementForYear(assets, runs, 2025);
    const total = rows[rows.length - 1];
    expect(total.category).toBe("total");
    expect(total.costOpening).toBe(2_400_000);
    expect(total.additions).toBe(2_400_000);
    expect(total.disposalsCost).toBe(1_200_000);
    expect(total.costClosing).toBe(total.costOpening + total.additions - total.disposalsCost);
    expect(total.accClosing).toBe(total.accOpening + total.depreciationCharge - total.disposalsAccumulated);
    expect(total.accOpening).toBe(800_000);
    expect(total.disposalsAccumulated).toBe(800_000);
    expect(total.accClosing).toBe(250_000 + 250_000 + 40_000);
    expect(total.nbvClosing).toBe(total.costClosing - total.accClosing);
  });

  it("the register shows posted figures and flags months no run has covered", () => {
    const rows = registerAsOf(assets, runs, "2025-07");
    expect(rows.map((r) => r.asset.id)).toEqual(["op", "new"]);
    const op = rows[0];
    expect(op.accumulated).toBe(500_000);
    expect(op.unposted).toBe(100_000); // Jun and Jul not yet run
  });

  it("before an opening register's cut-over the textbook schedule stands in", () => {
    expect(accumulatedAsOf(opening, runs, "2024-09")).toBe(100_000);
  });

  it("the monthly schedule marks posted months and projections", () => {
    const rows = depreciationScheduleForYear(assets, runs, 2025);
    const op = rows.find((r) => r.asset.id === "op");
    expect(op?.months[0]).toEqual({ amount: 50_000, posted: true });
    expect(op?.months[6]).toEqual({ amount: 50_000, posted: false });
    const sale = rows.find((r) => r.asset.id === "sold");
    expect(sale?.months.slice(5).every((cell) => cell.amount === 0)).toBe(true);
  });
});

// ─── Validation & import ───────────────────────────────────────────────────────

describe("validateFixedAssetInput", () => {
  const base: FixedAssetInput = {
    name: "Хөргөгч",
    category: "machinery",
    quantity: 1,
    unitCost: 2_178_000,
    salvageValue: 0,
    usefulLifeMonths: 120,
    acquisitionDate: "2024-07-01",
    funding: "opening",
    openingAsOf: "2024-12",
    openingAccumulatedDepreciation: 90_750,
    location: "",
    responsible: "",
    note: "",
  };

  it("accepts a well-formed opening asset", () => {
    expect(validateFixedAssetInput(base)).toBeNull();
  });

  it("rejects an opening month before acquisition", () => {
    expect(validateFixedAssetInput({ ...base, openingAsOf: "2024-05" })).not.toBeNull();
  });

  it("rejects opening depreciation above the depreciable amount", () => {
    expect(validateFixedAssetInput({ ...base, openingAccumulatedDepreciation: 3_000_000 })).not.toBeNull();
  });

  it("rejects a zero useful life and an empty name", () => {
    expect(validateFixedAssetInput({ ...base, usefulLifeMonths: 0 })).not.toBeNull();
    expect(validateFixedAssetInput({ ...base, name: "  " })).not.toBeNull();
  });
});

describe("parseAssetImport", () => {
  it("reads rows copied from the register sheet and skips header, total and signature rows", () => {
    const text = [
      "САВАНА ОРГАНИКА  ХХК \t\t\t45790",
      "ҮНДСЭН ХӨРӨНГИЙН ТАЙЛАН",
      "Авсан огноо\tНэр\tХэмжих нэгж /ш/\tҮндсэн өртөг\tНийт",
      "2024\tDell нөүтвүүк \t1\t1873274.8\t1873274.8",
      "2021\tХатаалтын модон тавиур\t31\t200,000\t6,200,000",
      "2020.07.27\tDell компютер -2\t1 ш\t1717168.5",
      "2022\tГал тогооны тавилга\t1\t\t4569000",
      "\tНИЙТ \t65\t\t38995193.3",
      "                  Нягтлан бодогч:........................./Д.ЭНХ-АМГАЛАН/",
    ].join("\n");
    const rows = parseAssetImport(text);
    expect(rows).toEqual([
      { name: "Dell нөүтвүүк", acquisitionDate: "2024-07-01", dateIsYearOnly: true, quantity: 1, unitCost: 1873274.8, category: "computers" },
      { name: "Хатаалтын модон тавиур", acquisitionDate: "2021-07-01", dateIsYearOnly: true, quantity: 31, unitCost: 200000, category: "furniture" },
      { name: "Dell компютер -2", acquisitionDate: "2020-07-27", dateIsYearOnly: false, quantity: 1, unitCost: 1717168.5, category: "computers" },
      { name: "Гал тогооны тавилга", acquisitionDate: "2022-07-01", dateIsYearOnly: true, quantity: 1, unitCost: 4569000, category: "furniture" },
    ]);
  });

  it("classifies the shop's own register lines sensibly", () => {
    expect(guessCategory("Epson L3110 принтер")).toBe("computers");
    expect(guessCategory("Хатаалтын төхөөрөмж")).toBe("machinery");
    expect(guessCategory("Ус нэрэгч төхөөрөмж")).toBe("machinery");
    expect(guessCategory("Хөргөгч")).toBe("machinery");
    expect(guessCategory("Шилэн хаалгатай шкаф")).toBe("furniture");
    expect(guessCategory("Төмөр ширээ")).toBe("furniture");
  });
});
