import { beforeEach, describe, expect, it, vi } from "vitest";

// One in-memory Firestore, shared by logError and the assertions below.
type Doc = Record<string, unknown>;
const store = new Map<string, Doc>();

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (n: number) => ({ __increment: n }) },
  Timestamp: { fromDate: (d: Date) => d },
}));

vi.mock("../../../api/bonum/_firebaseAdmin", () => {
  const notFound = Object.assign(new Error("NOT_FOUND"), { code: 5 });
  const exists = Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        const key = `${name}/${id}`;
        return {
          update: async (patch: Doc) => {
            const current = store.get(key);
            if (!current) throw notFound;
            const next = { ...current, ...patch };
            const inc = patch.count as { __increment?: number } | undefined;
            next.count = Number(current.count ?? 0) + (inc?.__increment ?? 0);
            store.set(key, next);
          },
          create: async (data: Doc) => {
            if (store.has(key)) throw exists;
            store.set(key, data);
          },
        };
      },
    }),
  };
  return { getAdminFirestore: () => Promise.resolve(db), getAdminAuth: () => null };
});

import {
  errorFingerprint,
  logError,
  redact,
  sanitizeContext,
} from "../../../api/_lib/errorLog";
import handler from "../../../api/errorlog/report";

beforeEach(() => {
  store.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.useRealTimers();
});

const rows = () => [...store.entries()].map(([id, doc]) => ({ id, ...doc }) as Doc & { id: string });

describe("logError", () => {
  it("records a failure with its source, action, message and stack", async () => {
    await logError({ source: "chat", action: "chat/webhook", message: "generation failed", error: new Error("quota") });

    const [row] = rows();
    expect(row).toMatchObject({
      source: "chat",
      action: "chat/webhook",
      message: "generation failed: quota",
      severity: "error",
      status: "open",
      origin: "server",
      count: 1,
    });
    expect(String(row.stack)).toContain("quota");
    expect(row.id).toMatch(/^errorLogs\/\d{4}-\d{2}-\d{2}_[0-9a-f]{20}$/);
  });

  it("merges the same fault into one row and counts it, whatever ids the message carries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T03:00:00Z"));
    await logError({ source: "order", action: "orders/mark-paid", message: "order a1b2c3d4e5f6a7b8c9d0 failed" });
    vi.setSystemTime(new Date("2026-11-12T03:00:05Z"));
    await logError({ source: "order", action: "orders/mark-paid", message: "order 99887766aabbccddeeff failed" });

    expect(rows()).toHaveLength(1);
    expect(rows()[0].count).toBe(2);
  });

  it("keeps different faults, and different days, apart", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T03:00:00Z"));
    await logError({ source: "chat", action: "chat/webhook", message: "generation failed" });
    await logError({ source: "chat", action: "chat/webhook", message: "order lookup failed" });
    vi.setSystemTime(new Date("2026-11-13T03:00:00Z"));
    await logError({ source: "chat", action: "chat/webhook", message: "generation failed" });

    expect(rows()).toHaveLength(3);
  });

  it("counts a burst of identical errors without writing each one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T03:00:00Z"));
    for (let i = 0; i < 5; i++) {
      await logError({ source: "payment", action: "bonum/invoice", message: "Bonum timed out" });
    }
    // Written once, the other four counted on the next write.
    expect(rows()[0].count).toBe(1);
    vi.setSystemTime(new Date("2026-11-12T03:00:10Z"));
    await logError({ source: "payment", action: "bonum/invoice", message: "Bonum timed out" });
    expect(rows()[0].count).toBe(6);
  });

  it("reopens a row that was marked resolved when the fault comes back", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T03:00:00Z"));
    await logError({ source: "chat", action: "chat/reply", message: "send failed" });
    const key = [...store.keys()][0];
    store.set(key, { ...store.get(key)!, status: "resolved" });

    vi.setSystemTime(new Date("2026-11-12T03:00:10Z"));
    await logError({ source: "chat", action: "chat/reply", message: "send failed" });

    expect(rows()[0].status).toBe("open");
  });

  it("never throws, even when the log itself is broken", async () => {
    const broken = vi.spyOn(store, "set").mockImplementation(() => {
      throw new Error("disk full");
    });
    await expect(logError({ source: "system", action: "x", message: "boom" })).resolves.toBeUndefined();
    broken.mockRestore();
  });
});

describe("what never reaches the log", () => {
  it("redacts tokens, keys, bearer headers and phone numbers", () => {
    expect(redact("Bearer abc.def.ghi failed")).toBe("Bearer [redacted] failed");
    expect(redact("GET /x?access_token=EAAB123456&a=1")).toContain("access_token=[redacted]");
    expect(redact("call 99112233 back")).toBe("call ******** back");
    expect(redact(`key ${"A1b2".repeat(15)}`)).toBe("key [redacted]");
    expect(redact("order 12345 of 3")).toBe("order 12345 of 3");
  });

  it("drops secret-looking context keys and bounds the rest", () => {
    const context = sanitizeContext({
      orderId: "o1",
      token: "t",
      nested: { password: "p", ok: 1, deep: { deeper: { deepest: 1 } } },
      big: "x".repeat(2000),
    })!;

    expect(context.orderId).toBe("o1");
    expect(context.token).toBe("[redacted]");
    expect((context.nested as Record<string, unknown>).password).toBe("[redacted]");
    expect(String(context.big).length).toBeLessThanOrEqual(301);
    expect(sanitizeContext("nope")).toBeNull();
  });

  it("fingerprints the same fault identically and different faults differently", () => {
    expect(errorFingerprint("chat", "a", "failed for 123")).toBe(errorFingerprint("chat", "a", "failed for 456"));
    expect(errorFingerprint("chat", "a", "failed")).not.toBe(errorFingerprint("order", "a", "failed"));
  });
});

describe("POST /api/errorlog/report", () => {
  function call(body: unknown, headers: Record<string, string> = {}) {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      end() {
        return this;
      },
    };
    return handler({ method: "POST", body, headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers } }, res).then(() => res);
  }

  it("stores a browser report as a client-origin row", async () => {
    const res = await call({ source: "order", action: "checkout/create-order", message: "The order could not be placed", url: "/checkout" });

    expect(res.statusCode).toBe(204);
    expect(rows()[0]).toMatchObject({ source: "order", origin: "client", url: "/checkout" });
  });

  it("refuses sources the browser may not claim, and empty reports", async () => {
    expect((await call({ source: "payment", action: "x", message: "y" })).statusCode).toBe(400);
    expect((await call({ source: "bogus", action: "x", message: "y" })).statusCode).toBe(400);
    expect((await call({ source: "order", action: "", message: "y" })).statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it("limits how often one address can report", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      statuses.push((await call({ source: "storefront", action: "a", message: `m${"x".repeat(i)}` }, headers)).statusCode);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses[0]).toBe(204);
  });

  it("only accepts POST", async () => {
    const res = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, json() { return this; }, end() { return this; } };
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});
