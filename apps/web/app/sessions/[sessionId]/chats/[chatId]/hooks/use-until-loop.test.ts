import { afterEach, describe, expect, test } from "bun:test";
import type { UntilState } from "@/lib/until/types";
import {
  readStoredUntilState,
  resolveUntilForChat,
  writeStoredUntilState,
} from "./use-until-loop";

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;

function installMemoryStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: {},
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return store;
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  });
});

describe("useUntilLoop chat-scoped state isolation", () => {
  const armedState: UntilState = {
    check: "pnpm test",
    round: 1,
    rounds: 5,
    phase: "armed",
  };

  test("resolveUntilForChat never exposes chat A's state while viewing chat B", () => {
    const entry = { chatId: "chat-a", state: armedState };
    expect(resolveUntilForChat(entry, "chat-a")).toEqual(armedState);
    expect(resolveUntilForChat(entry, "chat-b")).toBeNull();
  });

  test("writeStoredUntilState scopes writes strictly to entry.chatId and preserves isolation across chats", () => {
    const store = installMemoryStorage();

    writeStoredUntilState({ chatId: "chat-a", state: armedState });
    expect(readStoredUntilState("chat-a")).toEqual(armedState);
    expect(readStoredUntilState("chat-b")).toBeNull();
    expect(store.has("entry:until:chat-b")).toBe(false);

    writeStoredUntilState({ chatId: "chat-a", state: null });
    expect(readStoredUntilState("chat-a")).toBeNull();
  });
});
