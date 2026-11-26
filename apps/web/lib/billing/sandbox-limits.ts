import type { SandboxState } from "@entry-agents/sandbox";
import { getPlanDefinition } from "./plans";

export const FREE_USER_MAX_SANDBOXES = 1;
export const FREE_USER_SANDBOX_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
export const STARTER_SANDBOX_VCPUS = 1;
export const HIGH_SUBSCRIBER_SANDBOX_VCPUS = 2;

export interface SandboxPlanPolicy {
  sharedVm: boolean;
  vcpus: number;
  maxConcurrentActiveVms: number;
  autoSuspendSeconds: number;
  autoHibernateSeconds: number;
  autoDestroySeconds: number;
  monthlyActiveHoursLimit: number;
}

export function getSandboxPlanPolicy(
  planId: string | null | undefined,
  isAdmin = false,
): SandboxPlanPolicy {
  if (isAdmin) {
    return {
      sharedVm: false,
      vcpus: HIGH_SUBSCRIBER_SANDBOX_VCPUS,
      maxConcurrentActiveVms: 10,
      autoSuspendSeconds: 300,
      autoHibernateSeconds: 1200,
      autoDestroySeconds: 30 * 24 * 3600,
      monthlyActiveHoursLimit: 500,
    };
  }

  const plan = getPlanDefinition(planId);
  if (plan.id === "free") {
    return {
      sharedVm: true,
      vcpus: STARTER_SANDBOX_VCPUS,
      maxConcurrentActiveVms: 1,
      autoSuspendSeconds: 180,
      autoHibernateSeconds: 600,
      autoDestroySeconds: 7 * 24 * 3600,
      monthlyActiveHoursLimit: 5,
    };
  }

  if (plan.id === "plus") {
    return {
      sharedVm: true,
      vcpus: STARTER_SANDBOX_VCPUS,
      maxConcurrentActiveVms: 1,
      autoSuspendSeconds: 180,
      autoHibernateSeconds: 600,
      autoDestroySeconds: 14 * 24 * 3600,
      monthlyActiveHoursLimit: 25,
    };
  }

  // Builder ("entry") and legacy dedicated tiers: dedicated per-session 2 vCPU VMs, max 3 concurrent.
  // Generous yet aggressive idle timeouts (5m suspend, 15m hibernate) to keep compute costs tight.
  return {
    sharedVm: false,
    vcpus: HIGH_SUBSCRIBER_SANDBOX_VCPUS,
    maxConcurrentActiveVms: 3,
    autoSuspendSeconds: 300,
    autoHibernateSeconds: 900,
    autoDestroySeconds: 14 * 24 * 3600,
    monthlyActiveHoursLimit: 50,
  };
}

export interface WorkflowRunPlanLimits {
  maxSteps: number;
  windowDurationMs: number;
  maxAutoContinuations: number;
}

/**
 * Plan-tiered background execution caps:
 * - Free:    30m single window, 0 auto-continues (30m max), 50 steps/turn
 * - Plus:    2h window, 1 background auto-continue (4h max), 200 steps/turn
 * - Builder / Pro / Max / Admin: 4h window, 3 background auto-continues (16h max), 400 steps/turn
 */
export function getWorkflowRunPlanLimits(
  planId: string | null | undefined,
  isAdmin = false,
): WorkflowRunPlanLimits {
  if (isAdmin) {
    return {
      maxSteps: 400,
      windowDurationMs: 4 * 60 * 60 * 1000,
      maxAutoContinuations: 3,
    };
  }
  const plan = getPlanDefinition(planId);
  if (plan.id === "free") {
    return {
      maxSteps: 50,
      windowDurationMs: 30 * 60 * 1000,
      maxAutoContinuations: 0,
    };
  }
  if (plan.id === "plus") {
    return {
      maxSteps: 200,
      windowDurationMs: 2 * 60 * 60 * 1000,
      maxAutoContinuations: 1,
    };
  }
  return {
    maxSteps: 400,
    windowDurationMs: 4 * 60 * 60 * 1000,
    maxAutoContinuations: 3,
  };
}

/**
 * Resolves sandbox vCPU allocation by subscription tier:
 * - High subscribers (`entry` / Builder, `pro`, `max`) and admins receive 2 vCPUs.
 * - Free and entry-level (`plus`) subscribers stay on 1 vCPU for sustainable economics.
 * - Vercel Hobby profile enforces a 1 vCPU platform cap regardless of plan.
 */
