import { describe, expect, test } from "bun:test";
import { SUBAGENT_REGISTRY } from "../../subagents/registry";
import {
  TeamBoard,
  clearTeamBoard,
  findFileOwnershipConflicts,
  formatTeamContextSummary,
  getOrCreateTeamBoard,
  rebuildTeamBoardFromMessages,
} from "../team-board";

describe("TeamBoard & subagent coordination", () => {
  test("posts entries, manages task lifecycle, and filters queries", () => {
    const board = new TeamBoard("team_alpha");

    board.upsertTasks(
      [
        {
          id: "T1",
          title: "Inspect auth boundary",
          assignedRole: "explorer",
          files: ["./apps/web/lib/auth/config.ts"],
        },
        {
          id: "T2",
          title: "Ship callback handler",
          assignedRole: "executor",
          dependsOn: ["T1"],
          files: ["apps/web/app/api/auth/[...all]/route.ts"],
        },
      ],
      "architect",
    );

    board.updateTaskStatus("T1", "completed", "explorer", {
      notes: "Mapped config.ts",
      verification: "bun test lib/auth/config.test.ts (pass)",
    });

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
    expect(snap.tasks[0]?.verification).toBe(
      "bun test lib/auth/config.test.ts (pass)",
    );
    expect(snap.tasks[0]?.files).toEqual(["apps/web/lib/auth/config.ts"]);
    expect(snap.fileConflicts).toBeUndefined();

    const executorInbox = board.listEntries({ targetRole: "executor" });
    expect(executorInbox).toHaveLength(2);

    const summary = formatTeamContextSummary(board);
    expect(summary).toContain("## Shared Team Board Snapshot");
    expect(summary).toContain("[completed] `T1` (explorer)");
    expect(summary).toContain(
      "verified: bun test lib/auth/config.test.ts (pass)",
    );
    expect(summary).toContain("OAuth route found");
  });

  test("detects active file ownership conflicts while ignoring completed tasks", () => {
    const board = new TeamBoard("team_conflict");
    board.upsertTasks(
      [
        {
          id: "T1",
          title: "Refactor composer",
          assignedRole: "executor",
          status: "in_progress",
          files: ["./apps/web/components/composer.tsx", "apps/web/lib/a.ts"],
        },
        {
          id: "T2",
          title: "Restyle composer",
          assignedRole: "design",
          status: "open",
          files: ["apps/web/components/composer.tsx", "apps/web/lib/b.ts"],
        },
        {
          id: "T3",
          title: "Read composer",
          assignedRole: "explorer",
          status: "completed",
          files: ["apps/web/components/composer.tsx"],
        },
      ],
      "architect",
    );

    const conflicts = findFileOwnershipConflicts(board.listTasks());
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      file: "apps/web/components/composer.tsx",
      roles: ["executor", "design"],
      taskIds: ["T1", "T2"],
    });

    const snap = board.snapshot();
    expect(snap.fileConflicts).toEqual(conflicts);
    expect(formatTeamContextSummary(board)).toContain(
      "### File Ownership Warnings",
    );
  });

  test("rebuildTeamBoardFromMessages reconstructs entries, tasks, files, and verification", () => {
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
                      files: ["packages/crypto/aes.ts"],
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
                    files: ["packages/crypto/aes.ts"],
                    verification: "bun test packages/crypto/aes.test.ts",
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
    expect(snap.tasks[0]?.files).toEqual(["packages/crypto/aes.ts"]);
    expect(snap.tasks[0]?.verification).toBe(
      "bun test packages/crypto/aes.test.ts",
    );
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
