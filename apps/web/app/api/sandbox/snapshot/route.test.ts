import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realLibSessionContext from "@/app/api/sessions/_lib/session-context";
import * as realDbSessions from "@/lib/db/sessions";

mock.module("server-only", () => ({}));

type TestSandboxState = {
  type: "boxd";
  machineId?: string;
  machineName?: string;
  expiresAt?: number;
};

type TestSessionRecord = {
  id: string;
  userId: string;
  sandboxState: TestSandboxState | null;
  snapshotUrl: string | null;
  snapshotCreatedAt: Date | null;
  lifecycleVersion: number;
  lifecycleState: string | null;
  sandboxExpiresAt: Date | null;
  hibernateAfter: Date | null;
  lastActivityAt: Date | null;
};

const connectCalls: Array<{
  state: Record<string, unknown>;
  options: Record<string, unknown> | undefined;
}> = [];
const updateCalls: Array<Record<string, unknown>> = [];
const kickCalls: Array<{ sessionId: string; reason: string }> = [];

let stopCallCount = 0;
let connectSandboxResumeError: Error | null = null;
let sessionRecord: TestSessionRecord;

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  ...realLibSessionContext,
  requireAuthenticatedUser: async () => ({
    ok: true as const,
    userId: "user-1",
  }),
  requireOwnedSession: async () => ({ ok: true as const, sessionRecord }),
  requireOwnedSessionWithSandboxGuard: async ({
    sandboxGuard,
  }: {
    sandboxGuard: (state: TestSandboxState | null) => boolean;
  }) =>
    sandboxGuard(sessionRecord.sandboxState)
      ? ({ ok: true as const, sessionRecord } as const)
      : ({
          ok: false as const,
          response: Response.json(
            { error: "Sandbox not initialized" },
            { status: 400 },
          ),
        } as const),
}));

mock.module("@/lib/db/sessions", () => ({
  ...realDbSessions,
  getChatsBySessionId: async () => [],
  getSessionById: async () => sessionRecord,
  updateSession: async (_sessionId: string, patch: Record<string, unknown>) => {
    updateCalls.push(patch);
    sessionRecord = {
      ...sessionRecord,
      ...(patch as Partial<TestSessionRecord>),
    };
    return sessionRecord;
  },
}));

mock.module("@/lib/sandbox/lifecycle-kick", () => ({
  kickSandboxLifecycleWorkflow: (input: {
    sessionId: string;
    reason: string;
  }) => {
    kickCalls.push(input);
  },
}));

