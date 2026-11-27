import type { SandboxState } from "@entry-agents/sandbox";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chats, sessions } from "@/lib/db/schema";
import { ACTIVE_CHAT_RUN_STATUSES } from "@/lib/db/sessions";
import { getPlanDefinition } from "./plans";
import {
  getSandboxPlanPolicy,
  getSandboxRuntimeHandle,
  getSessionSandboxGroupKey,
} from "./sandbox-limits";

export const ACTIVE_RUN_STALE_MS = 15 * 60 * 1000;
export const MAX_CONCURRENT_TURNS_PER_SANDBOX = 6;
export const ADMIN_MAX_CONCURRENT_TURNS_PER_SANDBOX = 12;

export interface TurnSessionScope {
  id: string;
  projectId?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
  sandboxState?: SandboxState | null;
}

export interface ActiveChatTurnSnapshot {
  chatId: string;
  sessionId: string;
  workflowRunId: string | null;
  status: string;
  runStatusUpdatedAt: Date | null;
  projectId?: string | null;
  repoOwner?: string | null;
  repoName?: string | null;
  sandboxState?: SandboxState | null;
}

export type TurnConcurrencyDecision =
  | {
      allowed: true;
      targetSlotKey: string;
      usesExistingSandbox: boolean;
      activeDistinctSandboxes: number;
      maxConcurrentSandboxes: number;
      sameSandboxActiveTurns: number;
    }
  | {
      allowed: false;
      reason: string;
      code: "SANDBOX_LIMIT_REACHED" | "PER_SANDBOX_CONCURRENCY_REACHED";
      targetSlotKey: string;
      activeDistinctSandboxes: number;
      maxConcurrentSandboxes: number;
      sameSandboxActiveTurns: number;
    };

/**
 * Resolves which physical/logical sandbox slot a chat turn occupies:
 * - Free / Plus (`sharedVm: true`): all chats share one VM (`"shared-vm"`).
 * - Dedicated plans (`sharedVm: false`):
 *   - If two sessions already share the same runtime VM handle, they map to the
 *     exact same slot (`vm:<handle>`).
 *   - Otherwise, chats in the same session, forked chats, or sessions in the
 *     same project (`projectId` or `repoOwner/repoName`) share one slot via
 *     `getSessionSandboxGroupKey`.
 */
export function resolveTurnSandboxSlotKey(
  session: TurnSessionScope,
  sharedVm: boolean,
): string {
  if (sharedVm) {
    return "shared-vm";
  }

  const runtimeHandle = getSandboxRuntimeHandle(session.sandboxState);
  if (runtimeHandle) {
    return `vm:${runtimeHandle}`;
  }

  return getSessionSandboxGroupKey(session);
}

/**
 * Pure sandbox-aware concurrency policy for simultaneous chat turns.
 *
 * Replaces the legacy 1-chat-per-user global lock:
 * - Multiple chats inside the same session (forks, child chats), the same
 *   project (folder or GitHub repo), or on a shared-VM plan share one sandbox
 *   and run concurrently without consuming additional sandbox slots.
 * - Distinct sandboxes are admitted up to `policy.maxConcurrentActiveVms`
 *   (Free/Plus: 1 shared VM, Builder: 3 VMs, Admin: 10 VMs).
 * - Stale/abandoned runs older than `staleMs` never block new turns.
 */
