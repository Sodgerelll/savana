import type { CSSProperties } from "react";
import type { Collection, EntityStatus, Product } from "../data/products";
import {
  createDefaultStorefrontData,
  type HeroBanner,
  type JournalEntry,
  type MarketItem,
  type ShopSettings,
  type SiteNavigationId,
  type SiteNavigationItem,
  type Testimonial,
} from "../data/storefront";

export const SYSTEM_COLLECTION_SLUG = "best-sellers";
export const DEFAULT_COLLECTION_GRADIENT = "linear-gradient(135deg, #d8ccb7 0%, #bcab92 100%)";
const SYSTEM_COLLECTION_GRADIENT = "linear-gradient(135deg, #c8c0a0 0%, #b5aa88 100%)";

export function isSystemCollection(collection: Collection) {
  return collection.slug === SYSTEM_COLLECTION_SLUG;
}

export function normalizeCollectionSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getUniqueCollectionSlug(value: string, collections: Collection[], excludedId?: number) {
  const baseSlug = normalizeCollectionSlug(value) || `category-${excludedId ?? collections.length + 1}`;
  let nextSlug = baseSlug;
  let suffix = 2;

  while (
    collections.some(
      (collection) => collection.id !== excludedId && collection.slug === nextSlug
    )
  ) {
    nextSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return nextSlug;
}

export function getCategoryGradient(collections: Collection[], slug: string) {
  return (
    collections.find((collection) => collection.slug === slug)?.gradient ??
    (slug === SYSTEM_COLLECTION_SLUG ? SYSTEM_COLLECTION_GRADIENT : DEFAULT_COLLECTION_GRADIENT)
  );
}

export function getCollectionPrimaryImage(collection: Collection) {
  return collection.image.trim();
}

export function getProductPrimaryImage(product: Product) {
  return product.images.find((image) => image.trim().length > 0) ?? "";
}

export function formatStorePrice(amount: number) {
  const hasFraction = Math.abs(amount % 1) > 0.001;

  return `${new Intl.NumberFormat("mn-MN", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(amount)}₮`;
}

export function isActiveStatus(status?: EntityStatus | null) {
  return status !== "inactive";
}

export function getActiveCollections(collections: Collection[]) {
  return collections.filter((collection) => isActiveStatus(collection.status));
}

export function getActiveProducts(products: Product[], collections: Collection[]) {
  const activeCollectionSlugs = new Set(getActiveCollections(collections).map((collection) => collection.slug));
  return products.filter(
    (product) => isActiveStatus(product.status) && activeCollectionSlugs.has(product.category)
  );
}

export function getActiveHeroBanners(heroBanners: HeroBanner[], collections: Collection[]) {
  const activeCollectionSlugs = new Set(getActiveCollections(collections).map((collection) => collection.slug));
  return heroBanners.filter(
    (banner) => isActiveStatus(banner.status) && activeCollectionSlugs.has(banner.collectionSlug)
  );
}

export function getActiveMarkets(markets: MarketItem[]) {
  return markets.filter((market) => isActiveStatus(market.status));
}

export function getActiveTestimonials(testimonials: Testimonial[]) {
  return testimonials.filter((testimonial) => isActiveStatus(testimonial.status));
}

export function getActiveSiteNavigation(items: SiteNavigationItem[]) {
  return items
    .filter((item) => isActiveStatus(item.status))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getActiveJournalEntries(entries: JournalEntry[]) {
  return entries
    .filter((entry) => isActiveStatus(entry.status))
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt);
      const rightTime = Date.parse(right.publishedAt);

      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
        return right.id - left.id;
      }

      return rightTime - leftTime;
    });
}

export function getSiteNavigationPath(id: SiteNavigationId) {
  switch (id) {
    case "shop":
      return "/collections";
    case "featured":
      return `/collections/${SYSTEM_COLLECTION_SLUG}`;
    case "location":
      return "/partnerships";
    case "about":
      return "/about";
    case "contact":
      return "/contact";
    case "journal":
      return "/journal";
    default:
      return "/";
  }
}

export function getSiteNavigationIdForPath(pathname: string): SiteNavigationId | null {
  const normalizedPathname = pathname !== "/" ? pathname.replace(/\/+$/, "") || "/" : pathname;

  if (normalizedPathname === "/collections/best-sellers") {
    return "featured";
  }

  if (normalizedPathname === "/collections" || normalizedPathname.startsWith("/collections/")) {
    return "shop";
  }

  if (normalizedPathname === "/about") {
    return "about";
  }

  if (normalizedPathname === "/contact") {
    return "contact";
  }

  if (normalizedPathname === "/partnerships" || normalizedPathname === "/find-us") {
    return "location";
  }

  if (normalizedPathname === "/journal") {
    return "journal";
  }

  return null;
}

export function getPageBannerNavigationItem(items: SiteNavigationItem[], pathname: string) {
  const navigationId = getSiteNavigationIdForPath(pathname);

  if (!navigationId) {
    return null;
  }

  return items.find((item) => item.id === navigationId) ?? null;
}

export function getPageBannerStyle(imageUrl?: string | null): CSSProperties | undefined {
  const trimmedUrl = imageUrl?.trim();

  if (!trimmedUrl) {
    return undefined;
  }

  return {
    backgroundImage: `url("${trimmedUrl.replace(/["\\\n\r\f]/g, "\\$&")}")`,
  };
}

export function hasPageBanner(items: SiteNavigationItem[], pathname: string) {
  const navigationItem = getPageBannerNavigationItem(items, pathname);
  return Boolean(navigationItem?.pageBannerImage.trim());
}

export function getRenderableSettings(settings: ShopSettings) {
  return isActiveStatus(settings.status) ? settings : createDefaultStorefrontData().settings;
}
