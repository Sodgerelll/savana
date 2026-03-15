/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Collection, Product } from "../data/products";
import {
  clearLegacyStorefrontCandidate,
  createDefaultStorefrontData,
  getLegacyStorefrontCandidate,
  resolveSeedHeroBanners,
  type HeroBanner,
  type MarketItem,
  type ShopSettings,
  type StorefrontData,
  type Testimonial,
} from "../data/storefront";
import {
  deleteHeroBanner as deleteHeroBannerDocument,
  deleteCollection as deleteCollectionDocument,
  deleteMarket as deleteMarketDocument,
  deleteProduct as deleteProductDocument,
  deleteTestimonial as deleteTestimonialDocument,
  ensureStorefrontSeeded,
  getStorefrontStructure,
  readStorefront,
  resetStorefrontDocuments,
  saveHeroBanner,
  saveCollection,
  saveMarket,
  saveProduct,
  saveSettings,
  saveTestimonial,
  storefrontExists,
  subscribeToStorefront,
} from "../lib/storefrontRepository";
import {
  DEFAULT_COLLECTION_GRADIENT,
  getUniqueCollectionSlug,
  isSystemCollection,
} from "../lib/storefrontHelpers";
import { useAuth } from "./AuthContext";

interface StorefrontContextType extends StorefrontData {
  loading: boolean;
  saving: boolean;
  error: string | null;
  backend: "firestore";
  structure: ReturnType<typeof getStorefrontStructure>;
  saveSettingsDraft: (settings: ShopSettings) => void;
  updateSettings: (updates: Partial<ShopSettings>) => void;
  addCollection: () => number;
  saveCollectionDraft: (collection: Collection) => void;
  updateCollection: (collectionId: number, updates: Partial<Collection>) => void;
  deleteCollection: (collectionId: number) => void;
  saveProductDraft: (product: Product) => void;
  updateProduct: (productId: number, updates: Partial<Product>) => void;
  createProduct: () => number;
  deleteProduct: (productId: number) => void;
  saveHeroBannerDraft: (heroBanner: HeroBanner) => void;
  addHeroBanner: () => void;
  deleteHeroBanner: (heroBannerId: number) => void;
  saveMarketDraft: (market: MarketItem) => void;
  updateMarket: (marketId: number, updates: Partial<MarketItem>) => void;
  addMarket: () => void;
  deleteMarket: (marketId: number) => void;
  saveTestimonialDraft: (testimonial: Testimonial) => void;
  updateTestimonial: (testimonialId: number, updates: Partial<Testimonial>) => void;
  addTestimonial: () => void;
  deleteTestimonial: (testimonialId: number) => void;
  resetStorefront: () => void;
}

const StorefrontContext = createContext<StorefrontContextType | undefined>(undefined);

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Firestore sync failed.";
}

function getRegularCollections(collections: Collection[]) {
  return collections.filter((collection) => !isSystemCollection(collection));
}

