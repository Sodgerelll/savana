import { describe, it, expect } from "vitest";
import {
  buildSellerProductReportCsv,
  reportStamp,
  type SellerProductRow,
} from "../../lib/customerProductReport";
import type { CustomerRecord } from "../../lib/customers";

function makeCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: "cust-1",
    code: "CUS-0007",
    type: "organization",
    name: "Түшиг ХХК",
    displayName: "Түшиг",
    registrationNumber: "1234567",
    contactPerson: "Болд",
    phoneNumber: "99112233",
    secondaryPhone: null,
    email: null,
    address: {
      region: "Улаанбаатар",
      districtOrSoum: "СБД",
      khorooOrBag: "1-р хороо",
      streetAddress: "12-р байр",
    },
    note: "",
    tags: [],
    totalSales: 0,
    totalPaid: 0,
    outstandingBalance: 1_250_000,
    lastTransactionAt: null,
    status: "active",
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeRow(overrides: Partial<SellerProductRow> = {}): SellerProductRow {
  return {
    label: "P-001 - Гар тос",
    variant: null,
    transferred: 120,
    sold: 90,
    totalAmount: 2_300_000,
    ...overrides,
  };
}

const AT = new Date("2026-09-02T10:30:00");

describe("reportStamp", () => {
  it("formats the local date and time to the minute", () => {
    expect(reportStamp(AT)).toBe("2026-09-02 10:30");
  });
});

describe("buildSellerProductReportCsv", () => {
  it("starts with a BOM so Excel reads the Mongolian", () => {
    const csv = buildSellerProductReportCsv(makeCustomer(), [makeRow()], AT);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("puts the organisation details and the report date in the header block", () => {
    const csv = buildSellerProductReportCsv(makeCustomer(), [makeRow()], AT);
    const rows = csv.slice(1).split("\r\n");

    expect(rows[0]).toContain("тайлан");
    expect(rows).toContain("Байгууллага,Түшиг ХХК");
    expect(rows).toContain("Борлуулагчийн код,CUS-0007");
    expect(rows).toContain("Төрөл,Байгууллага");
    expect(rows).toContain("Регистрийн дугаар,1234567");
    expect(rows).toContain("Холбоо барих,Болд");
    expect(rows).toContain('Хаяг,"Улаанбаатар, СБД, 1-р хороо, 12-р байр"');
    expect(rows).toContain("Тайлан гаргасан огноо,2026-09-02 10:30");
  });

  it("writes one line per product with the remaining count and a rounded amount", () => {
    const csv = buildSellerProductReportCsv(
      makeCustomer(),
      [makeRow({ label: "P-1 - Их", variant: "500мл", transferred: 120, sold: 90, totalAmount: 2_300_000.6 })],
      AT,
    );
    const rows = csv.slice(1).split("\r\n");

    expect(rows).toContain("P-1 - Их,500мл,120,90,30,2300001");
  });

  it("totals the columns and states the outstanding balance", () => {
    const csv = buildSellerProductReportCsv(
      makeCustomer({ outstandingBalance: 1_250_000 }),
      [
        makeRow({ transferred: 120, sold: 90, totalAmount: 2_300_000 }),
        makeRow({ transferred: 40, sold: 40, totalAmount: 900_000 }),
      ],
      AT,
    );
    const rows = csv.slice(1).split("\r\n");

    expect(rows).toContain("Нийт,,160,130,30,3200000");
    expect(rows).toContain("Шилжүүлсэн бараа материалын нийт дүн (₮),3200000");
    expect(rows).toContain("Төлбөрийн үлдэгдэл нийт дүн (₮),1250000");
  });

  it("handles a seller with a missing address and no registration number", () => {
    const csv = buildSellerProductReportCsv(
      makeCustomer({ address: null, registrationNumber: null, type: "individual" }),
      [makeRow()],
      AT,
    );
    const rows = csv.slice(1).split("\r\n");

    expect(rows).toContain("Хаяг,");
    expect(rows).toContain("Регистрийн дугаар,");
    expect(rows).toContain("Төрөл,Хувь хүн");
  });
});
