import { describe, it, expect } from "vitest";

import { catalogueVocabulary, repairCatalogueWords } from "../../../api/chat/_lib/factGuard";

const PRODUCTS = [
  {
    name: "Гангатай шампунь",
    ingredients:
      "Наргил модны самрын тос, оливын тос, кастор тос, камелла тос, канола тос, " +
      "ганга өвсний хандтай тос, гааны эфирийн тос, ганганы эфирийн тос, " +
      "ганга өвсний нунтаг, шүлт, нэрмэл ус",
  },
  {
    name: "Халгайтай шампунь",
    ingredients: "Халгайн хандтай тос, Розмарин эфирийн тос, Халгай өвсний нунтаг",
  },
];

const VOCAB = catalogueVocabulary(PRODUCTS);

describe("catalogueVocabulary", () => {
  it("collects the words worth being exact about", () => {
    expect(VOCAB).toContain("өвсний");
    expect(VOCAB).toContain("хандтай");
    expect(VOCAB).toContain("шампунь");
  });

  it("leaves short words out, where one letter proves nothing", () => {
    // "тос" is three letters; almost anything is one edit away from it.
    expect(VOCAB).not.toContain("тос");
    expect(VOCAB).not.toContain("ус");
  });
});

describe("repairCatalogueWords", () => {
  it("puts back the letter that turned a herb into a disease", () => {
    // The real one. Sent to a customer on 30 August: ганга the plant became
    // ганга the illness, in a message about something that goes on skin.
    const reply = "Найрлагад нь ганга өвчний хандтай тос орсон.";

    const result = repairCatalogueWords(reply, VOCAB);

    expect(result.text).toBe("Найрлагад нь ганга өвсний хандтай тос орсон.");
    expect(result.repaired).toEqual([{ from: "өвчний", to: "өвсний" }]);
  });

  it("leaves a word the catalogue actually uses alone", () => {
    const reply = "Найрлагад нь ганга өвсний хандтай тос орсон.";

    expect(repairCatalogueWords(reply, VOCAB).text).toBe(reply);
    expect(repairCatalogueWords(reply, VOCAB).repaired).toEqual([]);
  });

  it("does not touch a word that is two letters away", () => {
    // Beyond one substitution this stops being a slip and starts being a guess.
    const result = repairCatalogueWords("Найрлагад нь ганга өвгүүн орсон.", VOCAB);

    expect(result.repaired).toEqual([]);
  });

  it("leaves ordinary words the shop never wrote where they are", () => {
    const reply = "Энэ шампунь хуйхны үрэвсэлд тохиромжтой бөгөөд үнэ нь 9,900₮ байна.";

    expect(repairCatalogueWords(reply, VOCAB).repaired).toEqual([]);
  });

  it("keeps quiet when two catalogue words are equally close", () => {
    // Picking one at random would be its own way of being wrong.
    const vocab = ["гангатай", "гантатай"];

    const result = repairCatalogueWords("Энэ гандатай зүйл.", vocab);

    expect(result.repaired).toEqual([]);
    expect(result.text).toBe("Энэ гандатай зүйл.");
  });

  it("keeps the capital letter the sentence started with", () => {
    const result = repairCatalogueWords("Өвчний хандтай тос.", VOCAB);

    expect(result.text).toBe("Өвсний хандтай тос.");
  });

  it("does not rewrite a suffix into a different word", () => {
    // Mongolian inflects by adding letters; treating that as a slip would have
    // the guard editing correct sentences.
    const result = repairCatalogueWords("Шампуниа авмаар байна.", VOCAB);

    expect(result.repaired).toEqual([]);
  });

  it("is a no-op without a catalogue to check against", () => {
    expect(repairCatalogueWords("Юу ч байхгүй.", []).text).toBe("Юу ч байхгүй.");
  });
});
