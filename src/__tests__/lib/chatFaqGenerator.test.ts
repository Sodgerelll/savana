import { describe, it, expect } from "vitest";

import {
  FAQ_GENERATOR_INSTRUCTION,
  parseGeneratedFaqs,
} from "../../lib/chat/faqGenerator";

const VALID = `[
  {"question":"Хүргэлт хэдэн хоног вэ?","answer":"1-2 ажлын өдөр.","topic":"Хүргэлт"},
  {"question":"Найрлага юу вэ?","answer":"Оливын тос, шүлт.","topic":"Найрлага"}
]`;

describe("parseGeneratedFaqs", () => {
  it("parses a clean JSON array", () => {
    expect(parseGeneratedFaqs(VALID)).toEqual([
      { question: "Хүргэлт хэдэн хоног вэ?", answer: "1-2 ажлын өдөр.", topic: "Хүргэлт" },
      { question: "Найрлага юу вэ?", answer: "Оливын тос, шүлт.", topic: "Найрлага" },
    ]);
  });

  it("unwraps a ```json fence", () => {
    expect(parseGeneratedFaqs("```json\n" + VALID + "\n```")).toHaveLength(2);
  });

  it("ignores a sentence the model added before the array", () => {
    expect(parseGeneratedFaqs(`Мэдээж, доор 2 асуулт байна:\n${VALID}`)).toHaveLength(2);
  });

  it("ignores trailing commentary after the array", () => {
    expect(parseGeneratedFaqs(`${VALID}\n\nЭдгээрийг хянаж засна уу.`)).toHaveLength(2);
  });

  it("trims whitespace around every field", () => {
    const result = parseGeneratedFaqs('[{"question":"  А  ","answer":"  Б  ","topic":"  В  "}]');

    expect(result).toEqual([{ question: "А", answer: "Б", topic: "В" }]);
  });

  it("defaults a missing topic to an empty string", () => {
    expect(parseGeneratedFaqs('[{"question":"А","answer":"Б"}]')).toEqual([
      { question: "А", answer: "Б", topic: "" },
    ]);
  });

  it("drops entries missing a question or an answer", () => {
    const result = parseGeneratedFaqs(
      '[{"question":"А","answer":""},{"question":"","answer":"Б"},{"question":"В","answer":"Г"}]',
    );

    expect(result).toEqual([{ question: "В", answer: "Г", topic: "" }]);
  });

  it("drops entries whose fields are not strings", () => {
    expect(parseGeneratedFaqs('[{"question":42,"answer":"Б"},{"question":"В","answer":null}]')).toEqual(
      [],
    );
  });

  it("survives null entries inside the array", () => {
    expect(parseGeneratedFaqs('[null,{"question":"А","answer":"Б"}]')).toEqual([
      { question: "А", answer: "Б", topic: "" },
    ]);
  });

  it("returns nothing for malformed JSON rather than throwing", () => {
    expect(parseGeneratedFaqs('[{"question":"А","answer":}]')).toEqual([]);
  });

  it("returns nothing when there is no array at all", () => {
    expect(parseGeneratedFaqs("Уучлаарай, би энэ хүсэлтэд хариулж чадахгүй.")).toEqual([]);
  });

  it("returns nothing for a JSON object instead of an array", () => {
    expect(parseGeneratedFaqs('{"question":"А","answer":"Б"}')).toEqual([]);
  });

  it("returns nothing for an empty reply", () => {
    expect(parseGeneratedFaqs("")).toEqual([]);
  });

  it("returns nothing when the brackets are reversed", () => {
    expect(parseGeneratedFaqs("] хачин хариу [")).toEqual([]);
  });

  it("handles an empty array", () => {
    expect(parseGeneratedFaqs("[]")).toEqual([]);
  });
});

describe("FAQ_GENERATOR_INSTRUCTION", () => {
  it("demands JSON-only output", () => {
    expect(FAQ_GENERATOR_INSTRUCTION).toContain("ЗӨВХӨН JSON");
  });

  it("forbids inventing catalog facts", () => {
    expect(FAQ_GENERATOR_INSTRUCTION).toContain("бүү зохио");
  });

  it("forbids medical claims", () => {
    expect(FAQ_GENERATOR_INSTRUCTION).toContain("эмчилнэ");
  });

  it("requires Mongolian Cyrillic", () => {
    expect(FAQ_GENERATOR_INSTRUCTION).toContain("Кирилл");
  });
});
