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
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(isLiveStatus("completed")).toBe(false);
    expect(deriveAgentHubRoster(null)).toEqual([]);
    expect(deriveAgentHubRoster([{ role: "assistant" }, null])).toEqual([]);
  });
});

describe("deriveTeamFeed", () => {
  test("reconstructs chronological entries, task files, verification, and conflicts", () => {
    const feed = deriveTeamFeed(msgs);
    expect(feed.entries.map((e) => e.id)).toEqual(["tb_a1", "tb_a2"]);
    expect(feed.entries[0]?.files).toEqual(["packages/agent/tools/team.ts"]);
    expect(feed.tasks).toHaveLength(1);
    expect(feed.tasks[0]?.status).toBe("completed");
    expect(feed.tasks[0]?.updatedBy).toBe("executor");
    expect(feed.fileConflicts).toEqual([]);

    const conflictFeed = deriveTeamFeed([
      {
        id: "a2",
        role: "assistant",
        parts: [
          {
            type: "tool-team_board",
            toolCallId: "tb_c",
            state: "output-available",
            output: {
              teamSnapshot: {
                teamId: "s2",
                entries: [],
                tasks: [
                  {
                    id: "T1",
                    title: "Edit feed",
                    assignedRole: "executor",
                    status: "in_progress",
                    files: ["apps/web/components/chat/chat-message-feed.tsx"],
                    updatedBy: "architect",
                    updatedAt: 1,
                  },
                  {
                    id: "T2",
                    title: "Style feed",
                    assignedRole: "design",
                    status: "open",
                    files: ["./apps/web/components/chat/chat-message-feed.tsx"],
                    verification: "pnpm check",
                    updatedBy: "architect",
                    updatedAt: 2,
                  },
                ],
              },
            },
          },
        ],
      },
    ]);

    expect(conflictFeed.tasks[1]?.verification).toBe("pnpm check");
    expect(conflictFeed.fileConflicts).toEqual([
      {
        file: "apps/web/components/chat/chat-message-feed.tsx",
        roles: ["executor", "design"],
        taskIds: ["T1", "T2"],
      },
    ]);
  });

  test("handles empty and invalid inputs gracefully", () => {
    expect(deriveTeamFeed(null)).toEqual({
      entries: [],
      tasks: [],
      waves: [],
      fileConflicts: [],
    });
    expect(deriveTeamFeed([])).toEqual({
      entries: [],
      tasks: [],
      waves: [],
      fileConflicts: [],
    });
  });

  test("preserves debate/challenge/verification kinds, mentions, parked status, and worktreeBranch", () => {
    const feed = deriveTeamFeed([
      {
        id: "msg_team_1",
        role: "assistant",
        parts: [
          {
            type: "tool-task",
            toolCallId: "tc_exec_1",
            state: "output-available",
            input: { subagentType: "executor", task: "Implement /team pane" },
            output: {
              worktreeBranch: "team/executor-tc_exec_",
              teamSnapshot: {
                teamId: "sess_wt",
                entries: [
                  {
                    id: "e_ch",
                    kind: "challenge",
                    authorRole: "reviewer",
                    targetRole: "executor",
                    title: "Validate mobile drawer fallback",
                    content:
                      "Please coordinate with @design on <1024px layout.",
                    mentions: ["executor", "design"],
                    createdAt: 10,
                  },
                  {
                    id: "e_db",
                    kind: "debate",
                    authorRole: "executor",
                    targetRole: "reviewer",
                    title: "Sheet vs docked rail boundary",
                    content:
                      "Keep 1024px boundary aligned with SessionLayoutShell.",
                    mentions: ["reviewer"],
                    createdAt: 20,
                  },
                  {
                    id: "e_vr",
                    kind: "verification",
                    authorRole: "reviewer",
                    targetRole: "all",
                    title: "Verified clean render",
                    content: "Checked 375px and 1440px widths.",
                    createdAt: 30,
                  },
                ],
                tasks: [
                  {
                    id: "T1",
                    title: "Deferred animation polish",
                    assignedRole: "design",
                    status: "parked",
                    files: ["apps/web/components/agent-hub/team-pane.tsx"],
                    updatedBy: "architect",
                    updatedAt: 10,
                  },
                  {
                    id: "T2",
                    title: "Implement docked /team pane",
                    assignedRole: "executor",
                    status: "in_progress",
                    dependsOn: ["T1"],
                    files: ["apps/web/components/agent-hub/team-pane.tsx"],
                    worktreeBranch: "team/executor-tc_exec_",
                    updatedBy: "executor",
                    updatedAt: 20,
                  },
                ],
              },
            },
          },
        ],
      },
    ]);

    expect(feed.entries.map((e) => e.kind)).toEqual([
      "challenge",
      "debate",
      "verification",
    ]);
    expect(feed.entries[0]?.mentions).toEqual(["executor", "design"]);
    expect(feed.fileConflicts).toEqual([]);
    expect(feed.waves).toEqual([
      { wave: 1, taskIds: ["T1"], status: "completed" },
      { wave: 2, taskIds: ["T2"], status: "active" },
    ]);
    expect(feed.tasks[1]?.worktreeBranch).toBe("team/executor-tc_exec_");

    const roster = deriveAgentHubRoster([
      {
        id: "msg_team_1",
        role: "assistant",
        parts: [
          {
            type: "tool-task",
            toolCallId: "tc_exec_1",
            state: "output-available",
            input: { subagentType: "executor", task: "Implement /team pane" },
            output: { worktreeBranch: "team/executor-tc_exec_" },
          },
        ],
      },
    ]);
    expect(roster[0]?.worktreeBranch).toBe("team/executor-tc_exec_");
  });
});
