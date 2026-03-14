import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
  writeBatch,
} from "firebase/firestore";
import type { Collection, Product } from "../data/products";
import {
  createDefaultStorefrontData,
  resolveSeedHeroBanners,
  type HeroBanner,
  type MarketItem,
  type ShopSettings,
  type StorefrontData,
  type Testimonial,
} from "../data/storefront";
import { db, firestoreDatabaseId } from "./firebase";

export const STOREFRONT_SITE_ID = "main";
const STOREFRONT_SCHEMA_VERSION = 1;

const siteRef = doc(db, "sites", STOREFRONT_SITE_ID);
const settingsRef = doc(db, "sites", STOREFRONT_SITE_ID, "settings", "general");
const legacyCollectionsRef = collection(db, "sites", STOREFRONT_SITE_ID, "collections");
const collectionsRef = collection(db, "collections");
const legacyProductsRef = collection(db, "sites", STOREFRONT_SITE_ID, "products");
const productsRef = collection(db, "products");
const bannersRef = collection(db, "sites", STOREFRONT_SITE_ID, "heroBanners");
const marketsRef = collection(db, "sites", STOREFRONT_SITE_ID, "markets");
const testimonialsRef = collection(db, "sites", STOREFRONT_SITE_ID, "testimonials");

function deserializeStatus(value: unknown) {
  return value === "inactive" ? "inactive" : "active";
}

function serializeSettings(settings: ShopSettings) {
  return {
    ...settings,
    updatedAt: serverTimestamp(),
  };
}

function serializeCollection(collectionItem: Collection) {
  return {
    ...collectionItem,
    siteId: STOREFRONT_SITE_ID,
    sortOrder: collectionItem.id,
    updatedAt: serverTimestamp(),
  };
}

function serializeProduct(product: Product) {
  return {
    ...product,
    siteId: STOREFRONT_SITE_ID,
    images: product.images,
    variants: product.variants ?? null,
    badge: product.badge ?? null,
    compareAtPrice: product.compareAtPrice ?? null,
    bestSeller: Boolean(product.bestSeller),
    sortOrder: product.id,
    updatedAt: serverTimestamp(),
  };
}

function serializeHeroBanner(heroBanner: HeroBanner) {
  return {
    ...heroBanner,
    sortOrder: heroBanner.id,
    updatedAt: serverTimestamp(),
  };
}

function serializeMarket(market: MarketItem) {
  return {
    ...market,
    sortOrder: market.id,
    updatedAt: serverTimestamp(),
  };
}

function serializeTestimonial(testimonial: Testimonial) {
  return {
    ...testimonial,
    sortOrder: testimonial.id,
    updatedAt: serverTimestamp(),
  };
}

function deserializeCollection(snapshot: QueryDocumentSnapshot<DocumentData>): Collection {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: Number(data.id),
    name: String(data.name ?? ""),
    slug: String(data.slug ?? ""),
    description: String(data.description ?? ""),
    gradient: String(data.gradient ?? ""),
    image: String(data.image ?? ""),
    status: deserializeStatus(data.status),
  };
}

function deserializeProduct(snapshot: QueryDocumentSnapshot<DocumentData>): Product {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: Number(data.id),
    name: String(data.name ?? ""),
    price: Number(data.price ?? 0),
    compareAtPrice:
      typeof data.compareAtPrice === "number" ? data.compareAtPrice : undefined,
    description: String(data.description ?? ""),
    category: String(data.category ?? ""),
    images: Array.isArray(data.images) ? data.images.map((image) => String(image)) : [""],
    variants: Array.isArray(data.variants)
      ? data.variants
          .map((variant) => {
            if (typeof variant !== "object" || variant === null) {
              return null;
            }

            const variantData = variant as Record<string, unknown>;
            return {
              name: String(variantData.name ?? ""),
              price: Number(variantData.price ?? 0),
            };
          })
          .filter((variant): variant is NonNullable<typeof variant> => variant !== null)
      : undefined,
    badge: typeof data.badge === "string" ? data.badge : undefined,
    bestSeller: Boolean(data.bestSeller),
    status: deserializeStatus(data.status),
  };
}

function deserializeHeroBanner(snapshot: QueryDocumentSnapshot<DocumentData>): HeroBanner {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: Number(data.id),
    collectionSlug: String(data.collectionSlug ?? ""),
    image: String(data.image ?? ""),
    source: String(data.source ?? "admin"),
    status: deserializeStatus(data.status),
  };
}

function deserializeMarket(snapshot: QueryDocumentSnapshot<DocumentData>): MarketItem {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: Number(data.id),
    name: String(data.name ?? ""),
    schedule: String(data.schedule ?? ""),
    address: String(data.address ?? ""),
    season: String(data.season ?? ""),
    status: deserializeStatus(data.status),
  };
}

