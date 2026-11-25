import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { pruneStaleToolResults } from "./prune-stale-tool-results";

function makeToolMessage(toolCallId: string, body: string): ModelMessage {
  return {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName: "web_fetch",
        output: { type: "json", value: { status: 200, body } },
      },
    ],
  };
}

describe("pruneStaleToolResults", () => {
  test("keeps the most recent tool results verbatim and compacts older bulky outputs", () => {
    const bigBody = "A".repeat(10_000);
    const messages: ModelMessage[] = [
      { role: "user", content: "Visit the console page" },
      makeToolMessage("tc-1", bigBody),
      makeToolMessage("tc-2", bigBody),
      makeToolMessage("tc-3", bigBody),
      makeToolMessage("tc-4", bigBody),
    ];

    const pruned = pruneStaleToolResults(messages, {
      keepRecentToolResults: 2,
      maxStaleChars: 2_000,
    });

    // Older two tool results compacted
    const firstContent = pruned[1]?.content as
      | Array<Record<string, unknown>>
      | undefined;
    const firstPart = firstContent?.[0];
    const firstOutput = firstPart?.output as { type: string; value: string };
    expect(firstOutput.type).toBe("text");
    expect(firstOutput.value.length).toBeLessThan(1_500);
    expect(firstOutput.value).toContain("compacted to conserve context");

    // Recent two tool results untouched
    expect(pruned[3]).toBe(messages[3]);
    expect(pruned[4]).toBe(messages[4]);
  });

  test("preserves tool-approval-response parts untouched", () => {
    const approvalMsg: ModelMessage = {
      role: "tool",
      content: [
        {
          type: "tool-approval-response",
          approvalId: "apr-1",
          approved: true,
        },
      ],
    };
    const messages: ModelMessage[] = [
      { role: "user", content: "Run command" },
      approvalMsg,
    ];

    const pruned = pruneStaleToolResults(messages, {
      keepRecentToolResults: 0,
    });
    expect(pruned).toBe(messages);
  });
});
