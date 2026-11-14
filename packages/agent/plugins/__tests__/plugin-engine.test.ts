import { describe, expect, test } from "bun:test";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  BUILTIN_PLUGIN_CATALOG,
  applyPluginHooksToTools,
  createPluginRunner,
  getBuiltinPluginBySlug,
  pluginManifestSchema,
  type EntryPluginRuntimeHooks,
  type ResolvedEntryPlugin,
} from "../index";

function makePlugin(
  overrides: Partial<ResolvedEntryPlugin> & {
    rules?: Partial<ResolvedEntryPlugin["manifest"]["rules"]>;
    slashCommands?: ResolvedEntryPlugin["manifest"]["slashCommands"];
  } = {},
): ResolvedEntryPlugin {
  const slug = overrides.slug ?? "test-plugin";
  const name = overrides.name ?? "Test Plugin";
  return {
    id: overrides.id ?? "p_test",
    slug,
    name,
    enabled: overrides.enabled ?? true,
    config: overrides.config ?? {},
    manifest: {
      slug,
      name,
      description: "A test plugin",
      version: "1.0.0",
      category: "custom",
      source: "custom",
      hooks: overrides.manifest?.hooks ?? [
        "session.context",
        "tool.execute.after",
      ],
      slashCommands:
        overrides.slashCommands ?? overrides.manifest?.slashCommands ?? [],
      configFields: overrides.manifest?.configFields ?? [],
      rules: {
        ...overrides.manifest?.rules,
        ...overrides.rules,
      },
    },
  };
}

describe("pluginManifestSchema & builtin catalog", () => {
  test("validates builtin catalog manifests", () => {
    expect(BUILTIN_PLUGIN_CATALOG.length).toBeGreaterThanOrEqual(5);
    for (const builtin of BUILTIN_PLUGIN_CATALOG) {
      const parsed = pluginManifestSchema.safeParse(builtin);
      expect(parsed.success).toBe(true);
    }
    expect(getBuiltinPluginBySlug("verification-gate")?.name).toBeDefined();
    expect(getBuiltinPluginBySlug("nonexistent")).toBeUndefined();
  });

  test("rejects invalid plugin slugs", () => {
    const res = pluginManifestSchema.safeParse({
      slug: "Bad Slug!",
      name: "Bad",
      description: "Invalid",
      hooks: [],
    });
    expect(res.success).toBe(false);
  });
});

describe("createPluginRunner", () => {
  test("aggregates context hooks, allowlists, blocklists, and compaction hints", () => {
    const p1 = makePlugin({
      slug: "p1",
      name: "Policy One",
      rules: {
        appendSystemPrompt: "Always check types.",
        compactionHint: "Keep test commands.",
        allowedTools: ["read", "bash", "write"],
        blockedTools: [{ tool: "write", reason: "Read-only audit mode" }],
      },
    });
    const p2 = makePlugin({
      slug: "p2",
      name: "Policy Two",
      rules: {
        appendSystemPrompt: "Summarize carefully.",
        allowedTools: ["read", "bash"],
      },
    });
    const disabled = makePlugin({
      slug: "disabled",
      enabled: false,
      rules: { appendSystemPrompt: "SHOULD_NOT_APPEAR" },
    });

    const runner = createPluginRunner([p1, p2, disabled]);
    const ctx = runner.runContextHooks({
      modelId: "claude-sonnet-4-6",
      agentId: "main",
      toolNames: ["read", "bash", "write"],
    });

    expect(ctx.systemAdditions).toEqual([
      "Always check types.",
      "Summarize carefully.",
    ]);
    expect(ctx.compactionHints).toEqual(["Keep test commands."]);
    expect([...(ctx.allowedToolNames ?? [])]).toEqual(["read", "bash"]);
    expect(ctx.blockedToolReasons.get("write")).toBe("Read-only audit mode");
  });

  test("evaluates permission hooks and deduplicates slash commands", () => {
    const p1 = makePlugin({
      slug: "p1",
      name: "Gate",
      rules: { requireApprovalTools: ["bash"] },
      slashCommands: [
        {
          name: "ship",
          description: "Run ship checklist",
          promptTemplate: "Check git status and run ci",
        },
      ],
    });
    const p2 = makePlugin({
      slug: "p2",
      name: "Duplicate",
      slashCommands: [
        {
          name: "ship",
          description: "Duplicate ignored",
          promptTemplate: "Ignored",
        },
        {
          name: "audit",
          description: "Audit secrets",
          promptTemplate: "Scan repo for hardcoded keys",
        },
      ],
    });

    const runner = createPluginRunner([p1, p2]);
    const perm = runner.runPermissionHooks({
      action: "bash",
      currentEffect: "allow",
      permissionMode: "ask",
    });
    expect(perm.effect).toBe("ask");

    const cmds = runner.getSlashCommands();
    expect(cmds.map((c) => `${c.name}:${c.pluginSlug}`)).toEqual([
      "ship:p1",
      "audit:p2",
    ]);
  });
});