export function resolveSandboxVcpusForPlan(input: {
  planId: string | null | undefined;
  isAdmin?: boolean;
  providerType?: string | null;
  isHobbyProfile?: boolean;
}): number {
  if (input.providerType === "vercel" && input.isHobbyProfile) {
    return STARTER_SANDBOX_VCPUS;
  }

  return getSandboxPlanPolicy(input.planId, Boolean(input.isAdmin)).vcpus;
}

export interface SessionSandboxCandidate {
  id: string;
  status: string;
  sandboxState: SandboxState | null;
  lastActivityAt?: Date | null;
  updatedAt?: Date | null;
}

export type FreeTierSandboxResolution =
  | { mode: "dedicated" }
  | { mode: "detach-and-provision-fresh" }
  | { mode: "keep-existing" }
  | {
      mode: "attach-existing";
      sourceSessionId: string;
      targetState: SandboxState;
    }
  | { mode: "provision-first" };

/**
 * Extracts the durable runtime handle for a sandbox state so we can detect
 * whether two sessions share the same underlying VM/container.
 */
export function getSandboxRuntimeHandle(
  state: SandboxState | null | undefined,
): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const record = state as unknown as Record<string, unknown>;
  if (typeof record.machineId === "string" && record.machineId.length > 0) {
    return `${String(record.type)}:${record.machineId}`;
  }
  if (typeof record.sandboxId === "string" && record.sandboxId.length > 0) {
    return `${String(record.type)}:${record.sandboxId}`;
  }
  return null;
}

export function isSandboxSharedAcrossSessions(
  sessionId: string,
  sandboxState: SandboxState | null | undefined,
  allUserSessions: SessionSandboxCandidate[],
  options?: { activeOnly?: boolean },
): boolean {
  const handle = getSandboxRuntimeHandle(sandboxState);
  if (!handle) {
    return false;
  }

  return allUserSessions.some((other) => {
    if (other.id === sessionId) return false;
    if (options?.activeOnly && other.status === "archived") return false;
    return getSandboxRuntimeHandle(other.sandboxState) === handle;
  });
}

/**
 * Pure policy for free-tier shared sandbox reuse & paid-upgrade self-healing:
 *
 * - Paid/Admin users: get dedicated per-session sandboxes. If a session
 *   previously shared a free-tier sandbox with another session, automatically
 *   detach it and provision a fresh dedicated sandbox ("detach-and-provision-fresh")
 *   so upgraded users never stay stuck on a stale shared sandbox.
 *
 * - Free non-admin users: share a single reusable sandbox across all chats.
 *   Even if a previous chat was archived (as long as its sandbox wasn't deleted),
 *   new chats attach and reuse that existing sandbox instead of provisioning a
 *   new VM per chat.
 */
export function resolveFreeTierSandboxReuse(input: {
  currentSessionId: string;
  currentSandboxState: SandboxState | null | undefined;
  requestedProviderType: string;
  userPlan: string | null | undefined;
  isAdmin?: boolean;
  userSessions: SessionSandboxCandidate[];
}): FreeTierSandboxResolution {
  const plan = getPlanDefinition(input.userPlan);
  const isSharedPlan =
    !input.isAdmin && (plan.id === "free" || plan.id === "plus");

  if (!isSharedPlan) {
    const sharedWithOther = isSandboxSharedAcrossSessions(
      input.currentSessionId,
      input.currentSandboxState,
      input.userSessions,
    );
    return sharedWithOther
      ? { mode: "detach-and-provision-fresh" }
      : { mode: "dedicated" };
  }

  if (getSandboxRuntimeHandle(input.currentSandboxState) !== null) {
    return { mode: "keep-existing" };
  }

  const candidates = input.userSessions
    .filter((s) => {
      if (s.id === input.currentSessionId) return false;
      if (!s.sandboxState) return false;
      if (String(s.sandboxState.type) !== input.requestedProviderType) {
        return false;
      }
      return getSandboxRuntimeHandle(s.sandboxState) !== null;
    })
    .toSorted((a, b) => {
      // Prefer non-archived sessions first, then most recently active/updated.
      const aActive = a.status !== "archived" ? 1 : 0;
      const bActive = b.status !== "archived" ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      const aTime = (a.lastActivityAt ?? a.updatedAt)?.getTime() ?? 0;
      const bTime = (b.lastActivityAt ?? b.updatedAt)?.getTime() ?? 0;
      return bTime - aTime;
    });

  const best = candidates[0];
  if (best?.sandboxState) {
    return {
      mode: "attach-existing",
      sourceSessionId: best.id,
      targetState: best.sandboxState,
    };
  }

  return { mode: "provision-first" };
}