function deserializeTestimonial(snapshot: QueryDocumentSnapshot<DocumentData>): Testimonial {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: Number(data.id),
    text: String(data.text ?? ""),
    author: String(data.author ?? ""),
    location: String(data.location ?? ""),
    status: deserializeStatus(data.status),
  };
}

function deserializeSettings(snapshot: DocumentSnapshot<DocumentData>) {
  const data = snapshot.data() as Partial<Record<keyof ShopSettings, unknown>> | undefined;

  if (!data) {
    return createDefaultStorefrontData().settings;
  }

  return {
    status: deserializeStatus(data.status),
    brandName: String(data.brandName ?? ""),
    brandDescription: String(data.brandDescription ?? ""),
    heroHeading: String(data.heroHeading ?? ""),
    heroSubtext: String(data.heroSubtext ?? ""),
    aboutIntroTitle: String(data.aboutIntroTitle ?? ""),
    aboutIntroBody: String(data.aboutIntroBody ?? ""),
    contactEmail: String(data.contactEmail ?? ""),
    location: String(data.location ?? ""),
    responseTime: String(data.responseTime ?? ""),
    facebookUrl: String(data.facebookUrl ?? "https://www.facebook.com/SavanaOrganica"),
    instagramUrl: String(data.instagramUrl ?? ""),
    instagramHandle: String(data.instagramHandle ?? ""),
    mapNote: String(data.mapNote ?? ""),
    marketIntro: String(data.marketIntro ?? ""),
    storeHoursText: String(data.storeHoursText ?? ""),
    wholesaleHeading: String(data.wholesaleHeading ?? ""),
    wholesaleText: String(data.wholesaleText ?? ""),
    wholesaleEmail: String(data.wholesaleEmail ?? ""),
  } satisfies ShopSettings;
}

export function getStorefrontStructure() {
  return {
    database: firestoreDatabaseId,
    site: `sites/${STOREFRONT_SITE_ID}`,
    settings: `sites/${STOREFRONT_SITE_ID}/settings/general`,
    collections: "collections/{collectionId}",
    products: "products/{productId}",
    heroBanners: `sites/${STOREFRONT_SITE_ID}/heroBanners/{bannerId}`,
    markets: `sites/${STOREFRONT_SITE_ID}/markets/{marketId}`,
    testimonials: `sites/${STOREFRONT_SITE_ID}/testimonials/{testimonialId}`,
  };
}

export async function storefrontExists() {
  const snapshot = await getDoc(siteRef);
  return snapshot.exists();
}

