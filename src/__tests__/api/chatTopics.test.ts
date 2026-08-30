import { describe, it, expect } from "vitest";

import {
  classifyTopic,
  mergeTopic,
  TOPIC_LABELS,
  type ChatTopic,
} from "../../../api/chat/_lib/topics";

describe("classifyTopic", () => {
  it("reads the tool the bot reached for", () => {
    // Choosing it was an act of understanding; there is no need to guess again.
    expect(classifyTopic({ toolName: "start_order", message: "за" })).toBe("order");
    expect(classifyTopic({ toolName: "show_products", message: "за" })).toBe("product");
    expect(classifyTopic({ toolName: "show_promotions", message: "за" })).toBe("price");
  });

  it("puts a complaint above the tool", () => {
    // Someone saying a soap arrived broken while the bot shows them a carousel
    // is not browsing, and this is the label that should reach a person.
    expect(
      classifyTopic({ toolName: "show_products", message: "Ирсэн саван эвдэрсэн байна" }),
    ).toBe("complaint");
  });

  it("falls back to the customer's own words", () => {
    expect(classifyTopic({ message: "Хүргэлт хэзээ ирэх вэ?" })).toBe("delivery");
    expect(classifyTopic({ message: "Төлбөрөө яаж төлөх вэ?" })).toBe("payment");
    expect(classifyTopic({ message: "Үнэ хэд вэ?" })).toBe("price");
  });

  it("matches a stem so a suffix does not hide the word", () => {
    // "хүргэлт", "хүргэлтийн", "хүргэлтэд" are one idea.
    expect(classifyTopic({ message: "хүргэлтийн талаар асуух гэсэн юм" })).toBe("delivery");
  });

  it("is 'other' when nothing in the turn says otherwise", () => {
    expect(classifyTopic({ message: "Сайн байна уу" })).toBe("other");
    expect(classifyTopic({})).toBe("other");
  });

  it("has a Mongolian label for every topic it can return", () => {
    const topics: ChatTopic[] = [
      "order",
      "delivery",
      "payment",
      "price",
      "product",
      "complaint",
      "other",
    ];
    for (const topic of topics) {
      expect(TOPIC_LABELS[topic]).toBeTruthy();
    }
  });
});

describe("mergeTopic", () => {
  it("lets the thread move on as the customer commits", () => {
    // "what soaps do you have" becomes "I'll take three".
    expect(mergeTopic("product", "order")).toBe("order");
  });

  it("keeps what the thread was about when a turn says nothing", () => {
    // A bare "за" must not erase a known topic.
    expect(mergeTopic("order", "other")).toBe("order");
  });

  it("starts from nothing without inventing a topic", () => {
    expect(mergeTopic(null, "other")).toBe("other");
  });
});

describe("the two topic lists", () => {
  it("says the same thing on both sides of the runtime boundary", async () => {
    // api/chat/_lib/topics.ts re-declares this vocabulary rather than importing
    // it, for the reason at the top of src/lib/chat/types.ts. Nothing else stops
    // the two drifting apart, so this does.
    const app = await import("../../lib/chat/types");

    expect([...app.CHAT_TOPIC_VALUES].sort()).toEqual(Object.keys(TOPIC_LABELS).sort());
    expect(app.CHAT_TOPIC_LABELS).toEqual(TOPIC_LABELS);
  });
});
