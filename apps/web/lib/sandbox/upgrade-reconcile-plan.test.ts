import { describe, expect, test } from "bun:test";
import type { SandboxState } from "@entry-agents/sandbox";
import { planUpgradeSandboxReconciliation } from "./upgrade-reconcile-plan";

function makeState(machineId: string): SandboxState {
  return {
    type: "boxd",
    machineId,
    status: "active",
  } as unknown as SandboxState;
}

describe("planUpgradeSandboxReconciliation", () => {
  test("detaches older/archived siblings sharing the same sandbox and keeps most recent active session", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const plan = planUpgradeSandboxReconciliation(
      [
        {
          id: "s-archived",
          status: "archived",
          sandboxState: makeState("m-1"),
          lastActivityAt: new Date("2026-11-18T11:59:00Z"),
        },
        {
          id: "s-older",
          status: "active",
          sandboxState: makeState("m-1"),
          lastActivityAt: new Date("2026-11-18T11:30:00Z"),
        },
        {
          id: "s-winner",
          status: "active",
          sandboxState: makeState("m-1"),
          lastActivityAt: new Date("2026-11-18T11:55:00Z"),
          hibernateAfter: new Date(now.getTime() + 5 * 60 * 1000),
        },
      ],
      now.getTime(),
    );

    expect(plan.detachSessionIds).toEqual(["s-older", "s-archived"]);
    expect(plan.refreshTimeoutSessionIds).toEqual(["s-winner"]);
  });

  test("no-ops when each session already has a dedicated sandbox with paid timeouts", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const plan = planUpgradeSandboxReconciliation(
      [
        {
          id: "s-1",
          status: "active",
          sandboxState: makeState("m-1"),
          hibernateAfter: new Date(now.getTime() + 45 * 60 * 1000),
        },
        {
          id: "s-2",
          status: "active",
          sandboxState: makeState("m-2"),
          hibernateAfter: new Date(now.getTime() + 45 * 60 * 1000),
        },
      ],
      now.getTime(),
    );

    expect(plan.detachSessionIds).toEqual([]);
    expect(plan.refreshTimeoutSessionIds).toEqual([]);
  });
});