export function evaluateTurnConcurrency(input: {
  planId: string | null | undefined;
  isAdmin?: boolean;
  targetChatId: string;
  targetWorkflowRunId?: string | null;
  targetSession: TurnSessionScope;
  activeRuns: ActiveChatTurnSnapshot[];
  nowMs?: number;
  staleMs?: number;
}): TurnConcurrencyDecision {
  const isAdmin = Boolean(input.isAdmin);
  const policy = getSandboxPlanPolicy(input.planId, isAdmin);
  const plan = getPlanDefinition(input.planId);
  const nowMs = input.nowMs ?? Date.now();
  const staleMs = input.staleMs ?? ACTIVE_RUN_STALE_MS;
  const maxPerSandbox = isAdmin
    ? ADMIN_MAX_CONCURRENT_TURNS_PER_SANDBOX
    : MAX_CONCURRENT_TURNS_PER_SANDBOX;

  const targetSlotKey = resolveTurnSandboxSlotKey(
    input.targetSession,
    policy.sharedVm,
  );
  const targetGroupKey = getSessionSandboxGroupKey(input.targetSession);
  const targetHasProjectScope = Boolean(
    input.targetSession.projectId ||
    (input.targetSession.repoOwner && input.targetSession.repoName),
  );

  const distinctSlots = new Set<string>();
  let sameSandboxActiveTurns = 0;

  for (const run of input.activeRuns) {
    // Ignore the incoming chat itself or the same workflow run.
    if (run.chatId === input.targetChatId) continue;
    if (
      input.targetWorkflowRunId &&
      run.workflowRunId === input.targetWorkflowRunId
    ) {
      continue;
    }

    // Ignore stale runs that stopped heartbeating.
    if (
      run.runStatusUpdatedAt &&
      nowMs - run.runStatusUpdatedAt.getTime() > staleMs
    ) {
      continue;
    }

    const runScope: TurnSessionScope = {
      id: run.sessionId,
      projectId: run.projectId,
      repoOwner: run.repoOwner,
      repoName: run.repoName,
      sandboxState: run.sandboxState,
    };
    const runSlotKey = resolveTurnSandboxSlotKey(runScope, policy.sharedVm);
    const runGroupKey = getSessionSandboxGroupKey(runScope);

    // Treat sibling sessions in the same project as occupying the target's
    // sandbox slot even if one has provisioned its VM handle and the other is
    // about to attach to it.
    const sharesSandboxWithTarget =
      runSlotKey === targetSlotKey ||
      run.sessionId === input.targetSession.id ||
      (targetHasProjectScope && runGroupKey === targetGroupKey);

    const effectiveSlotKey = sharesSandboxWithTarget
      ? targetSlotKey
      : runSlotKey;
    distinctSlots.add(effectiveSlotKey);

    if (sharesSandboxWithTarget) {
      sameSandboxActiveTurns += 1;
    }
  }

  if (sameSandboxActiveTurns >= maxPerSandbox) {
    return {
      allowed: false,
      code: "PER_SANDBOX_CONCURRENCY_REACHED",
      reason: `Up to ${maxPerSandbox} chats can run at once inside the same sandbox. Wait for one of them to finish, then try again.`,
      targetSlotKey,
      activeDistinctSandboxes: distinctSlots.size,
      maxConcurrentSandboxes: policy.maxConcurrentActiveVms,
      sameSandboxActiveTurns,
    };
  }

  const usesExistingSandbox = distinctSlots.has(targetSlotKey);
  if (usesExistingSandbox) {
    return {
      allowed: true,
      targetSlotKey,
      usesExistingSandbox: true,
      activeDistinctSandboxes: distinctSlots.size,
      maxConcurrentSandboxes: policy.maxConcurrentActiveVms,
      sameSandboxActiveTurns,
    };
  }

  if (distinctSlots.size >= policy.maxConcurrentActiveVms) {
    const vmLabel =
      policy.maxConcurrentActiveVms === 1
        ? "1 concurrent sandbox"
        : `${policy.maxConcurrentActiveVms} concurrent sandboxes`;
    return {
      allowed: false,
      code: "SANDBOX_LIMIT_REACHED",
      reason: `Your ${plan.name} plan supports up to ${vmLabel} across separate projects. Chats inside the same project or session share one sandbox and can run in parallel, or wait for another project run to finish.`,
      targetSlotKey,
      activeDistinctSandboxes: distinctSlots.size,
      maxConcurrentSandboxes: policy.maxConcurrentActiveVms,
      sameSandboxActiveTurns,
    };
  }

  return {
    allowed: true,
    targetSlotKey,
    usesExistingSandbox: false,
    activeDistinctSandboxes: distinctSlots.size,
    maxConcurrentSandboxes: policy.maxConcurrentActiveVms,
    sameSandboxActiveTurns,
  };
}

/**
 * Database-backed admission check called at workflow startup. Lazily verifies
 * workflow run liveness only when an active run would otherwise cause a block,
 * so crashed runs can never lock out subsequent turns.
 */
export async function checkAndAdmitConcurrentTurn(input: {
  userId: string;
  chatId: string;
  sessionId: string;
  workflowRunId: string;
  planId: string | null | undefined;
  isAdmin?: boolean;
}): Promise<TurnConcurrencyDecision> {
  const [targetRows, activeRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        projectId: sessions.projectId,
        repoOwner: sessions.repoOwner,
        repoName: sessions.repoName,
        sandboxState: sessions.sandboxState,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, input.sessionId),
          eq(sessions.userId, input.userId),
        ),
      )
      .limit(1),
    db
      .select({
        chatId: chats.id,
        sessionId: chats.sessionId,
        workflowRunId: chats.activeStreamId,
        status: chats.status,
        runStatusUpdatedAt: chats.runStatusUpdatedAt,
        projectId: sessions.projectId,
        repoOwner: sessions.repoOwner,
        repoName: sessions.repoName,
        sandboxState: sessions.sandboxState,
      })
      .from(chats)
      .innerJoin(sessions, eq(chats.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.userId, input.userId),
          or(
            isNotNull(chats.activeStreamId),
            inArray(chats.status, [...ACTIVE_CHAT_RUN_STATUSES]),
          ),
        ),
      ),
  ]);

  const targetSession: TurnSessionScope = targetRows[0] ?? {
    id: input.sessionId,
  };

  const initialDecision = evaluateTurnConcurrency({
    planId: input.planId,
    isAdmin: input.isAdmin,
    targetChatId: input.chatId,
    targetWorkflowRunId: input.workflowRunId,
    targetSession,
    activeRuns: activeRows,
  });

  if (initialDecision.allowed) {
    return initialDecision;
  }

  // Slow path: before blocking, verify whether the other active workflow runs
  // are truly still alive. Prune any dead/gone runs so crashed workflows never
  // falsely reject a user's prompt.
  try {
    const { verifyRunState } = await import("@/lib/workflow-run-recovery");
    const liveRuns: ActiveChatTurnSnapshot[] = [];
    for (const run of activeRows) {
      if (run.chatId === input.chatId) continue;
      if (!run.workflowRunId) {
        liveRuns.push(run);
        continue;
      }
      const outcome = await verifyRunState(run.workflowRunId).catch(
        () => "alive" as const,
      );
      if (outcome !== "gone") {
        liveRuns.push(run);
      }
    }

    return evaluateTurnConcurrency({
      planId: input.planId,
      isAdmin: input.isAdmin,
      targetChatId: input.chatId,
      targetWorkflowRunId: input.workflowRunId,
      targetSession,
      activeRuns: liveRuns,
    });
  } catch {
    return initialDecision;
  }
}
