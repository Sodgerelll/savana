import {
  collections as defaultCollections,
  products as defaultProducts,
  type Collection,
  type EntityStatus,
  type Product,
} from "./products";

export type SiteNavigationId = "shop" | "featured" | "location" | "about" | "contact" | "journal";
export type SiteNavigationGroup = "left" | "right";

export interface SiteNavigationItem {
  id: SiteNavigationId;
  group: SiteNavigationGroup;
  labelEn: string;
  labelMn: string;
  pageBannerImage: string;
  sortOrder: number;
  status: EntityStatus;
}

export interface JournalEntry {
  id: number;
  titleEn: string;
  titleMn: string;
  excerptEn: string;
  excerptMn: string;
  categoryEn: string;
  categoryMn: string;
  author: string;
  publishedAt: string;
  image: string;
  status: EntityStatus;
}

export interface ShopSettings {
  status: EntityStatus;
  brandName: string;
  brandDescription: string;
  heroHeading: string;
  heroSubtext: string;
  aboutIntroTitle: string;
  aboutIntroBody: string;
  contactPhone: string;
  contactEmail: string;
  location: string;
  responseTime: string;
  facebookUrl: string;
  instagramUrl: string;
  instagramHandle: string;
  mapNote: string;
  marketIntro: string;
  storeHoursText: string;
  wholesaleHeading: string;
  wholesaleText: string;
  wholesaleEmail: string;
  navigationItems: SiteNavigationItem[];
  journalHeadingEn: string;
  journalHeadingMn: string;
  journalSubtextEn: string;
  journalSubtextMn: string;
  journalEntries: JournalEntry[];
}

export interface HeroBanner {
  id: number;
  collectionSlug: string;
  image: string;
  source: string;
  status: EntityStatus;
}

export interface MarketItem {
  id: number;
  name: string;
  schedule: string;
  address: string;
  season: string;
  status: EntityStatus;
}

export interface Testimonial {
  id: number;
  text: string;
  author: string;
  location: string;
  status: EntityStatus;
}

export interface StorefrontData {
  settings: ShopSettings;
  collections: Collection[];
  products: Product[];
  heroBanners: HeroBanner[];
  markets: MarketItem[];
  testimonials: Testimonial[];
}

