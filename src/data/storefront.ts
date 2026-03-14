import {
  collections as defaultCollections,
  products as defaultProducts,
  type Collection,
  type EntityStatus,
  type Product,
} from "./products";

export interface ShopSettings {
  status: EntityStatus;
  brandName: string;
  brandDescription: string;
  heroHeading: string;
  heroSubtext: string;
  aboutIntroTitle: string;
  aboutIntroBody: string;
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
    settings: { ...defaultSettings },
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
      settings: { ...defaultSettings, ...parsed.settings },
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
