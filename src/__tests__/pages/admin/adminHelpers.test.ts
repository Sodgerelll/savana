import { describe, it, expect } from "vitest";
import type { OrderRecord } from "../../../lib/orders";
import type { UserProfile, UserRole } from "../../../lib/userProfiles";
import type { JournalEntry, SiteNavigationItem } from "../../../data/storefront";
import {
  getUserIdentity,
  getRoleLabel,
  getManageableRoleOptions,
  getUserProviderSummary,
  getAuthMethodLabel,
  getOrderStatusLabel,
  getOrderStatusClassName,
  getOrderTotalQuantity,
  getOrderPaymentStatusLabel,
  formatAdminDateTime,
  getLocalizedManagedText,
  getManagedNavigationLabel,
  getManagedJournalTitle,
  getManagedJournalCategory,
} from "../../../pages/admin/adminHelpers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "uid-1",
    email: null,
    phoneNumber: null,
    displayName: null,
    role: "customer",
    registrationMethod: "email",
    lastAuthMethod: "email",
    providers: [],
    hasPassword: false,
    phoneLoginEmail: null,
    registeredAt: null,
    lastSignInAt: null,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    orderNumber: "ORD-0001",
    auth: { uid: "u1", isAnonymous: false },
    customer: { fullName: "Alice", phoneNumber: "99001234", email: null, note: "" },
    address: { region: "UB", districtOrSoum: "Chingeltei", khorooOrBag: "1-r khoroo", streetAddress: "St 1", additionalAddress: "" },
    items: [],
    totals: { subtotal: 0, shippingFee: 0, grandTotal: 0 },
    payment: { method: "qpay", provider: "qpay", status: "pending", amount: 0, qrPayload: "", paidAt: null },
    status: "new",
    schemaVersion: 1,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as OrderRecord;
}

function makeNavItem(overrides: Partial<SiteNavigationItem> = {}): SiteNavigationItem {
  return {
    id: "shop",
    group: "left",
    labelEn: "Shop",
    labelMn: "Дэлгүүр",
    pageBannerImage: "",
    sortOrder: 1,
    status: "active",
    ...overrides,
  };
}

function makeJournalEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 1,
    titleEn: "English Title",
    titleMn: "Монгол гарчиг",
    excerptEn: "",
    excerptMn: "",
    categoryEn: "News",
    categoryMn: "Мэдээ",
    author: "Author",
    publishedAt: "2024-01-01",
    image: "",
    status: "active",
    ...overrides,
  };
}

// ─── getUserIdentity ──────────────────────────────────────────────────────────

describe("getUserIdentity", () => {
  it("prefers displayName", () => {
    expect(getUserIdentity(makeProfile({ displayName: "Alice", email: "a@b.com" }))).toBe("Alice");
  });

  it("falls back to phoneNumber", () => {
    expect(getUserIdentity(makeProfile({ phoneNumber: "+97699001234" }))).toBe("+97699001234");
  });

  it("falls back to email", () => {
    expect(getUserIdentity(makeProfile({ email: "alice@example.com" }))).toBe("alice@example.com");
  });

  it("falls back to uid as last resort", () => {
    expect(getUserIdentity(makeProfile({ uid: "uid-xyz" }))).toBe("uid-xyz");
  });
});

// ─── getRoleLabel ─────────────────────────────────────────────────────────────

describe("getRoleLabel", () => {
  const cases: [UserRole, string, string][] = [
    ["sysadmin", "Систем админ", "System admin"],
    ["admin", "Админ", "Admin"],
    ["worker", "Ажилтан", "Employee"],
    ["customer", "Хэрэглэгч", "Customer"],
  ];

  it.each(cases)("%s MN → %s", (role, mn) => {
    expect(getRoleLabel(role, "MN")).toBe(mn);
  });

  it.each(cases)("%s EN → %s", (role, _mn, en) => {
    expect(getRoleLabel(role, "EN")).toBe(en);
  });
});

// ─── getManageableRoleOptions ─────────────────────────────────────────────────

describe("getManageableRoleOptions", () => {
  it("non-customer roles get [sysadmin, admin, worker]", () => {
    expect(getManageableRoleOptions("admin")).toEqual(["sysadmin", "admin", "worker"]);
    expect(getManageableRoleOptions("sysadmin")).toEqual(["sysadmin", "admin", "worker"]);
  });

  it("customer role also includes customer", () => {
    expect(getManageableRoleOptions("customer")).toContain("customer");
    expect(getManageableRoleOptions("customer")).toHaveLength(4);
  });
});

// ─── getUserProviderSummary ───────────────────────────────────────────────────

describe("getUserProviderSummary", () => {
  it("joins providers with comma", () => {
    expect(getUserProviderSummary(makeProfile({ providers: ["google", "password"] }))).toBe("google, password");
  });

  it("returns dash for empty providers", () => {
    expect(getUserProviderSummary(makeProfile({ providers: [] }))).toBe("-");
  });
});

// ─── getAuthMethodLabel ───────────────────────────────────────────────────────

describe("getAuthMethodLabel", () => {
  it.each([
    ["email", "MN", "И-мэйл"],
    ["email", "EN", "Email"],
    ["google", "MN", "Google"],
    ["phone", "MN", "Утас"],
    ["phone", "EN", "Phone"],
    ["guest", "MN", "Зочин"],
    ["guest", "EN", "Guest"],
    ["unknown", "MN", "Тодорхойгүй"],
    ["unknown", "EN", "Unknown"],
  ] as const)("%s %s → %s", (method, lang, expected) => {
    expect(getAuthMethodLabel(method, lang)).toBe(expected);
  });
});

