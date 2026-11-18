import { describe, expect, test } from "bun:test";
import type { SandboxState } from "@entry-agents/sandbox";
import {
  isSandboxSharedAcrossSessions,
  resolveFreeTierSandboxReuse,
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

  test("upgraded paid user automatically detaches from shared sandbox and provisions a fresh dedicated one", () => {
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
