import { describe, it, expect } from "vitest";
import { alertFor, titleWithCount } from "../../lib/chat/chatAlerts";

const copy = {
  awaiting: (n: number) => `${n} яриа хүн хүлээж байна`,
  leads: (n: number) => `${n} шинэ захиалгын хүсэлт`,
};

describe("alertFor", () => {
  it("says nothing on the first reading", () => {
    // Everything is "new" the first time and none of it is news — announcing a
    // backlog on page load teaches whoever is watching to ignore the alerts.
    expect(alertFor(null, { awaiting: 3, newLeads: 2 }, copy)).toBeNull();
  });

  it("announces only what went up", () => {
    expect(
      alertFor({ awaiting: 1, newLeads: 4 }, { awaiting: 2, newLeads: 4 }, copy),
    ).toBe("1 яриа хүн хүлээж байна");
  });

  it("announces both when both went up", () => {
    expect(alertFor({ awaiting: 0, newLeads: 0 }, { awaiting: 1, newLeads: 2 }, copy)).toBe(
      "1 яриа хүн хүлээж байна · 2 шинэ захиалгын хүсэлт",
    );
  });

  it("says nothing when a count is unchanged or falling", () => {
    expect(alertFor({ awaiting: 3, newLeads: 1 }, { awaiting: 3, newLeads: 1 }, copy)).toBeNull();
    expect(alertFor({ awaiting: 3, newLeads: 1 }, { awaiting: 1, newLeads: 0 }, copy)).toBeNull();
  });

  it("counts the difference, not the total", () => {
    expect(alertFor({ awaiting: 5, newLeads: 0 }, { awaiting: 8, newLeads: 0 }, copy)).toBe(
      "3 яриа хүн хүлээж байна",
    );
  });
});

describe("titleWithCount", () => {
  it("puts the count first, where a narrow tab still shows it", () => {
    expect(titleWithCount("SAVANA", 3)).toBe("(3) SAVANA");
  });

  it("takes the count off again at zero", () => {
    expect(titleWithCount("(3) SAVANA", 0)).toBe("SAVANA");
  });

  it("replaces a count rather than stacking another on top", () => {
    expect(titleWithCount("(3) SAVANA", 5)).toBe("(5) SAVANA");
  });
});
