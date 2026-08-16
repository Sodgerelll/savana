import { describe, it, expect } from "vitest";
import {
  buildCustomerTransactionReturnEntry,
  buildCustomerTransactionSaleEntry,
  buildDirectSaleEntry,
  buildFinanceLedgerEntry,
  buildGoodsWriteOffEntry,
  buildOrderPaidEntry,
  buildProductionCompletedEntry,
  buildRawMaterialPurchaseEntry,
  buildReversalEntry,
  buildSaleEntry,
  isEmptyEntry,
  type BuiltEntry,
} from "../../lib/accounting/entryBuilders";
import { ACCOUNT_CODES } from "../../lib/accounting/chartOfAccounts";

/** Every posted entry must have equal debits and credits — the ledger's one hard rule. */
function expectBalanced(entry: BuiltEntry) {
  const debit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const credit = entry.lines.reduce((sum, l) => sum + l.credit, 0);
  expect(debit).toBe(credit);
}

/** Net movement on one account: positive = debit side, negative = credit side. */
function net(entry: BuiltEntry, accountCode: string) {
  return entry.lines
    .filter((l) => l.accountCode === accountCode)
    .reduce((sum, l) => sum + l.debit - l.credit, 0);
}

// ─── НӨАТ split, shared by every sales channel ────────────────────────────────

describe("НӨАТ is split off revenue the same way in every channel", () => {
  const cases: Array<[string, BuiltEntry]> = [
    ["offline sale", buildSaleEntry({ grandTotal: 11000, cogsAmount: 0, paymentMethod: "cash", vatAmount: 1000 })],
    ["direct/POS sale", buildDirectSaleEntry({ lineTotal: 11000, cogsAmount: 0, vatAmount: 1000 })],
    ["online order", buildOrderPaidEntry({ grandTotal: 11000, cogsAmount: 0, vatAmount: 1000 })],
    [
      "reseller transaction",
      buildCustomerTransactionSaleEntry({
        paymentMethod: "cash",
        paidAmount: 11000,
        grandTotal: 11000,
        cogsAmount: 0,
        vatAmount: 1000,
      }),
    ],
  ];

  it.each(cases)("%s credits the tax to 2410 and only the net to revenue", (_name, entry) => {
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.VAT_PAYABLE)).toBe(-1000);

    const revenue =
      net(entry, ACCOUNT_CODES.REVENUE_DIRECT) +
      net(entry, ACCOUNT_CODES.REVENUE_ONLINE) +
      net(entry, ACCOUNT_CODES.REVENUE_WHOLESALE);
    expect(revenue).toBe(-10000);
  });

  it("clamps a tax larger than the total rather than inverting the revenue line", () => {
    const entry = buildSaleEntry({ grandTotal: 1000, cogsAmount: 0, paymentMethod: "cash", vatAmount: 9999 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.VAT_PAYABLE)).toBe(-1000);
  });

  it("books the whole total as revenue when there is no tax", () => {
    const entry = buildSaleEntry({ grandTotal: 11000, cogsAmount: 0, paymentMethod: "cash" });
    expect(net(entry, ACCOUNT_CODES.REVENUE_DIRECT)).toBe(-11000);
    expect(entry.lines.some((l) => l.accountCode === ACCOUNT_CODES.VAT_PAYABLE)).toBe(false);
  });
});

// ─── Money account routing ────────────────────────────────────────────────────

describe("buildSaleEntry", () => {
  it("settles cash into 1010 and a bank transfer into 1020", () => {
    expect(buildSaleEntry({ grandTotal: 1000, cogsAmount: 0, paymentMethod: "cash" }).lines[0].accountCode).toBe(
      ACCOUNT_CODES.CASH,
    );
    expect(
      buildSaleEntry({ grandTotal: 1000, cogsAmount: 0, paymentMethod: "bank_transfer" }).lines[0].accountCode,
    ).toBe(ACCOUNT_CODES.BANK);
  });

  it("moves cost out of inventory into COGS", () => {
    const entry = buildSaleEntry({ grandTotal: 10000, cogsAmount: 4000, paymentMethod: "cash" });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.COGS)).toBe(4000);
    expect(net(entry, ACCOUNT_CODES.INVENTORY)).toBe(-4000);
  });
});

// ─── Gifts and own use ────────────────────────────────────────────────────────

