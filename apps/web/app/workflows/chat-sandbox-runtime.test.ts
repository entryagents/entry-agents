import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const state = {
  mockSession: null as Record<string, unknown> | null,
  kickedSessionId: null as string | null,
};

mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => state.mockSession,
}));

mock.module("@/lib/sandbox/provisioning-kick", () => ({
  kickSandboxProvisioningWorkflow: async (sessionId: string) => {
    state.kickedSessionId = sessionId;
  },
}));

mock.module("@/lib/skills-cache", () => ({
  getCachedSkills: async () => null,
  setCachedSkills: async () => {},
}));

const { resolveChatSandboxRuntime } = await import("./chat-sandbox-runtime");

const getKickedSessionId = (): string | null => state.kickedSessionId;

describe("resolveChatSandboxRuntime instant startup", () => {
  test("returns immediately and kicks provisioning when sandbox is not yet active", async () => {
    state.kickedSessionId = null;
    state.mockSession = {
      id: "session-1",
      userId: "user-1",
      title: "Test Session",
      status: "active",
      lifecycleState: "provisioning",
      sandboxState: null,
      branch: "main",
      repoOwner: "test-owner",
      repoName: "test-repo",
    };

    const startTime = Date.now();
    const result = await resolveChatSandboxRuntime({
      userId: "user-1",
      sessionId: "session-1",
    });
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(1000);
    expect(getKickedSessionId()).toBe("session-1");
    expect(result.sessionTitle).toBe("Test Session");
    expect(result.currentBranch).toBe("main");
    expect(result.workingDirectory).toBeUndefined();
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills.map((s) => s.name)).toContain("agent-browser");
    expect(result.skills.map((s) => s.name)).toContain("sandbox");
  });

  test("returns workspace directory immediately when sandbox is already active", async () => {
    state.kickedSessionId = null;
    state.mockSession = {
      id: "session-2",
      userId: "user-1",
      title: "Active Session",
      status: "active",
      lifecycleState: "active",
      sandboxState: {
        type: "boxd",
        machineId: "entry-active-machine",
        machineName: "entry-active-machine",
        workingDirectory: "/workspace",
      },
      branch: "feature-branch",
    };

    const startTime = Date.now();
    const result = await resolveChatSandboxRuntime({
      userId: "user-1",
      sessionId: "session-2",
    });
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(1000);
    expect(getKickedSessionId()).toBeNull();
    expect(result.workingDirectory).toBe("/workspace");
    expect(result.currentBranch).toBe("feature-branch");
    expect(result.skills.length).toBeGreaterThan(0);
  });
});