mock.module("@entry-agents/sandbox", () => ({
  connectSandbox: async (
    stateOrConfig: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => {
    const state =
      (stateOrConfig.state as Record<string, unknown> | undefined) ??
      stateOrConfig;
    const effectiveOptions =
      (stateOrConfig.options as Record<string, unknown> | undefined) ?? options;
    connectCalls.push({ state, options: effectiveOptions });

    if (connectSandboxResumeError && effectiveOptions?.resume === true) {
      throw connectSandboxResumeError;
    }

    const machineId =
      typeof state.machineId === "string" ? state.machineId : "bx_123";
    const machineName =
      typeof state.machineName === "string"
        ? state.machineName
        : "entry-session-1";

    return {
      id: "runtime-1",
      expiresAt: Date.now() + 120_000,
      workingDirectory: "/workspace",
      stop: async () => {
        stopCallCount += 1;
      },
      getState: () => ({
        type: "boxd" as const,
        machineId,
        machineName,
        expiresAt: Date.now() + 120_000,
      }),
    };
  },
}));

const routeModulePromise = import("./route");

function makeSessionRecord(
  overrides: Partial<TestSessionRecord> = {},
): TestSessionRecord {
  return {
    id: "session-1",
    userId: "user-1",
    sandboxState: {
      type: "boxd",
      machineId: "bx_123",
      machineName: "entry-session-1",
    },
    snapshotUrl: null,
    snapshotCreatedAt: null,
    lifecycleVersion: 2,
    lifecycleState: "active",
    sandboxExpiresAt: new Date(Date.now() + 60_000),
    hibernateAfter: new Date(Date.now() + 30_000),
    lastActivityAt: new Date(),
    ...overrides,
  };
}

describe("/api/sandbox/snapshot", () => {
  beforeEach(() => {
    connectCalls.length = 0;
    updateCalls.length = 0;
    kickCalls.length = 0;
    stopCallCount = 0;
    connectSandboxResumeError = null;
    sessionRecord = makeSessionRecord();
  });

  test("POST pauses a named persistent sandbox without writing a legacy snapshot", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    const payload = (await response.json()) as {
      snapshotId: string | null;
    };

    expect(response.ok).toBe(true);
    expect(stopCallCount).toBe(1);
    expect(payload.snapshotId).toBe("bx_123");
    expect(connectCalls[0]).toMatchObject({
      state: {
        type: "boxd",
        machineId: "bx_123",
      },
    });
    expect(updateCalls[0]).toEqual(
      expect.objectContaining({
        snapshotUrl: null,
        snapshotCreatedAt: null,
        sandboxState: {
          type: "boxd",
          machineId: "bx_123",
          machineName: "entry-session-1",
        },
        lifecycleVersion: 3,
        lifecycleState: "hibernated",
      }),
    );
  });

  test("PUT resumes an existing named persistent sandbox", async () => {
    const { PUT } = await routeModulePromise;

    sessionRecord = makeSessionRecord({
      sandboxState: {
        type: "boxd",
        machineId: "bx_123",
        machineName: "entry-session-1",
      },
      lifecycleState: "hibernated",
      sandboxExpiresAt: null,
      hibernateAfter: null,
    });

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(connectCalls[0]).toMatchObject({
      state: {
        type: "boxd",
      },
      options: {
        resume: true,
      },
    });
    expect(updateCalls[0]).toEqual(
      expect.objectContaining({
        sandboxState: expect.objectContaining({
          type: "boxd",
          machineId: "bx_123",
        }),
        snapshotUrl: null,
        snapshotCreatedAt: null,
        lifecycleVersion: 3,
      }),
    );
    expect(kickCalls).toEqual([
      { sessionId: "session-1", reason: "snapshot-restored" },
    ]);
  });

  test("PUT clears a broken persistent sandbox handle after a 404", async () => {
    const { PUT } = await routeModulePromise;

    sessionRecord = makeSessionRecord({
      sandboxState: {
        type: "boxd",
        machineId: "bx_123",
        machineName: "entry-session-1",
      },
      snapshotUrl: null,
      lifecycleState: "hibernated",
      sandboxExpiresAt: null,
      hibernateAfter: null,
    });
    connectSandboxResumeError = new Error("Status code 404 is not ok");

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(payload.error).toContain("Saved sandbox is no longer available");
    expect(updateCalls[0]).toEqual(
      expect.objectContaining({
        sandboxState: {
          type: "boxd",
        },
        lifecycleState: "hibernated",
      }),
    );
  });

  test("PUT clears a dead-snapshot handle after a 400 'no snapshot available' resume", async () => {
    const { PUT } = await routeModulePromise;

    sessionRecord = makeSessionRecord({
      sandboxState: {
        type: "boxd",
        machineId: "bx_123",
        machineName: "entry-session-1",
      },
      snapshotUrl: null,
      lifecycleState: "hibernated",
      sandboxExpiresAt: null,
      hibernateAfter: null,
    });
    connectSandboxResumeError = new Error(
      "Status code 400 is not ok: Cannot resume sandbox: no snapshot available.",
    );

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(payload.error).toContain("Saved sandbox is no longer available");
    expect(updateCalls[0]).toEqual(
      expect.objectContaining({
        sandboxState: { type: "boxd" },
        lifecycleState: "hibernated",
      }),
    );
  });

  test("PUT lazily migrates a legacy snapshot-backed session on first resume", async () => {
    const { PUT } = await routeModulePromise;

    sessionRecord = makeSessionRecord({
      sandboxState: { type: "boxd" },
      snapshotUrl: "snap-legacy-1",
      lifecycleState: "hibernated",
      sandboxExpiresAt: null,
      hibernateAfter: null,
    });

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(connectCalls[0]).toMatchObject({
      state: {
        type: "boxd",
      },
      options: {
        resume: true,
        createIfMissing: true,
        persistent: true,
      },
    });
    expect(updateCalls[0]).toEqual(
      expect.objectContaining({
        sandboxState: expect.objectContaining({
          type: "boxd",
        }),
        snapshotUrl: null,
        snapshotCreatedAt: null,
        lifecycleVersion: 3,
      }),
    );
    expect(kickCalls).toEqual([
      { sessionId: "session-1", reason: "snapshot-restored" },
    ]);
  });
});
