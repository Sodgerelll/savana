import { describe, it, expect } from "vitest";
import { contentTokens, matchFaq, normalise } from "../../../api/chat/_lib/faqMatch";

const FAQS = [
  { question: "Хүргэлт хэдэн хоног вэ?", answer: "УБ дотор 1-2 өдөрт хүргэнэ." },
  { question: "Хүргэлтийн төлбөр хэд вэ?", answer: "Хүргэлтийн төлбөр 8,000₮." },
  { question: "Захиалсан бараагаа буцааж болох уу?", answer: "Захиалсан бараанд буцаалт байхгүй." },
  { question: "Ямар төлбөрийн хэлбэр байдаг вэ?", answer: "QR-аар (Bonum) төлнө." },
];

/** Not the opening message — the shortcut is off for that one by design. */
const MID = { isFirstTurn: false };

describe("normalise", () => {
  it("folds case, ё and punctuation away", () => {
    expect(normalise("  Хүргэлт  ХЭДЭН хоног вэ??? ")).toBe("хүргэлт хэдэн хоног вэ");
    expect(normalise("Ёстой юу")).toBe("естой юу");
  });
});

describe("contentTokens", () => {
  it("drops the particles that end nearly every Mongolian question", () => {
    // Left in, "вэ"/"уу"/"байна" would make unrelated questions look alike.
    expect([...contentTokens("Хүргэлт хэд вэ, байна уу?")]).toEqual(["хүргэлт", "хэд"]);
  });
});

describe("matchFaq", () => {
  it("answers an exactly repeated question from the knowledge base", () => {
    const hit = matchFaq("Хүргэлт хэдэн хоног вэ?", FAQS, MID);

    expect(hit?.answer).toBe("УБ дотор 1-2 өдөрт хүргэнэ.");
    expect(hit?.similarity).toBe(1);
  });

  it("ignores casing and punctuation on the way in", () => {
    expect(matchFaq("хүргэлт хэдэн хоног вэ", FAQS, MID)?.answer).toBe(
      "УБ дотор 1-2 өдөрт хүргэнэ.",
    );
  });

  it("refuses two questions that differ by one decisive word", () => {
    // "Хүргэлт хэд вэ" is about price; "Хүргэлт хэдэн хоног вэ" is about time.
    // They share two content words, which is exactly the trap this guards.
    expect(matchFaq("Хүргэлт хэд вэ?", FAQS, MID)).toBeNull();
  });

  it("stays out of the way on the opening message", () => {
    // The first reply carries the one greeting the bot is allowed.
    expect(matchFaq("Хүргэлт хэдэн хоног вэ?", FAQS, { isFirstTurn: true })).toBeNull();
  });

  it("stands aside when the customer is mid-flow with a phone number", () => {
    // Answering a FAQ here would talk straight past a lead being captured.
    expect(matchFaq("Батбаяр 99119911 хүргэлт хэдэн хоног вэ", FAQS, MID)).toBeNull();
  });

  it("stands aside when an order number is in the message", () => {
    expect(matchFaq("ORD-2026-00123 хүргэлт хэдэн хоног вэ", FAQS, MID)).toBeNull();
  });

  it("stands aside for a long message carrying its own context", () => {
    const long = `Сайн байна уу, би өчигдөр захиалга өгсөн бөгөөд ${"нэмэлт тайлбар ".repeat(8)}хүргэлт хэдэн хоног вэ`;

    expect(long.length).toBeGreaterThan(120);
    expect(matchFaq(long, FAQS, MID)).toBeNull();
  });

  it("refuses a bare greeting rather than reaching for the nearest entry", () => {
    expect(matchFaq("сайн байна уу", FAQS, MID)).toBeNull();
    expect(matchFaq("за", FAQS, MID)).toBeNull();
    expect(matchFaq("баярлалаа", FAQS, MID)).toBeNull();
  });

  it("refuses a question the knowledge base has no answer for", () => {
    expect(matchFaq("Саван яаж хийдэг вэ?", FAQS, MID)).toBeNull();
  });

  it("skips entries with a blank question or answer", () => {
    const broken = [{ question: "Хүргэлт хэдэн хоног вэ?", answer: "   " }];

    expect(matchFaq("Хүргэлт хэдэн хоног вэ?", broken, MID)).toBeNull();
  });

  it("returns nothing when the knowledge base is empty", () => {
    expect(matchFaq("Хүргэлт хэдэн хоног вэ?", [], MID)).toBeNull();
    expect(matchFaq("Хүргэлт хэдэн хоног вэ?", undefined as never, MID)).toBeNull();
  });

  it("picks the closest entry when more than one clears the bar", () => {
    const faqs = [
      { question: "Захиалсан бараагаа буцааж болох уу?", answer: "Буцаалт байхгүй." },
      { question: "Захиалсан бараагаа буцааж солиулж болох уу?", answer: "Солилт байхгүй." },
    ];

    expect(matchFaq("Захиалсан бараагаа буцааж болох уу?", faqs, MID)?.answer).toBe(
      "Буцаалт байхгүй.",
    );
  });
});
