import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createChatLead,
  extractName,
  extractPhone,
  findOpenLead,
  isLeadComplete,
  updateChatLead,
} from "../../../api/chat/_lib/leads";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("extractPhone", () => {
  it("reads a bare 8-digit number", () => {
    expect(extractPhone("99119911")).toBe("99119911");
  });

  it("accepts every valid Mongolian mobile prefix", () => {
    for (const prefix of ["6", "7", "8", "9"]) {
      expect(extractPhone(`${prefix}1234567`)).toBe(`${prefix}1234567`);
    }
  });

  it("strips the spaces people type inside a number", () => {
    expect(extractPhone("9911 9911")).toBe("99119911");
  });

  it("strips dashes and brackets", () => {
    expect(extractPhone("9911-9911")).toBe("99119911");
    expect(extractPhone("(9911)9911")).toBe("99119911");
  });

  it("drops a +976 country code", () => {
    expect(extractPhone("+976 99119911")).toBe("99119911");
    expect(extractPhone("97699119911")).toBe("99119911");
  });

  it("finds the number inside a sentence", () => {
    expect(extractPhone("Намайг Бат гэдэг, утас 99119911 байна")).toBe("99119911");
  });

  it("finds the number even when a quantity is in the same message", () => {
    // The regression tegri's prompt warns about: other digits nearby must not
    // make the parser call the number invalid.
    expect(extractPhone("3 ширхэг авъя, 99119911")).toBe("99119911");
  });

  it("finds the number when a date is in the same message", () => {
    expect(extractPhone("2026-08-20-нд хүргээрэй, 88001122")).toBe("88001122");
  });

  it("rejects a number that is too short", () => {
    expect(extractPhone("9911991")).toBeNull();
  });

  it("rejects a longer digit run rather than slicing 8 out of it", () => {
    expect(extractPhone("991199112233")).toBeNull();
  });

  it("rejects a prefix Mongolia does not use", () => {
    expect(extractPhone("11223344")).toBeNull();
    expect(extractPhone("51234567")).toBeNull();
  });

  it("returns null for text with no number", () => {
    expect(extractPhone("Сайн байна уу")).toBeNull();
    expect(extractPhone("")).toBeNull();
  });

  it("returns the first number when several are present", () => {
    expect(extractPhone("99119911 эсвэл 88008800")).toBe("99119911");
  });
});

describe("extractName", () => {
  it("reads a labelled name", () => {
    expect(extractName("Нэр: Батбаяр")).toBe("Батбаяр");
    expect(extractName("нэр : Болд")).toBe("Болд");
  });

  it("reads an English label", () => {
    expect(extractName("Name: Bat")).toBe("Bat");
  });

  it("stops the labelled name at a comma", () => {
    expect(extractName("Нэр: Бат, утас 99119911")).toBe("Бат");
  });

  it("reads a name written just before the phone number", () => {
    expect(extractName("Батбаяр 99119911")).toBe("Батбаяр");
  });

  it("collapses spacing in a two-part name", () => {
    expect(extractName("Бат  Баяр 99119911")).toBe("Бат Баяр");
  });

  it("does not mistake a lead-in word for a name", () => {
    expect(extractName("утас 99119911")).toBeNull();
    expect(extractName("дугаар 99119911")).toBeNull();
  });

  it("returns null rather than guessing when there is no name", () => {
    expect(extractName("99119911")).toBeNull();
    expect(extractName("Сайн байна уу")).toBeNull();
    expect(extractName("")).toBeNull();
  });
});

describe("isLeadComplete", () => {
  it("needs both a name and a phone", () => {
    expect(isLeadComplete({ customerName: "Бат", customerPhone: "99119911" })).toBe(true);
    expect(isLeadComplete({ customerName: "", customerPhone: "99119911" })).toBe(false);
    expect(isLeadComplete({ customerName: "Бат", customerPhone: "" })).toBe(false);
  });

  it("treats whitespace as missing", () => {
    expect(isLeadComplete({ customerName: "   ", customerPhone: "99119911" })).toBe(false);
  });
});

describe("createChatLead", () => {
  function fakeDb() {
    const written: Array<Record<string, unknown>> = [];
    return {
      written,
      db: {
        collection: () => ({
          doc: () => ({
            id: "lead-1",
            set: (data: Record<string, unknown>) => {
              written.push(data);
              return Promise.resolve();
            },
          }),
        }),
      },
    };
  }

  const input = {
    type: "order" as const,
    conversationId: "c1",
    channel: "facebook",
    customerName: "  Батбаяр  ",
    customerPhone: "  99119911  ",
    note: "  яаралтай  ",
    items: [{ productId: 7, name: "Хужирт саван", variant: null, quantity: 2 }],
  };

  it("stores the lead as new, never as an order", async () => {
    const { db, written } = fakeDb();

    await createChatLead(db, input);

    expect(written[0]).toMatchObject({ type: "order", status: "new", convertedOrderId: null });
  });

  it("trims the customer fields", async () => {
    const { db, written } = fakeDb();

    await createChatLead(db, input);

    expect(written[0]).toMatchObject({
      customerName: "Батбаяр",
      customerPhone: "99119911",
      note: "яаралтай",
    });
  });

  it("keeps the item list", async () => {
    const { db, written } = fakeDb();

    await createChatLead(db, input);

    expect(written[0].items).toEqual([
      { productId: 7, name: "Хужирт саван", variant: null, quantity: 2 },
    ]);
  });

  it("returns the new lead id", async () => {
    const { db } = fakeDb();

    await expect(createChatLead(db, input)).resolves.toBe("lead-1");
  });
});

describe("findOpenLead", () => {
  function queryDb(docs: Array<{ id: string; data: Record<string, unknown> }>, throws = false) {
    const query: Record<string, unknown> = {};
    query.where = () => query;
    query.limit = () => query;
    query.get = () =>
      throws
        ? Promise.reject(new Error("index missing"))
        : Promise.resolve({
            empty: docs.length === 0,
            docs: docs.map((entry) => ({ id: entry.id, data: () => entry.data })),
          });
    return { collection: () => query };
  }

  it("returns the open lead on the conversation", async () => {
    const db = queryDb([{ id: "lead-1", data: { status: "new" } }]);

    await expect(findOpenLead(db, "c1")).resolves.toEqual({
      id: "lead-1",
      data: { status: "new" },
    });
  });

  it("returns null when there is none", async () => {
    await expect(findOpenLead(queryDb([]), "c1")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the query fails", async () => {
    await expect(findOpenLead(queryDb([], true), "c1")).resolves.toBeNull();
  });
});

describe("updateChatLead", () => {
  it("merges the patch and refreshes updatedAt", async () => {
    const written: Array<[Record<string, unknown>, unknown]> = [];
    const db = {
      collection: () => ({
        doc: () => ({
          set: (data: Record<string, unknown>, options: unknown) => {
            written.push([data, options]);
            return Promise.resolve();
          },
        }),
      }),
    };

    await updateChatLead(db, "lead-1", { customerPhone: "99119911" });

    expect(written[0][0]).toMatchObject({ customerPhone: "99119911" });
    expect(written[0][0].updatedAt).toBeInstanceOf(Date);
    expect(written[0][1]).toEqual({ merge: true });
  });
});
