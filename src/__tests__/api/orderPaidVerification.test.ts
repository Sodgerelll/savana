import { describe, it, expect, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  PaymentVerificationError,
  assertPaymentSettlesOrder,
  postOrderPaidEntry,
} from "../../../api/_lib/postOrderPaidEntry";

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }));

import { isValidChecksum } from "../../../api/bonum/webhook";

const invoicedOrder = {
  payment: { status: "pending", invoiceId: "inv-1", amount: 28000 },
};

describe("assertPaymentSettlesOrder", () => {
  it("accepts Bonum's word for the order's own invoice paid in full", () => {
    expect(() => assertPaymentSettlesOrder(invoicedOrder, { invoiceId: "inv-1", paidAmount: 28000 })).not.toThrow();
  });

  it("accepts a notice that names no amount — the invoice was raised for the right one", () => {
    expect(() => assertPaymentSettlesOrder(invoicedOrder, { invoiceId: "inv-1" })).not.toThrow();
  });

  it("refuses an order that never had an invoice", () => {
    expect(() => assertPaymentSettlesOrder({ payment: { invoiceId: null, amount: 28000 } }, {})).toThrow(
      PaymentVerificationError,
    );
  });

  it("refuses a payment of another invoice", () => {
    expect(() => assertPaymentSettlesOrder(invoicedOrder, { invoiceId: "inv-2", paidAmount: 28000 })).toThrow(
      /нэхэмжлэх/,
    );
  });

  it("refuses a payment short of the invoice — 100₮ for a 28000₮ order", () => {
    try {
      assertPaymentSettlesOrder(invoicedOrder, { invoiceId: "inv-1", paidAmount: 100 });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentVerificationError);
      expect((error as PaymentVerificationError).code).toBe("AMOUNT_MISMATCH");
    }
  });
});

// ─── postOrderPaidEntry against a tiny Admin SDK stand-in ─────────────────────

function adminDb(docs: Record<string, Record<string, unknown>>) {
  const writes: Array<{ op: string; path: string; data: Record<string, unknown> }> = [];
  let auto = 0;
  const ref = (path: string) => ({
    path,
    id: path.split("/").pop(),
    get: async () => snapshot(path),
  });
  const snapshot = (path: string) => ({
    exists: path in docs,
    data: () => docs[path],
    ref: ref(path),
  });
  const db = {
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${name}/${id ?? `auto-${++auto}`}`),
    }),
    runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        get: async (r: { path: string }) => snapshot(r.path),
        set: (r: { path: string }, data: Record<string, unknown>) => {
          writes.push({ op: "set", path: r.path, data });
          docs[r.path] = data;
        },
        update: (r: { path: string }, data: Record<string, unknown>) => {
          writes.push({ op: "update", path: r.path, data });
          docs[r.path] = { ...(docs[r.path] ?? {}), ...data };
        },
      }),
  };
  return { db, writes, docs };
}

describe("postOrderPaidEntry", () => {
  const serverPricedOrder = () => ({
    orderNumber: "ORD-1",
    items: [{ productId: 1, quantity: 2, unitPrice: 10000 }],
    totals: { subtotal: 20000, shippingFee: 8000, grandTotal: 28000, vatMode: "none", vatAmount: 0 },
    payment: { status: "pending", invoiceId: "inv-1", amount: 28000 },
    pricing: { verifiedBy: "server" },
    stockApplied: false,
  });

  it("books exactly what a server-priced order was invoiced for, even if the price fell since", async () => {
    const { db, writes, docs } = adminDb({
      "orders/o1": serverPricedOrder(),
      // A discount started after the invoice: re-pricing would book less than was collected.
      "products/1": { price: 7000, totalStock: 10, soldCount: 0 },
    });

    await postOrderPaidEntry(db, "o1", {}, { invoiceId: "inv-1", paidAmount: 28000 });

    const entry = writes.find((write) => write.path.startsWith("journalEntries/"))?.data as {
      lines: Array<{ accountCode: string; debit: number; credit: number }>;
    };
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: "1030", debit: 28000 }),
      expect.objectContaining({ accountCode: "4400", credit: 8000 }),
      expect.objectContaining({ accountCode: "4100", credit: 20000 }),
    ]);
    expect(docs["orders/o1"]).toMatchObject({ status: "paid", stockApplied: true, totalsAdjusted: false });
    expect(typeof docs["orders/o1"].journalEntryId).toBe("string");
  });

  it("leaves the order untouched when the payment does not settle it", async () => {
    const { db, writes, docs } = adminDb({ "orders/o1": serverPricedOrder(), "products/1": { price: 10000 } });

    await expect(postOrderPaidEntry(db, "o1", {}, { invoiceId: "inv-1", paidAmount: 100 })).rejects.toThrow(
      PaymentVerificationError,
    );
    expect(writes.filter((write) => !write.path.startsWith("counters/"))).toHaveLength(0);
    expect(docs["orders/o1"]).toMatchObject({ payment: { status: "pending" } });
  });

  it("is a no-op for an order that is already paid", async () => {
    const { db, writes } = adminDb({ "orders/o1": { ...serverPricedOrder(), payment: { status: "paid" } } });

    await expect(postOrderPaidEntry(db, "o1", {}, { invoiceId: "inv-1" })).resolves.toBeNull();
    expect(writes).toHaveLength(0);
  });
});

// ─── Bonum webhook checksum ───────────────────────────────────────────────────

describe("isValidChecksum", () => {
  const key = "merchant-key";
  const sign = (payload: string) => createHmac("sha256", key).update(payload, "utf8").digest("hex");

  afterEach(() => {
    delete process.env.BONUM_CHECKSUM_KEY;
  });

  it("verifies the bytes exactly as Bonum sent them", () => {
    process.env.BONUM_CHECKSUM_KEY = key;
    // Spacing a re-serialisation would not reproduce.
    const raw = '{ "type": "PAYMENT", "status": "SUCCESS" }';

    expect(isValidChecksum(raw, JSON.parse(raw), sign(raw))).toBe(true);
  });

  it("still accepts a signature over the compact form", () => {
    process.env.BONUM_CHECKSUM_KEY = key;
    const parsed = { type: "PAYMENT", status: "SUCCESS" };

    expect(isValidChecksum(null, parsed, sign(JSON.stringify(parsed)))).toBe(true);
  });

  it("rejects a wrong signature, a missing one, and any signature when no key is configured", () => {
    process.env.BONUM_CHECKSUM_KEY = key;
    const raw = '{"type":"PAYMENT"}';
    expect(isValidChecksum(raw, JSON.parse(raw), sign("tampered"))).toBe(false);
    expect(isValidChecksum(raw, JSON.parse(raw), "")).toBe(false);

    delete process.env.BONUM_CHECKSUM_KEY;
    expect(isValidChecksum(raw, JSON.parse(raw), sign(raw))).toBe(false);
  });
});
