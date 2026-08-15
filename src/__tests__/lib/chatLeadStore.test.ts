import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createSale: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestampToken: Symbol("serverTimestamp"),
}));

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: () => ({ __ref: "chat_leads" }),
  doc: (_ref: unknown, id?: string) => ({ id }),
  query: (ref: unknown) => ref,
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: () => mocks.serverTimestampToken,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
}));

vi.mock("../../lib/sales", () => ({ createSale: mocks.createSale }));
vi.mock("../../lib/checkoutAddress", () => ({ DEFAULT_ADDRESS_REGION: "Улаанбаатар" }));
vi.mock("../../lib/orders", () => ({ SHIPPING_FEE: 8000 }));

import {
  convertLeadToSale,
  LeadConversionError,
  priceLeadItems,
  setChatLeadStatus,
} from "../../lib/chat/leadStore";
import type { ChatLeadRecord } from "../../lib/chat/types";

const CATALOG = [
  { id: 1, name: "Хужирт саван", price: 25000, category: "soap", images: ["https://i/1.jpg"] },
  { id: 2, name: "Ванны давс", price: 18000, category: "bath", images: [] },
];

function lead(overrides: Partial<ChatLeadRecord> = {}): ChatLeadRecord {
  return {
    id: "lead-1",
    schemaVersion: 1,
    type: "order",
    status: "new",
    conversationId: "c1",
    channel: "facebook",
    customerName: "Батбаяр",
    customerPhone: "99119911",
    note: "",
    items: [{ productId: 1, name: "Хужирт саван", variant: null, quantity: 2 }],
    convertedOrderId: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSale.mockResolvedValue({ id: "sale-1", saleNumber: "SL-2026-00001" });
});

describe("priceLeadItems", () => {
  it("prices a matched product from the live catalog", () => {
    const { priced, unmatched } = priceLeadItems(
      [{ productId: 1, name: "Хужирт саван", variant: null, quantity: 3 }],
      CATALOG,
    );

    expect(unmatched).toEqual([]);
    expect(priced).toEqual([
      {
        productId: 1,
        name: "Хужирт саван",
        category: "soap",
        image: "https://i/1.jpg",
        variant: null,
        quantity: 3,
        unitPrice: 25000,
        lineTotal: 75000,
      },
    ]);
  });

  it("matches by name when the lead has no product id", () => {
    const { priced } = priceLeadItems(
      [{ productId: null, name: "ванны давс", variant: null, quantity: 1 }],
      CATALOG,
    );

    expect(priced[0].productId).toBe(2);
  });

  it("uses the catalog price, not anything stored on the lead", () => {
    const { priced } = priceLeadItems(
      [{ productId: 1, name: "Хужирт саван", variant: null, quantity: 1 }],
      [{ ...CATALOG[0], price: 30000 }],
    );

    expect(priced[0].unitPrice).toBe(30000);
  });

  it("reports products that are no longer in the catalog", () => {
    const { priced, unmatched } = priceLeadItems(
      [{ productId: 99, name: "Байхгүй бараа", variant: null, quantity: 1 }],
      CATALOG,
    );

    expect(priced).toEqual([]);
    expect(unmatched).toEqual(["Байхгүй бараа"]);
  });

  it("treats a zero-priced product as unmatched rather than selling it free", () => {
    const { unmatched } = priceLeadItems(
      [{ productId: 1, name: "Хужирт саван", variant: null, quantity: 1 }],
      [{ ...CATALOG[0], price: 0 }],
    );

    expect(unmatched).toEqual(["Хужирт саван"]);
  });

  it("keeps a null image when the product has no photo", () => {
    const { priced } = priceLeadItems(
      [{ productId: 2, name: "Ванны давс", variant: null, quantity: 1 }],
      CATALOG,
    );

    expect(priced[0].image).toBeNull();
  });
});

