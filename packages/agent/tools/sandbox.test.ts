import { describe, expect, mock, test } from "bun:test";
import * as realAiModule from "ai";

mock.module("ai", () => ({
  ...realAiModule,
  tool: <T extends Record<string, unknown>>(definition: T) => definition,
}));

const { sandboxControlTool } = await import("./sandbox");

function contextWith(overrides: {
  status?: () => Promise<Record<string, unknown>>;
  provision?: () => Promise<Record<string, unknown>>;
  delete?: () => Promise<Record<string, unknown>>;
  reconnect?: () => Promise<Record<string, unknown>>;
  snapshot?: () => Promise<Record<string, unknown>>;
  serve?: () => Promise<Record<string, unknown>>;
  stop_serve?: () => Promise<Record<string, unknown>>;
  ps?: () => Promise<Record<string, unknown>>;
  kill_process?: () => Promise<Record<string, unknown>>;
  env_get?: () => Promise<Record<string, unknown>>;
  env_set?: () => Promise<Record<string, unknown>>;
}) {
  return {
    sandbox: {
      state: { type: "modal" as const, volumeName: "entry-workspace-s1" },
      workingDirectory: "/workspace",
    },
    model: "test-model",
    sandboxControl: {
      status: overrides.status ?? (async () => ({ status: "running" })),
      provision: overrides.provision ?? (async () => ({ started: true })),
      reconnect: overrides.reconnect ?? (async () => ({ reconnected: true })),
      snapshot: overrides.snapshot ?? (async () => ({ snapshotId: "snap-1" })),
      delete: overrides.delete ?? (async () => ({ deleted: true })),
      serve: overrides.serve ?? (async () => ({ running: true, port: 3000 })),
      stop_serve: overrides.stop_serve ?? (async () => ({ stopped: true })),
      ps: overrides.ps ?? (async () => ({ processes: "node 123" })),
      kill_process: overrides.kill_process ?? (async () => ({ killed: true })),
      env_get: overrides.env_get ?? (async () => ({ env: "FOO=BAR" })),
      env_set: overrides.env_set ?? (async () => ({ set: true })),
    },
  };
}

function executionOptions(experimental_context: unknown) {
  return { toolCallId: "tool-call-1", messages: [], experimental_context };
}

