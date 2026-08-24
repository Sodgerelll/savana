import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
  writeBatch,
} from "firebase/firestore";
import type { Collection, Discount, Product } from "../data/products";
import {
  normalizeShopSettings,
  resolveNavigationItemLabel,
  createDefaultStorefrontData,
  resolveSeedHeroBanners,
  type HeroBanner,
  type MarketItem,
  type ShopSettings,
  type SiteNavigationItem,
  type StorefrontData,
  type Testimonial,
} from "../data/storefront";
import { db, firestoreDatabaseId } from "./firebase";
import { blendUnitCost } from "./rawMaterials";
import {
  buildPackagingPurchaseEntry,
  buildPackagingWriteOffEntry,
  buildReversalEntry,
} from "./accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry } from "./accounting/postEntryClient";

export const STOREFRONT_SITE_ID = "main";
const STOREFRONT_SCHEMA_VERSION = 1;

const siteRef = doc(db, "sites", STOREFRONT_SITE_ID);
const settingsRef = doc(db, "sites", STOREFRONT_SITE_ID, "settings", "general");
const navigationItemsRef = collection(db, "sites", STOREFRONT_SITE_ID, "navigationItems");
const legacyCollectionsRef = collection(db, "sites", STOREFRONT_SITE_ID, "collections");
const collectionsRef = collection(db, "collections");
const legacyProductsRef = collection(db, "sites", STOREFRONT_SITE_ID, "products");
const productsRef = collection(db, "products");
const bannersRef = collection(db, "sites", STOREFRONT_SITE_ID, "heroBanners");
const marketsRef = collection(db, "sites", STOREFRONT_SITE_ID, "markets");
const testimonialsRef = collection(db, "sites", STOREFRONT_SITE_ID, "testimonials");
const packagingRef = collection(db, "packaging");
const discountsRef = collection(db, "sites", STOREFRONT_SITE_ID, "discounts");

export interface PackagingPurchaseEntry {
  id: string;
  quantity: number;
  unitCost: number | null;
  supplier: string;
  origin: string;
  /** Freight/shipping cost paid to land this purchase, in ₮ — separate from the item's own price. */
  cargo: number;
  purchasedAt: string;
  notes: string;
  createdByUid: string;
  createdAt: string;
  /** Money account the purchase settled from, kept so a reversal returns money to the same place. */
  paymentMethod?: string | null;
}

export interface PackagingUsageEntry {
  id: string;
  quantity: number;
  /** Item's unit cost at the moment of use, snapshotted so a later reversal posts the same
   *  amount even if the item's unit cost has since drifted from new purchases. */
  unitCost: number | null;
  reason: string;
  usedAt: string;
  notes: string;
  createdByUid: string;
  createdAt: string;
}

export interface PackagingItem {
  id: number;
  name: string;
  size: string;
  remaining: number;
  unitCost: number | null;
  sortOrder: number;
  purchaseLog: PackagingPurchaseEntry[];
  usageLog: PackagingUsageEntry[];
}

function deserializePackagingPurchaseEntry(raw: unknown): PackagingPurchaseEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    quantity: Number(r.quantity ?? 0),
    unitCost: r.unitCost === null || r.unitCost === undefined ? null : Number(r.unitCost),
    supplier: String(r.supplier ?? ""),
    origin: String(r.origin ?? ""),
    cargo: Number(r.cargo ?? 0),
    purchasedAt: String(r.purchasedAt ?? ""),
    notes: String(r.notes ?? ""),
    createdByUid: String(r.createdByUid ?? ""),
    createdAt: String(r.createdAt ?? ""),
    paymentMethod: typeof r.paymentMethod === "string" ? r.paymentMethod : null,
  };
}

function deserializePackagingUsageEntry(raw: unknown): PackagingUsageEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    quantity: Number(r.quantity ?? 0),
    unitCost: r.unitCost === null || r.unitCost === undefined ? null : Number(r.unitCost),
    reason: String(r.reason ?? ""),
    usedAt: String(r.usedAt ?? ""),
    notes: String(r.notes ?? ""),
    createdByUid: String(r.createdByUid ?? ""),
    createdAt: String(r.createdAt ?? ""),
  };
}

