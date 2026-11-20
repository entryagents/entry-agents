import { describe, expect, test } from "bun:test";
import type { SandboxState } from "@entry-agents/sandbox";
import {
  getSandboxPlanPolicy,
  isSandboxSharedAcrossSessions,
  resolveFreeTierSandboxReuse,
  resolveSandboxVcpusForPlan,
} from "./sandbox-limits";

function boxdState(machineId?: string): SandboxState {
  return {
    type: "boxd",
    ...(machineId ? { machineId } : {}),
  } as SandboxState;
}

describe("resolveFreeTierSandboxReuse", () => {
  test("free user with no existing sandbox provisions their first one", () => {
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "s_new",
      currentSandboxState: boxdState(),
      requestedProviderType: "boxd",
      userPlan: "free",
      isAdmin: false,
      userSessions: [
        { id: "s_new", status: "running", sandboxState: boxdState() },
      ],
    });

    expect(res.mode).toBe("provision-first");
  });

  test("free user reuses existing active sandbox on new chat", () => {
    const existing = boxdState("mach_shared_1");
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "s_new",
      currentSandboxState: boxdState(),
      requestedProviderType: "boxd",
      userPlan: "free",
      isAdmin: false,
      userSessions: [
        { id: "s_new", status: "running", sandboxState: boxdState() },
        { id: "s_old", status: "running", sandboxState: existing },
      ],
    });

    expect(res.mode).toBe("attach-existing");
    if (res.mode === "attach-existing") {
      expect(res.sourceSessionId).toBe("s_old");
      expect(res.targetState).toEqual(existing);
    }
  });

  test("free user reuses sandbox from an archived chat if not deleted", () => {
    const archivedBoxd = boxdState("mach_archived_1");
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "s_new",
      currentSandboxState: boxdState(),
      requestedProviderType: "boxd",
      userPlan: "free",
      isAdmin: false,
      userSessions: [
        { id: "s_new", status: "running", sandboxState: boxdState() },
        { id: "s_arch", status: "archived", sandboxState: archivedBoxd },
      ],
    });

    expect(res.mode).toBe("attach-existing");
    if (res.mode === "attach-existing") {
      expect(res.sourceSessionId).toBe("s_arch");
      expect(res.targetState).toEqual(archivedBoxd);
    }
  });

  test("plus and builder subscribers share their existing user sandbox across chats", () => {
    const shared = boxdState("mach_shared_1");
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "s_2",
      currentSandboxState: shared,
      requestedProviderType: "boxd",
      userPlan: "plus",
      isAdmin: false,
      userSessions: [
        { id: "s_1", status: "running", sandboxState: shared },
        { id: "s_2", status: "running", sandboxState: shared },
      ],
    });

    expect(res.mode).toBe("keep-existing");
  });

  test("dedicated plan user automatically detaches from shared sandbox and provisions a fresh dedicated one", () => {
    const shared = boxdState("mach_shared_1");
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "s_2",
      currentSandboxState: shared,
      requestedProviderType: "boxd",
      userPlan: "pro",
      isAdmin: false,
      userSessions: [
        { id: "s_1", status: "running", sandboxState: shared },
        { id: "s_2", status: "running", sandboxState: shared },
      ],
    });

    expect(res.mode).toBe("detach-and-provision-fresh");
  });

  test("paid user with non-shared sandbox keeps dedicated mode", () => {
    const dedicated = boxdState("mach_dedicated_1");
    const res = resolveFreeTierSandboxReuse({
      currentSessionId: "s_2",
      currentSandboxState: dedicated,
      requestedProviderType: "boxd",
      userPlan: "pro",
      isAdmin: false,
      userSessions: [
        { id: "s_1", status: "running", sandboxState: boxdState("mach_1") },
        { id: "s_2", status: "running", sandboxState: dedicated },
      ],
    });

    expect(res.mode).toBe("dedicated");
  });

  test("isSandboxSharedAcrossSessions detects active siblings sharing the same machineId", () => {
    const shared = boxdState("mach_shared_1");
    expect(
      isSandboxSharedAcrossSessions(
        "s_arch",
        shared,
        [
          { id: "s_arch", status: "archived", sandboxState: shared },
          { id: "s_active", status: "running", sandboxState: shared },
        ],
        { activeOnly: true },
      ),
    ).toBe(true);
  });
});

