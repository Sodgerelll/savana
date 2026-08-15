import { describe, it, expect, vi, beforeEach } from "vitest";

const { firestoreMocks } = vi.hoisted(() => ({
  firestoreMocks: {
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot: vi.fn(),
    batchSet: vi.fn(),
    batchCommit: vi.fn(),
    serverTimestampToken: Symbol("serverTimestamp"),
  },
}));

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: () => ({ __ref: "chat_faqs" }),
  doc: (_ref: unknown, id?: string) => ({ id: id ?? "generated-id" }),
  query: (ref: unknown) => ref,
  onSnapshot: firestoreMocks.onSnapshot,
  serverTimestamp: () => firestoreMocks.serverTimestampToken,
  setDoc: firestoreMocks.setDoc,
  updateDoc: firestoreMocks.updateDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  writeBatch: () => ({ set: firestoreMocks.batchSet, commit: firestoreMocks.batchCommit }),
}));

import {
  createChatFaq,
  createChatFaqsBatch,
  createEmptyFaqDraft,
  deleteChatFaq,
  setChatFaqActive,
  subscribeToChatFaqs,
  updateChatFaq,
  type ChatFaqDraft,
} from "../../lib/chat/faqStore";

function draft(overrides: Partial<ChatFaqDraft> = {}): ChatFaqDraft {
  return {
    question: "  Хүргэлт хэдэн хоног вэ?  ",
    answer: "  1-2 ажлын өдөр.  ",
    topic: "  Хүргэлт  ",
    order: 3,
    isActive: true,
    ...overrides,
  };
}

/** Drives the onSnapshot callback with the given raw documents. */
function emitSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  let received: unknown[] = [];
  firestoreMocks.onSnapshot.mockImplementation(
    (_query: unknown, onNext: (snap: unknown) => void) => {
      onNext({ docs: docs.map((entry) => ({ id: entry.id, data: () => entry.data })) });
      return () => {};
    },
  );
  subscribeToChatFaqs({ onData: (faqs) => { received = faqs; } });
  return received as Array<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createEmptyFaqDraft", () => {
  it("starts active with the supplied order", () => {
    expect(createEmptyFaqDraft(5)).toEqual({
      question: "",
      answer: "",
      topic: "",
      order: 5,
      isActive: true,
    });
  });
});

describe("createChatFaq", () => {
  it("trims every text field before writing", async () => {
    await createChatFaq(draft());

    expect(firestoreMocks.setDoc.mock.calls[0][1]).toMatchObject({
      question: "Хүргэлт хэдэн хоног вэ?",
      answer: "1-2 ажлын өдөр.",
      topic: "Хүргэлт",
      order: 3,
      isActive: true,
    });
  });

  it("stamps createdAt and updatedAt server-side", async () => {
    await createChatFaq(draft());

    const written = firestoreMocks.setDoc.mock.calls[0][1];
    expect(written.createdAt).toBe(firestoreMocks.serverTimestampToken);
    expect(written.updatedAt).toBe(firestoreMocks.serverTimestampToken);
  });

  it("falls back to order 0 when the value is not a finite number", async () => {
    await createChatFaq(draft({ order: Number.NaN }));

    expect(firestoreMocks.setDoc.mock.calls[0][1].order).toBe(0);
  });

  it("returns the new document id", async () => {
    await expect(createChatFaq(draft())).resolves.toBe("generated-id");
  });
});

describe("updateChatFaq", () => {
  it("writes the normalized draft and refreshes updatedAt only", async () => {
    await updateChatFaq("faq-1", draft());

    const written = firestoreMocks.updateDoc.mock.calls[0][1];
    expect(written.question).toBe("Хүргэлт хэдэн хоног вэ?");
    expect(written.updatedAt).toBe(firestoreMocks.serverTimestampToken);
    expect(written.createdAt).toBeUndefined();
  });
});

describe("setChatFaqActive", () => {
  it("toggles the flag without touching the content", async () => {
    await setChatFaqActive("faq-1", false);

    expect(firestoreMocks.updateDoc.mock.calls[0][1]).toEqual({
      isActive: false,
      updatedAt: firestoreMocks.serverTimestampToken,
    });
  });
});

describe("deleteChatFaq", () => {
  it("deletes the document", async () => {
    await deleteChatFaq("faq-1");

    expect(firestoreMocks.deleteDoc).toHaveBeenCalledTimes(1);
  });
});

describe("createChatFaqsBatch", () => {
  it("writes every draft in a single commit", async () => {
    await expect(createChatFaqsBatch([draft(), draft({ question: "Хоёр дахь" })])).resolves.toBe(2);

    expect(firestoreMocks.batchSet).toHaveBeenCalledTimes(2);
    expect(firestoreMocks.batchCommit).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an empty list", async () => {
    await expect(createChatFaqsBatch([])).resolves.toBe(0);

    expect(firestoreMocks.batchCommit).not.toHaveBeenCalled();
  });

  it("refuses a batch that would exceed the Firestore write limit", async () => {
    const many = Array.from({ length: 401 }, () => draft());

    await expect(createChatFaqsBatch(many)).rejects.toThrow("400");
    expect(firestoreMocks.batchCommit).not.toHaveBeenCalled();
  });
});

describe("subscribeToChatFaqs", () => {
  it("sorts by order, then alphabetically within the same order", () => {
    const faqs = emitSnapshot([
      { id: "c", data: { question: "Б асуулт", answer: "a", order: 1 } },
      { id: "a", data: { question: "Хоёр", answer: "a", order: 5 } },
      { id: "b", data: { question: "А асуулт", answer: "a", order: 1 } },
    ]);

    expect(faqs.map((faq) => faq.question)).toEqual(["А асуулт", "Б асуулт", "Хоёр"]);
  });

  it("treats a missing isActive as active so older entries keep feeding the bot", () => {
    const faqs = emitSnapshot([{ id: "a", data: { question: "q", answer: "a" } }]);

    expect(faqs[0].isActive).toBe(true);
  });

  it("respects an explicit isActive false", () => {
    const faqs = emitSnapshot([{ id: "a", data: { question: "q", answer: "a", isActive: false } }]);

    expect(faqs[0].isActive).toBe(false);
  });

  it("defaults a missing or non-numeric order to 0", () => {
    const faqs = emitSnapshot([
      { id: "a", data: { question: "q1", answer: "a" } },
      { id: "b", data: { question: "q2", answer: "a", order: "эхэнд" } },
    ]);

    expect(faqs.map((faq) => faq.order)).toEqual([0, 0]);
  });

  it("converts Firestore timestamps to ISO strings", () => {
    const faqs = emitSnapshot([
      {
        id: "a",
        data: {
          question: "q",
          answer: "a",
          createdAt: { toDate: () => new Date("2026-08-15T10:00:00.000Z") },
        },
      },
    ]);

    expect(faqs[0].createdAt).toBe("2026-08-15T10:00:00.000Z");
    expect(faqs[0].updatedAt).toBeNull();
  });

  it("coerces missing text fields to empty strings", () => {
    const faqs = emitSnapshot([{ id: "a", data: {} }]);

    expect(faqs[0]).toMatchObject({ question: "", answer: "", topic: "" });
  });
});
