import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null } }));

import { forgetPushOnServer } from "../../lib/pushNotifications";

function stubBrowser(serviceWorker: Record<string, unknown>) {
  vi.stubGlobal("window", { setTimeout, clearTimeout, PushManager: class {}, Notification: class {} });
  vi.stubGlobal("navigator", { serviceWorker });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("forgetPushOnServer", () => {
  it("does not hold up signing out when no service worker is registered", async () => {
    // `navigator.serviceWorker.ready` never settles here; the old code awaited it forever.
    stubBrowser({ ready: new Promise(() => {}), getRegistration: async () => undefined });

    await expect(forgetPushOnServer()).resolves.toBeUndefined();
  });

  it("gives up after a few seconds when the worker never answers", async () => {
    vi.useFakeTimers();
    stubBrowser({ getRegistration: () => new Promise(() => {}) });

    const done = forgetPushOnServer();
    await vi.advanceTimersByTimeAsync(3000);

    await expect(done).resolves.toBeUndefined();
  });
});