function serializePackaging(item: PackagingItem): DocumentData {
  return {
    name: item.name,
    size: item.size,
    remaining: item.remaining,
    unitCost: item.unitCost,
    sortOrder: item.sortOrder,
    _schemaVersion: STOREFRONT_SCHEMA_VERSION,
    _updatedAt: serverTimestamp(),
  };
}

function deserializePackaging(docSnap: QueryDocumentSnapshot): PackagingItem {
  const data = docSnap.data();
  const unitCostRaw = data.unitCost;
  const rawPurchaseLog = Array.isArray(data.purchaseLog) ? data.purchaseLog : [];
  const rawUsageLog = Array.isArray(data.usageLog) ? data.usageLog : [];
  return {
    id: Number(docSnap.id),
    name: String(data.name ?? ""),
    size: String(data.size ?? ""),
    remaining: Number(data.remaining ?? 0),
    unitCost:
      unitCostRaw === null || unitCostRaw === undefined || unitCostRaw === ""
        ? null
        : Number(unitCostRaw),
    sortOrder: Number(data.sortOrder ?? 0),
    purchaseLog: rawPurchaseLog
      .map(deserializePackagingPurchaseEntry)
      .filter((e): e is PackagingPurchaseEntry => e !== null)
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)),
    usageLog: rawUsageLog
      .map(deserializePackagingUsageEntry)
      .filter((e): e is PackagingUsageEntry => e !== null)
      .sort((a, b) => b.usedAt.localeCompare(a.usedAt)),
  };
}

export function subscribeToPackaging(
  onData: (items: PackagingItem[]) => void,
  onError: (error: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(packagingRef, (snapshot) => {
    const items = snapshot.docs.map((d) => deserializePackaging(d));
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    onData(items);
  }, onError);
}

export async function savePackaging(item: PackagingItem) {
  await setDoc(doc(packagingRef, String(item.id)), serializePackaging(item), { merge: true });
}

export async function deletePackaging(itemId: number) {
  await deleteDoc(doc(packagingRef, String(itemId)));
}

export interface AddPackagingPurchaseInput {
  quantity: number;
  unitCost: number | null;
  supplier: string;
  origin: string;
  cargo: number;
  purchasedAt: string;
  notes: string;
  createdByUid: string;
  /** Which money account the purchase was settled from; defaults to cash. */
  paymentMethod?: string | null;
}

/** What a purchase cost in total — 0 when no unit cost was recorded. */
function packagingPurchaseAmount(entry: Pick<PackagingPurchaseEntry, "quantity" | "unitCost">): number {
  return entry.unitCost && entry.unitCost > 0 ? Math.round(entry.quantity * entry.unitCost) : 0;
}

/** Landed cost of a purchase — the item itself plus what it cost to freight in. */
export function packagingPurchaseLandedCost(
  entry: Pick<PackagingPurchaseEntry, "quantity" | "unitCost" | "cargo">,
): number {
  return packagingPurchaseAmount(entry) + Math.max(0, entry.cargo || 0);
}

/**
 * Records a packaging purchase. Stock grows and the money account it was paid from shrinks,
 * mirroring addRawMaterialPurchase in rawMaterials.ts.
 */
export async function addPackagingPurchase(
  itemId: number,
  input: AddPackagingPurchaseInput,
): Promise<void> {
  const entry: PackagingPurchaseEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    quantity: input.quantity,
    unitCost: input.unitCost,
    supplier: input.supplier,
    origin: input.origin,
    cargo: input.cargo,
    purchasedAt: input.purchasedAt,
    notes: input.notes,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
    paymentMethod: input.paymentMethod ?? null,
  };

  const amount = packagingPurchaseAmount(entry);
  const entryNumber = amount > 0 ? await generateJournalEntryNumber() : null;

  const itemRef = doc(packagingRef, String(itemId));

  // Read before writing so the new unit cost can be blended with what is already held.
  const currentSnap = await getDoc(itemRef);
  const currentData = currentSnap.exists() ? (currentSnap.data() as Record<string, unknown>) : {};
  const nextUnitCost = blendUnitCost(
    Number(currentData.remaining ?? 0),
    currentData.unitCost === null || currentData.unitCost === undefined ? null : Number(currentData.unitCost),
    input.quantity,
    input.unitCost,
  );

  const batch = writeBatch(db);

  batch.update(itemRef, {
    remaining: increment(input.quantity),
    purchaseLog: arrayUnion(entry),
    ...(nextUnitCost !== null ? { unitCost: nextUnitCost } : {}),
    _updatedAt: serverTimestamp(),
  });

  if (entryNumber) {
    postJournalEntry(
      batch,
      entryNumber,
      buildPackagingPurchaseEntry({ amount, paymentMethod: input.paymentMethod }),
      {
        sourceType: "packagingPurchase",
        sourceId: `${itemId}:${entry.id}`,
        sourceNumber: entry.id,
        description: `Сав баглаа боодол худалдан авалт: ${input.supplier || String(itemId)}`,
        createdBy: input.createdByUid,
      },
    );
  }

  await batch.commit();
}

