import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "../../lib/chat/exportCsv";

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Батбаяр")).toBe("Батбаяр");
    expect(csvCell(25000)).toBe("25000");
  });

  it("quotes a value containing a comma, quote or newline", () => {
    expect(csvCell("СБД, 5-р хороо")).toBe('"СБД, 5-р хороо"');
    expect(csvCell('Тэр "сайн" гэсэн')).toBe('"Тэр ""сайн"" гэсэн"');
    expect(csvCell("нэг\nхоёр")).toBe('"нэг\nхоёр"');
  });

  it("defuses a value Excel would run as a formula", () => {
    // A note beginning with "=" is a note, not a spreadsheet function, and a
    // file that executes on open is a file nobody should be handed.
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+976 99119911")).toBe("'+976 99119911");
    expect(csvCell("-5")).toBe("'-5");
  });

  it("writes nothing for a missing value", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("starts with a byte order mark so Excel reads Mongolian correctly", () => {
    // Without it Excel on Windows falls back to the system codepage and every
    // Cyrillic name arrives as mojibake.
    expect(toCsv(["Нэр"], [["Батбаяр"]]).startsWith("\uFEFF")).toBe(true);
  });

  it("puts the headers first and separates rows with CRLF", () => {
    const csv = toCsv(["Нэр", "Утас"], [["Бат", "99119911"], ["Дорж", "88112233"]]);

    expect(csv.slice(1).split("\r\n")).toEqual(["Нэр,Утас", "Бат,99119911", "Дорж,88112233"]);
  });

  it("writes a header-only file when there is nothing to export", () => {
    expect(toCsv(["Нэр"], []).slice(1)).toBe("Нэр");
  });
});
