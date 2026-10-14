import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) },
}));

import {
  newOrderPayload,
  notifyAdmins,
  notifyNewOrder,
  notifyOrderPaid,
  paidOrderPayload,
  parsePushSubscription,
  subscriptionId,
} from "../../../api/_lib/pushNotify";

const order = {
  orderNumber: "ORD-261014-ABC123",
  items: [{ quantity: 2 }, { quantity: 1 }],
  totals: { grandTotal: 45000 },
  customer: { fullName: "Бат", phoneNumber: "99112233" },
  address: { streetAddress: "Хан-Уул 1-р хороо" },
};

function sub(id: string, uid: string) {
  return {
    uid,
    endpoint: `https://push.example/${id}`,
    keys: { p256dh: `p-${id}`, auth: `a-${id}` },
  };
}

/** A tiny Admin SDK stand-in: subscriptions, user roles and orders in memory. */
function fakeDb(opts: { subs?: Record<string, ReturnType<typeof sub>>; roles?: Record<string, string>; orders?: Record<string, unknown> }) {
  const subs = { ...(opts.subs ?? {}) };
  const deleted: string[] = [];

  return {
    deleted,
    subs,
    collection: (name: string) => ({
      get: async () => ({
        docs: Object.entries(subs).map(([id, data]) => ({
          id,
          data: () => data,
          ref: { delete: async () => { deleted.push(id); delete subs[id]; } },
        })),
      }),
      doc: (id: string) => ({
        get: async () => {
          if (name === "users") {
            const role = opts.roles?.[id];
            return { exists: role != null, data: () => ({ role }) };
          }
          if (name === "orders") {
            const data = (opts.orders ?? {})[id];
            return { exists: data != null, data: () => data };
          }
          return { exists: false, data: () => undefined };
        },
        delete: async () => { deleted.push(id); delete subs[id]; },
      }),
    }),
  };
}

const configured = () => {
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
};

describe("push payloads", () => {
  it("names the order, quantity and total — and nothing about the buyer", () => {
    const payload = newOrderPayload("o1", order);
    expect(payload.body).toBe("ORD-261014-ABC123 · 3 ширхэг · 45,000₮");
    expect(JSON.stringify(payload)).not.toMatch(/Бат|99112233|Хан-Уул/);
  });

  it("gives placed and paid the same tag so one replaces the other", () => {
    expect(paidOrderPayload("o1", order).tag).toBe(newOrderPayload("o1", order).tag);
    expect(paidOrderPayload("o1", order).title).not.toBe(newOrderPayload("o1", order).title);
  });
});

describe("parsePushSubscription", () => {
  it("accepts what a browser produces", () => {
    expect(parsePushSubscription(sub("1", "u"))).toEqual({
      endpoint: "https://push.example/1",
      keys: { p256dh: "p-1", auth: "a-1" },
    });
  });

  it.each([null, {}, { endpoint: "http://insecure", keys: { p256dh: "a", auth: "b" } }, { endpoint: "https://x", keys: {} }])(
    "rejects %j",
    (value) => expect(parsePushSubscription(value)).toBeNull(),
  );

  it("derives a stable id from the endpoint", () => {
    expect(subscriptionId("https://a")).toBe(subscriptionId("https://a"));
    expect(subscriptionId("https://a")).not.toBe(subscriptionId("https://b"));
  });
});

describe("notifyAdmins", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({});
    configured();
  });
  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  const payload = newOrderPayload("o1", order);

  it("does nothing without VAPID keys, and never touches Firestore", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const db = { collection: () => { throw new Error("must not be called"); } };
    expect(await notifyAdmins(db, payload)).toBe(0);
    await expect(notifyNewOrder(db, "o1")).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every admin device", async () => {
    const db = fakeDb({ subs: { a: sub("a", "u1"), b: sub("b", "u2") }, roles: { u1: "admin", u2: "sysadmin" } });
    expect(await notifyAdmins(db, payload)).toBe(2);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1] as string)).toMatchObject({ tag: "order-o1", url: "/account/orders" });
  });

  it("drops devices whose owner is no longer an admin", async () => {
    const db = fakeDb({
      subs: { a: sub("a", "u1"), b: sub("b", "u2"), c: sub("c", "gone") },
      roles: { u1: "admin", u2: "customer" },
    });
    expect(await notifyAdmins(db, payload)).toBe(1);
    expect(db.deleted.sort()).toEqual(["b", "c"]);
  });

  it("forgets a device the push service says is gone, and keeps one that merely failed", async () => {
    sendNotification
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { statusCode: 503 }));
    const db = fakeDb({ subs: { a: sub("a", "u1"), b: sub("b", "u1") }, roles: { u1: "admin" } });
    expect(await notifyAdmins(db, payload)).toBe(0);
    expect(db.deleted).toEqual(["a"]);
  });

  it("never throws into the payment path", async () => {
    const db = { collection: () => { throw new Error("firestore down"); } };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyAdmins(db, payload)).resolves.toBe(0);
    await expect(notifyOrderPaid(db, "o1")).resolves.toBeUndefined();
    quiet.mockRestore();
  });

  it("builds the notification from the stored order", async () => {
    const db = fakeDb({ subs: { a: sub("a", "u1") }, roles: { u1: "admin" }, orders: { o1: order } });
    await notifyOrderPaid(db, "o1");
    expect(JSON.parse(sendNotification.mock.calls[0][1] as string).title).toBe("✅ Захиалгын төлбөр төлөгдлөө");
  });
});
