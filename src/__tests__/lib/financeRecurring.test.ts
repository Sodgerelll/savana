import { describe, it, expect, vi } from "vitest";

// ─── Mock firebase/firestore (listDueOccurrences is pure, but the module imports firebase) ───

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

import { listDueOccurrences } from "../../lib/financeRecurring";

describe("listDueOccurrences", () => {
  describe("weekly", () => {
    it("generates every 7 days from startDate up to today inclusive", () => {
      expect(
        listDueOccurrences({ frequency: "weekly", startDate: "2026-06-01", lastGeneratedDate: null }, "2026-06-22"),
      ).toEqual(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]);
    });

    it("only returns occurrences after lastGeneratedDate", () => {
      expect(
        listDueOccurrences({ frequency: "weekly", startDate: "2026-06-01", lastGeneratedDate: "2026-06-10" }, "2026-06-22"),
      ).toEqual(["2026-06-15", "2026-06-22"]);
    });

    it("returns nothing when startDate is in the future", () => {
      expect(
        listDueOccurrences({ frequency: "weekly", startDate: "2026-08-01", lastGeneratedDate: null }, "2026-07-09"),
      ).toEqual([]);
    });

    it("crosses month boundaries", () => {
      expect(
        listDueOccurrences({ frequency: "weekly", startDate: "2026-06-25", lastGeneratedDate: null }, "2026-07-05"),
      ).toEqual(["2026-06-25", "2026-07-02"]);
    });
  });

  describe("monthly", () => {
    it("repeats on the same day each month", () => {
      expect(
        listDueOccurrences({ frequency: "monthly", startDate: "2026-04-15", lastGeneratedDate: null }, "2026-07-09"),
      ).toEqual(["2026-04-15", "2026-05-15", "2026-06-15"]);
    });

    it("clamps day 31 to shorter months", () => {
      expect(
        listDueOccurrences({ frequency: "monthly", startDate: "2026-01-31", lastGeneratedDate: null }, "2026-04-30"),
      ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    });

    it("crosses year boundaries", () => {
      expect(
        listDueOccurrences({ frequency: "monthly", startDate: "2025-11-05", lastGeneratedDate: "2025-12-31" }, "2026-02-10"),
      ).toEqual(["2026-01-05", "2026-02-05"]);
    });
  });

  describe("yearly", () => {
    it("repeats on the same month/day each year", () => {
      expect(
        listDueOccurrences({ frequency: "yearly", startDate: "2024-03-10", lastGeneratedDate: null }, "2026-07-09"),
      ).toEqual(["2024-03-10", "2025-03-10", "2026-03-10"]);
    });

    it("clamps Feb 29 to Feb 28 in non-leap years", () => {
      expect(
        listDueOccurrences({ frequency: "yearly", startDate: "2024-02-29", lastGeneratedDate: null }, "2026-03-01"),
      ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
    });
  });

  it("returns empty for a malformed startDate", () => {
    expect(
      listDueOccurrences({ frequency: "monthly", startDate: "garbage", lastGeneratedDate: null }, "2026-07-09"),
    ).toEqual([]);
  });

  it("caps the number of generated occurrences", () => {
    const due = listDueOccurrences(
      { frequency: "weekly", startDate: "2000-01-01", lastGeneratedDate: null },
      "2026-07-09",
      120,
    );
    expect(due).toHaveLength(120);
    expect(due[0]).toBe("2000-01-01");
  });
});
