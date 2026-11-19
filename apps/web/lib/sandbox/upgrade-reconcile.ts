import "server-only";

import { getSessionsByUserId, updateSession } from "@/lib/db/sessions";
import { DEFAULT_SANDBOX_TIMEOUT_MS } from "@/lib/sandbox/config";
import { clearSandboxState } from "@/lib/sandbox/utils";
import { planUpgradeSandboxReconciliation } from "./upgrade-reconcile-plan";

/**
 * Automatically reconciles a user's sandboxes when they upgrade from Free to
 * a paid plan so no session stays stuck on a stale shared sandbox or a
 * 5-minute free-tier hibernation timer.
 */
export async function reconcileUserSandboxesOnPlanUpgrade(
  userId: string,
): Promise<void> {
  const userSessions = await getSessionsByUserId(userId).catch(() => []);
  if (userSessions.length === 0) return;

  const nowMs = Date.now();
  const plan = planUpgradeSandboxReconciliation(userSessions, nowMs);
  if (
    plan.detachSessionIds.length === 0 &&
    plan.refreshTimeoutSessionIds.length === 0
  ) {
    return;
  }

  const sessionMap = new Map(userSessions.map((s) => [s.id, s]));

  await Promise.all([
    ...plan.detachSessionIds.map(async (sessionId) => {
      const target = sessionMap.get(sessionId);
      if (!target) return;
      await updateSession(sessionId, {
        sandboxState: clearSandboxState(target.sandboxState),
        lifecycleState: target.status === "archived" ? "archived" : null,
        sandboxExpiresAt: null,
        hibernateAfter: null,
        lifecycleError: null,
      }).catch((err) => {
        console.warn(
          `[sandbox-upgrade] Failed to detach shared sandbox on session ${sessionId}:`,
          err,
        );
      });
    }),
    ...plan.refreshTimeoutSessionIds.map(async (sessionId) => {
      await updateSession(sessionId, {
        hibernateAfter: new Date(nowMs + DEFAULT_SANDBOX_TIMEOUT_MS),
        sandboxExpiresAt: null,
      }).catch((err) => {
        console.warn(
          `[sandbox-upgrade] Failed to refresh sandbox timeout on session ${sessionId}:`,
          err,
        );
      });
    }),
  ]);
}