export async function removePackagingPurchase(
  itemId: number,
  entry: PackagingPurchaseEntry,
): Promise<void> {
  const amount = packagingPurchaseAmount(entry);
  const entryNumber = amount > 0 ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);
  const itemRef = doc(packagingRef, String(itemId));

  batch.update(itemRef, {
    remaining: increment(-entry.quantity),
    purchaseLog: arrayRemove(entry),
    _updatedAt: serverTimestamp(),
  });

  if (entryNumber) {
    postJournalEntry(
      batch,
      entryNumber,
      buildReversalEntry(
        buildPackagingPurchaseEntry({ amount, paymentMethod: entry.paymentMethod }).lines,
      ),
      {
        sourceType: "packagingPurchase",
        sourceId: `${itemId}:${entry.id}`,
        sourceNumber: entry.id,
        description: `Сав баглаа боодлын худалдан авалт устгасан — бичилтийг цуцаллаа`,
        createdBy: entry.createdByUid,
      },
    );
  }

  await batch.commit();
}

export interface AddPackagingUsageInput {
  quantity: number;
  reason: string;
  usedAt: string;
  notes: string;
  createdByUid: string;
}

/**
 * Records packaging consumed outside of a sale — waste, samples, damage. Mirrors
 * addRawMaterialUsage in rawMaterials.ts.
 */
export async function addPackagingUsage(
  itemId: number,
  input: AddPackagingUsageInput,
): Promise<void> {
  const itemRef = doc(packagingRef, String(itemId));
  const currentSnap = await getDoc(itemRef);
  if (!currentSnap.exists()) throw new Error("Packaging item not found");
  const currentData = currentSnap.data() as Record<string, unknown>;
  const remaining = Number(currentData.remaining ?? 0);
  if (input.quantity > remaining) {
    throw new Error("INSUFFICIENT_STOCK");
  }
  const unitCost = currentData.unitCost === null || currentData.unitCost === undefined
    ? null
    : Number(currentData.unitCost);

  const entry: PackagingUsageEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    quantity: input.quantity,
    unitCost,
    reason: input.reason,
    usedAt: input.usedAt,
    notes: input.notes,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
  };

  const amount = unitCost && unitCost > 0 ? Math.round(input.quantity * unitCost) : 0;
  const entryNumber = amount > 0 ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);

  batch.update(itemRef, {
    remaining: increment(-input.quantity),
    usageLog: arrayUnion(entry),
    _updatedAt: serverTimestamp(),
  });

  if (entryNumber) {
    postJournalEntry(
      batch,
      entryNumber,
      buildPackagingWriteOffEntry({ amount }),
      {
        sourceType: "packagingUsage",
        sourceId: `${itemId}:${entry.id}`,
        sourceNumber: entry.id,
        description: `Сав баглаа боодлын зарцуулалт: ${input.reason || String(itemId)}`,
        createdBy: input.createdByUid,
      },
    );
  }

  await batch.commit();
}

export async function removePackagingUsage(
  itemId: number,
  entry: PackagingUsageEntry,
): Promise<void> {
  const amount = entry.unitCost && entry.unitCost > 0 ? Math.round(entry.quantity * entry.unitCost) : 0;
  const entryNumber = amount > 0 ? await generateJournalEntryNumber() : null;

  const batch = writeBatch(db);
  const itemRef = doc(packagingRef, String(itemId));

  batch.update(itemRef, {
    remaining: increment(entry.quantity),
    usageLog: arrayRemove(entry),
    _updatedAt: serverTimestamp(),
  });

  if (entryNumber) {
    postJournalEntry(
      batch,
      entryNumber,
      buildReversalEntry(buildPackagingWriteOffEntry({ amount }).lines),
      {
        sourceType: "packagingUsage",
        sourceId: `${itemId}:${entry.id}`,
        sourceNumber: entry.id,
        description: `Сав баглаа боодлын зарцуулалт устгасан — бичилтийг цуцаллаа`,
        createdBy: entry.createdByUid,
      },
    );
  }

  await batch.commit();
}