export const LEGACY_STOREFRONT_STORAGE_KEY = "savana.storefront.v1";
export const OFFICIAL_FACEBOOK_URL = "https://www.facebook.com/SavanaOrganica";
const SYSTEM_COLLECTION_SLUG = "best-sellers";
const PRAIRIE_SOURCE_BANNER_IMAGES = [
  "https://www.prairiesoapshack.com/cdn/shop/files/PSS_WomenBeauty_Photoshoot-09955.jpg?v=1757878646&width=1500",
  "https://www.prairiesoapshack.com/cdn/shop/files/LUM08714.jpg?v=1717130728&width=1500",
  "https://www.prairiesoapshack.com/cdn/shop/files/CHE08917.jpg?v=1766084176&width=1500",
  "https://www.prairiesoapshack.com/cdn/shop/files/LUM08420.jpg?v=1691208130&width=1500",
] as const;
const defaultNavigationItems: SiteNavigationItem[] = [
  {
    id: "shop",
    group: "left",
    labelEn: "Shop",
    labelMn: "Дэлгүүр",
    pageBannerImage: "",
    sortOrder: 1,
    status: "active",
  },
  {
    id: "featured",
    group: "left",
    labelEn: "Featured",
    labelMn: "Эрэлттэй",
    pageBannerImage: "",
    sortOrder: 2,
    status: "active",
  },
  {
    id: "location",
    group: "left",
    labelEn: "Partnerships",
    labelMn: "Хамтрал",
    pageBannerImage: "",
    sortOrder: 3,
    status: "active",
  },
  {
    id: "about",
    group: "right",
    labelEn: "About Us",
    labelMn: "Бидний тухай",
    pageBannerImage: "",
    sortOrder: 1,
    status: "active",
  },
  {
    id: "contact",
    group: "right",
    labelEn: "Contact",
    labelMn: "Холбоо барих",
    pageBannerImage: "",
    sortOrder: 2,
    status: "active",
  },
  {
    id: "journal",
    group: "right",
    labelEn: "Journal",
    labelMn: "Сэтгүүл",
    pageBannerImage: "",
    sortOrder: 3,
    status: "active",
  },
];
const defaultJournalEntries: JournalEntry[] = [
  {
    id: 1,
    titleEn: "Why we build routines around fewer, better essentials",
    titleMn: "Яагаад бид өдөр тутмын арчилгааг цөөн атлаа чанартай хэрэгцээнд төвлөрүүлдэг вэ",
    excerptEn:
      "A SAVANA shelf is meant to feel calm and practical. We care more about what earns a place in the routine than about adding noise.",
    excerptMn:
      "SAVANA-ийн бүтээгдэхүүний тавиур тайван, хэрэглээнд ойр мэдрэмж өгөх ёстой. Бид олон зүйл нэмэхээс илүү үнэхээр хэрэгтэй зүйл дээр төвлөрдөг.",
    categoryEn: "Routine",
    categoryMn: "Дадал",
    author: "SAVANA Studio",
    publishedAt: "2026-03-10",
    image: "",
    status: "active",
  },
  {
    id: 2,
    titleEn: "Ingredient clarity matters more than trend language",
    titleMn: "Найрлагын тодорхой байдал нь тренд үгнээс илүү чухал",
    excerptEn:
      "Our journal tracks how we think about ingredients, textures, and everyday use so customers can understand what each product is trying to do.",
    excerptMn:
      "Бүтээгдэхүүн бүр юу хийхээр бүтээгдсэн, ямар мэдрэмж өгөх ёстойг ойлгомжтой болгохын тулд бид найрлага, бүтэц, хэрэглээний талаар тэмдэглэл хөтөлдөг.",
    categoryEn: "Ingredients",
    categoryMn: "Найрлага",
    author: "SAVANA Studio",
    publishedAt: "2026-03-05",
    image: "",
    status: "active",
  },
  {
    id: 3,
    titleEn: "Designing a storefront that feels tactile and slow",
    titleMn: "Мэдрэмжтэй, тайван хэмнэлтэй storefront хэрхэн бүрддэг вэ",
    excerptEn:
      "Warm neutrals, quiet typography, and practical merchandising choices shape the tone of the brand as much as the formulas do.",
    excerptMn:
      "Дулаан нейтрал өнгө, нам тайван бичгийн хэв, хэрэглээнд суурилсан merchandising шийдлүүд нь найрлагын адил брэндийн өнгө аясыг бүрдүүлдэг.",
    categoryEn: "Studio",
    categoryMn: "Студи",
    author: "SAVANA Studio",
    publishedAt: "2026-02-26",
    image: "",
    status: "active",
  },
];

const defaultSettings: ShopSettings = {
  status: "active",
  brandName: "SAVANA",
  brandDescription:
    "Organic soap, solid shampoo, and wellness products made in Mongolia with thoughtful natural ingredients.",
  heroHeading: "SAVANA",
  heroSubtext:
    "Organic soap, solid shampoo, and wellness products for the whole family.",
  aboutIntroTitle: "SAVANA",
  aboutIntroBody:
    "SAVANA creates natural care products with a focus on everyday use, clean ingredients, and simple routines.\n\nOur collections are built around organic soaps, solid shampoos, and wellness products designed for modern households.\n\nWe continue to improve each product with careful sourcing, practical formulas, and a commitment to quality.",
  contactPhone: "77770081",
  contactEmail: "savanaorganica@gmail.com",
  location: "Улаанбаатар, Монгол Улс",
  responseTime: "24-48 цагийн дотор хариу өгнө.",
  facebookUrl: OFFICIAL_FACEBOOK_URL,
  instagramUrl: "https://www.instagram.com/savana_brand/",
  instagramHandle: "@savana_brand",
  mapNote:
    "Follow SAVANA on Facebook and Instagram for the latest updates and announcements.",
  marketIntro:
    "Store and delivery information is updated through SAVANA's official channels.",
  storeHoursText:
    "Orders and support requests are processed throughout the week. Delivery times may vary by location.",
  wholesaleHeading: "Work With SAVANA",
  wholesaleText:
    "We welcome partnerships with retailers, boutiques, and distributors who want to offer SAVANA products.",
  wholesaleEmail: "savanaorganica@gmail.com",
  navigationItems: defaultNavigationItems,
  journalHeadingEn: "SAVANA Journal",
  journalHeadingMn: "SAVANA сэтгүүл",
  journalSubtextEn:
    "Editorial notes on ingredients, rituals, and the everyday choices shaping the brand.",
  journalSubtextMn:
    "Найрлага, дадал, брэндийн өдөр тутмын өнгө төрхийг өгүүлэх редакцын тэмдэглэлүүд.",
  journalEntries: defaultJournalEntries,
};

