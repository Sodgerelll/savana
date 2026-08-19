import { describe, it, expect } from "vitest";
import {
  dedupePairs,
  extractPairs,
  formatPairsForModel,
  normaliseMessages,
  parseFaqJson,
  type HistoryMessage,
} from "../../../api/chat/_lib/history";

const PAGE = "PAGE-1";

function graphMessages(
  entries: Array<{ from: string; message: string; at: string }>,
): { data: unknown[] } {
  return {
    data: entries.map((entry) => ({
      from: { id: entry.from },
      message: entry.message,
      created_time: entry.at,
    })),
  };
}

function say(fromPage: boolean, text: string, createdAt: string): HistoryMessage {
  return { fromPage, text, createdAt };
}

describe("normaliseMessages", () => {
  it("puts a conversation back in chronological order", () => {
    // Graph hands messages back newest-first. Pairing them in that order
    // matches every question with the answer that came before it.
    const result = normaliseMessages(
      graphMessages([
        { from: PAGE, message: "8,000₮", at: "2026-03-02T10:05:00+0000" },
        { from: "USER-1", message: "Хүргэлт хэд вэ?", at: "2026-03-02T10:00:00+0000" },
      ]),
      PAGE,
    );

    expect(result.map((m) => m.text)).toEqual(["Хүргэлт хэд вэ?", "8,000₮"]);
    expect(result.map((m) => m.fromPage)).toEqual([false, true]);
  });

  it("drops empty messages, which are stickers and attachments", () => {
    const result = normaliseMessages(
      graphMessages([
        { from: "USER-1", message: "", at: "2026-03-02T10:00:00+0000" },
        { from: "USER-1", message: "Сайн байна уу", at: "2026-03-02T10:01:00+0000" },
      ]),
      PAGE,
    );

    expect(result).toHaveLength(1);
  });

  it("survives a conversation with no messages edge at all", () => {
    expect(normaliseMessages(undefined, PAGE)).toEqual([]);
    expect(normaliseMessages({ data: null }, PAGE)).toEqual([]);
  });
});

describe("extractPairs", () => {
  it("pairs a question with the shop's reply", () => {
    const pairs = extractPairs(
      [
        say(false, "Саван яаж хэрэглэх вэ?", "2026-03-02T10:00:00+0000"),
        say(true, "Нойтон арьсандаа хөөсрүүлээд зөөлөн массаж хийнэ.", "2026-03-02T10:05:00+0000"),
      ],
      "2026",
    );

    expect(pairs).toEqual([
      {
        question: "Саван яаж хэрэглэх вэ?",
        answer: "Нойтон арьсандаа хөөсрүүлээд зөөлөн массаж хийнэ.",
      },
    ]);
  });

  it("keeps the last thing the customer said before the reply", () => {
    // People open with "сайн байна уу", then ask. The answer belongs to the
    // question, not to the greeting.
    const pairs = extractPairs(
      [
        say(false, "Сайн байна уу", "2026-03-02T10:00:00+0000"),
        say(false, "Хужирт саван байгаа юу?", "2026-03-02T10:01:00+0000"),
        say(true, "Тийм ээ, байгаа. 25,000₮ үнэтэй.", "2026-03-02T10:05:00+0000"),
      ],
      "2026",
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0].question).toBe("Хужирт саван байгаа юу?");
  });

  it("joins consecutive replies, which shops split across bubbles", () => {
    const pairs = extractPairs(
      [
        say(false, "Хүргэлт хэдэн өдөр вэ?", "2026-03-02T10:00:00+0000"),
        say(true, "УБ дотор 1-2 өдөр.", "2026-03-02T10:05:00+0000"),
        say(true, "Хөдөө орон нутагт 3-5 өдөр.", "2026-03-02T10:06:00+0000"),
      ],
      "2026",
    );

    expect(pairs[0].answer).toBe("УБ дотор 1-2 өдөр. Хөдөө орон нутагт 3-5 өдөр.");
  });

  it("keeps only the requested year", () => {
    const messages = [
      say(false, "Хуучин асуулт байна уу?", "2025-12-31T10:00:00+0000"),
      say(true, "Хуучин хариулт байна шүү дээ.", "2025-12-31T10:05:00+0000"),
      say(false, "Шинэ асуулт байна уу?", "2026-01-02T10:00:00+0000"),
      say(true, "Шинэ хариулт байна шүү дээ.", "2026-01-02T10:05:00+0000"),
    ];

    expect(extractPairs(messages, "2026").map((p) => p.question)).toEqual(["Шинэ асуулт байна уу?"]);
    expect(extractPairs(messages, "2025").map((p) => p.question)).toEqual(["Хуучин асуулт байна уу?"]);
  });

  it("dates a pair by the answer, so a new-year reply counts as this year", () => {
    // Asked on the 31st, answered on the 1st. The reply is the part that has to
    // still be true, so that is the date the pair is filed under.
    const pairs = extractPairs(
      [
        say(false, "Захиалга авах уу?", "2025-12-31T23:50:00+0000"),
        say(true, "Тийм ээ, авна. Дугаараа үлдээгээрэй.", "2026-01-01T00:10:00+0000"),
      ],
      "2026",
    );

    expect(pairs).toHaveLength(1);
  });

  it("skips one-word chatter on either side", () => {
    const pairs = extractPairs(
      [
        say(false, "за", "2026-03-02T10:00:00+0000"),
        say(true, "За баярлалаа, дахин уулзая шүү.", "2026-03-02T10:05:00+0000"),
        say(false, "Найрлагад нь юу байдаг вэ?", "2026-03-02T11:00:00+0000"),
        say(true, "ok", "2026-03-02T11:05:00+0000"),
      ],
      "2026",
    );

    expect(pairs).toEqual([]);
  });

  it("ignores a shop message nobody asked for", () => {
    // Broadcasts and follow-ups open with the page speaking first.
    const pairs = extractPairs(
      [
        say(true, "Шинэ бүтээгдэхүүн ирлээ, үзээрэй!", "2026-03-02T10:00:00+0000"),
        say(false, "Үнэ нь хэд вэ?", "2026-03-02T10:01:00+0000"),
        say(true, "32,000₮ болно доо.", "2026-03-02T10:02:00+0000"),
      ],
      "2026",
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0].question).toBe("Үнэ нь хэд вэ?");
  });

  it("leaves a question that was never answered out", () => {
    const pairs = extractPairs([say(false, "Хэн нэгэн байна уу?", "2026-03-02T10:00:00+0000")], "2026");

    expect(pairs).toEqual([]);
  });
});

