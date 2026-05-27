import { describe, it, expect } from "vitest";
import type { Collection, Product } from "../../data/products";
import type { HeroBanner, JournalEntry, MarketItem, SiteNavigationItem, Testimonial } from "../../data/storefront";
import {
  isSystemCollection,
  normalizeCollectionSlug,
  getUniqueCollectionSlug,
  formatStorePrice,
  isActiveStatus,
  getActiveCollections,
  getActiveProducts,
  getActiveHeroBanners,
  getActiveMarkets,
  getActiveTestimonials,
  getActiveSiteNavigation,
  getActiveJournalEntries,
  getSiteNavigationIdForPath,
  getPageBannerNavigationItem,
  getPageBannerStyle,
  getProductPrimaryImage,
  getCollectionPrimaryImage,
  SYSTEM_COLLECTION_SLUG,
} from "../../lib/storefrontHelpers";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 1,
    name: "Test",
    slug: "test",
    description: "",
    gradient: "",
    image: "img.jpg",
    status: "active",
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: "Product",
    price: 10000,
    description: "",
    category: "test",
    images: ["img.jpg"],
    status: "active",
    ...overrides,
  };
}

function makeBanner(overrides: Partial<HeroBanner> = {}): HeroBanner {
  return { id: 1, collectionSlug: "test", image: "", source: "", status: "active", ...overrides };
}

function makeMarket(overrides: Partial<MarketItem> = {}): MarketItem {
  return { id: 1, name: "Market", schedule: "", address: "", season: "", status: "active", ...overrides };
}

function makeTestimonial(overrides: Partial<Testimonial> = {}): Testimonial {
  return { id: 1, author: "Alice", role: "", quote: "", image: "", status: "active", ...overrides };
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
    titleEn: "Title",
    titleMn: "Гарчиг",
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

// ─── isSystemCollection ───────────────────────────────────────────────────────

describe("isSystemCollection", () => {
  it("returns true for best-sellers slug", () => {
    expect(isSystemCollection(makeCollection({ slug: SYSTEM_COLLECTION_SLUG }))).toBe(true);
  });

  it("returns false for any other slug", () => {
    expect(isSystemCollection(makeCollection({ slug: "soap" }))).toBe(false);
    expect(isSystemCollection(makeCollection({ slug: "" }))).toBe(false);
  });
});

// ─── normalizeCollectionSlug ──────────────────────────────────────────────────

describe("normalizeCollectionSlug", () => {
  it("lowercases and trims", () => {
    expect(normalizeCollectionSlug("  Hello World  ")).toBe("hello-world");
  });

  it("replaces spaces with dashes", () => {
    expect(normalizeCollectionSlug("my collection")).toBe("my-collection");
  });

  it("collapses multiple special chars into a single dash", () => {
    expect(normalizeCollectionSlug("a   b--c")).toBe("a-b-c");
  });

  it("strips leading and trailing dashes", () => {
    expect(normalizeCollectionSlug("--foo--")).toBe("foo");
  });

  it("removes non-alphanumeric characters (Mongolian kept as empty)", () => {
    expect(normalizeCollectionSlug("Нүүр биеийн")).toBe("");
  });

  it("preserves numbers", () => {
    expect(normalizeCollectionSlug("product-2024")).toBe("product-2024");
  });
});

// ─── getUniqueCollectionSlug ──────────────────────────────────────────────────

describe("getUniqueCollectionSlug", () => {
  const existing = [makeCollection({ id: 1, slug: "soap" }), makeCollection({ id: 2, slug: "bath" })];

  it("returns base slug when no collision", () => {
    expect(getUniqueCollectionSlug("hair", existing)).toBe("hair");
  });

  it("appends -2 on first collision", () => {
    expect(getUniqueCollectionSlug("soap", existing)).toBe("soap-2");
  });

  it("keeps incrementing until unique", () => {
    const cols = [
      ...existing,
      makeCollection({ id: 3, slug: "soap-2" }),
      makeCollection({ id: 4, slug: "soap-3" }),
    ];
    expect(getUniqueCollectionSlug("soap", cols)).toBe("soap-4");
  });

  it("allows the excluded id to keep its own slug", () => {
    expect(getUniqueCollectionSlug("soap", existing, 1)).toBe("soap");
  });
});

// ─── formatStorePrice ─────────────────────────────────────────────────────────

describe("formatStorePrice", () => {
  it("formats integer amounts with ₮ suffix", () => {
    const result = formatStorePrice(10000);
    expect(result).toContain("₮");
    expect(result).toContain("10");
  });

  it("formats zero", () => {
    expect(formatStorePrice(0)).toContain("₮");
  });

  it("includes decimals when fractional", () => {
    const result = formatStorePrice(1500.5);
    expect(result).toContain(".");
    expect(result).toContain("₮");
  });

  it("no decimals for whole numbers", () => {
    const result = formatStorePrice(5000);
    expect(result).not.toContain(".");
  });
});

// ─── isActiveStatus ───────────────────────────────────────────────────────────

describe("isActiveStatus", () => {
  it("returns true for 'active'", () => {
    expect(isActiveStatus("active")).toBe(true);
  });

  it("returns false for 'inactive'", () => {
    expect(isActiveStatus("inactive")).toBe(false);
  });

  it("returns true for null and undefined (defaults to active)", () => {
    expect(isActiveStatus(null)).toBe(true);
    expect(isActiveStatus(undefined)).toBe(true);
  });
});

// ─── getActiveCollections ─────────────────────────────────────────────────────

describe("getActiveCollections", () => {
  it("returns only active collections", () => {
    const cols = [
      makeCollection({ id: 1, slug: "a", status: "active" }),
      makeCollection({ id: 2, slug: "b", status: "inactive" }),
      makeCollection({ id: 3, slug: "c", status: "active" }),
    ];
    const result = getActiveCollections(cols);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.slug)).toEqual(["a", "c"]);
  });

  it("returns empty array when all inactive", () => {
    expect(getActiveCollections([makeCollection({ status: "inactive" })])).toHaveLength(0);
  });
});

