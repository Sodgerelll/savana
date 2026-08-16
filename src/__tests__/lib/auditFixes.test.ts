import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async () => (await import("../helpers/firestoreMock")).firestoreMock.module);

import {
  applyProductionIntake,
  applyStockMovement,
  readProductStockState,
  UnknownVariantError,
} from "../../lib/inventory";
import { blendUnitCost } from "../../lib/rawMaterials";
import { linkCustomersToContacts, type CustomerRecord } from "../../lib/customers";
import { businessYear } from "../../lib/documentNumbers";
import {
  buildOrderPaidEntry,
  buildSaleEntry,
  buildTransferReturnEntry,
  type BuiltEntry,
} from "../../lib/accounting/entryBuilders";
import { ACCOUNT_CODES } from "../../lib/accounting/chartOfAccounts";
import { journalWindowStart, JOURNAL_WINDOW_YEARS } from "../../lib/accounting/journalQueries";

/** Net movement on one account: positive = debit side, negative = credit side. */
function net(entry: BuiltEntry, accountCode: string) {
  return entry.lines
    .filter((l) => l.accountCode === accountCode)
    .reduce((sum, l) => sum + l.debit - l.credit, 0);
}

function expectBalanced(entry: BuiltEntry) {
  const debit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const credit = entry.lines.reduce((sum, l) => sum + l.credit, 0);
  expect(debit).toBe(credit);
}

// ─── A movement that names a variant the product does not have ────────────────

describe("applyStockMovement — unknown variant", () => {
  const variantProduct = () =>
    readProductStockState(7, {
      totalStock: 20,
      soldCount: 0,
      variants: [
        { name: "100г", price: 12000, quantity: 12, soldCount: 0 },
        { name: "200г", price: 20000, quantity: 8, soldCount: 0 },
      ],
    });

  it("raises instead of quietly moving only the product-level count", () => {
    const state = variantProduct();

    expect(() =>
      applyStockMovement(state, { variant: "150г", quantity: 2 }, { productName: "Sea Buckthorn" }),
    ).toThrow(UnknownVariantError);

    // Nothing moved: the aggregate used to drift away from the variants right here.
    expect(state.soldCount).toBe(0);
  });

  it("raises on the way back too, so returned units cannot land on the wrong variant", () => {
    expect(() =>
      applyStockMovement(variantProduct(), { variant: "150г", quantity: -2 }, { validate: false }),
    ).toThrow(UnknownVariantError);
  });

  it("still moves a variant it does know", () => {
    const state = variantProduct();
    applyStockMovement(state, { variant: "200г", quantity: 3 });

    expect(state.soldCount).toBe(3);
    expect(state.variants?.find((v) => v.name === "200г")?.soldCount).toBe(3);
  });
});

// ─── Undoing production ───────────────────────────────────────────────────────

describe("applyProductionIntake — taking units back out", () => {
  it("shows the shortfall instead of clamping at zero", () => {
    const state = readProductStockState(3, { totalStock: 50, soldCount: 50 });

    applyProductionIntake(state, null, -200);

    // Clamping used to leave totalStock at 0, inventing 150 units the batch never made.
    expect(state.totalStock).toBe(-150);
  });

  it("treats a variant product the same way", () => {
    const state = readProductStockState(3, {
      totalStock: 10,
      soldCount: 0,
      variants: [{ name: "100г", price: 1000, quantity: 10, soldCount: 0 }],
    });

    applyProductionIntake(state, "100г", -25);

    expect(state.variants?.[0].quantity).toBe(-15);
    expect(state.totalStock).toBe(-15);
  });
});

// ─── Delivery revenue kept apart from goods revenue ───────────────────────────

describe("delivery is booked to its own revenue account", () => {
  it("splits shipping out of an online order's revenue", () => {
    const entry = buildOrderPaidEntry({ grandTotal: 58000, cogsAmount: 0, vatAmount: 0, shippingAmount: 8000 });

    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.REVENUE_SHIPPING)).toBe(-8000);
    expect(net(entry, ACCOUNT_CODES.REVENUE_ONLINE)).toBe(-50000);
    expect(net(entry, ACCOUNT_CODES.CLEARING)).toBe(58000);
  });

  it("splits shipping out of an offline sale, after НӨАТ", () => {
    const entry = buildSaleEntry({
      grandTotal: 58000,
      cogsAmount: 0,
      paymentMethod: "cash",
      vatAmount: 5000,
      shippingAmount: 8000,
    });

    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.VAT_PAYABLE)).toBe(-5000);
    expect(net(entry, ACCOUNT_CODES.REVENUE_SHIPPING)).toBe(-8000);
    expect(net(entry, ACCOUNT_CODES.REVENUE_DIRECT)).toBe(-45000);
  });

  it("never lets shipping eat into more than the total leaves available", () => {
    const entry = buildSaleEntry({
      grandTotal: 5000,
      cogsAmount: 0,
      paymentMethod: "cash",
      vatAmount: 500,
      shippingAmount: 9000,
    });

    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.REVENUE_SHIPPING)).toBe(-4500);
    expect(net(entry, ACCOUNT_CODES.REVENUE_DIRECT)).toBe(0);
  });

  it("books everything as goods revenue when there is no delivery charge", () => {
    const entry = buildOrderPaidEntry({ grandTotal: 50000, cogsAmount: 0 });

    expect(net(entry, ACCOUNT_CODES.REVENUE_ONLINE)).toBe(-50000);
    expect(entry.lines.some((l) => l.accountCode === ACCOUNT_CODES.REVENUE_SHIPPING)).toBe(false);
  });
});