describe("applyPluginHooksToTools", () => {
  test("modifies input before execution, redacts output patterns, and blocks denied tools", async () => {
    const runtimeHooks = new Map<string, EntryPluginRuntimeHooks>([
      [
        "guard",
        {
          beforeToolExecute: async ({ toolName, input }) => {
            if (
              toolName === "echo" &&
              (input as { msg: string }).msg === "deny"
            ) {
              return { allow: false, reason: "Denied echo input" };
            }
            return {
              allow: true,
              input: { msg: `${(input as { msg: string }).msg}_trimmed` },
            };
          },
        },
      ],
    ]);

    const plugin = makePlugin({
      slug: "guard",
      name: "Guard Plugin",
      rules: {
        redactOutputPatterns: ["sk-[A-Za-z0-9]{8,}"],
        toolNotes: { echo: "[Audited]" },
      },
    });

    const baseTools = {
      echo: tool({
        description: "Echo message",
        inputSchema: z.object({ msg: z.string() }),
        execute: async ({ msg }): Promise<Record<string, unknown>> => ({
          reply: `Got ${msg} with token sk-secret123456`,
        }),
      }),
    } satisfies ToolSet;

    const runner = createPluginRunner([plugin], runtimeHooks);
    const hooked = applyPluginHooksToTools(baseTools, runner, {
      agentId: "main",
      sessionId: "sess_1",
    });

    const okResult: unknown = await hooked.echo.execute?.(
      { msg: "hello" },
      { toolCallId: "tc_1", messages: [] },
    );
    expect(okResult).toEqual({
      reply: "Got hello_trimmed with token [REDACTED_BY_PLUGIN]",
      pluginNote: "[Audited]",
    });

    const deniedResult: unknown = await hooked.echo.execute?.(
      { msg: "deny" },
      { toolCallId: "tc_2", messages: [] },
    );
    expect(deniedResult).toEqual({
      error: "Denied echo input",
      blockedByPlugin: true,
    });
  });

  test("preserves AsyncGenerator streaming yields and transforms final output", async () => {
    const plugin = makePlugin({
      slug: "redactor",
      name: "Redactor",
      rules: { redactOutputPatterns: ["SECRET_[0-9]+"] },
    });

    const streamTool = tool({
      description: "Streaming mock tool",
      inputSchema: z.object({ step: z.string() }),
      execute: async function* ({ step }) {
        yield { phase: "running", detail: step };
        yield { phase: "done", detail: "key=SECRET_987654" };
      },
    });

    const baseTools = { streamTool } satisfies ToolSet;
    const runner = createPluginRunner([plugin]);
    const hooked = applyPluginHooksToTools(baseTools, runner, {
      agentId: "main",
    });

    const stream = hooked.streamTool.execute?.(
      { step: "work" },
      { toolCallId: "tc_stream", messages: [] },
    ) as AsyncIterable<unknown>;

    const yielded: unknown[] = [];
    for await (const chunk of stream) {
      yielded.push(chunk);
    }

    const last = yielded[yielded.length - 1] as {
      phase: string;
      detail: string;
    };
    expect(yielded[0]).toEqual({ phase: "running", detail: "work" });
    expect(last.detail).toBe("key=[REDACTED_BY_PLUGIN]");
  });
});