describe("resolveSandboxVcpusForPlan", () => {
  test("assigns 1 vCPU to free and starter plus subscribers", () => {
    expect(
      resolveSandboxVcpusForPlan({ planId: "free", providerType: "boxd" }),
    ).toBe(1);
    expect(
      resolveSandboxVcpusForPlan({ planId: "plus", providerType: "boxd" }),
    ).toBe(1);
  });

  test("assigns 2 vCPUs to high subscribers and admins", () => {
    expect(
      resolveSandboxVcpusForPlan({ planId: "entry", providerType: "boxd" }),
    ).toBe(2);
    expect(
      resolveSandboxVcpusForPlan({ planId: "pro", providerType: "boxd" }),
    ).toBe(2);
    expect(
      resolveSandboxVcpusForPlan({ planId: "max", providerType: "boxd" }),
    ).toBe(2);
    expect(
      resolveSandboxVcpusForPlan({
        planId: "free",
        isAdmin: true,
        providerType: "boxd",
      }),
    ).toBe(2);
  });

  test("respects Vercel Hobby 1 vCPU ceiling", () => {
    expect(
      resolveSandboxVcpusForPlan({
        planId: "pro",
        isAdmin: true,
        providerType: "vercel",
        isHobbyProfile: true,
      }),
    ).toBe(1);
  });
});

describe("getSandboxPlanPolicy (all tier scenarios)", () => {
  test("free tier enforces 1 shared 1-vCPU VM, 3m suspend, 10m hibernate, 7d TTL, 5 hrs/mo", () => {
    expect(getSandboxPlanPolicy("free")).toEqual({
      sharedVm: true,
      vcpus: 1,
      maxConcurrentActiveVms: 1,
      autoSuspendSeconds: 180,
      autoHibernateSeconds: 600,
      autoDestroySeconds: 7 * 24 * 3600,
      monthlyActiveHoursLimit: 5,
    });
  });

  test("plus ($3) enforces 1 shared 1-vCPU VM, 3m suspend, 10m hibernate, 14d TTL, 25 hrs/mo", () => {
    expect(getSandboxPlanPolicy("plus")).toEqual({
      sharedVm: true,
      vcpus: 1,
      maxConcurrentActiveVms: 1,
      autoSuspendSeconds: 180,
      autoHibernateSeconds: 600,
      autoDestroySeconds: 14 * 24 * 3600,
      monthlyActiveHoursLimit: 25,
    });
  });

  test("builder ($10 / entry) gets dedicated 2-vCPU VMs up to 3 concurrent, 3m suspend, 10m hibernate, 14d TTL, 50 hrs/mo", () => {
    expect(getSandboxPlanPolicy("entry")).toEqual({
      sharedVm: false,
      vcpus: 2,
      maxConcurrentActiveVms: 3,
      autoSuspendSeconds: 180,
      autoHibernateSeconds: 600,
      autoDestroySeconds: 14 * 24 * 3600,
      monthlyActiveHoursLimit: 50,
    });

    const shared = boxdState("mach_shared_1");
    const upgradeRes = resolveFreeTierSandboxReuse({
      currentSessionId: "s_builder",
      currentSandboxState: shared,
      requestedProviderType: "boxd",
      userPlan: "entry",
      isAdmin: false,
      userSessions: [
        { id: "s_old", status: "running", sandboxState: shared },
        { id: "s_builder", status: "running", sandboxState: shared },
      ],
    });
    expect(upgradeRes.mode).toBe("detach-and-provision-fresh");
  });

  test("admin gets elevated dedicated 2-vCPU policy", () => {
    const policy = getSandboxPlanPolicy("free", true);
    expect(policy.sharedVm).toBe(false);
    expect(policy.vcpus).toBe(2);
    expect(policy.maxConcurrentActiveVms).toBe(10);
  });
});