const defaultMarkets: MarketItem[] = [
  {
    id: 1,
    name: "Calgary Farmers' Market",
    schedule: "Saturdays, 9am - 3pm",
    address: "510 77 Ave SE, Calgary, AB",
    season: "Year-round",
    status: "active",
  },
  {
    id: 2,
    name: "Edmonton City Market",
    schedule: "Saturdays, 8am - 3pm",
    address: "103A Ave & 97 St NW, Edmonton, AB",
    season: "May - October",
    status: "active",
  },
  {
    id: 3,
    name: "Red Deer Farmers' Market",
    schedule: "Saturdays, 8am - 1pm",
    address: "4747 53 St, Red Deer, AB",
    season: "Year-round",
    status: "active",
  },
  {
    id: 4,
    name: "Lethbridge Farmer's Market",
    schedule: "Thursdays, 10am - 2pm",
    address: "400 Stafford Dr N, Lethbridge, AB",
    season: "April - October",
    status: "active",
  },
];

const defaultTestimonials: Testimonial[] = [
  {
    id: 1,
    text: "I've been using SAVANA soaps for over a year now and my skin has never been happier. The Dandelion & Honey is my absolute favourite!",
    author: "Sarah M.",
    location: "Calgary, AB",
    status: "active",
  },
  {
    id: 2,
    text: "Finally found natural products that actually work. The body butter is incredibly moisturizing without feeling greasy. Will never go back to store-bought.",
    author: "Jennifer K.",
    location: "Edmonton, AB",
    status: "active",
  },
  {
    id: 3,
    text: "The Forest Bath soap is like bringing the outdoors into my shower every morning. Beautiful products made with so much care. Highly recommend!",
    author: "Michael R.",
    location: "Red Deer, AB",
    status: "active",
  },
];

function cloneCollections(collections: Collection[]) {
  return collections.map((collection) => ({ ...collection }));
}

function cloneProducts(products: Product[]) {
  return products.map((product) => ({
    ...product,
    images: [...product.images],
    variants: product.variants?.map((variant) => ({ ...variant })),
  }));
}

function cloneNavigationItems(items: SiteNavigationItem[]) {
  return items.map((item) => ({ ...item }));
}

function cloneJournalEntries(entries: JournalEntry[]) {
  return entries.map((entry) => ({ ...entry }));
}

export function cloneShopSettings(settings: ShopSettings): ShopSettings {
  return {
    ...settings,
    navigationItems: cloneNavigationItems(settings.navigationItems),
    journalEntries: cloneJournalEntries(settings.journalEntries),
  };
}

function parseStatus(value: unknown): EntityStatus {
  return value === "inactive" ? "inactive" : "active";
}

function parseNavigationId(value: unknown): SiteNavigationId | null {
  switch (value) {
    case "shop":
    case "featured":
    case "location":
    case "about":
    case "contact":
    case "journal":
      return value;
    default:
      return null;
  }
}

function parseNavigationGroup(value: unknown): SiteNavigationGroup {
  return value === "right" ? "right" : "left";
}

