import { describe, expect, test } from "bun:test";
import { SUBAGENT_REGISTRY } from "../../subagents/registry";
import {
  TeamBoard,
  clearTeamBoard,
  extractMentions,
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

  test("rebuildTeamBoardFromMessages also rehydrates from UIMessage parts format", () => {
    const teamId = `team_ui_replay_${Date.now()}`;
    clearTeamBoard(teamId);

    const uiMessages = [
      {
        id: "msg_1",
        role: "assistant",
        parts: [
          {
            type: "tool-team_board",
            toolCallId: "call_tb_1",
            state: "output-available",
            output: {
              teamSnapshot: {
                teamId,
                entries: [
                  {
                    id: "tb_contract_1",
                    kind: "contract",
                    authorRole: "architect",
                    targetRole: "executor",
                    title: "Team API Contract",
                    content:
                      "Export TeamBoardSnapshot with waves and fileConflicts.",
                    createdAt: 500,
                  },
                ],
                tasks: [
                  {
                    id: "W1",
                    title: "Wire /team command",
                    assignedRole: "executor",
                    status: "completed",
                    files: ["apps/web/hooks/use-session-skills.ts"],
                    verification: "pnpm typecheck",
                    updatedBy: "executor",
                    updatedAt: 600,
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    const rebuilt = rebuildTeamBoardFromMessages(uiMessages, teamId);
    const snap = rebuilt.snapshot();
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0]?.kind).toBe("contract");
    expect(snap.entries[0]?.targetRole).toBe("executor");
    expect(snap.tasks[0]?.id).toBe("W1");
    expect(snap.tasks[0]?.status).toBe("completed");
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

  test("extractMentions parses unique lowercase handles while ignoring emails", () => {
    const mentions = extractMentions(
      "Escalate @Reviewer and @executor on team_board, ask @reviewer again, ignore dev@entry-agents.dev.",
    );
    expect(mentions).toEqual(["reviewer", "executor"]);
  });

  test("supports debate, challenge, and verification entries with normalized mentions", () => {
    const board = new TeamBoard("team_debate");

    const challenge = board.postEntry({
      kind: "challenge",
      authorRole: "reviewer",
      targetRole: "executor",
      title: "Race in session store",
      content:
        "Coordinate with @architect and @Executor before changing the lock key.",
      files: ["apps/web/lib/team/role-models-store.ts"],
    });
    const debate = board.postEntry({
      kind: "debate",
      authorRole: "architect",
      targetRole: "reviewer",
      title: "Per-chat storage key",
      content: "Store per-chat pins in sessionStorage keyed by chatId.",
    });
    const verification = board.postEntry({
      kind: "verification",
      authorRole: "reviewer",
      targetRole: "all",
      title: "Typecheck & isolated suite pass",
      content: "Verified pnpm check and bun test pass on clean worktree.",
    });

    expect(challenge.mentions).toEqual(["executor", "architect"]);
    expect(debate.kind).toBe("debate");
    expect(verification.kind).toBe("verification");
    expect(verification.mentions).toBeUndefined();

    const summary = formatTeamContextSummary(board);
    expect(summary).toContain("(challenge) **reviewer -> executor**");
    expect(summary).toContain("(debate) **architect -> reviewer**");
    expect(summary).toContain("(verification) **reviewer -> all**");
  });

  test("parked tasks settle execution waves and do not trigger file ownership conflicts", () => {
    const board = new TeamBoard("team_parked");
    board.upsertTasks(
      [
        {
          id: "T1",
          title: "Lock contracts",
          assignedRole: "architect",
          status: "completed",
          files: ["packages/agent/team/team-board.ts"],
        },
        {
          id: "T2",
          title: "Deferred polish experiment",
          assignedRole: "design",
          status: "parked",
          dependsOn: ["T1"],
          files: ["apps/web/components/agent-hub/team-pane.tsx"],
          notes: "Deferred out of scope to keep PR focused.",
        },
        {
          id: "T3",
          title: "Ship TeamPane",
          assignedRole: "executor",
          status: "in_progress",
          dependsOn: ["T1", "T2"],
          files: ["apps/web/components/agent-hub/team-pane.tsx"],
          worktreeBranch: "team/executor-ab12cd34",
        },
      ],
      "architect",
    );

    const snap = board.snapshot();
    expect(snap.fileConflicts).toBeUndefined();
    expect(snap.waves).toEqual([
      { wave: 1, taskIds: ["T1"], status: "completed" },
      { wave: 2, taskIds: ["T2"], status: "completed" },
      { wave: 3, taskIds: ["T3"], status: "active" },
    ]);
    expect(snap.tasks[2]?.worktreeBranch).toBe("team/executor-ab12cd34");

    const summary = formatTeamContextSummary(board);
    expect(summary).toContain("[parked] `T2` (design)");
    expect(summary).toContain("[branch: team/executor-ab12cd34]");
  });

  test("preserves worktreeBranch through updateTaskStatus and replay", () => {
    const teamId = `team_wt_${Date.now()}`;
    clearTeamBoard(teamId);
    const board = new TeamBoard(teamId);
    board.upsertTasks(
      [
        {
          id: "W1",
          title: "Build worktree isolator",
          assignedRole: "executor",
        },
      ],
      "architect",
    );
    const updated = board.updateTaskStatus("W1", "in_progress", "executor", {
      worktreeBranch: "team/executor-99887766",
    });
    expect(updated?.worktreeBranch).toBe("team/executor-99887766");

    const replayed = rebuildTeamBoardFromMessages(
      [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolName: "team_board",
              output: { teamSnapshot: board.snapshot() },
            },
          ],
        },
      ],
      `${teamId}_replay`,
    );
    expect(replayed.listTasks()[0]?.worktreeBranch).toBe(
      "team/executor-99887766",
    );
    clearTeamBoard(teamId);
    clearTeamBoard(`${teamId}_replay`);
  });
});
