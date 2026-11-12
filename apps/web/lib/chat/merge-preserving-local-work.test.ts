import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { mergePreservingLocalWork } from "./merge-preserving-local-work";

describe("mergePreservingLocalWork", () => {
  test("returns empty array when both inputs are empty", () => {
    expect(mergePreservingLocalWork([], [])).toEqual([]);
    expect(mergePreservingLocalWork(null, null)).toEqual([]);
  });

  test("preserves local messages when server messages are empty", () => {
    const localUserMsg: WebAgentUIMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "Hello AI" }],
    };
    expect(mergePreservingLocalWork([], [localUserMsg])).toEqual([
      localUserMsg,
    ]);
  });

  test("never drops recent local user prompt when server returns stale snapshot", () => {
    const serverMsgs: WebAgentUIMessage[] = [
      {
        id: "u0",
        role: "user",
        parts: [{ type: "text", text: "First prompt" }],
      },
      {
        id: "a0",
        role: "assistant",
        parts: [{ type: "text", text: "First response" }],
      },
    ];

    const localMsgs: WebAgentUIMessage[] = [
      ...serverMsgs,
      {
        id: "u1-failed-to-reach-server",
        role: "user",
        parts: [{ type: "text", text: "Second prompt that hit error" }],
      },
    ];

    const merged = mergePreservingLocalWork(serverMsgs, localMsgs);
    expect(merged.length).toBe(3);
    expect(merged[2]?.id).toBe("u1-failed-to-reach-server");
    expect(merged[2]?.parts[0]).toEqual({
      type: "text",
      text: "Second prompt that hit error",
    });
  });

  test("merges in-flight streaming parts without losing local work", () => {
    const serverMsgs: WebAgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
      },
    ];

    const localMsgs: WebAgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Hello world, extra streamed content" }],
      },
    ];

    const merged = mergePreservingLocalWork(serverMsgs, localMsgs);
    expect(merged.length).toBe(1);
    expect(merged[0]?.id).toBe("a1");
    // Should have both parts merged/deduped
    const texts = merged[0]?.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text);
    expect(texts).toContain("Hello world, extra streamed content");
  });

  test("preserves local assistant tool call output when server errored", () => {
    const serverMsgs: WebAgentUIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Run ls" }],
      },
    ];

    const localMsgs: WebAgentUIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Run ls" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool" as const,
            toolName: "task",
            state: "output-available" as const,
            toolCallId: "call_123",
            input: { command: "ls" },
            output: { summary: "file1.txt\nfile2.txt" },
          },
        ],
      },
    ];

    const merged = mergePreservingLocalWork(serverMsgs, localMsgs);
    expect(merged.length).toBe(2);
    expect(merged[1]?.id).toBe("a1");
    expect(merged[1]?.parts.length).toBe(1);
  });
});