export function resolveNavigationItemLabel(
  id: SiteNavigationId,
  language: "EN" | "MN",
  value: unknown,
) {
  const defaultItem = defaultNavigationItems.find((navigationItem) => navigationItem.id === id);
  const fallback = language === "MN" ? defaultItem?.labelMn ?? "" : defaultItem?.labelEn ?? "";
  const nextValue = String(value ?? fallback).trim();

  if (id === "location") {
    const legacyValue = language === "MN" ? "Байршил" : "Location";

    if (!nextValue || nextValue === legacyValue) {
      return fallback;
    }
  }

  return nextValue || fallback;
}

function normalizeNavigationItems(value: unknown) {
  if (!Array.isArray(value)) {
    return cloneNavigationItems(defaultNavigationItems);
  }

  const overrides = new Map<SiteNavigationId, SiteNavigationItem>();

  value.forEach((item) => {
    if (typeof item !== "object" || item === null) {
      return;
    }

    const rawItem = item as Record<string, unknown>;
    const id = parseNavigationId(rawItem.id);

    if (!id) {
      return;
    }

    const defaultItem = defaultNavigationItems.find((navigationItem) => navigationItem.id === id);

    if (!defaultItem) {
      return;
    }

    overrides.set(id, {
      ...defaultItem,
      group: parseNavigationGroup(rawItem.group),
      labelEn: resolveNavigationItemLabel(id, "EN", rawItem.labelEn),
      labelMn: resolveNavigationItemLabel(id, "MN", rawItem.labelMn),
      pageBannerImage: String(rawItem.pageBannerImage ?? defaultItem.pageBannerImage),
      sortOrder: Number.isFinite(rawItem.sortOrder) ? Number(rawItem.sortOrder) : defaultItem.sortOrder,
      status: parseStatus(rawItem.status),
    });
  });

  return defaultNavigationItems
    .map((item) => ({ ...(overrides.get(item.id) ?? item) }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function normalizeJournalEntries(value: unknown) {
  if (value === undefined) {
    return cloneJournalEntries(defaultJournalEntries);
  }

  if (!Array.isArray(value)) {
    return cloneJournalEntries(defaultJournalEntries);
  }

  return value
    .map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }

      const rawEntry = entry as Record<string, unknown>;

      return {
        id: Number.isFinite(rawEntry.id) ? Number(rawEntry.id) : index + 1,
        titleEn: String(rawEntry.titleEn ?? ""),
        titleMn: String(rawEntry.titleMn ?? ""),
        excerptEn: String(rawEntry.excerptEn ?? ""),
        excerptMn: String(rawEntry.excerptMn ?? ""),
        categoryEn: String(rawEntry.categoryEn ?? ""),
        categoryMn: String(rawEntry.categoryMn ?? ""),
        author: String(rawEntry.author ?? ""),
        publishedAt: String(rawEntry.publishedAt ?? ""),
        image: String(rawEntry.image ?? ""),
        status: parseStatus(rawEntry.status),
      } satisfies JournalEntry;
    })
    .filter((entry): entry is JournalEntry => entry !== null);
}

export function normalizeShopSettings(value: Partial<Record<keyof ShopSettings, unknown>> | undefined): ShopSettings {
  const defaults = cloneShopSettings(defaultSettings);

  if (!value) {
    return defaults;
  }

  return {
    status: parseStatus(value.status),
    brandName: String(value.brandName ?? defaults.brandName),
    brandDescription: String(value.brandDescription ?? defaults.brandDescription),
    heroHeading: String(value.heroHeading ?? defaults.heroHeading),
    heroSubtext: String(value.heroSubtext ?? defaults.heroSubtext),
    aboutIntroTitle: String(value.aboutIntroTitle ?? defaults.aboutIntroTitle),
    aboutIntroBody: String(value.aboutIntroBody ?? defaults.aboutIntroBody),
    contactPhone: String(value.contactPhone ?? defaults.contactPhone),
    contactEmail: String(value.contactEmail ?? defaults.contactEmail),
    location: String(value.location ?? defaults.location),
    responseTime: String(value.responseTime ?? defaults.responseTime),
    facebookUrl: String(value.facebookUrl ?? defaults.facebookUrl),
    instagramUrl: String(value.instagramUrl ?? defaults.instagramUrl),
    instagramHandle: String(value.instagramHandle ?? defaults.instagramHandle),
    mapNote: String(value.mapNote ?? defaults.mapNote),
    marketIntro: String(value.marketIntro ?? defaults.marketIntro),
    storeHoursText: String(value.storeHoursText ?? defaults.storeHoursText),
    wholesaleHeading: String(value.wholesaleHeading ?? defaults.wholesaleHeading),
    wholesaleText: String(value.wholesaleText ?? defaults.wholesaleText),
    wholesaleEmail: String(value.wholesaleEmail ?? defaults.wholesaleEmail),
    navigationItems: normalizeNavigationItems(value.navigationItems),
    journalHeadingEn: String(value.journalHeadingEn ?? defaults.journalHeadingEn),
    journalHeadingMn: String(value.journalHeadingMn ?? defaults.journalHeadingMn),
    journalSubtextEn: String(value.journalSubtextEn ?? defaults.journalSubtextEn),
    journalSubtextMn: String(value.journalSubtextMn ?? defaults.journalSubtextMn),
    journalEntries: normalizeJournalEntries(value.journalEntries),
  };
}

