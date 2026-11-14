import { describe, expect, test } from "bun:test";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
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
      {
        type: "tool-task",
        toolCallId: "c4",
        state: "output-available",
        input: { subagentType: "architect", task: "Plan plugins" },
        output: {
          teamSnapshot: {
            teamId: "sess_1",
            entries: [
              {
                id: "tb_a1",
                kind: "decision",
                authorRole: "architect",
                title: "Use flat schema",
                content: "Avoid discriminated unions.",
                files: ["packages/agent/tools/team.ts"],
                createdAt: 150,
              },
            ],
            tasks: [
              {
                id: "T-1",
                title: "Wire TeamBoard",
                assignedRole: "executor",
                status: "in_progress",
                updatedBy: "architect",
                updatedAt: 150,
              },
            ],
          },
        },
      },
      {
        type: "tool-team_board",
        toolCallId: "tb_call_1",
        state: "output-available",
        input: { action: "update_task", taskId: "T-1", status: "completed" },
        output: {
          action: "update_task",
          teamSnapshot: {
            teamId: "sess_1",
            entries: [
              {
                id: "tb_a2",
                kind: "handoff",
                authorRole: "executor",
                targetRole: "reviewer",
                title: "Ready for review",
                content: "Tests written.",
                createdAt: 250,
              },
            ],
            tasks: [
              {
                id: "T-1",
                title: "Wire TeamBoard",
                assignedRole: "executor",
                status: "completed",
                updatedBy: "executor",
                updatedAt: 250,
              },
            ],
          },
        },
      },
    ],
  },
];

describe("deriveAgentHubRoster", () => {
  test("derives status, metrics, architect type, and current tool", () => {
    const roster = deriveAgentHubRoster(msgs);
    expect(roster.map((r) => r.status)).toEqual([
      "running",
      "completed",
      "failed",
      "completed",
    ]);
    expect(roster[0]?.pending?.name).toBe("grep");
    expect(roster[0]?.inputTokens).toBe(1200);
    expect(roster[2]?.errorText).toBe("boom");
    expect(roster[2]?.inputTokens).toBeNull();
    expect(roster[3]?.subagentType).toBe("architect");
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
      total: 4,
      live: 1,
      inputTokens: 1700,
      outputTokens: 100,
    });
    expect(isLiveStatus("completed")).toBe(false);
    expect(deriveAgentHubRoster(null)).toEqual([]);
    expect(deriveAgentHubRoster([{ role: "assistant" }, null])).toEqual([]);
  });
});

describe("deriveTeamFeed", () => {
  test("reconstructs chronological entries and latest task states from team_board and task parts", () => {
    const feed = deriveTeamFeed(msgs);
    expect(feed.entries.map((e) => e.id)).toEqual(["tb_a1", "tb_a2"]);
    expect(feed.entries[0]?.files).toEqual(["packages/agent/tools/team.ts"]);
    expect(feed.tasks).toHaveLength(1);
    expect(feed.tasks[0]?.status).toBe("completed");
    expect(feed.tasks[0]?.updatedBy).toBe("executor");
  });

  test("handles empty and invalid inputs gracefully", () => {
    expect(deriveTeamFeed(null)).toEqual({ entries: [], tasks: [] });
    expect(deriveTeamFeed([])).toEqual({ entries: [], tasks: [] });
  });
});