describe("convertLeadToSale", () => {
  const actor = { uid: "admin-1", name: "Сод" };

  it("creates an unsettled sale so payment is still confirmed by hand", async () => {
    await convertLeadToSale(lead(), CATALOG, actor);

    expect(mocks.createSale.mock.calls[0][0]).toMatchObject({
      status: "new",
      channel: "messenger",
      paymentMethod: "cash",
    });
  });

  it("routes an Instagram lead to the instagram sale channel", async () => {
    await convertLeadToSale(lead({ channel: "instagram" }), CATALOG, actor);

    expect(mocks.createSale.mock.calls[0][0].channel).toBe("instagram");
  });

  it("totals the priced lines and adds the shipping fee", async () => {
    await convertLeadToSale(lead(), CATALOG, actor);

    expect(mocks.createSale.mock.calls[0][0].totals).toEqual({
      subtotal: 50000,
      shippingFee: 8000,
      grandTotal: 58000,
      vatMode: "none",
      vatAmount: 0,
    });
  });

  it("carries the customer's name, phone and note onto the sale", async () => {
    await convertLeadToSale(lead({ note: "Оройн цагаар залгана уу" }), CATALOG, actor);

    expect(mocks.createSale.mock.calls[0][0].customer).toMatchObject({
      type: "individual",
      fullName: "Батбаяр",
      phoneNumber: "99119911",
      note: "Оройн цагаар залгана уу",
    });
  });

  it("records who converted it", async () => {
    await convertLeadToSale(lead(), CATALOG, actor);

    expect(mocks.createSale.mock.calls[0][0]).toMatchObject({
      createdByUid: "admin-1",
      createdByName: "Сод",
    });
  });

  it("marks the lead converted and links the sale", async () => {
    await convertLeadToSale(lead(), CATALOG, actor);

    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      status: "converted",
      convertedOrderId: "sale-1",
    });
  });

  it("returns the new sale id and number", async () => {
    await expect(convertLeadToSale(lead(), CATALOG, actor)).resolves.toEqual({
      saleId: "sale-1",
      saleNumber: "SL-2026-00001",
    });
  });

  it("refuses to convert the same lead twice", async () => {
    await expect(
      convertLeadToSale(lead({ convertedOrderId: "sale-9" }), CATALOG, actor),
    ).rejects.toBeInstanceOf(LeadConversionError);

    expect(mocks.createSale).not.toHaveBeenCalled();
  });

  it("refuses to convert without a customer name", async () => {
    await expect(convertLeadToSale(lead({ customerName: "  " }), CATALOG, actor)).rejects.toThrow(
      /дутуу/,
    );
    expect(mocks.createSale).not.toHaveBeenCalled();
  });

  it("refuses to convert without a phone number", async () => {
    await expect(convertLeadToSale(lead({ customerPhone: "" }), CATALOG, actor)).rejects.toThrow(
      /дутуу/,
    );
  });

  it("refuses when a product is no longer in the catalog, naming it", async () => {
    const stale = lead({
      items: [{ productId: 99, name: "Хуучин саван", variant: null, quantity: 1 }],
    });

    await expect(convertLeadToSale(stale, CATALOG, actor)).rejects.toThrow(/Хуучин саван/);
    expect(mocks.createSale).not.toHaveBeenCalled();
  });

  it("refuses a lead with no items", async () => {
    await expect(convertLeadToSale(lead({ items: [] }), CATALOG, actor)).rejects.toThrow(
      /бүтээгдэхүүн байхгүй/,
    );
  });

  it("does not mark the lead converted when the sale fails", async () => {
    mocks.createSale.mockRejectedValue(new Error("firestore offline"));

    await expect(convertLeadToSale(lead(), CATALOG, actor)).rejects.toThrow();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe("setChatLeadStatus", () => {
  it("writes the status with a server timestamp", async () => {
    await setChatLeadStatus("lead-1", "dismissed");

    expect(mocks.updateDoc.mock.calls[0][1]).toEqual({
      status: "dismissed",
      updatedAt: mocks.serverTimestampToken,
    });
  });
});