export function StorefrontProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const canManageStorefront = Boolean(user && !user.isAnonymous);
  const [storefront, setStorefront] = useState<StorefrontData>(createDefaultStorefrontData);
  const [loading, setLoading] = useState(true);
  const [savingCount, setSavingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const structure = useMemo(() => getStorefrontStructure(), []);
  const storefrontRef = useRef(storefront);

  useEffect(() => {
    storefrontRef.current = storefront;
  }, [storefront]);

  useEffect(() => {
    let active = true;
    let unsubscribers: Array<() => void> = [];

    const bootstrap = async () => {
      if (authLoading) {
        return;
      }

      setLoading(true);
      setError(null);

      const migrationCandidate = getLegacyStorefrontCandidate();
      const seedData = migrationCandidate ?? createDefaultStorefrontData();

      try {
        const initialized = await storefrontExists();

        if (canManageStorefront) {
          await ensureStorefrontSeeded(seedData);

          if (migrationCandidate) {
            clearLegacyStorefrontCandidate();
          }
        } else if (!initialized) {
          if (!active) {
            return;
          }

          storefrontRef.current = seedData;
          setStorefront(seedData);
          setLoading(false);
          return;
        }
      } catch (seedError) {
        if (active) {
          setError(getErrorMessage(seedError));
        }
      }

      try {
        const remoteStorefront = await readStorefront();

        if (!active) {
          return;
        }

        setStorefront(remoteStorefront);
        storefrontRef.current = remoteStorefront;
        setLoading(false);

        unsubscribers = subscribeToStorefront({
          onSettings: (settings) => {
            if (!active) return;
            const nextStorefront = { ...storefrontRef.current, settings };
            storefrontRef.current = nextStorefront;
            setStorefront(nextStorefront);
          },
          onCollections: (collections) => {
            if (!active) return;
            const nextStorefront = { ...storefrontRef.current, collections };
            storefrontRef.current = nextStorefront;
            setStorefront(nextStorefront);
          },
          onProducts: (products) => {
            if (!active) return;
            const nextStorefront = { ...storefrontRef.current, products };
            storefrontRef.current = nextStorefront;
            setStorefront(nextStorefront);
          },
          onHeroBanners: (heroBanners) => {
            if (!active) return;
            const nextStorefront = {
              ...storefrontRef.current,
              heroBanners:
                heroBanners.length > 0
                  ? heroBanners
                  : resolveSeedHeroBanners(createDefaultStorefrontData().heroBanners, storefrontRef.current.collections),
            };
            storefrontRef.current = nextStorefront;
            setStorefront(nextStorefront);
          },
          onMarkets: (markets) => {
            if (!active) return;
            const nextStorefront = { ...storefrontRef.current, markets };
            storefrontRef.current = nextStorefront;
            setStorefront(nextStorefront);
          },
          onTestimonials: (testimonials) => {
            if (!active) return;
            const nextStorefront = { ...storefrontRef.current, testimonials };
            storefrontRef.current = nextStorefront;
            setStorefront(nextStorefront);
          },
          onError: (firestoreError) => {
            if (!active) return;
            setError(getErrorMessage(firestoreError));
          },
        });
      } catch (readError) {
        if (!active) {
          return;
        }

        setStorefront(seedData);
        setLoading(false);
        setError(getErrorMessage(readError));
      }
    };

    void bootstrap();

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [authLoading, canManageStorefront]);

  const runWrite = (task: Promise<void>) => {
    setSavingCount((count) => count + 1);

    void task
      .then(() => {
        setError(null);
      })
      .catch((writeError) => {
        setError(getErrorMessage(writeError));
      })
      .finally(() => {
        setSavingCount((count) => Math.max(0, count - 1));
      });
  };

  const updateSettings = (updates: Partial<ShopSettings>) => {
    const nextSettings = { ...storefrontRef.current.settings, ...updates };
    const nextStorefront = { ...storefrontRef.current, settings: nextSettings };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);
    runWrite(saveSettings(nextSettings));
  };

  const saveSettingsDraft = (settings: ShopSettings) => {
    const nextStorefront = { ...storefrontRef.current, settings };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);
    runWrite(saveSettings(settings));
  };

  const addCollection = () => {
    const nextId = Math.max(0, ...storefrontRef.current.collections.map((collection) => collection.id)) + 1;
    const nextCollection: Collection = {
      id: nextId,
      name: "New Category",
      slug: getUniqueCollectionSlug("new-category", storefrontRef.current.collections),
      description: "",
      gradient: DEFAULT_COLLECTION_GRADIENT,
      image: "",
      status: "active",
    };

    const nextStorefront = {
      ...storefrontRef.current,
      collections: [...storefrontRef.current.collections, nextCollection],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(saveCollection(nextCollection));
    return nextId;
  };

  const saveCollectionDraft = (collectionDraft: Collection) => {
    const existingCollection = storefrontRef.current.collections.find(
      (collection) => collection.id === collectionDraft.id
    );
    const nextSlug = isSystemCollection(collectionDraft)
      ? collectionDraft.slug
      : getUniqueCollectionSlug(collectionDraft.name, storefrontRef.current.collections, collectionDraft.id);
    const nextCollection = { ...collectionDraft, slug: nextSlug };
    const previousSlug = existingCollection?.slug;
    const slugChanged = existingCollection ? previousSlug !== nextCollection.slug : false;
    const nextProducts = slugChanged && previousSlug
      ? storefrontRef.current.products.map((product) =>
          product.category === previousSlug ? { ...product, category: nextCollection.slug } : product
        )
      : storefrontRef.current.products;
    const changedProducts = slugChanged && previousSlug
      ? storefrontRef.current.products
          .filter((product) => product.category === previousSlug)
          .map((product) => ({ ...product, category: nextCollection.slug }))
      : [];
    const nextHeroBanners = slugChanged && previousSlug
      ? storefrontRef.current.heroBanners.map((heroBanner) =>
          heroBanner.collectionSlug === previousSlug
            ? { ...heroBanner, collectionSlug: nextCollection.slug }
            : heroBanner
        )
      : storefrontRef.current.heroBanners;
    const changedHeroBanners = slugChanged && previousSlug
      ? storefrontRef.current.heroBanners
          .filter((heroBanner) => heroBanner.collectionSlug === previousSlug)
          .map((heroBanner) => ({ ...heroBanner, collectionSlug: nextCollection.slug }))
      : [];
    const nextCollections = existingCollection
      ? storefrontRef.current.collections.map((collection) =>
          collection.id === nextCollection.id ? nextCollection : collection
        )
      : [...storefrontRef.current.collections, nextCollection];
    const nextStorefront = {
      ...storefrontRef.current,
      collections: nextCollections,
      products: nextProducts,
      heroBanners: nextHeroBanners,
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(
      (async () => {
        if (changedProducts.length > 0) {
          await Promise.all(changedProducts.map((product) => saveProduct(product)));
        }

        if (changedHeroBanners.length > 0) {
          await Promise.all(changedHeroBanners.map((heroBanner) => saveHeroBanner(heroBanner)));
        }

        await saveCollection(nextCollection);
      })()
    );
  };

  const updateCollection = (collectionId: number, updates: Partial<Collection>) => {
    const currentCollection = storefrontRef.current.collections.find((collection) => collection.id === collectionId);

    if (!currentCollection) {
      return;
    }

    const nextSlug =
      isSystemCollection(currentCollection)
        ? currentCollection.slug
        : Object.prototype.hasOwnProperty.call(updates, "name")
          ? getUniqueCollectionSlug(String(updates.name ?? ""), storefrontRef.current.collections, collectionId)
          : currentCollection.slug;

    const affectedProducts = storefrontRef.current.products.filter(
      (product) => product.category === currentCollection.slug
    );
    const nextCollection: Collection = {
      ...currentCollection,
      ...updates,
      slug: nextSlug,
    };
    const slugChanged = nextCollection.slug !== currentCollection.slug;
    const nextProducts = slugChanged
      ? storefrontRef.current.products.map((product) =>
          product.category === currentCollection.slug ? { ...product, category: nextCollection.slug } : product
        )
      : storefrontRef.current.products;
    const changedProducts = slugChanged
      ? affectedProducts.map((product) => ({ ...product, category: nextCollection.slug }))
      : [];
    const affectedHeroBanners = storefrontRef.current.heroBanners.filter(
      (heroBanner) => heroBanner.collectionSlug === currentCollection.slug
    );
    const nextHeroBanners = slugChanged
      ? storefrontRef.current.heroBanners.map((heroBanner) =>
          heroBanner.collectionSlug === currentCollection.slug
            ? { ...heroBanner, collectionSlug: nextCollection.slug }
            : heroBanner
        )
      : storefrontRef.current.heroBanners;
    const changedHeroBanners = slugChanged
      ? affectedHeroBanners.map((heroBanner) => ({ ...heroBanner, collectionSlug: nextCollection.slug }))
      : [];
    const nextCollections = storefrontRef.current.collections.map((collection) =>
      collection.id === collectionId ? nextCollection : collection
    );
    const nextStorefront = {
      ...storefrontRef.current,
      collections: nextCollections,
      products: nextProducts,
      heroBanners: nextHeroBanners,
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(
      (async () => {
        if (slugChanged) {
          await Promise.all(changedProducts.map((product) => saveProduct(product)));
          await Promise.all(changedHeroBanners.map((heroBanner) => saveHeroBanner(heroBanner)));
        }

        await saveCollection(nextCollection);
      })()
    );
  };

  const deleteCollection = (collectionId: number) => {
    const currentCollection = storefrontRef.current.collections.find((collection) => collection.id === collectionId);

    if (!currentCollection) {
      return;
    }

    if (isSystemCollection(currentCollection)) {
      setError("System collections cannot be deleted.");
      return;
    }

    if (getRegularCollections(storefrontRef.current.collections).length <= 1) {
      setError("Create another category before deleting this one.");
      return;
    }

    const hasDependencies = storefrontRef.current.products.some(
      (product) => product.category === currentCollection.slug
    );
    const hasBannerDependencies = storefrontRef.current.heroBanners.some(
      (heroBanner) => heroBanner.collectionSlug === currentCollection.slug
    );

    if (hasDependencies) {
      setError("This category is used by products and cannot be deleted.");
      return;
    }

    if (hasBannerDependencies) {
      setError("This category is used by hero banners and cannot be deleted.");
      return;
    }

    const nextStorefront = {
      ...storefrontRef.current,
      collections: storefrontRef.current.collections.filter((collection) => collection.id !== collectionId),
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(deleteCollectionDocument(collectionId));
  };

  const saveProductDraft = (productDraft: Product) => {
    const existingProduct = storefrontRef.current.products.find((product) => product.id === productDraft.id);
    const nextStorefront = {
      ...storefrontRef.current,
      products: existingProduct
        ? storefrontRef.current.products.map((product) =>
            product.id === productDraft.id ? productDraft : product
          )
        : [...storefrontRef.current.products, productDraft],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);
    runWrite(saveProduct(productDraft));
  };

  const updateProduct = (productId: number, updates: Partial<Product>) => {
    const nextProducts = storefrontRef.current.products.map((product) =>
      product.id === productId ? { ...product, ...updates } : product
    );
    const nextProduct = nextProducts.find((product) => product.id === productId);
    const nextStorefront = { ...storefrontRef.current, products: nextProducts };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    if (nextProduct) {
      runWrite(saveProduct(nextProduct));
    }
  };

  const createProduct = () => {
    const nextId = Math.max(0, ...storefrontRef.current.products.map((product) => product.id)) + 1;
    const defaultCategory =
      getRegularCollections(storefrontRef.current.collections)[0]?.slug ??
      storefrontRef.current.collections[0]?.slug ??
      "soap";

    const nextProduct: Product = {
      id: nextId,
      name: "New Product",
      price: 0,
      description: "",
      category: defaultCategory,
      images: [""],
      status: "active",
    };

    const nextStorefront = {
      ...storefrontRef.current,
      products: [...storefrontRef.current.products, nextProduct],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(saveProduct(nextProduct));
    return nextId;
  };

  const deleteProduct = (productId: number) => {
    const nextStorefront = {
      ...storefrontRef.current,
      products: storefrontRef.current.products.filter((product) => product.id !== productId),
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(deleteProductDocument(productId));
  };

  const saveHeroBannerDraft = (heroBannerDraft: HeroBanner) => {
    const existingHeroBanner = storefrontRef.current.heroBanners.find(
      (heroBanner) => heroBanner.id === heroBannerDraft.id
    );
    const nextStorefront = {
      ...storefrontRef.current,
      heroBanners: existingHeroBanner
        ? storefrontRef.current.heroBanners.map((heroBanner) =>
            heroBanner.id === heroBannerDraft.id ? heroBannerDraft : heroBanner
          )
        : [...storefrontRef.current.heroBanners, heroBannerDraft],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);
    runWrite(saveHeroBanner(heroBannerDraft));
  };

  const addHeroBanner = () => {
    const nextId = Math.max(0, ...storefrontRef.current.heroBanners.map((heroBanner) => heroBanner.id)) + 1;
    const defaultCollectionSlug =
      getRegularCollections(storefrontRef.current.collections)[0]?.slug ??
      storefrontRef.current.collections[0]?.slug ??
      "";
    const nextHeroBanner: HeroBanner = {
      id: nextId,
      collectionSlug: defaultCollectionSlug,
      image: "",
      source: "admin",
      status: "active",
    };

    const nextStorefront = {
      ...storefrontRef.current,
      heroBanners: [...storefrontRef.current.heroBanners, nextHeroBanner],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(saveHeroBanner(nextHeroBanner));
  };

  const deleteHeroBanner = (heroBannerId: number) => {
    const nextStorefront = {
      ...storefrontRef.current,
      heroBanners: storefrontRef.current.heroBanners.filter((heroBanner) => heroBanner.id !== heroBannerId),
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(deleteHeroBannerDocument(heroBannerId));
  };

  const updateMarket = (marketId: number, updates: Partial<MarketItem>) => {
    const nextMarkets = storefrontRef.current.markets.map((market) =>
      market.id === marketId ? { ...market, ...updates } : market
    );
    const nextMarket = nextMarkets.find((market) => market.id === marketId);
    const nextStorefront = { ...storefrontRef.current, markets: nextMarkets };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    if (nextMarket) {
      runWrite(saveMarket(nextMarket));
    }
  };

  const saveMarketDraft = (marketDraft: MarketItem) => {
    const existingMarket = storefrontRef.current.markets.find((market) => market.id === marketDraft.id);
    const nextStorefront = {
      ...storefrontRef.current,
      markets: existingMarket
        ? storefrontRef.current.markets.map((market) =>
            market.id === marketDraft.id ? marketDraft : market
          )
        : [...storefrontRef.current.markets, marketDraft],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);
    runWrite(saveMarket(marketDraft));
  };

  const addMarket = () => {
    const nextId = Math.max(0, ...storefrontRef.current.markets.map((market) => market.id)) + 1;
    const nextMarket: MarketItem = {
      id: nextId,
      name: "New Market",
      schedule: "",
      address: "",
      season: "",
      status: "active",
    };

    const nextStorefront = {
      ...storefrontRef.current,
      markets: [...storefrontRef.current.markets, nextMarket],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(saveMarket(nextMarket));
  };

  const deleteMarket = (marketId: number) => {
    const nextStorefront = {
      ...storefrontRef.current,
      markets: storefrontRef.current.markets.filter((market) => market.id !== marketId),
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(deleteMarketDocument(marketId));
  };

  const updateTestimonial = (testimonialId: number, updates: Partial<Testimonial>) => {
    const nextTestimonials = storefrontRef.current.testimonials.map((testimonial) =>
      testimonial.id === testimonialId ? { ...testimonial, ...updates } : testimonial
    );
    const nextTestimonial = nextTestimonials.find((testimonial) => testimonial.id === testimonialId);
    const nextStorefront = { ...storefrontRef.current, testimonials: nextTestimonials };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    if (nextTestimonial) {
      runWrite(saveTestimonial(nextTestimonial));
    }
  };

  const saveTestimonialDraft = (testimonialDraft: Testimonial) => {
    const existingTestimonial = storefrontRef.current.testimonials.find(
      (testimonial) => testimonial.id === testimonialDraft.id
    );
    const nextStorefront = {
      ...storefrontRef.current,
      testimonials: existingTestimonial
        ? storefrontRef.current.testimonials.map((testimonial) =>
            testimonial.id === testimonialDraft.id ? testimonialDraft : testimonial
          )
        : [...storefrontRef.current.testimonials, testimonialDraft],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);
    runWrite(saveTestimonial(testimonialDraft));
  };

  const addTestimonial = () => {
    const nextId = Math.max(0, ...storefrontRef.current.testimonials.map((testimonial) => testimonial.id)) + 1;
    const nextTestimonial: Testimonial = {
      id: nextId,
      text: "",
      author: "New Customer",
      location: "",
      status: "active",
    };

    const nextStorefront = {
      ...storefrontRef.current,
      testimonials: [...storefrontRef.current.testimonials, nextTestimonial],
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(saveTestimonial(nextTestimonial));
  };

  const deleteTestimonial = (testimonialId: number) => {
    const nextStorefront = {
      ...storefrontRef.current,
      testimonials: storefrontRef.current.testimonials.filter((testimonial) => testimonial.id !== testimonialId),
    };
    storefrontRef.current = nextStorefront;
    setStorefront(nextStorefront);

    runWrite(deleteTestimonialDocument(testimonialId));
  };

  const resetStorefront = () => {
    const defaults = createDefaultStorefrontData();
    storefrontRef.current = defaults;
    setStorefront(defaults);
    runWrite(resetStorefrontDocuments(defaults));
  };

  return (
    <StorefrontContext.Provider
      value={{
        ...storefront,
        loading,
        saving: savingCount > 0,
        error,
        backend: "firestore",
        structure,
        saveSettingsDraft,
        updateSettings,
        addCollection,
        saveCollectionDraft,
        updateCollection,
        deleteCollection,
        saveProductDraft,
        updateProduct,
        createProduct,
        deleteProduct,
        saveHeroBannerDraft,
        addHeroBanner,
        deleteHeroBanner,
        saveMarketDraft,
        updateMarket,
        addMarket,
        deleteMarket,
        saveTestimonialDraft,
        updateTestimonial,
        addTestimonial,
        deleteTestimonial,
        resetStorefront,
      }}
    >
      {children}
    </StorefrontContext.Provider>
  );
}

export function useStorefront() {
  const context = useContext(StorefrontContext);

  if (!context) {
    throw new Error("useStorefront must be used within StorefrontProvider");
  }

  return context;
}
