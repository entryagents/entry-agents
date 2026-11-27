import { describe, expect, test } from "bun:test";
import type { SandboxState } from "@entry-agents/sandbox";
import {
  evaluateTurnConcurrency,
  MAX_CONCURRENT_TURNS_PER_SANDBOX,
  type ActiveChatTurnSnapshot,
} from "./turn-concurrency";
import { resolveFreeTierSandboxReuse } from "./sandbox-limits";

const now = new Date("2026-11-27T12:00:00Z").getTime();

function makeBoxdState(machineId: string): SandboxState {
  return {
    type: "boxd",
    machineId,
    machineName: machineId,
  } as unknown as SandboxState;
}

describe("evaluateTurnConcurrency — sandbox-aware concurrent chats", () => {
  test("allows forked/sibling chats in the exact same session to run concurrently", () => {
    const activeRuns: ActiveChatTurnSnapshot[] = [
      {
        chatId: "chat-original",
        sessionId: "sess-1",
        workflowRunId: "wrun-1",
        status: "running",
        runStatusUpdatedAt: new Date(now - 5_000),
        sandboxState: makeBoxdState("vm-1"),
      },
    ];

    const decision = evaluateTurnConcurrency({
      planId: "entry",
      targetChatId: "chat-fork",
      targetWorkflowRunId: "wrun-2",
      targetSession: {
        id: "sess-1",
        sandboxState: makeBoxdState("vm-1"),
      },
      activeRuns,
      nowMs: now,
    });

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.usesExistingSandbox).toBe(true);
    }
    expect(decision.sameSandboxActiveTurns).toBe(1);
    expect(decision.activeDistinctSandboxes).toBe(1);
  });

  test("allows multiple chats in different sessions of the same GitHub repo project to share 1 sandbox", () => {
    const activeRuns: ActiveChatTurnSnapshot[] = [
      {
        chatId: "chat-a",
        sessionId: "sess-a",
        workflowRunId: "wrun-a",
        status: "running",
        runStatusUpdatedAt: new Date(now - 10_000),
        repoOwner: "entryagents",
        repoName: "entry-agents",
        sandboxState: makeBoxdState("vm-repo-1"),
      },
    ];

    // Second session in the same repo hasn't provisioned yet (sandboxState null)
    const decision = evaluateTurnConcurrency({
      planId: "entry",
      targetChatId: "chat-b",
      targetWorkflowRunId: "wrun-b",
      targetSession: {
        id: "sess-b",
        repoOwner: "EntryAgents",
        repoName: "Entry-Agents",
        sandboxState: null,
      },
      activeRuns,
      nowMs: now,
    });

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.usesExistingSandbox).toBe(true);
    }
    expect(decision.activeDistinctSandboxes).toBe(1);
  });

  test("allows multiple chats in different sessions of the same folder project to share 1 sandbox", () => {
    const activeRuns: ActiveChatTurnSnapshot[] = [
      {
        chatId: "chat-1",
        sessionId: "sess-1",
        workflowRunId: "wrun-1",
        status: "running",
        runStatusUpdatedAt: new Date(now - 2_000),
        projectId: "proj-alpha",
        sandboxState: makeBoxdState("vm-proj-alpha"),
      },
    ];

    const decision = evaluateTurnConcurrency({
      planId: "entry",
      targetChatId: "chat-2",
      targetWorkflowRunId: "wrun-2",
      targetSession: {
        id: "sess-2",
        projectId: "proj-alpha",
        sandboxState: null,
      },
      activeRuns,
      nowMs: now,
    });

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.usesExistingSandbox).toBe(true);
    }
  });

  test("allows Free and Plus users to run multiple chats concurrently on their shared VM", () => {
    const activeRuns: ActiveChatTurnSnapshot[] = [
      {
        chatId: "chat-free-1",
        sessionId: "sess-free-1",
        workflowRunId: "wrun-1",
        status: "running",
        runStatusUpdatedAt: new Date(now - 8_000),
        repoOwner: "acme",
        repoName: "web",
        sandboxState: makeBoxdState("vm-shared"),
      },
    ];

    for (const planId of ["free", "plus"]) {
      const decision = evaluateTurnConcurrency({
        planId,
        targetChatId: "chat-free-2",
        targetWorkflowRunId: "wrun-2",
        targetSession: {
          id: "sess-free-2",
          repoOwner: "acme",
          repoName: "api",
          sandboxState: makeBoxdState("vm-shared"),
        },
        activeRuns,
        nowMs: now,
      });

      expect(decision.allowed).toBe(true);
      if (decision.allowed) {
        expect(decision.usesExistingSandbox).toBe(true);
      }
      expect(decision.maxConcurrentSandboxes).toBe(1);
    }
  });

  test("enforces Builder plan 3-sandbox limit across separate projects while still allowing concurrent chats inside active projects", () => {
    const activeRuns: ActiveChatTurnSnapshot[] = [
      {
        chatId: "c1",
        sessionId: "s1",
        workflowRunId: "r1",
        status: "running",
        runStatusUpdatedAt: new Date(now - 5_000),
        repoOwner: "org",
        repoName: "repo-1",
        sandboxState: makeBoxdState("vm-1"),
      },
      {
        chatId: "c2",
        sessionId: "s2",
        workflowRunId: "r2",
        status: "running",
        runStatusUpdatedAt: new Date(now - 5_000),
        repoOwner: "org",
        repoName: "repo-2",
        sandboxState: makeBoxdState("vm-2"),
      },
      {
        chatId: "c3",
        sessionId: "s3",
        workflowRunId: "r3",
        status: "running",
        runStatusUpdatedAt: new Date(now - 5_000),
        repoOwner: "org",
        repoName: "repo-3",
        sandboxState: makeBoxdState("vm-3"),
      },
    ];

    // 4th distinct project exceeds Builder's 3-sandbox limit
    const fourthProject = evaluateTurnConcurrency({
      planId: "entry",
      targetChatId: "c4",
      targetWorkflowRunId: "r4",
      targetSession: {
        id: "s4",
        repoOwner: "org",
        repoName: "repo-4",
      },
      activeRuns,
      nowMs: now,
    });
    expect(fourthProject.allowed).toBe(false);
    if (!fourthProject.allowed) {
      expect(fourthProject.code).toBe("SANDBOX_LIMIT_REACHED");
      expect(fourthProject.reason).toContain("3 concurrent sandboxes");
    }

    // Another chat inside repo-2 (already active) uses 0 extra sandboxes -> ALLOWED!
    const sameProjectChat = evaluateTurnConcurrency({
      planId: "entry",
      targetChatId: "c2-second",
      targetWorkflowRunId: "r2-second",
      targetSession: {
        id: "s2-second",
        repoOwner: "org",
        repoName: "repo-2",
      },
      activeRuns,
      nowMs: now,
    });
    expect(sameProjectChat.allowed).toBe(true);
    if (sameProjectChat.allowed) {
      expect(sameProjectChat.usesExistingSandbox).toBe(true);
    }
  });

  test("ignores stale crashed runs older than 15 minutes", () => {
    const staleRuns: ActiveChatTurnSnapshot[] = [
      {
        chatId: "c1",
        sessionId: "s1",
        workflowRunId: "r1",
        status: "running",
        runStatusUpdatedAt: new Date(now - 20 * 60 * 1000),
        repoOwner: "org",
        repoName: "repo-1",
      },
      {
        chatId: "c2",
        sessionId: "s2",
        workflowRunId: "r2",
        status: "running",
        runStatusUpdatedAt: new Date(now - 20 * 60 * 1000),
        repoOwner: "org",
        repoName: "repo-2",
      },
      {
        chatId: "c3",
        sessionId: "s3",
        workflowRunId: "r3",
        status: "running",
        runStatusUpdatedAt: new Date(now - 20 * 60 * 1000),
        repoOwner: "org",
        repoName: "repo-3",
      },
    ];

    const decision = evaluateTurnConcurrency({
      planId: "entry",
      targetChatId: "c4",
      targetWorkflowRunId: "r4",
      targetSession: {
        id: "s4",
        repoOwner: "org",
        repoName: "repo-4",
      },
      activeRuns: staleRuns,
      nowMs: now,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.activeDistinctSandboxes).toBe(0);
  });

  test("enforces per-sandbox soft cap to protect VM memory", () => {
    const activeRuns: ActiveChatTurnSnapshot[] = Array.from(
      { length: MAX_CONCURRENT_TURNS_PER_SANDBOX },
      (_, idx) => ({
        chatId: `chat-${idx}`,
        sessionId: "sess-1",
        workflowRunId: `wrun-${idx}`,
        status: "running",
        runStatusUpdatedAt: new Date(now - 5_000),
        sandboxState: makeBoxdState("vm-1"),
      }),
    );

    const decision = evaluateTurnConcurrency({
      planId: "entry",
      targetChatId: "chat-overflow",
      targetWorkflowRunId: "wrun-overflow",
      targetSession: {
        id: "sess-1",
        sandboxState: makeBoxdState("vm-1"),
      },
      activeRuns,
      nowMs: now,
    });

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("PER_SANDBOX_CONCURRENCY_REACHED");
    }
  });

  test("project-level sandbox reuse attaches sibling sessions in the same repo on Builder plan", () => {
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "sess-new",
      currentSandboxState: null,
      currentRepoOwner: "entryagents",
      currentRepoName: "entry-agents",
      requestedProviderType: "boxd",
      userPlan: "entry",
      isAdmin: false,
      userSessions: [
        {
          id: "sess-existing-repo",
          status: "completed",
          repoOwner: "entryagents",
          repoName: "entry-agents",
          sandboxState: makeBoxdState("vm-project-1"),
          lastActivityAt: new Date(now - 60_000),
        },
        {
          id: "sess-other-repo",
          status: "completed",
          repoOwner: "entryagents",
          repoName: "empress",
          sandboxState: makeBoxdState("vm-project-2"),
          lastActivityAt: new Date(now - 10_000),
        },
      ],
    });

    expect(res.mode).toBe("attach-existing");
    if (res.mode === "attach-existing") {
      expect(res.sourceSessionId).toBe("sess-existing-repo");
    }
  });

  test("upgraded Builder user still detaches if sandbox was shared with a DIFFERENT project", () => {
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "sess-repo-a",
      currentSandboxState: makeBoxdState("vm-old-free"),
      currentRepoOwner: "entryagents",
      currentRepoName: "repo-a",
      requestedProviderType: "boxd",
      userPlan: "entry",
      isAdmin: false,
      userSessions: [
        {
          id: "sess-repo-b",
          status: "completed",
          repoOwner: "entryagents",
          repoName: "repo-b",
          sandboxState: makeBoxdState("vm-old-free"),
        },
      ],
    });

    expect(res.mode).toBe("detach-and-provision-fresh");
  });
});
