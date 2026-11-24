import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { buildOlderMessagesDigest } from "./helpers";

describe("buildOlderMessagesDigest", () => {
  test("preserves both initial goal (head) and most recent older messages (tail) when over cap", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: "Initial goal: refactor auth middleware and compaction.",
      },
    ];

    for (let i = 1; i <= 140; i++) {
      messages.push({
        role: "assistant",
        content: `Step ${i}: ${i >= 130 ? `CRITICAL RECENT FINDING #${i}` : "routine exploration ".repeat(18)}`,
      });
    }

    const digest = buildOlderMessagesDigest(messages);

    expect(digest.length).toBeLessThanOrEqual(28_000);
    expect(digest).toContain(
      "Initial goal: refactor auth middleware and compaction.",
    );
    expect(digest).toContain("middle message(s) omitted due to digest cap");
    expect(digest).toContain("CRITICAL RECENT FINDING #130");
    expect(digest).toContain("CRITICAL RECENT FINDING #140");
  });
});