describe("dedupePairs", () => {
  it("counts differently punctuated versions of one question once", () => {
    const pairs = dedupePairs([
      { question: "Хүргэлт хэд вэ?", answer: "8,000₮ байна аа." },
      { question: "хүргэлт   хэд вэ", answer: "8 мянга байна аа." },
      { question: "ХҮРГЭЛТ ХЭД ВЭ!!!", answer: "Найман мянга байна аа." },
      { question: "Хэзээ хүргэдэг вэ?", answer: "1-2 өдөрт хүргэнэ ээ." },
    ]);

    expect(pairs.map((p) => p.question)).toEqual(["Хүргэлт хэд вэ?", "Хэзээ хүргэдэг вэ?"]);
  });

  it("keeps the first answer, which is the one the counts were built from", () => {
    const pairs = dedupePairs([
      { question: "Үнэ хэд вэ?", answer: "Эхний хариулт байна аа." },
      { question: "Үнэ хэд вэ?", answer: "Хоёр дахь хариулт байна аа." },
    ]);

    expect(pairs[0].answer).toBe("Эхний хариулт байна аа.");
  });
});

describe("formatPairsForModel", () => {
  it("caps the transcript so a busy year still fits the context window", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      question: `Асуулт ${i} байна уу?`,
      answer: `Хариулт ${i} байна шүү.`,
    }));

    const text = formatPairsForModel(many, 150);

    expect(text).toContain("150. Хэрэглэгч: Асуулт 149");
    expect(text).not.toContain("151.");
  });
});

describe("parseFaqJson", () => {
  it("reads an array wrapped in a code fence", () => {
    const reply = '```json\n[{"question":"Хүргэлт?","answer":"8,000₮","topic":"Хүргэлт"}]\n```';

    expect(parseFaqJson(reply)).toEqual([
      { question: "Хүргэлт?", answer: "8,000₮", topic: "Хүргэлт" },
    ]);
  });

  it("returns nothing rather than garbage when the reply is not JSON", () => {
    expect(parseFaqJson("Уучлаарай, боловсруулж чадсангүй.")).toEqual([]);
    expect(parseFaqJson("[ this is not json ]")).toEqual([]);
  });

  it("drops entries missing a question or an answer", () => {
    const reply = '[{"question":"A","answer":""},{"question":"","answer":"B"},{"question":"C","answer":"D"}]';

    expect(parseFaqJson(reply)).toEqual([{ question: "C", answer: "D", topic: "" }]);
  });
});
