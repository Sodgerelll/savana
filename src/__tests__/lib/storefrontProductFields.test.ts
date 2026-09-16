import { describe, it, expect, vi, beforeEach } from "vitest";
import { firestoreMock } from "../helpers/firestoreMock";

vi.mock("../../lib/firebase", () => ({ db: {}, firestoreDatabaseId: "(default)" }));
vi.mock("firebase/firestore", async () => ({
  ...(await import("../helpers/firestoreMock")).firestoreMock.module,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

import { onSnapshot } from "firebase/firestore";
import type { Product } from "../../data/products";
import { saveProductEdit, subscribeToStorefront } from "../../lib/storefrontRepository";

const product: Product = {
  id: 7,
  name: "Сүүлэн тостой саван",
  price: 8800,
  description: "",
  category: "soap",
  images: [""],
  status: "active",
};

/** What the product editor last wrote. The shared mock keys `doc(collectionRef, id)` by id alone. */
function lastSavedProduct(): Record<string, unknown> | undefined {
  return firestoreMock.writes.filter((write) => write.op === "set").at(-1)?.data;
}

/** Feeds one products snapshot to `subscribeToStorefront` and returns what the page receives. */
function productsFromSnapshot(documents: Record<string, unknown>[]): Product[] {
  let received: Product[] = [];
  vi.mocked(onSnapshot).mockImplementation(((ref: { path: string }, next: (snapshot: unknown) => void) => {
    if (ref.path === "products") {
      next({ empty: documents.length === 0, docs: documents.map((data) => ({ id: String(data.id), data: () => data })) });
    }
    return () => undefined;
  }) as never);

  subscribeToStorefront({
    onSettings: () => undefined,
    onNavigationItems: () => undefined,
    onCollections: () => undefined,
    onProducts: (products) => {
      received = products;
    },
    onHeroBanners: () => undefined,
    onMarkets: () => undefined,
    onTestimonials: () => undefined,
    onDiscounts: () => undefined,
    onError: () => undefined,
  });

  return received;
}

beforeEach(() => {
  firestoreMock.reset();
});

describe("storage conditions on a product", () => {
  it("is saved with the rest of the product", async () => {
    await saveProductEdit({ ...product, storageConditions: "Хуурай, сэрүүн газар хадгална." });

    expect(lastSavedProduct()).toMatchObject({
      storageConditions: "Хуурай, сэрүүн газар хадгална.",
    });
  });

  it("is cleared when the admin empties the field", async () => {
    // The editor merges into the stored document, so a field left out would keep the old
    // text. Writing null is what actually removes it.
    firestoreMock.seed("7", { ...product, storageConditions: "Хуучин текст" });

    await saveProductEdit({ ...product, storageConditions: undefined });

    expect(lastSavedProduct()).toMatchObject({ storageConditions: null });
  });

  it("reaches the product page when it is filled in", () => {
    const [received] = productsFromSnapshot([{ ...product, storageConditions: "Хуурай газар" }]);

    expect(received.storageConditions).toBe("Хуурай газар");
  });

  it("is absent on products that never had it or had it cleared", () => {
    const [never, cleared] = productsFromSnapshot([
      { ...product, id: 7 },
      { ...product, id: 8, storageConditions: null },
    ]);

    expect(never.storageConditions).toBeUndefined();
    expect(cleared.storageConditions).toBeUndefined();
  });

  it("does not disturb shelf life, which is a separate field", async () => {
    await saveProductEdit({ ...product, shelfLife: "12 сар", storageConditions: "Сэрүүн газар" });

    expect(lastSavedProduct()).toMatchObject({
      shelfLife: "12 сар",
      storageConditions: "Сэрүүн газар",
    });
  });
});
