import { beforeEach, describe, expect, it } from "bun:test";
import {
  clearChatStoppedByUser,
  isChatStoppedByUser,
  markChatStoppedByUser,
} from "./stop-latch";

describe("stop-latch", () => {
  beforeEach(() => {
    clearChatStoppedByUser("chat-a");
    clearChatStoppedByUser("chat-b");
  });

  it("tracks stopped state per chatId until explicitly cleared", () => {
    expect(isChatStoppedByUser("chat-a")).toBe(false);
    markChatStoppedByUser("chat-a");
    expect(isChatStoppedByUser("chat-a")).toBe(true);
    expect(isChatStoppedByUser("chat-b")).toBe(false);

    clearChatStoppedByUser("chat-a");
    expect(isChatStoppedByUser("chat-a")).toBe(false);
  });

  it("ignores empty chatIds safely", () => {
    markChatStoppedByUser("");
    expect(isChatStoppedByUser("")).toBe(false);
    clearChatStoppedByUser("");
  });
});