export async function ensureStorefrontSeeded(seedData: StorefrontData = createDefaultStorefrontData()) {
  const [
    siteSnapshot,
    settingsSnapshot,
    collectionsSnapshot,
    legacyCollectionsSnapshot,
    productsSnapshot,
    legacyProductsSnapshot,
    bannersSnapshot,
    marketsSnapshot,
    testimonialsSnapshot,
  ] = await Promise.all([
    getDoc(siteRef),
    getDoc(settingsRef),
    getDocs(query(collectionsRef, limit(1))),
    getDocs(query(legacyCollectionsRef, limit(1))),
    getDocs(query(productsRef, limit(1))),
    getDocs(query(legacyProductsRef, limit(1))),
    getDocs(query(bannersRef, limit(1))),
    getDocs(query(marketsRef, limit(1))),
    getDocs(query(testimonialsRef, limit(1))),
  ]);

  const batch = writeBatch(db);
  let hasWrites = false;
  const shouldSeedNestedContent = !siteSnapshot.exists();

  if (!siteSnapshot.exists()) {
    batch.set(siteRef, {
      siteId: STOREFRONT_SITE_ID,
      schemaVersion: STOREFRONT_SCHEMA_VERSION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    hasWrites = true;
  }

  if (!settingsSnapshot.exists()) {
    batch.set(settingsRef, serializeSettings(seedData.settings));
    hasWrites = true;
  }

  if (shouldSeedNestedContent && collectionsSnapshot.empty) {
    const sourceCollections = legacyCollectionsSnapshot.empty
      ? seedData.collections
      : legacyCollectionsSnapshot.docs.map((snapshot) => deserializeCollection(snapshot));

    sourceCollections.forEach((collectionItem) => {
      batch.set(doc(collectionsRef, String(collectionItem.id)), serializeCollection(collectionItem));
    });
    hasWrites = true;
  }

  if (shouldSeedNestedContent && productsSnapshot.empty) {
    const sourceProducts = legacyProductsSnapshot.empty
      ? seedData.products
      : legacyProductsSnapshot.docs.map((snapshot) => deserializeProduct(snapshot));

    sourceProducts.forEach((product) => {
      batch.set(doc(productsRef, String(product.id)), serializeProduct(product));
    });
    hasWrites = true;
  }

  if (bannersSnapshot.empty) {
    const sourceCollections = collectionsSnapshot.empty
      ? legacyCollectionsSnapshot.empty
        ? seedData.collections
        : legacyCollectionsSnapshot.docs.map((snapshot) => deserializeCollection(snapshot))
      : (await getDocs(query(collectionsRef, orderBy("sortOrder")))).docs.map((snapshot) =>
          deserializeCollection(snapshot)
        );
    const sourceBanners = resolveSeedHeroBanners(seedData.heroBanners, sourceCollections);

    sourceBanners.forEach((banner) => {
      batch.set(doc(bannersRef, String(banner.id)), serializeHeroBanner(banner));
    });
    hasWrites = true;
  }

  if (shouldSeedNestedContent && marketsSnapshot.empty) {
    seedData.markets.forEach((market) => {
      batch.set(doc(marketsRef, String(market.id)), serializeMarket(market));
    });
    hasWrites = true;
  }

  if (shouldSeedNestedContent && testimonialsSnapshot.empty) {
    seedData.testimonials.forEach((testimonial) => {
      batch.set(doc(testimonialsRef, String(testimonial.id)), serializeTestimonial(testimonial));
    });
    hasWrites = true;
  }

  if (hasWrites) {
    await batch.commit();
  }
}

export async function readStorefront(): Promise<StorefrontData> {
  const [
    siteSnapshot,
    settingsSnapshot,
    collectionsSnapshot,
    legacyCollectionsSnapshot,
    productsSnapshot,
    legacyProductsSnapshot,
    bannersSnapshot,
    marketsSnapshot,
    testimonialsSnapshot,
  ] =
    await Promise.all([
      getDoc(siteRef),
      getDoc(settingsRef),
      getDocs(query(collectionsRef, orderBy("sortOrder"))),
      getDocs(query(legacyCollectionsRef, orderBy("sortOrder"))),
      getDocs(query(productsRef, orderBy("sortOrder"))),
      getDocs(query(legacyProductsRef, orderBy("sortOrder"))),
      getDocs(query(bannersRef, orderBy("sortOrder"))),
      getDocs(query(marketsRef, orderBy("sortOrder"))),
      getDocs(query(testimonialsRef, orderBy("sortOrder"))),
    ]);

  const defaults = createDefaultStorefrontData();
  const resolvedCollections = collectionsSnapshot.empty
    ? legacyCollectionsSnapshot.empty
      ? (siteSnapshot.exists() ? [] : defaults.collections)
      : legacyCollectionsSnapshot.docs.map((snapshot) => deserializeCollection(snapshot))
    : collectionsSnapshot.docs.map((snapshot) => deserializeCollection(snapshot));
  const resolvedProducts = productsSnapshot.empty
    ? legacyProductsSnapshot.empty
      ? (siteSnapshot.exists() ? [] : defaults.products)
      : legacyProductsSnapshot.docs.map((snapshot) => deserializeProduct(snapshot))
    : productsSnapshot.docs.map((snapshot) => deserializeProduct(snapshot));
  const fallbackMarkets = siteSnapshot.exists() ? [] : defaults.markets;
  const fallbackTestimonials = siteSnapshot.exists() ? [] : defaults.testimonials;

  return {
    settings: settingsSnapshot.exists() ? deserializeSettings(settingsSnapshot) : defaults.settings,
    collections: resolvedCollections,
    products: resolvedProducts,
    heroBanners: bannersSnapshot.empty
      ? resolveSeedHeroBanners(defaults.heroBanners, resolvedCollections)
      : bannersSnapshot.docs.map((snapshot) => deserializeHeroBanner(snapshot)),
    markets: marketsSnapshot.empty
      ? fallbackMarkets
      : marketsSnapshot.docs.map((snapshot) => deserializeMarket(snapshot)),
    testimonials: testimonialsSnapshot.empty
      ? fallbackTestimonials
      : testimonialsSnapshot.docs.map((snapshot) => deserializeTestimonial(snapshot)),
  };
}

interface StorefrontListeners {
  onSettings: (settings: ShopSettings) => void;
  onCollections: (collections: Collection[]) => void;
  onProducts: (products: Product[]) => void;
  onHeroBanners: (heroBanners: HeroBanner[]) => void;
  onMarkets: (markets: MarketItem[]) => void;
  onTestimonials: (testimonials: Testimonial[]) => void;
  onError: (error: FirestoreError) => void;
}

export function subscribeToStorefront(listeners: StorefrontListeners): Unsubscribe[] {
  return [
    onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        listeners.onSettings(deserializeSettings(snapshot));
      }
    }, listeners.onError),
    onSnapshot(query(collectionsRef, orderBy("sortOrder")), (snapshot) => {
      listeners.onCollections(snapshot.docs.map((docSnapshot) => deserializeCollection(docSnapshot)));
    }, listeners.onError),
    onSnapshot(query(productsRef, orderBy("sortOrder")), (snapshot) => {
      listeners.onProducts(snapshot.docs.map((docSnapshot) => deserializeProduct(docSnapshot)));
    }, listeners.onError),
    onSnapshot(query(bannersRef, orderBy("sortOrder")), (snapshot) => {
      listeners.onHeroBanners(snapshot.docs.map((docSnapshot) => deserializeHeroBanner(docSnapshot)));
    }, listeners.onError),
    onSnapshot(query(marketsRef, orderBy("sortOrder")), (snapshot) => {
      listeners.onMarkets(snapshot.docs.map((docSnapshot) => deserializeMarket(docSnapshot)));
    }, listeners.onError),
    onSnapshot(query(testimonialsRef, orderBy("sortOrder")), (snapshot) => {
      listeners.onTestimonials(snapshot.docs.map((docSnapshot) => deserializeTestimonial(docSnapshot)));
    }, listeners.onError),
  ];
}