describe("sandboxControlTool", () => {
  test("status is read-only and passes the host result through", async () => {
    const context = contextWith({
      status: async () => ({
        status: "paused",
        lifecycleState: "hibernated",
        sandboxExpiresAt: null,
      }),
    });

    const result = await sandboxControlTool().execute?.(
      { action: "status" },
      executionOptions(context),
    );

    expect(result).toMatchObject({
      success: true,
      action: "status",
      status: "paused",
      lifecycleState: "hibernated",
    });
  });

  test("every action routes to its own host callback", async () => {
    const calls: string[] = [];
    const context = contextWith({
      provision: async () => {
        calls.push("provision");
        return { started: true };
      },
      reconnect: async () => {
        calls.push("reconnect");
        return { reconnected: true };
      },
      snapshot: async () => {
        calls.push("snapshot");
        return { snapshotId: "snap-1" };
      },
      delete: async () => {
        calls.push("delete");
        return { deleted: true };
      },
    });

    for (const action of [
      "provision",
      "reconnect",
      "snapshot",
      "delete",
    ] as const) {
      const result = await sandboxControlTool().execute?.(
        { action },
        executionOptions(context),
      );
      expect(result).toMatchObject({ success: true, action });
    }

    expect(calls).toEqual(["provision", "reconnect", "snapshot", "delete"]);
  });

  test("a host failure becomes a tool error, not a thrown turn", async () => {
    const context = contextWith({
      snapshot: async () => {
        throw new Error("Sandbox snapshot is still running");
      },
    });

    const result = await sandboxControlTool().execute?.(
      { action: "snapshot" },
      executionOptions(context),
    );

    expect(result).toMatchObject({
      success: false,
      action: "snapshot",
      error: "Sandbox snapshot is still running",
    });
  });

  test("missing host context fails clearly", async () => {
    const result = await sandboxControlTool().execute?.(
      { action: "delete" },
      executionOptions({ model: "test-model" }),
    );

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain(
      "Workspace lifecycle control isn't available",
    );
  });
  test("extended actions route to their host callbacks or fallbacks", async () => {
    const context = contextWith({});
    const serveRes = await sandboxControlTool().execute?.(
      { action: "serve", port: 3000 },
      executionOptions(context),
    );
    expect(serveRes).toMatchObject({ success: true, action: "serve" });

    const psRes = await sandboxControlTool().execute?.(
      { action: "ps" },
      executionOptions(context),
    );
    expect(psRes).toMatchObject({ success: true, action: "ps" });

    const envRes = await sandboxControlTool().execute?.(
      { action: "env_set", envKey: "TEST_SECRET", envValue: "secret123" },
      executionOptions(context),
    );
    expect(envRes).toMatchObject({ success: true, action: "env_set" });
  });

  test("capability actions route cleanly through host callbacks when provided", async () => {
    const calls: string[] = [];
    const context = {
      ...contextWith({}),
      sandboxControl: {
        ...contextWith({}).sandboxControl,
        checkpoint_create: async ({ name }: { name?: string } = {}) => {
          calls.push(`cp_create:${name ?? ""}`);
          return { checkpoint: { name: name ?? "auto", status: "ready" } };
        },
        checkpoint_list: async () => {
          calls.push("cp_list");
          return { checkpoints: [] };
        },
        checkpoint_restore: async ({ name }: { name: string }) => {
          calls.push(`cp_restore:${name}`);
          return { restored: true };
        },
        checkpoint_delete: async ({ name }: { name: string }) => {
          calls.push(`cp_delete:${name}`);
          return { deleted: true };
        },
        expose_port: async (opts: { port?: number; name?: string }) => {
          calls.push(`expose:${opts.port ?? "auto"}:${opts.name ?? ""}`);
          return { url: "https://api.vm.boxd.sh" };
        },
        unexpose_port: async ({ port }: { port: number }) => {
          calls.push(`unexpose:${port}`);
          return { unexposed: true };
        },
        ports: async () => {
          calls.push("ports");
          return { proxies: [], rawPorts: [] };
        },
        logs: async () => {
          calls.push("logs");
          return { logs: "ready" };
        },
        resize: async ({ vcpu }: { vcpu?: number }) => {
          calls.push(`resize:${vcpu}`);
          return { vcpu, rebooted: true };
        },
        fork: async ({ name }: { name?: string }) => {
          calls.push(`fork:${name ?? ""}`);
          return { machineId: "vm-2" };
        },
        egress_allow: async ({ entries }: { entries: string[] }) => {
          calls.push(`egress:${entries.join(",")}`);
          return { egressAllow: entries };
        },
      },
    };

    const toolDef = sandboxControlTool();
    expect(
      await toolDef.execute?.(
        { action: "checkpoint_create", checkpointName: "safe-point" },
        executionOptions(context),
      ),
    ).toMatchObject({ success: true, action: "checkpoint_create" });
    expect(
      await toolDef.execute?.(
        { action: "checkpoint_list" },
        executionOptions(context),
      ),
    ).toMatchObject({ success: true, action: "checkpoint_list" });
    expect(
      await toolDef.execute?.(
        { action: "checkpoint_restore", checkpointName: "safe-point" },
        executionOptions(context),
      ),
    ).toMatchObject({ success: true, action: "checkpoint_restore" });
    expect(
      await toolDef.execute?.(
        { action: "checkpoint_delete", checkpointName: "safe-point" },
        executionOptions(context),
      ),
    ).toMatchObject({ success: true, action: "checkpoint_delete" });
    expect(
      await toolDef.execute?.({ action: "logs" }, executionOptions(context)),
    ).toMatchObject({ success: true, action: "logs", logs: "ready" });
    expect(
      await toolDef.execute?.({ action: "info" }, executionOptions(context)),
    ).toMatchObject({ success: true, action: "info", status: "running" });
    expect(
      await toolDef.execute?.({ action: "ports" }, executionOptions(context)),
    ).toMatchObject({
      success: true,
      action: "ports",
      proxies: [],
      rawPorts: [],
    });
    expect(
      await toolDef.execute?.(
        { action: "expose_port", port: 3000, proxyName: "api" },
        executionOptions(context),
      ),
    ).toMatchObject({
      success: true,
      action: "expose_port",
      url: "https://api.vm.boxd.sh",
    });
    expect(
      await toolDef.execute?.(
        { action: "unexpose_port", port: 3000 },
        executionOptions(context),
      ),
    ).toMatchObject({
      success: true,
      action: "unexpose_port",
      unexposed: true,
    });

    expect(calls).toEqual([
      "cp_create:safe-point",
      "cp_list",
      "cp_restore:safe-point",
      "cp_delete:safe-point",
      "logs",
      "ports",
      "expose:3000:api",
      "unexpose:3000",
    ]);
  });

  test("serve uses sandbox.domain() when direct sandbox fallback runs, and unsupported capabilities fail cleanly", async () => {
    const fakeSandbox = {
      type: "cloud" as const,
      workingDirectory: "/workspace",
      stat: async () => ({
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtimeMs: 0,
      }),
      domain: (port: number) => `https://p${port}.entry-test.boxd.sh`,
      exec: async () => ({
        success: true,
        exitCode: 0,
        stdout: "4242\n",
        stderr: "",
        truncated: false,
      }),
    };

    const directContext = {
      model: "test-model",
      sandbox: fakeSandbox,
      sandboxControl: {
        status: async () => ({ status: "running" }),
        provision: async () => ({ started: true }),
        reconnect: async () => ({ reconnected: true }),
        snapshot: async () => ({ snapshotId: "s1" }),
        delete: async () => ({ deleted: true }),
      },
    };

    const toolDef = sandboxControlTool();
    const serveRes = await toolDef.execute?.(
      { action: "serve", port: 5173 },
      executionOptions(directContext),
    );
    expect(serveRes).toMatchObject({
      success: true,
      action: "serve",
      url: "https://p5173.entry-test.boxd.sh",
    });

    const unsupportedRes = await toolDef.execute?.(
      { action: "checkpoint_list" },
      executionOptions(directContext),
    );
    expect(unsupportedRes).toMatchObject({
      success: false,
      action: "checkpoint_list",
    });
    expect((unsupportedRes as { error: string }).error).toContain(
      "not supported by the current workspace provider",
    );

    const modelOut = await toolDef.toModelOutput?.({
      toolCallId: "tc-1",
      input: { action: "logs" },
      output: {
        success: true,
        action: "logs",
        logs: "x".repeat(30_000),
      },
    });
    expect(modelOut?.type).toBe("text");
    expect((modelOut as { value: string }).value.length).toBeLessThanOrEqual(
      16_300,
    );
  });
});
