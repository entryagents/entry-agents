import { describe, expect, test } from "bun:test";
import {
  deriveAgentHubRoster,
  isLiveStatus,
  summarizeAgentHub,
} from "./derive-roster";

const msgs = [
  { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
  {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "text", text: "working" },
      {
        type: "tool-task",
        toolCallId: "c1",
        state: "output-available",
        preliminary: true,
        input: { subagentType: "explorer", task: "Find auth code" },
        output: {
          modelId: "m1",
          startedAt: 1000,
          toolCallCount: 3,
          pending: { name: "grep", input: { pattern: "auth" } },
          usage: { inputTokens: 1200, outputTokens: 80 },
        },
      },
      {
        type: "tool-task",
        toolCallId: "c2",
        state: "output-available",
        input: { subagentType: "executor", task: "Fix bug" },
        output: { depth: 1, usage: { inputTokens: 500, outputTokens: 20 } },
      },
      {
        type: "tool-task",
        toolCallId: "c3",
        state: "output-error",
        errorText: "boom",
        input: { subagentType: "reviewer", task: "Review" },
      },
    ],
  },
];

describe("deriveAgentHubRoster", () => {
  test("derives status, metrics and current tool", () => {
    const roster = deriveAgentHubRoster(msgs);
    expect(roster.map((r) => r.status)).toEqual([
      "running",
      "completed",
      "failed",
    ]);
    expect(roster[0]?.pending?.name).toBe("grep");
    expect(roster[0]?.inputTokens).toBe(1200);
    expect(roster[2]?.errorText).toBe("boom");
    expect(roster[2]?.inputTokens).toBeNull();
  });

  test("lineage links depth-1 entries to the preceding depth-0 entry", () => {
    const roster = deriveAgentHubRoster(msgs);
    expect(roster[1]?.parentId).toBe("c1");
    expect(roster[0]?.parentId).toBeNull();
  });

  test("totals and live counting; tolerates garbage input", () => {
    const roster = deriveAgentHubRoster(msgs);
    const totals = summarizeAgentHub(roster);
    expect(totals).toEqual({
      total: 3,
      live: 1,
      inputTokens: 1700,
      outputTokens: 100,
    });
    expect(isLiveStatus("completed")).toBe(false);
    expect(deriveAgentHubRoster(null)).toEqual([]);
    expect(deriveAgentHubRoster([{ role: "assistant" }, null])).toEqual([]);
  });
});
