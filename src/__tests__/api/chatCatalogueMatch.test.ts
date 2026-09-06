import { describe, it, expect } from "vitest";

import { findCatalogueProduct } from "../../../api/chat/_lib/catalogueMatch";

const CATALOGUE = [
  { id: 1, name: "Давстай халуун жин" },
  { id: 2, name: "Ванны давс" },
  { id: 3, name: "Зочид буудлын саван" },
  { id: 4, name: "Гарын саван" },
  { id: 5, name: "Гарын савангийн 5ш-тэй багц" },
];

describe("findCatalogueProduct", () => {
  it("takes the id the tool recorded when there is one", () => {
    expect(findCatalogueProduct(CATALOGUE, "юу ч байсан", 2)?.name).toBe("Ванны давс");
  });

  it("matches the name as written", () => {
    expect(findCatalogueProduct(CATALOGUE, "ванны давс")?.name).toBe("Ванны давс");
  });

  it("looks past a size the model folded into the name", () => {
    // The real one. This line, in a real basket, killed a five-line order.
    expect(findCatalogueProduct(CATALOGUE, "Давстай халуун жин (1 кг)")?.name).toBe(
      "Давстай халуун жин",
    );
  });

  it("looks past packaging written into the name", () => {
    expect(
      findCatalogueProduct(CATALOGUE, "Зочид буудлын саван (цагаан торон савлатай)")?.name,
    ).toBe("Зочид буудлын саван");
  });

  it("matches a name the catalogue's own is the start of", () => {
    expect(findCatalogueProduct(CATALOGUE, "Ванны давс 1500 гр")?.name).toBe("Ванны давс");
  });

  it("prefers the longer catalogue name when both would fit", () => {
    // "Гарын саван" is the start of "Гарын савангийн 5ш-тэй багц"; the customer
    // naming the pack should get the pack.
    expect(findCatalogueProduct(CATALOGUE, "Гарын савангийн 5ш-тэй багц")?.name).toBe(
      "Гарын савангийн 5ш-тэй багц",
    );
  });

  it("will not let a short name swallow a longer product", () => {
    // A prefix has to end on a word boundary, or "Гарын сав" matches everything.
    expect(findCatalogueProduct(CATALOGUE, "Гарын савангаар")).toBeUndefined();
  });

  it("returns nothing for a product the shop does not sell", () => {
    expect(findCatalogueProduct(CATALOGUE, "Шоколад")).toBeUndefined();
    expect(findCatalogueProduct(CATALOGUE, "")).toBeUndefined();
  });
});

describe("the basket that was lost", () => {
  it("resolves every line of it", () => {
    // The real basket, as it was stored: five lines, two of which the exact
    // match could not place. The order died on the first of them and took the
    // other four with it.
    const shop = [
      { id: 1, name: "Давстай халуун жин" },
      { id: 482330, name: "Аяга таваг угаах саван" },
      { id: 2, name: "Зочид буудлын саван" },
      { id: 403661, name: "Ванны давс" },
      { id: 713889, name: "Гангатай саван" },
    ];
    const basket = [
      "Давстай халуун жин (1 кг)",
      "Аяга таваг угаах саван",
      "Зочид буудлын саван (цагаан торон савлатай)",
      "Ванны давс",
      "Гангатай саван",
    ];

    const resolved = basket.map((name) => findCatalogueProduct(shop, name)?.name);

    expect(resolved).toEqual([
      "Давстай халуун жин",
      "Аяга таваг угаах саван",
      "Зочид буудлын саван",
      "Ванны давс",
      "Гангатай саван",
    ]);
  });
});
