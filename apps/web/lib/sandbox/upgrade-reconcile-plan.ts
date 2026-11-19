import type { SandboxState } from "@entry-agents/sandbox";
import {
  FREE_USER_SANDBOX_INACTIVITY_TIMEOUT_MS,
  getSandboxRuntimeHandle,
} from "@/lib/billing/sandbox-limits";

export interface UpgradeReconcileSessionInput {
  id: string;
  status: string;
  sandboxState: SandboxState | null;
  lifecycleState?: string | null;
  lastActivityAt?: Date | null;
  updatedAt?: Date | null;
  hibernateAfter?: Date | null;
  sandboxExpiresAt?: Date | null;
}

export interface UpgradeReconcilePlan {
  /** Session IDs whose shared sandboxState should be detached/cleared so they provision fresh dedicated sandboxes on next use. */
  detachSessionIds: string[];
  /** Active non-detached session IDs whose short 5-minute free-tier hibernation/expiry timers should be extended to paid defaults. */
  refreshTimeoutSessionIds: string[];
}

function getSessionRecencyMs(s: UpgradeReconcileSessionInput): number {
  return (s.lastActivityAt ?? s.updatedAt)?.getTime() ?? 0;
}

/**
 * Pure planner for reconciling a user's sandboxes when upgrading from the
 * free tier to a paid plan:
 *
 * 1. Any sandbox handle shared across multiple sessions is kept ONLY on the
 *    most recently active non-archived session (or most recent overall if all
 *    are archived). All other sessions sharing that handle are detached so they
 *    automatically provision their own fresh dedicated sandbox next time.
 * 2. Remaining active sessions whose hibernation/expiry timers are within the
 *    short 5-minute free-tier window are flagged to have their timeouts
 *    refreshed to paid defaults.
 */
export function planUpgradeSandboxReconciliation(
  sessions: UpgradeReconcileSessionInput[],
  nowMs: number = Date.now(),
): UpgradeReconcilePlan {
  const byHandle = new Map<string, UpgradeReconcileSessionInput[]>();

  for (const session of sessions) {
    const handle = getSandboxRuntimeHandle(session.sandboxState);
    if (!handle) continue;
    const group = byHandle.get(handle);
    if (group) {
      group.push(session);
    } else {
      byHandle.set(handle, [session]);
    }
  }

  const detachSet = new Set<string>();
  const keptSessions: UpgradeReconcileSessionInput[] = [];

  for (const group of byHandle.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (only) keptSessions.push(only);
      continue;
    }

    const sorted = group.toSorted((a, b) => {
      const aActive = a.status !== "archived" ? 1 : 0;
      const bActive = b.status !== "archived" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return getSessionRecencyMs(b) - getSessionRecencyMs(a);
    });

    const winner = sorted[0];
    if (winner) keptSessions.push(winner);
    for (const loser of sorted.slice(1)) {
      detachSet.add(loser.id);
    }
  }

  const freeTierCeilingMs =
    nowMs + FREE_USER_SANDBOX_INACTIVITY_TIMEOUT_MS + 60_000;
  const refreshTimeoutSessionIds: string[] = [];

  for (const session of keptSessions) {
    if (session.status === "archived") continue;
    const hibernateMs = session.hibernateAfter?.getTime();
    const expiresMs = session.sandboxExpiresAt?.getTime();
    const hasShortFreeTimer =
      (hibernateMs !== undefined && hibernateMs <= freeTierCeilingMs) ||
      (expiresMs !== undefined && expiresMs <= freeTierCeilingMs);
    if (hasShortFreeTimer) {
      refreshTimeoutSessionIds.push(session.id);
    }
  }

  return {
    detachSessionIds: [...detachSet],
    refreshTimeoutSessionIds,
  };
}
