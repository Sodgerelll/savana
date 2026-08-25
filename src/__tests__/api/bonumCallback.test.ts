import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bonumCallbackUrl } from "../../../api/bonum/_client";

const VARS = ["BONUM_CALLBACK_BASE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("bonumCallbackUrl", () => {
  it("prefers the address the deployment was told to use", () => {
    process.env.BONUM_CALLBACK_BASE_URL = "https://savana.mn";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "prod.vercel.app";

    expect(bonumCallbackUrl()).toBe("https://savana.mn/api/bonum/webhook");
  });

  it("uses the stable production address over the deployment's own", () => {
    // VERCEL_URL changes with every deploy, so an invoice raised today aimed
    // its callback at today's build — a payment arriving with nobody listening
    // looks exactly like a payment that never happened.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "savana-gamma.vercel.app";
    process.env.VERCEL_URL = "savana-9f3ab21-team.vercel.app";

    expect(bonumCallbackUrl()).toBe("https://savana-gamma.vercel.app/api/bonum/webhook");
  });

  it("falls back to the deployment address when there is nothing better", () => {
    process.env.VERCEL_URL = "savana-9f3ab21-team.vercel.app";

    expect(bonumCallbackUrl()).toBe("https://savana-9f3ab21-team.vercel.app/api/bonum/webhook");
  });

  it("trims a trailing slash rather than doubling it", () => {
    process.env.BONUM_CALLBACK_BASE_URL = "https://savana.mn/";

    expect(bonumCallbackUrl()).toBe("https://savana.mn/api/bonum/webhook");
  });

  it("points at localhost when nothing is configured at all", () => {
    expect(bonumCallbackUrl()).toBe("http://localhost:3000/api/bonum/webhook");
  });
});
