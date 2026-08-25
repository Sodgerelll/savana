import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
}));

import { deserializeChatSettings } from "../../lib/chat/chatSettings";
import { DEFAULT_CHAT_SETTINGS } from "../../lib/chat/types";

describe("deserializeChatSettings", () => {
  it("returns the full defaults when the document does not exist", () => {
    expect(deserializeChatSettings(undefined)).toEqual(DEFAULT_CHAT_SETTINGS);
  });

  it("returns the full defaults for an empty document", () => {
    expect(deserializeChatSettings({})).toEqual(DEFAULT_CHAT_SETTINGS);
  });

  it("keeps stored values and fills only the missing ones", () => {
    const result = deserializeChatSettings({
      isActive: true,
      botName: "Савана бот",
      facebook: { pageId: "12345" },
    });

    expect(result.isActive).toBe(true);
    expect(result.botName).toBe("Савана бот");
    // Untouched fields fall back rather than becoming undefined.
    expect(result.welcomeMessage).toBe(DEFAULT_CHAT_SETTINGS.welcomeMessage);
    expect(result.widget.primaryColor).toBe(DEFAULT_CHAT_SETTINGS.widget.primaryColor);
    expect(result.widget.position).toBe(DEFAULT_CHAT_SETTINGS.widget.position);
  });

  it("lets the site widget follow the master switch when it was never saved", () => {
    // The settings page shipped without a widget switch, so every document it
    // wrote carries no `widget` key. Reading that as "off" left the storefront
    // bubble dark with nothing in the admin able to light it, while the owner
    // had already switched the bot on and reasonably expected one bot.
    expect(deserializeChatSettings({ isActive: true }).widget.isActive).toBe(true);
    expect(deserializeChatSettings({ isActive: false }).widget.isActive).toBe(false);
  });

  it("obeys a widget switch that was saved on purpose", () => {
    const off = deserializeChatSettings({ isActive: true, widget: { isActive: false } });
    expect(off.widget.isActive).toBe(false);
  });

  it("leaves a stored Facebook block out of the browser's copy entirely", () => {
    // Credentials moved to the server environment. A document written by an
    // older build may still hold a page token, and nothing in the admin bundle
    // should be able to read, render or re-save it.
    const result = deserializeChatSettings({
      facebook: { pageId: "12345", pageAccessToken: "EAAG-secret" },
    });

    expect(result).not.toHaveProperty("facebook");
    expect(JSON.stringify(result)).not.toContain("EAAG-secret");
  });

  it("ignores fields stored with the wrong type", () => {
    const result = deserializeChatSettings({
      isActive: "yes",
      handoverThreshold: "many",
      temperature: null,
      botName: 42,
    });

    expect(result.isActive).toBe(DEFAULT_CHAT_SETTINGS.isActive);
    expect(result.handoverThreshold).toBe(DEFAULT_CHAT_SETTINGS.handoverThreshold);
    expect(result.temperature).toBe(DEFAULT_CHAT_SETTINGS.temperature);
    expect(result.botName).toBe(DEFAULT_CHAT_SETTINGS.botName);
  });

  it("drops non-string entries from knowledgePoints", () => {
    const result = deserializeChatSettings({
      knowledgePoints: ["Хүргэлт 8000₮", 5, null, "Ажлын цаг 10:00-19:00"],
    });

    expect(result.knowledgePoints).toEqual(["Хүргэлт 8000₮", "Ажлын цаг 10:00-19:00"]);
  });

  it("falls back to an empty knowledge list when the field is not an array", () => {
    expect(deserializeChatSettings({ knowledgePoints: "Хүргэлт 8000₮" }).knowledgePoints).toEqual([]);
  });

  it("accepts bottom-left but rejects any other widget position", () => {
    expect(deserializeChatSettings({ widget: { position: "bottom-left" } }).widget.position).toBe(
      "bottom-left",
    );
    expect(deserializeChatSettings({ widget: { position: "top-middle" } }).widget.position).toBe(
      "bottom-right",
    );
  });

  it("survives nested objects stored as the wrong type", () => {
    const result = deserializeChatSettings({ facebook: "not-an-object", widget: 7 });

    expect(result.widget).toEqual(DEFAULT_CHAT_SETTINGS.widget);
  });

  it("reads a Firestore Timestamp updatedAt as an ISO string", () => {
    const result = deserializeChatSettings({
      updatedAt: { toDate: () => new Date("2026-08-15T10:00:00.000Z") },
    });

    expect(result.updatedAt).toBe("2026-08-15T10:00:00.000Z");
  });

  it("passes an already-serialized updatedAt through unchanged", () => {
    expect(deserializeChatSettings({ updatedAt: "2026-08-15T10:00:00.000Z" }).updatedAt).toBe(
      "2026-08-15T10:00:00.000Z",
    );
  });

  it("reports a pending serverTimestamp as null instead of crashing", () => {
    expect(deserializeChatSettings({ updatedAt: null }).updatedAt).toBeNull();
  });

  it("keeps the bot disabled by default so it cannot answer before it is configured", () => {
    expect(DEFAULT_CHAT_SETTINGS.isActive).toBe(false);
    expect(DEFAULT_CHAT_SETTINGS.widget.isActive).toBe(false);
  });
});

describe("deserializeChatSettings — buttons", () => {
  it("starts with the shop's default menu and welcome buttons", () => {
    const result = deserializeChatSettings({});

    expect(result.menuButtons.map((b) => b.action)).toEqual([
      "SHOW_PRODUCTS",
      "SHOW_PROMOTIONS",
      "TRANSFER_TO_STAFF",
      "RESUME_BOT",
    ]);
    expect(result.quickReplies).toHaveLength(3);
  });

  it("keeps the buttons the shop configured", () => {
    const result = deserializeChatSettings({
      menuButtons: [{ title: "Саван 🧼", action: "SHOW_PRODUCTS" }],
    });

    expect(result.menuButtons).toEqual([{ title: "Саван 🧼", action: "SHOW_PRODUCTS" }]);
  });

  it("drops a button the webhook would not recognise", () => {
    // Each action runs a tool. A button carrying anything else does nothing at
    // all when a customer presses it, which is worse than not being there.
    const result = deserializeChatSettings({
      menuButtons: [
        { title: "Сайн", action: "SHOW_PRODUCTS" },
        { title: "Муу", action: "LAUNCH_ROCKET" },
        { title: "", action: "SHOW_PROMOTIONS" },
      ],
    });

    expect(result.menuButtons).toEqual([{ title: "Сайн", action: "SHOW_PRODUCTS" }]);
  });

  it("falls back to the defaults rather than showing an empty menu", () => {
    // Deleting every button is a mistake, not an instruction.
    expect(deserializeChatSettings({ menuButtons: [] }).menuButtons.length).toBeGreaterThan(0);
    expect(deserializeChatSettings({ quickReplies: "nonsense" }).quickReplies.length).toBeGreaterThan(0);
  });

  it("trims a title padded with spaces", () => {
    const result = deserializeChatSettings({
      quickReplies: [{ title: "  Хямдрал  ", action: "SHOW_PROMOTIONS" }],
    });

    expect(result.quickReplies[0].title).toBe("Хямдрал");
  });
});