// ─── getOrderStatusLabel ──────────────────────────────────────────────────────

describe("getOrderStatusLabel", () => {
  it.each([
    ["new", "MN", "Шинэ"],
    ["new", "EN", "New"],
    ["paid", "MN", "Төлбөр төлөгдсөн"],
    ["paid", "EN", "Payment paid"],
    ["delivering", "MN", "Хүргэлт хийгдэж байгаа"],
    ["delivering", "EN", "Delivering"],
    ["delivered", "MN", "Хүргэгдсэн"],
    ["delivered", "EN", "Delivered"],
  ] as const)("status=%s lang=%s → %s", (status, lang, expected) => {
    expect(getOrderStatusLabel(status, lang)).toBe(expected);
  });
});

// ─── getOrderStatusClassName ──────────────────────────────────────────────────

describe("getOrderStatusClassName", () => {
  it("includes status name in class", () => {
    expect(getOrderStatusClassName("paid")).toContain("paid");
    expect(getOrderStatusClassName("delivering")).toContain("delivering");
    expect(getOrderStatusClassName("delivered")).toContain("delivered");
    expect(getOrderStatusClassName("new")).toContain("new");
  });
});

// ─── getOrderTotalQuantity ────────────────────────────────────────────────────

describe("getOrderTotalQuantity", () => {
  it("sums item quantities", () => {
    const order = makeOrder({
      items: [
        { productId: 1, name: "A", category: "c", image: null, variant: null, quantity: 3, unitPrice: 1000, lineTotal: 3000 },
        { productId: 2, name: "B", category: "c", image: null, variant: null, quantity: 2, unitPrice: 500, lineTotal: 1000 },
      ],
    });
    expect(getOrderTotalQuantity(order)).toBe(5);
  });

  it("returns 0 for empty items", () => {
    expect(getOrderTotalQuantity(makeOrder({ items: [] }))).toBe(0);
  });
});

// ─── getOrderPaymentStatusLabel ───────────────────────────────────────────────

describe("getOrderPaymentStatusLabel", () => {
  it.each([
    ["paid", "MN", "Төлөгдсөн"],
    ["paid", "EN", "Paid"],
    ["failed", "MN", "Амжилтгүй"],
    ["failed", "EN", "Failed"],
    ["cancelled", "MN", "Цуцлагдсан"],
    ["cancelled", "EN", "Cancelled"],
    ["pending", "MN", "Хүлээгдэж буй"],
    ["pending", "EN", "Pending"],
  ] as const)("status=%s lang=%s → %s", (status, lang, expected) => {
    expect(getOrderPaymentStatusLabel(status, lang)).toBe(expected);
  });
});

// ─── formatAdminDateTime ──────────────────────────────────────────────────────

describe("formatAdminDateTime", () => {
  it("returns dash for null", () => {
    expect(formatAdminDateTime(null, "MN")).toBe("-");
  });

  it("parses YYYY-MM-DD as local date (no time zone shift)", () => {
    const result = formatAdminDateTime("2024-03-15", "EN");
    expect(result).toContain("2024");
    expect(result).toContain("3");
    expect(result).toContain("15");
  });

  it("returns value as-is when not a valid date string", () => {
    expect(formatAdminDateTime("not-a-date", "EN")).toBe("not-a-date");
  });

  it("formats ISO datetime strings", () => {
    const result = formatAdminDateTime("2024-06-01T12:00:00.000Z", "EN");
    expect(result).toContain("2024");
  });
});

// ─── getLocalizedManagedText ──────────────────────────────────────────────────

describe("getLocalizedManagedText", () => {
  it("returns primary language text when not empty", () => {
    expect(getLocalizedManagedText("MN", "English", "Монгол")).toBe("Монгол");
    expect(getLocalizedManagedText("EN", "English", "Монгол")).toBe("English");
  });

  it("falls back to the other language when primary is empty", () => {
    expect(getLocalizedManagedText("MN", "English", "")).toBe("English");
    expect(getLocalizedManagedText("EN", "", "Монгол")).toBe("Монгол");
  });

  it("returns empty string when both are empty", () => {
    expect(getLocalizedManagedText("MN", "", "")).toBe("");
  });

  it("trims whitespace before checking emptiness", () => {
    expect(getLocalizedManagedText("MN", "English", "   ")).toBe("English");
  });
});

// ─── getManagedNavigationLabel ────────────────────────────────────────────────

describe("getManagedNavigationLabel", () => {
  it("returns MN label for MN", () => {
    const item = makeNavItem({ labelMn: "Дэлгүүр", labelEn: "Shop" });
    expect(getManagedNavigationLabel(item, "MN")).toBe("Дэлгүүр");
  });

  it("returns EN label for EN", () => {
    const item = makeNavItem({ labelMn: "Дэлгүүр", labelEn: "Shop" });
    expect(getManagedNavigationLabel(item, "EN")).toBe("Shop");
  });
});

// ─── getManagedJournalTitle / getManagedJournalCategory ───────────────────────

describe("getManagedJournalTitle", () => {
  it("returns correct language title", () => {
    const entry = makeJournalEntry({ titleMn: "Монгол", titleEn: "English" });
    expect(getManagedJournalTitle(entry, "MN")).toBe("Монгол");
    expect(getManagedJournalTitle(entry, "EN")).toBe("English");
  });
});

describe("getManagedJournalCategory", () => {
  it("returns correct language category", () => {
    const entry = makeJournalEntry({ categoryMn: "Мэдээ", categoryEn: "News" });
    expect(getManagedJournalCategory(entry, "MN")).toBe("Мэдээ");
    expect(getManagedJournalCategory(entry, "EN")).toBe("News");
  });
});