function deserializeStatus(value: unknown) {
  return value === "inactive" ? "inactive" : "active";
}

function serializeSettings(settings: ShopSettings) {
  return {
    ...settings,
    navigationItems: [],
    updatedAt: serverTimestamp(),
  };
}

function serializeNavigationItem(item: SiteNavigationItem) {
  return {
    ...item,
    updatedAt: serverTimestamp(),
  };
}

function serializeCollection(collectionItem: Collection) {
  return {
    ...collectionItem,
    siteId: STOREFRONT_SITE_ID,
    sortOrder: collectionItem.id,
    level: collectionItem.level ?? null,
    parentId: collectionItem.parentId ?? null,
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
    ingredients: product.ingredients ?? null,
    usage: product.usage ?? null,
    howToUse: product.howToUse ?? null,
    caution: product.caution ?? null,
    shelfLife: product.shelfLife ?? null,
    sizeLabel: product.sizeLabel ?? null,
    costPrice: product.costPrice ?? 0,
    wholesalePrice: product.wholesalePrice ?? 0,
    minStockLevel: product.minStockLevel ?? 0,
    totalStock: product.totalStock ?? 0,
    soldCount: product.soldCount ?? 0,
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
    featuredProductId: data.featuredProductId ? Number(data.featuredProductId) : undefined,
    status: deserializeStatus(data.status),
    level: data.level ? (Number(data.level) as 1 | 2 | 3) : undefined,
    parentId: data.parentId ? Number(data.parentId) : undefined,
  };
}

function deserializeProduct(snapshot: QueryDocumentSnapshot<DocumentData>): Product {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: Number(data.id),
    name: String(data.name ?? ""),
    price: Math.round(Number(data.price ?? 0)),
    compareAtPrice:
      typeof data.compareAtPrice === "number" ? Math.round(data.compareAtPrice) : undefined,
    description: String(data.description ?? ""),
    ingredients: typeof data.ingredients === "string" ? data.ingredients : undefined,
    usage: typeof data.usage === "string" ? data.usage : undefined,
    howToUse: typeof data.howToUse === "string" ? data.howToUse : undefined,
    caution: typeof data.caution === "string" ? data.caution : undefined,
    shelfLife: typeof data.shelfLife === "string" ? data.shelfLife : undefined,
    sizeLabel: typeof data.sizeLabel === "string" ? data.sizeLabel : undefined,
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
              price: Math.round(Number(variantData.price ?? 0)),
              quantity: Number(variantData.quantity ?? 0),
              soldCount: Number(variantData.soldCount ?? 0),
            };
          })
          .filter((variant): variant is NonNullable<typeof variant> => variant !== null)
      : undefined,
    costPrice: typeof data.costPrice === "number" ? Math.round(data.costPrice) : undefined,
    wholesalePrice: typeof data.wholesalePrice === "number" ? Math.round(data.wholesalePrice) : undefined,
    minStockLevel: typeof data.minStockLevel === "number" ? data.minStockLevel : undefined,
    totalStock: typeof data.totalStock === "number" ? data.totalStock : undefined,
    soldCount: typeof data.soldCount === "number" ? data.soldCount : undefined,
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

