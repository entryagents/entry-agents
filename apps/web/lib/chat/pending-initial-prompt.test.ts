import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  consumePendingInitialPrompt,
  savePendingInitialPrompt,
} from "./pending-initial-prompt";

describe("pending-initial-prompt", () => {
  const store = new Map<string, string>();
  const originalWindow = globalThis.window;

  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { window: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  test("saves and consumes once, returning null on second consume", () => {
    savePendingInitialPrompt("chat_123", {
      payload: { text: "Build a landing page" },
      displayText: "Build a landing page",
    });

    const first = consumePendingInitialPrompt("chat_123");
    expect(first).not.toBeNull();
    expect(first?.displayText).toBe("Build a landing page");

    const second = consumePendingInitialPrompt("chat_123");
    expect(second).toBeNull();
  });
});