describe("buildGoodsWriteOffEntry", () => {
  it("books the cost as an expense without inventing cash or revenue", () => {
    const entry = buildGoodsWriteOffEntry({ cogsAmount: 4000 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.GOODS_WRITE_OFF)).toBe(4000);
    expect(net(entry, ACCOUNT_CODES.INVENTORY)).toBe(-4000);
    expect(net(entry, ACCOUNT_CODES.CASH)).toBe(0);
    expect(net(entry, ACCOUNT_CODES.REVENUE_DIRECT)).toBe(0);
  });

  it("produces nothing to post when the cost is unknown", () => {
    expect(isEmptyEntry(buildGoodsWriteOffEntry({ cogsAmount: 0 }))).toBe(true);
  });
});

// ─── Reseller transactions ────────────────────────────────────────────────────

describe("buildCustomerTransactionSaleEntry", () => {
  it("splits the total between cash received and the receivable still owed", () => {
    const entry = buildCustomerTransactionSaleEntry({
      paymentMethod: "cash",
      paidAmount: 4000,
      grandTotal: 10000,
      cogsAmount: 0,
    });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.CASH)).toBe(4000);
    expect(net(entry, ACCOUNT_CODES.AR)).toBe(6000);
  });

  it("never books a negative receivable when the payment overshoots the total", () => {
    const entry = buildCustomerTransactionSaleEntry({
      paymentMethod: "cash",
      paidAmount: 15000,
      grandTotal: 10000,
      cogsAmount: 0,
    });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.AR)).toBe(0);
    expect(net(entry, ACCOUNT_CODES.CASH)).toBe(10000);
  });
});

describe("buildCustomerTransactionReturnEntry", () => {
  it("takes the tax back off the liability and only the net off revenue", () => {
    const entry = buildCustomerTransactionReturnEntry({ grandTotal: 11000, cogsAmount: 0, vatAmount: 1000 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.SALES_RETURNS)).toBe(10000);
    expect(net(entry, ACCOUNT_CODES.VAT_PAYABLE)).toBe(1000);
    expect(net(entry, ACCOUNT_CODES.AR)).toBe(-11000);
  });

  it("puts the cost back into inventory", () => {
    const entry = buildCustomerTransactionReturnEntry({ grandTotal: 10000, cogsAmount: 4000 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.INVENTORY)).toBe(4000);
    expect(net(entry, ACCOUNT_CODES.COGS)).toBe(-4000);
  });
});

// ─── Production and purchasing ────────────────────────────────────────────────

describe("buildProductionCompletedEntry", () => {
  it("moves cost from raw materials into finished goods", () => {
    const entry = buildProductionCompletedEntry({ producedCost: 43000 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.INVENTORY)).toBe(43000);
    expect(net(entry, ACCOUNT_CODES.RAW_MATERIALS)).toBe(-43000);
  });

  it("produces nothing to post for a costless batch", () => {
    expect(isEmptyEntry(buildProductionCompletedEntry({ producedCost: 0 }))).toBe(true);
  });
});

describe("buildRawMaterialPurchaseEntry", () => {
  it("grows the raw-material stock and shrinks the money account it was paid from", () => {
    const entry = buildRawMaterialPurchaseEntry({ amount: 43000, paymentMethod: "bank" });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.RAW_MATERIALS)).toBe(43000);
    expect(net(entry, ACCOUNT_CODES.BANK)).toBe(-43000);
  });

  it("defaults to cash when no method is recorded", () => {
    expect(net(buildRawMaterialPurchaseEntry({ amount: 1000 }), ACCOUNT_CODES.CASH)).toBe(-1000);
  });
});

// ─── Manual ledger rows ───────────────────────────────────────────────────────

describe("buildFinanceLedgerEntry", () => {
  it("books an expense against the operating-expense account", () => {
    const entry = buildFinanceLedgerEntry({ type: "expense", amount: 250000 });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.OPERATING_EXPENSE)).toBe(250000);
    expect(net(entry, ACCOUNT_CODES.CASH)).toBe(-250000);
  });

  it("books non-sale income against other income", () => {
    const entry = buildFinanceLedgerEntry({ type: "income", amount: 80000, paymentMethod: "bank" });
    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.OTHER_INCOME)).toBe(-80000);
    expect(net(entry, ACCOUNT_CODES.BANK)).toBe(80000);
  });
});

// ─── Reversal ─────────────────────────────────────────────────────────────────

describe("buildReversalEntry", () => {
  it("mirrors every line so the pair nets to nothing", () => {
    const original = buildSaleEntry({ grandTotal: 11000, cogsAmount: 4000, paymentMethod: "cash", vatAmount: 1000 });
    const reversal = buildReversalEntry(original.lines);

    expectBalanced(reversal);
    for (const code of Object.values(ACCOUNT_CODES)) {
      expect(net(original, code) + net(reversal, code)).toBe(0);
    }
  });
});