function deserializeNavigationItem(snapshot: QueryDocumentSnapshot<DocumentData>): SiteNavigationItem {
  const data = snapshot.data() as Record<string, unknown>;
  const id = String(data.id ?? "") as SiteNavigationItem["id"];

  return {
    id,
    group: data.group === "right" ? "right" : "left",
    labelEn: resolveNavigationItemLabel(id, "EN", data.labelEn),
    labelMn: resolveNavigationItemLabel(id, "MN", data.labelMn),
    pageBannerImage: String(data.pageBannerImage ?? ""),
    sortOrder: Number.isFinite(data.sortOrder) ? Number(data.sortOrder) : 0,
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
  return normalizeShopSettings(data);
}

export function getStorefrontStructure() {
  return {
    database: firestoreDatabaseId,
    site: `sites/${STOREFRONT_SITE_ID}`,
    settings: `sites/${STOREFRONT_SITE_ID}/settings/general`,
    navigationItems: `sites/${STOREFRONT_SITE_ID}/navigationItems/{navigationId}`,
    collections: "collections/{collectionId}",
    products: "products/{productId}",
    orders: "orders/{orderId}",
    contactMessages: `sites/${STOREFRONT_SITE_ID}/contactMessages/{messageId}`,
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
    navigationItemsSnapshot,
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
    getDocs(query(navigationItemsRef, limit(1))),
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

  const settingsValue = settingsSnapshot.exists() ? deserializeSettings(settingsSnapshot) : seedData.settings;
  const rawSettingsData = settingsSnapshot.data() as Partial<Record<keyof ShopSettings, unknown>> | undefined;
  const hasInlineNavigationItems =
    Array.isArray(rawSettingsData?.navigationItems) && rawSettingsData.navigationItems.length > 0;

  if (navigationItemsSnapshot.empty) {
    settingsValue.navigationItems.forEach((item) => {
      batch.set(doc(navigationItemsRef, item.id), serializeNavigationItem(item));
    });
    hasWrites = true;
  }

  if (hasInlineNavigationItems) {
    batch.set(settingsRef, serializeSettings(settingsValue), { merge: true });
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
    navigationItemsSnapshot,
    collectionsSnapshot,
    legacyCollectionsSnapshot,
    productsSnapshot,
    legacyProductsSnapshot,
    bannersSnapshot,
    marketsSnapshot,
    testimonialsSnapshot,
    discountsSnapshot,
  ] =
    await Promise.all([
      getDoc(siteRef),
      getDoc(settingsRef),
      getDocs(query(navigationItemsRef, orderBy("sortOrder"))),
      getDocs(query(collectionsRef, orderBy("sortOrder"))),
      getDocs(query(legacyCollectionsRef, orderBy("sortOrder"))),
      getDocs(query(productsRef, orderBy("sortOrder"))),
      getDocs(query(legacyProductsRef, orderBy("sortOrder"))),
      getDocs(query(bannersRef, orderBy("sortOrder"))),
      getDocs(query(marketsRef, orderBy("sortOrder"))),
      getDocs(query(testimonialsRef, orderBy("sortOrder"))),
      getDocs(discountsRef),
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
  const resolvedSettings = settingsSnapshot.exists() ? deserializeSettings(settingsSnapshot) : defaults.settings;
  const resolvedNavigationItems = navigationItemsSnapshot.empty
    ? resolvedSettings.navigationItems
    : navigationItemsSnapshot.docs.map((snapshot) => deserializeNavigationItem(snapshot));
  const fallbackMarkets = siteSnapshot.exists() ? [] : defaults.markets;
  const fallbackTestimonials = siteSnapshot.exists() ? [] : defaults.testimonials;

  return {
    settings: {
      ...resolvedSettings,
      navigationItems: resolvedNavigationItems,
    },
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
    discounts: discountsSnapshot.docs.map((snapshot) => deserializeDiscount(snapshot)),
  };
}

interface StorefrontListeners {
  onSettings: (settings: ShopSettings) => void;
  onNavigationItems: (items: SiteNavigationItem[]) => void;
  onCollections: (collections: Collection[]) => void;
  onProducts: (products: Product[]) => void;
  onHeroBanners: (heroBanners: HeroBanner[]) => void;
  onMarkets: (markets: MarketItem[]) => void;
  onTestimonials: (testimonials: Testimonial[]) => void;
  onDiscounts: (discounts: Discount[]) => void;
  onError: (error: FirestoreError) => void;
}

export function subscribeToStorefront(listeners: StorefrontListeners): Unsubscribe[] {
  return [
    onSnapshot(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        listeners.onSettings(deserializeSettings(snapshot));
      }
    }, listeners.onError),
    onSnapshot(query(navigationItemsRef, orderBy("sortOrder")), (snapshot) => {
      if (!snapshot.empty) {
        listeners.onNavigationItems(snapshot.docs.map((docSnapshot) => deserializeNavigationItem(docSnapshot)));
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
    onSnapshot(discountsRef, (snapshot) => {
      listeners.onDiscounts(snapshot.docs.map((docSnapshot) => deserializeDiscount(docSnapshot)));
    }, listeners.onError),
  ];
}

export async function saveSettings(settings: ShopSettings) {
  const batch = writeBatch(db);

  batch.set(settingsRef, serializeSettings(settings), { merge: true });

  settings.navigationItems.forEach((item) => {
    batch.set(doc(navigationItemsRef, item.id), serializeNavigationItem(item), { merge: true });
  });

  await batch.commit();
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

/**
 * Saves an edited product without disturbing what has been sold.
 *
 * The product editor owns names, prices, images and stock *levels* — an admin counting the
 * shelf is entitled to set `totalStock` and a variant's `quantity`. It does not own
 * `soldCount`, which only a sale may move. saveProduct() sent the whole document back from
 * whatever the browser last saw, so saving a renamed product also rewound every sale that
 * had landed since the modal was opened.
 *
 * The current document is read inside a transaction and the sold counters are carried
 * across, product-level and per variant, so an edit can never undo a sale.
 */
export async function saveProductEdit(product: Product) {
  const ref = doc(productsRef, String(product.id));

  await runTransaction(db, async (t) => {
    const snapshot = await t.get(ref);
    const current = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : {};

    const currentVariants = Array.isArray(current.variants)
      ? (current.variants as Array<Record<string, unknown>>)
      : [];
    const soldByVariant = new Map<string, number>(
      currentVariants.map((variant) => [String(variant.name ?? ""), Number(variant.soldCount ?? 0)]),
    );

    const payload = serializeProduct(product);
    const variants = product.variants?.map((variant) => ({
      ...variant,
      soldCount: soldByVariant.get(variant.name) ?? Number(variant.soldCount ?? 0),
    })) ?? null;

    t.set(
      ref,
      {
        ...payload,
        variants,
        // Never written from the editor — this is the sales counter.
        soldCount: Number(current.soldCount ?? product.soldCount ?? 0),
      },
      { merge: true },
    );
  });
}

/**
 * Writes only the named fields of a product, leaving everything else on the document
 * untouched.
 *
 * saveProduct() sends the whole product back from an in-memory snapshot, so using it for a
 * small edit would overwrite `totalStock`, `soldCount` and `variants` with whatever the
 * browser last saw — silently undoing a production intake or a sale that landed in between.
 * Anything that changes one part of a product goes through here instead.
 */
export async function patchProduct(productId: number, updates: Partial<Product>) {
  await setDoc(
    doc(productsRef, String(productId)),
    { ...updates, updatedAt: serverTimestamp() },
    { merge: true },
  );
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

function serializeDiscount(discount: Discount) {
  return {
    id: discount.id,
    productId: discount.productId,
    type: discount.type,
    value: discount.value,
    startAt: discount.startAt,
    endAt: discount.endAt,
    status: discount.status,
  };
}

function deserializeDiscount(snapshot: QueryDocumentSnapshot<DocumentData>): Discount {
  const data = snapshot.data();
  return {
    id: Number(data.id),
    productId: Number(data.productId),
    type: data.type === "amount" ? "amount" : "percent",
    value: Number(data.value ?? 0),
    startAt: String(data.startAt ?? ""),
    endAt: String(data.endAt ?? ""),
    status: data.status === "inactive" ? "inactive" : "active",
  };
}

export async function saveDiscount(discount: Discount) {
  await setDoc(doc(discountsRef, String(discount.id)), serializeDiscount(discount), { merge: true });
}

export async function deleteDiscount(discountId: number) {
  await deleteDoc(doc(discountsRef, String(discountId)));
}

export async function resetStorefrontDocuments(seedData: StorefrontData = createDefaultStorefrontData()) {
  const [
    navigationItemsSnapshot,
    collectionsSnapshot,
    legacyCollectionsSnapshot,
    productsSnapshot,
    legacyProductsSnapshot,
    bannersSnapshot,
    marketsSnapshot,
    testimonialsSnapshot,
  ] = await Promise.all([
    getDocs(navigationItemsRef),
    getDocs(collectionsRef),
    getDocs(legacyCollectionsRef),
    getDocs(productsRef),
    getDocs(legacyProductsRef),
    getDocs(bannersRef),
    getDocs(marketsRef),
    getDocs(testimonialsRef),
  ]);

  const batch = writeBatch(db);

  navigationItemsSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
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

  seedData.settings.navigationItems.forEach((item) => {
    batch.set(doc(navigationItemsRef, item.id), serializeNavigationItem(item));
  });

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