export async function saveSettings(settings: ShopSettings) {
  await setDoc(settingsRef, serializeSettings(settings), { merge: true });
}

export async function saveCollection(collectionItem: Collection) {
  await setDoc(doc(collectionsRef, String(collectionItem.id)), serializeCollection(collectionItem), { merge: true });
}

export async function deleteCollection(collectionId: number) {
  await deleteDoc(doc(collectionsRef, String(collectionId)));
}

export async function saveProduct(product: Product) {
  await setDoc(doc(productsRef, String(product.id)), serializeProduct(product), { merge: true });
}

export async function deleteProduct(productId: number) {
  await deleteDoc(doc(productsRef, String(productId)));
}

export async function saveHeroBanner(heroBanner: HeroBanner) {
  await setDoc(doc(bannersRef, String(heroBanner.id)), serializeHeroBanner(heroBanner), { merge: true });
}

export async function deleteHeroBanner(heroBannerId: number) {
  await deleteDoc(doc(bannersRef, String(heroBannerId)));
}

export async function saveMarket(market: MarketItem) {
  await setDoc(doc(marketsRef, String(market.id)), serializeMarket(market), { merge: true });
}

export async function deleteMarket(marketId: number) {
  await deleteDoc(doc(marketsRef, String(marketId)));
}

export async function saveTestimonial(testimonial: Testimonial) {
  await setDoc(doc(testimonialsRef, String(testimonial.id)), serializeTestimonial(testimonial), { merge: true });
}

export async function deleteTestimonial(testimonialId: number) {
  await deleteDoc(doc(testimonialsRef, String(testimonialId)));
}

export async function resetStorefrontDocuments(seedData: StorefrontData = createDefaultStorefrontData()) {
  const [
    collectionsSnapshot,
    legacyCollectionsSnapshot,
    productsSnapshot,
    legacyProductsSnapshot,
    bannersSnapshot,
    marketsSnapshot,
    testimonialsSnapshot,
  ] = await Promise.all([
    getDocs(collectionsRef),
    getDocs(legacyCollectionsRef),
    getDocs(productsRef),
    getDocs(legacyProductsRef),
    getDocs(bannersRef),
    getDocs(marketsRef),
    getDocs(testimonialsRef),
  ]);

  const batch = writeBatch(db);

  collectionsSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  legacyCollectionsSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  productsSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  legacyProductsSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  bannersSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  marketsSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  testimonialsSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));

  batch.set(siteRef, {
    siteId: STOREFRONT_SITE_ID,
    schemaVersion: STOREFRONT_SCHEMA_VERSION,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(settingsRef, serializeSettings(seedData.settings));

  seedData.collections.forEach((collectionItem) => {
    batch.set(doc(collectionsRef, String(collectionItem.id)), serializeCollection(collectionItem));
  });

  seedData.products.forEach((product) => {
    batch.set(doc(productsRef, String(product.id)), serializeProduct(product));
  });

  seedData.heroBanners.forEach((heroBanner) => {
    batch.set(doc(bannersRef, String(heroBanner.id)), serializeHeroBanner(heroBanner));
  });

  seedData.markets.forEach((market) => {
    batch.set(doc(marketsRef, String(market.id)), serializeMarket(market));
  });

  seedData.testimonials.forEach((testimonial) => {
    batch.set(doc(testimonialsRef, String(testimonial.id)), serializeTestimonial(testimonial));
  });

  await batch.commit();
}