function getBannerCollections(collections: Collection[]) {
  const nonSystemCollections = collections.filter((collection) => collection.slug !== SYSTEM_COLLECTION_SLUG);
  return nonSystemCollections.length > 0 ? nonSystemCollections : collections;
}

export function createDefaultHeroBanners(collections: Collection[]): HeroBanner[] {
  return getBannerCollections(collections)
    .slice(0, PRAIRIE_SOURCE_BANNER_IMAGES.length)
    .map((collection, index) => ({
      id: index + 1,
      collectionSlug: collection.slug,
      image: PRAIRIE_SOURCE_BANNER_IMAGES[index],
      source: "prairiesoapshack.com",
      status: "active",
    }));
}

export function resolveSeedHeroBanners(seedBanners: HeroBanner[] | undefined, collections: Collection[]) {
  const collectionSlugs = new Set(collections.map((collection) => collection.slug));
  const matchingBanners =
    seedBanners?.filter((banner) => collectionSlugs.has(banner.collectionSlug)) ?? [];

  return matchingBanners.length > 0 ? matchingBanners : createDefaultHeroBanners(collections);
}

export function createDefaultStorefrontData(): StorefrontData {
  const clonedCollections = cloneCollections(defaultCollections);

  return {
    settings: cloneShopSettings(defaultSettings),
    collections: clonedCollections,
    products: cloneProducts(defaultProducts),
    heroBanners: createDefaultHeroBanners(clonedCollections),
    markets: defaultMarkets.map((market) => ({ ...market })),
    testimonials: defaultTestimonials.map((testimonial) => ({ ...testimonial })),
  };
}

export function getLegacyStorefrontCandidate(): StorefrontData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(LEGACY_STOREFRONT_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StorefrontData>;

    if (
      !parsed ||
      !parsed.settings ||
      !Array.isArray(parsed.collections) ||
      !Array.isArray(parsed.products) ||
      (!parsed.heroBanners && parsed.heroBanners !== undefined && !Array.isArray(parsed.heroBanners)) ||
      !Array.isArray(parsed.markets) ||
      !Array.isArray(parsed.testimonials)
    ) {
      return null;
    }

    const parsedCollections = parsed.collections.map((collection) => ({ ...collection }));

    return {
      settings: normalizeShopSettings(parsed.settings as Partial<Record<keyof ShopSettings, unknown>>),
      collections: parsedCollections,
      products: parsed.products.map((product) => ({
        ...product,
        images: [...(product.images ?? [""])],
        variants: product.variants?.map((variant) => ({ ...variant })),
      })),
      heroBanners: resolveSeedHeroBanners(
        parsed.heroBanners?.map((banner) => ({ ...banner })),
        parsedCollections
      ),
      markets: parsed.markets.map((market) => ({ ...market })),
      testimonials: parsed.testimonials.map((testimonial) => ({ ...testimonial })),
    };
  } catch {
    return null;
  }
}

export function clearLegacyStorefrontCandidate() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LEGACY_STOREFRONT_STORAGE_KEY);
  }
}