// ─── getActiveProducts ────────────────────────────────────────────────────────

describe("getActiveProducts", () => {
  const cols = [
    makeCollection({ id: 1, slug: "soap", status: "active" }),
    makeCollection({ id: 2, slug: "bath", status: "inactive" }),
  ];

  it("includes products in active collections with active status", () => {
    const products = [
      makeProduct({ id: 1, category: "soap", status: "active" }),
      makeProduct({ id: 2, category: "bath", status: "active" }),
      makeProduct({ id: 3, category: "soap", status: "inactive" }),
    ];
    const result = getActiveProducts(products, cols);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("excludes products in inactive collections", () => {
    const products = [makeProduct({ id: 1, category: "bath", status: "active" })];
    expect(getActiveProducts(products, cols)).toHaveLength(0);
  });
});

// ─── getActiveHeroBanners ─────────────────────────────────────────────────────

describe("getActiveHeroBanners", () => {
  const cols = [makeCollection({ id: 1, slug: "soap", status: "active" })];

  it("includes banners pointing to active collections", () => {
    const banners = [
      makeBanner({ id: 1, collectionSlug: "soap", status: "active" }),
      makeBanner({ id: 2, collectionSlug: "bath", status: "active" }),
      makeBanner({ id: 3, collectionSlug: "soap", status: "inactive" }),
    ];
    const result = getActiveHeroBanners(banners, cols);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

// ─── getActiveMarkets / getActiveTestimonials ─────────────────────────────────

describe("getActiveMarkets", () => {
  it("filters by status", () => {
    const markets = [
      makeMarket({ id: 1, status: "active" }),
      makeMarket({ id: 2, status: "inactive" }),
    ];
    expect(getActiveMarkets(markets)).toHaveLength(1);
  });
});

describe("getActiveTestimonials", () => {
  it("filters by status", () => {
    const testimonials = [
      makeTestimonial({ id: 1, status: "active" }),
      makeTestimonial({ id: 2, status: "inactive" }),
    ];
    expect(getActiveTestimonials(testimonials)).toHaveLength(1);
  });
});

// ─── getActiveSiteNavigation ──────────────────────────────────────────────────

describe("getActiveSiteNavigation", () => {
  it("filters inactive items and sorts by sortOrder", () => {
    const items = [
      makeNavItem({ id: "about", sortOrder: 3, status: "active" }),
      makeNavItem({ id: "shop", sortOrder: 1, status: "active" }),
      makeNavItem({ id: "contact", sortOrder: 2, status: "inactive" }),
    ];
    const result = getActiveSiteNavigation(items);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("shop");
    expect(result[1].id).toBe("about");
  });
});

// ─── getActiveJournalEntries ──────────────────────────────────────────────────

describe("getActiveJournalEntries", () => {
  it("filters inactive entries", () => {
    const entries = [
      makeJournalEntry({ id: 1, status: "active", publishedAt: "2024-01-10" }),
      makeJournalEntry({ id: 2, status: "inactive", publishedAt: "2024-01-20" }),
    ];
    expect(getActiveJournalEntries(entries)).toHaveLength(1);
  });

  it("sorts by publishedAt descending", () => {
    const entries = [
      makeJournalEntry({ id: 1, publishedAt: "2024-01-01", status: "active" }),
      makeJournalEntry({ id: 2, publishedAt: "2024-06-01", status: "active" }),
      makeJournalEntry({ id: 3, publishedAt: "2024-03-01", status: "active" }),
    ];
    const result = getActiveJournalEntries(entries);
    expect(result.map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it("falls back to id sort when publishedAt is invalid", () => {
    const entries = [
      makeJournalEntry({ id: 1, publishedAt: "invalid", status: "active" }),
      makeJournalEntry({ id: 3, publishedAt: "invalid", status: "active" }),
      makeJournalEntry({ id: 2, publishedAt: "invalid", status: "active" }),
    ];
    const result = getActiveJournalEntries(entries);
    expect(result.map((e) => e.id)).toEqual([3, 2, 1]);
  });
});

// ─── getSiteNavigationIdForPath ───────────────────────────────────────────────

describe("getSiteNavigationIdForPath", () => {
  it.each([
    ["/collections", "shop"],
    ["/collections/soap", "shop"],
    ["/collections/best-sellers", "featured"],
    ["/about", "about"],
    ["/contact", "contact"],
    ["/partnerships", "location"],
    ["/find-us", "location"],
    ["/journal", "journal"],
    ["/", null],
    ["/login", null],
  ])("maps %s → %s", (path, expected) => {
    expect(getSiteNavigationIdForPath(path)).toBe(expected);
  });
});

// ─── getPageBannerNavigationItem ──────────────────────────────────────────────

describe("getPageBannerNavigationItem", () => {
  it("returns the matching nav item", () => {
    const items = [makeNavItem({ id: "about", pageBannerImage: "banner.jpg" })];
    const result = getPageBannerNavigationItem(items, "/about");
    expect(result?.id).toBe("about");
  });

  it("returns null for unknown path", () => {
    const items = [makeNavItem({ id: "about", pageBannerImage: "banner.jpg" })];
    expect(getPageBannerNavigationItem(items, "/unknown")).toBeNull();
  });

  it("returns null when no item matches the path id", () => {
    const items = [makeNavItem({ id: "shop" })];
    expect(getPageBannerNavigationItem(items, "/about")).toBeNull();
  });
});

// ─── getPageBannerStyle ───────────────────────────────────────────────────────

describe("getPageBannerStyle", () => {
  it("returns undefined for empty string", () => {
    expect(getPageBannerStyle("")).toBeUndefined();
    expect(getPageBannerStyle("   ")).toBeUndefined();
    expect(getPageBannerStyle(null)).toBeUndefined();
  });

  it("returns backgroundImage style for valid url", () => {
    const style = getPageBannerStyle("https://example.com/img.jpg");
    expect(style?.backgroundImage).toContain("https://example.com/img.jpg");
  });

  it("escapes double-quotes in url", () => {
    const style = getPageBannerStyle('img"with"quotes.jpg');
    expect(style?.backgroundImage).toBe('url("img\\"with\\"quotes.jpg")');
  });
});

// ─── getProductPrimaryImage ───────────────────────────────────────────────────

describe("getProductPrimaryImage", () => {
  it("returns first non-empty image", () => {
    expect(getProductPrimaryImage(makeProduct({ images: ["", "a.jpg", "b.jpg"] }))).toBe("a.jpg");
  });

  it("returns empty string when all images are empty", () => {
    expect(getProductPrimaryImage(makeProduct({ images: ["", "  "] }))).toBe("");
  });

  it("returns empty string for no images", () => {
    expect(getProductPrimaryImage(makeProduct({ images: [] }))).toBe("");
  });
});

// ─── getCollectionPrimaryImage ────────────────────────────────────────────────

describe("getCollectionPrimaryImage", () => {
  it("trims and returns the image field", () => {
    expect(getCollectionPrimaryImage(makeCollection({ image: "  img.jpg  " }))).toBe("img.jpg");
  });
});
