import { describe, expect, test } from "bun:test";
import { SUBAGENT_REGISTRY } from "../../subagents/registry";
import {
  TeamBoard,
  clearTeamBoard,
  formatTeamContextSummary,
  getOrCreateTeamBoard,
  rebuildTeamBoardFromMessages,
} from "../team-board";

describe("TeamBoard & subagent coordination", () => {
  test("posts entries, manages task lifecycle, and filters queries", () => {
    const board = new TeamBoard("team_alpha");

    board.upsertTasks(
      [
        { id: "T1", title: "Inspect auth boundary", assignedRole: "explorer" },
        {
          id: "T2",
          title: "Ship callback handler",
          assignedRole: "executor",
          dependsOn: ["T1"],
        },
      ],
      "architect",
    );

    board.updateTaskStatus("T1", "completed", "explorer", "Mapped config.ts");

    board.postEntry({
      kind: "finding",
      authorRole: "explorer",
      targetRole: "executor",
      title: "OAuth route found",
      content: "Callback lives in app/api/auth/[...all]/route.ts",
      files: ["apps/web/lib/auth/config.ts"],
    });

    board.postEntry({
      kind: "decision",
      authorRole: "architect",
      targetRole: "all",
      title: "Use HKDF key derivation",
      content: "Derive AES-256-GCM key via HKDF from BETTER_AUTH_SECRET.",
    });

    const snap = board.snapshot();
    expect(snap.tasks).toHaveLength(2);
    expect(snap.tasks[0]?.status).toBe("completed");
    expect(snap.tasks[0]?.notes).toBe("Mapped config.ts");

    const executorInbox = board.listEntries({ targetRole: "executor" });
    expect(executorInbox).toHaveLength(2);

    const summary = formatTeamContextSummary(board);
    expect(summary).toContain("## Shared Team Board Snapshot");
    expect(summary).toContain("[completed] `T1` (explorer)");
    expect(summary).toContain("OAuth route found");
  });

  test("rebuildTeamBoardFromMessages reconstructs entries and tasks across team_board and task parts", () => {
    const teamId = `team_replay_${Date.now()}`;
    clearTeamBoard(teamId);

    const messages = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolName: "team_board",
            output: {
              type: "json",
              value: {
                teamSnapshot: {
                  teamId,
                  entries: [
                    {
                      id: "tb_1",
                      kind: "decision",
                      authorRole: "architect",
                      title: "Split API and UI",
                      content: "Keep encryption helper isolated.",
                      createdAt: 100,
                    },
                  ],
                  tasks: [
                    {
                      id: "T-1",
                      title: "Write encryption module",
                      assignedRole: "executor",
                      status: "in_progress",
                      updatedBy: "architect",
                      updatedAt: 100,
                    },
                  ],
                },
              },
            },
          },
          {
            type: "tool-result",
            toolName: "task",
            output: {
              teamSnapshot: {
                teamId,
                entries: [
                  {
                    id: "tb_2",
                    kind: "handoff",
                    authorRole: "executor",
                    targetRole: "reviewer",
                    title: "Ready for audit",
                    content: "Implemented HKDF + AES-GCM helpers.",
                    createdAt: 200,
                  },
                ],
                tasks: [
                  {
                    id: "T-1",
                    title: "Write encryption module",
                    assignedRole: "executor",
                    status: "completed",
                    updatedBy: "executor",
                    updatedAt: 200,
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    const rebuilt = rebuildTeamBoardFromMessages(messages, teamId);
    const snap = rebuilt.snapshot();
    expect(snap.entries.map((e) => e.id)).toEqual(["tb_1", "tb_2"]);
    expect(snap.tasks[0]?.status).toBe("completed");
    expect(getOrCreateTeamBoard(teamId)).toBe(rebuilt);
    clearTeamBoard(teamId);
  });

  test("SUBAGENT_REGISTRY registers architect alongside specialist teammates", () => {
    expect(Object.keys(SUBAGENT_REGISTRY)).toEqual(
      expect.arrayContaining([
        "architect",
        "explorer",
        "executor",
        "reviewer",
        "design",
      ]),
    );
  });
});
