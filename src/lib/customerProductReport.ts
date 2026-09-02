// "By product" export for a contract seller (гэрээт борлуулагч) on the Борлуулагч screen:
// what has been transferred to them per product, how much they have sold, what is still on
// their shelf, and the total value — as an Excel-openable CSV. Same shape the chat screens
// use: a BOM so Excel on Windows reads the Mongolian, CRLF rows, and an organisation/date
// header block above the table.

import { csvCell } from "./chat/exportCsv";
import type { CustomerRecord } from "./customers";

// U+FEFF byte-order mark. Without it Excel on Windows reads the file as the system
// codepage and turns every Mongolian name into mojibake.
const BOM = "﻿";

/** One aggregated product line, matching what the Бүтээгдэхүүнээр tab shows on screen. */
export interface SellerProductRow {
  /** Already run through getProductLabel — "code - name". */
  label: string;
  variant: string | null;
  transferred: number;
  sold: number;
  totalAmount: number;
}

/** Local YYYY-MM-DD HH:mm — the moment the report was pulled, for its header. */
export function reportStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function row(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

function addressText(customer: CustomerRecord): string {
  const a = customer.address;
  if (!a) return "";
  return [a.region, a.districtOrSoum, a.khorooOrBag, a.streetAddress].filter(Boolean).join(", ");
}

/**
 * The seller's per-product report as CSV text: an organisation/date header block, then one
 * line per product (transferred, sold, still out, total value), the totals row, and finally
 * the outstanding payment balance.
 */
export function buildSellerProductReportCsv(
  customer: CustomerRecord,
  rows: SellerProductRow[],
  now: Date = new Date(),
): string {
  const totalTransferred = rows.reduce((sum, p) => sum + p.transferred, 0);
  const totalSold = rows.reduce((sum, p) => sum + p.sold, 0);
  const totalRemaining = totalTransferred - totalSold;
  const totalAmount = rows.reduce((sum, p) => sum + p.totalAmount, 0);

  const lines: string[] = [
    row(["Гэрээт борлуулагчийн бүтээгдэхүүнээр шилжүүлсэн бараа материалын тайлан"]),
    row([]),
    row(["Байгууллага", customer.name]),
    row(["Борлуулагчийн код", customer.code]),
    row(["Төрөл", customer.type === "organization" ? "Байгууллага" : "Хувь хүн"]),
    row(["Регистрийн дугаар", customer.registrationNumber ?? ""]),
    row(["Холбоо барих", customer.contactPerson ?? ""]),
    row(["Утас", customer.phoneNumber]),
    row(["Хаяг", addressText(customer)]),
    row(["Тайлан гаргасан огноо", reportStamp(now)]),
    row([]),
    row(["Бүтээгдэхүүн", "Хувилбар", "Шилжүүлсэн (ш)", "Зарсан (ш)", "Үлдэгдэл (ш)", "Нийт дүн (₮)"]),
    ...rows.map((p) =>
      row([
        p.label,
        p.variant ?? "",
        p.transferred,
        p.sold,
        p.transferred - p.sold,
        Math.round(p.totalAmount),
      ]),
    ),
    row(["Нийт", "", totalTransferred, totalSold, totalRemaining, Math.round(totalAmount)]),
    row([]),
    row(["Шилжүүлсэн бараа материалын нийт дүн (₮)", Math.round(totalAmount)]),
    row(["Төлбөрийн үлдэгдэл нийт дүн (₮)", Math.round(customer.outstandingBalance)]),
  ];

  return BOM + lines.join("\r\n");
}

/** File-name-safe slug of the seller's name — letters and digits kept, the rest hyphenated. */
function slugify(name: string): string {
  return name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "борлуулагч";
}

/** Builds the report and hands it to the browser as a dated file that opens in Excel. */
export function downloadSellerProductReport(
  customer: CustomerRecord,
  rows: SellerProductRow[],
): void {
  const csv = buildSellerProductReportCsv(customer, rows);
  const date = new Date().toISOString().slice(0, 10);

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(customer.name)}-бараа-материал-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick: revoking immediately races the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