// ─── A wholesale return gives the tax back ────────────────────────────────────

describe("buildTransferReturnEntry", () => {
  it("debits the НӨАТ back out and credits the receivable with the gross", () => {
    const entry = buildTransferReturnEntry({ returnTotal: 20000, cogsAmount: 8000, taxAmount: 2000 });

    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.SALES_RETURNS)).toBe(20000);
    // The tax charged on the sale comes back off the liability, instead of being kept.
    expect(net(entry, ACCOUNT_CODES.VAT_PAYABLE)).toBe(2000);
    expect(net(entry, ACCOUNT_CODES.AR)).toBe(-22000);
    expect(net(entry, ACCOUNT_CODES.INVENTORY)).toBe(8000);
    expect(net(entry, ACCOUNT_CODES.COGS)).toBe(-8000);
  });

  it("leaves the tax line out of a return on an untaxed transfer", () => {
    const entry = buildTransferReturnEntry({ returnTotal: 20000, cogsAmount: 0 });

    expectBalanced(entry);
    expect(net(entry, ACCOUNT_CODES.AR)).toBe(-20000);
    expect(entry.lines.some((l) => l.accountCode === ACCOUNT_CODES.VAT_PAYABLE)).toBe(false);
  });
});

// ─── Raw material costing ─────────────────────────────────────────────────────

describe("blendUnitCost", () => {
  it("averages the new purchase against what is already held", () => {
    // 10 kg at ₮5 000 plus 10 kg at ₮7 000 → ₮6 000.
    expect(blendUnitCost(10, 5000, 10, 7000)).toBe(6000);
  });

  it("takes the purchase price outright when nothing is held", () => {
    expect(blendUnitCost(0, 5000, 10, 7000)).toBe(7000);
  });

  it("takes the purchase price outright when no cost was ever recorded", () => {
    expect(blendUnitCost(10, null, 10, 7000)).toBe(7000);
  });

  it("leaves the existing figure alone when the purchase has no price", () => {
    expect(blendUnitCost(10, 5000, 10, null)).toBeNull();
  });

  it("weights by quantity rather than splitting down the middle", () => {
    // 90 kg at ₮1 000 plus 10 kg at ₮2 000 → ₮1 100, not ₮1 500.
    expect(blendUnitCost(90, 1000, 10, 2000)).toBe(1100);
  });
});

// ─── The two customer directories can be joined ───────────────────────────────

describe("linkCustomersToContacts", () => {
  const customer = (id: string, phoneNumber: string) =>
    ({ id, phoneNumber, code: "", name: "" }) as unknown as CustomerRecord;

  it("matches a reseller to their buyer record however the phone was typed", () => {
    const linked = linkCustomersToContacts(
      [customer("cus-1", "9900-1234"), customer("cus-2", "88776655")],
      [
        { id: "har-1", phoneNumber: "+976 99001234" },
        { id: "har-9", phoneNumber: "99887766" },
      ],
    );

    expect(linked.get("cus-1")?.id).toBe("har-1");
    expect(linked.has("cus-2")).toBe(false);
  });

  it("ignores a customer with no phone rather than matching them to a blank contact", () => {
    const linked = linkCustomersToContacts([customer("cus-1", "")], [{ id: "har-1", phoneNumber: "" }]);

    expect(linked.size).toBe(0);
  });
});

// ─── Numbering reads the year in the shop's timezone ──────────────────────────

describe("businessYear", () => {
  it("is already the new year in Ulaanbaatar while UTC is still in the old one", () => {
    // 2026-12-31 20:00 UTC is 2027-01-01 04:00 in Ulaanbaatar. The browser and the
    // serverless runtime used to disagree here and reset each other's counter.
    expect(businessYear(new Date("2026-12-31T20:00:00Z"))).toBe(2027);
  });

  it("agrees with UTC for the rest of the year", () => {
    expect(businessYear(new Date("2026-06-15T12:00:00Z"))).toBe(2026);
  });
});

// ─── The ledger subscription window ───────────────────────────────────────────

describe("journalWindowStart", () => {
  it("reaches back far enough to cover the current and prior financial years", () => {
    expect(journalWindowStart(new Date("2026-08-16T00:00:00Z"))).toBe(
      `${2026 - JOURNAL_WINDOW_YEARS}-08-16`,
    );
  });
});
