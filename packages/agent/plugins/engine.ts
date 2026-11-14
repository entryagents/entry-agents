import type { ToolSet } from "ai";
import type {
  EntryPluginRuntimeHooks,
  PluginAfterToolInput,
  PluginBeforeToolInput,
  PluginBeforeToolResult,
  PluginContextHookInput,
  PluginContextHookResult,
  PluginPermissionInput,
  PluginPermissionResult,
  PluginSlashCommand,
  ResolvedEntryPlugin,
} from "./types";

function compileSafeRegex(pattern: string): RegExp | null {
  if (!pattern || pattern.length > 200) return null;
  try {
    return new RegExp(pattern, "g");
  } catch {
    return null;
  }
}

function redactWithPatterns(value: unknown, patterns: RegExp[]): unknown {
  if (patterns.length === 0) return value;
  if (typeof value === "string") {
    let next = value;
    for (const regex of patterns) {
      regex.lastIndex = 0;
      next = next.replace(regex, "[REDACTED_BY_PLUGIN]");
    }
    return next;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactWithPatterns(item, patterns));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = redactWithPatterns(v, patterns);
    }
    return out;
  }
  return value;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    Symbol.asyncIterator in value &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === "function"
  );
}

export interface PluginRunner {
  plugins: ResolvedEntryPlugin[];
  runContextHooks: (input: PluginContextHookInput) => PluginContextHookResult;
  runBeforeToolHooks: (
    input: Omit<PluginBeforeToolInput, "config">,
  ) => Promise<PluginBeforeToolResult>;
  runAfterToolHooks: (
    input: Omit<PluginAfterToolInput, "config">,
  ) => Promise<unknown>;
  runPermissionHooks: (input: PluginPermissionInput) => PluginPermissionResult;
  getSlashCommands: () => Array<
    PluginSlashCommand & { pluginSlug: string; pluginName: string }
  >;
}

export function createPluginRunner(
  plugins: ResolvedEntryPlugin[] = [],
  runtimeHooksBySlug?: ReadonlyMap<string, EntryPluginRuntimeHooks>,
): PluginRunner {
  const enabledPlugins = plugins.filter((p) => p.enabled);

  const runContextHooks = (
    input: PluginContextHookInput,
  ): PluginContextHookResult => {
    const systemAdditions: string[] = [];
    const compactionHints: string[] = [];
    const blockedToolReasons = new Map<string, string>();
    let allowedToolNames: Set<string> | undefined;

    for (const plugin of enabledPlugins) {
      try {
        const { rules } = plugin.manifest;
        if (rules.appendSystemPrompt) {
          systemAdditions.push(rules.appendSystemPrompt);
        }
        if (rules.compactionHint) {
          compactionHints.push(rules.compactionHint);
        }
        if (rules.allowedTools && rules.allowedTools.length > 0) {
          const pluginAllowed = new Set(rules.allowedTools);
          if (!allowedToolNames) {
            allowedToolNames = pluginAllowed;
          } else {
            allowedToolNames = new Set(
              [...allowedToolNames].filter((name) => pluginAllowed.has(name)),
            );
          }
        }
        if (rules.blockedTools) {
          for (const rule of rules.blockedTools) {
            if (typeof rule === "string") {
              blockedToolReasons.set(
                rule,
                `Blocked by plugin "${plugin.name}" (${plugin.slug})`,
              );
            } else {
              blockedToolReasons.set(
                rule.tool,
                rule.reason ??
                  `Blocked by plugin "${plugin.name}" (${plugin.slug})`,
              );
            }
          }
        }

        const runtimeHooks = runtimeHooksBySlug?.get(plugin.slug);
        const hookOut = runtimeHooks?.onContext?.(input);
        if (hookOut?.appendSystemPrompt) {
          systemAdditions.push(hookOut.appendSystemPrompt);
        }
        if (hookOut?.compactionHint) {
          compactionHints.push(hookOut.compactionHint);
        }
        if (hookOut?.blockTools) {
          for (const name of hookOut.blockTools) {
            blockedToolReasons.set(
              name,
              `Blocked by plugin "${plugin.name}" hook`,
            );
          }
        }
      } catch (error) {
        console.warn(
          `[plugins] Context hook failed for plugin "${plugin.slug}":`,
          error,
        );
      }
    }

    return {
      systemAdditions,
      allowedToolNames,
      blockedToolReasons,
      compactionHints,
    };
  };

  const runBeforeToolHooks = async (
    input: Omit<PluginBeforeToolInput, "config">,
  ): Promise<PluginBeforeToolResult> => {
    let currentInput = input.input;

    for (const plugin of enabledPlugins) {
      const { rules } = plugin.manifest;
      if (rules.allowedTools && rules.allowedTools.length > 0) {
        if (!rules.allowedTools.includes(input.toolName)) {
          return {
            allow: false,
            reason: `Tool "${input.toolName}" is not in the allowlist of plugin "${plugin.name}".`,
            input: currentInput,
          };
        }
      }

      if (rules.blockedTools) {
        const match = rules.blockedTools.find((entry) =>
          typeof entry === "string"
            ? entry === input.toolName
            : entry.tool === input.toolName,
        );
        if (match) {
          return {
            allow: false,
            reason:
              typeof match === "string"
                ? `Blocked by plugin "${plugin.name}".`
                : (match.reason ?? `Blocked by plugin "${plugin.name}".`),
            input: currentInput,
          };
        }
      }

      const runtimeHooks = runtimeHooksBySlug?.get(plugin.slug);
      if (runtimeHooks?.beforeToolExecute) {
        try {
          const outcome = await runtimeHooks.beforeToolExecute({
            ...input,
            input: currentInput,
            config: plugin.config,
          });
          if (outcome) {
            if (outcome.input !== undefined) {
              currentInput = outcome.input;
            }
            if (outcome.allow === false) {
              return {
                allow: false,
                reason:
                  outcome.reason ?? `Rejected by plugin "${plugin.name}".`,
                input: currentInput,
              };
            }
          }
        } catch (error) {
          console.warn(
            `[plugins] beforeToolExecute failed for "${plugin.slug}":`,
            error,
          );
        }
      }
    }

    return { allow: true, input: currentInput };
  };

  const runAfterToolHooks = async (
    input: Omit<PluginAfterToolInput, "config">,
  ): Promise<unknown> => {
    let currentOutput = input.output;

    for (const plugin of enabledPlugins) {
      const { rules } = plugin.manifest;

      if (rules.redactOutputPatterns && rules.redactOutputPatterns.length > 0) {
        const compiled = rules.redactOutputPatterns
          .map(compileSafeRegex)
          .filter((r): r is RegExp => r !== null);
        currentOutput = redactWithPatterns(currentOutput, compiled);
      }

      const note = rules.toolNotes?.[input.toolName];
      if (note && input.status === "completed") {
        if (typeof currentOutput === "string") {
          currentOutput = `${currentOutput}\n\n${note}`;
        } else if (
          currentOutput &&
          typeof currentOutput === "object" &&
          !Array.isArray(currentOutput)
        ) {
          const rec = currentOutput as Record<string, unknown>;
          if (!("final" in rec)) {
            currentOutput = {
              ...rec,
              pluginNote: rec.pluginNote
                ? `${String(rec.pluginNote)}\n${note}`
                : note,
            };
          }
        }
      }

      const runtimeHooks = runtimeHooksBySlug?.get(plugin.slug);
      if (runtimeHooks?.afterToolExecute) {
        try {
          const outcome = await runtimeHooks.afterToolExecute({
            ...input,
            output: currentOutput,
            config: plugin.config,
          });
          if (outcome && outcome.output !== undefined) {
            currentOutput = outcome.output;
          }
        } catch (error) {
          console.warn(
            `[plugins] afterToolExecute failed for "${plugin.slug}":`,
            error,
          );
        }
      }
    }

    return currentOutput;
  };

  const runPermissionHooks = (
    input: PluginPermissionInput,
  ): PluginPermissionResult => {
    let effect = input.currentEffect;
    let reason: string | undefined;

    for (const plugin of enabledPlugins) {
      const { rules } = plugin.manifest;
      if (
        rules.requireApprovalTools &&
        rules.requireApprovalTools.includes(input.action)
      ) {
        effect = "ask";
        reason = `Approval required by plugin "${plugin.name}"`;
      }

      const runtimeHooks = runtimeHooksBySlug?.get(plugin.slug);
      if (runtimeHooks?.evaluatePermission) {
        try {
          const outcome = runtimeHooks.evaluatePermission({
            ...input,
            currentEffect: effect,
          });
          if (outcome?.effect) {
            effect = outcome.effect;
            reason = outcome.reason ?? reason;
          }
        } catch (error) {
          console.warn(
            `[plugins] evaluatePermission failed for "${plugin.slug}":`,
            error,
          );
        }
      }
    }

    return { effect, ...(reason ? { reason } : {}) };
  };

  const getSlashCommands = () => {
    const seen = new Set<string>();
    const list: Array<
      PluginSlashCommand & { pluginSlug: string; pluginName: string }
    > = [];
    for (const plugin of enabledPlugins) {
      for (const cmd of plugin.manifest.slashCommands) {
        if (seen.has(cmd.name)) continue;
        seen.add(cmd.name);
        list.push({
          ...cmd,
          pluginSlug: plugin.slug,
          pluginName: plugin.name,
        });
      }
    }
    return list;
  };

  return {
    plugins: enabledPlugins,
    runContextHooks,
    runBeforeToolHooks,
    runAfterToolHooks,
    runPermissionHooks,
    getSlashCommands,
  };
}

/**
 * Wraps a toolset for a single call so enabled plugins intercept before/after tool
 * execution without mutating module-level tool definitions. Preserves both
 * Promise-returning and AsyncGenerator-returning tool executors cleanly.
 */
export function applyPluginHooksToTools<T extends ToolSet>(
  baseTools: T,
  runner: PluginRunner,
  meta: { agentId: string; sessionId?: string },
): T {
  if (runner.plugins.length === 0) {
    return baseTools;
  }

  const wrapped: Record<string, unknown> = {};

  for (const [toolName, rawTool] of Object.entries(baseTools)) {
    const t = rawTool as {
      execute?: (input: unknown, options: unknown) => unknown;
      needsApproval?: boolean | ((input: unknown, options: unknown) => unknown);
    };

    if (typeof t?.execute !== "function") {
      wrapped[toolName] = rawTool;
      continue;
    }

    const originalExecute = t.execute;
    const originalNeedsApproval = t.needsApproval;

    const wrappedExecute = async function* (input: unknown, options: unknown) {
      const before = await runner.runBeforeToolHooks({
        toolName,
        input,
        agentId: meta.agentId,
        sessionId: meta.sessionId,
      });

      if (!before.allow) {
        const denied = {
          error: before.reason ?? `Blocked by Entry plugin policy`,
          blockedByPlugin: true,
        };
        return await runner.runAfterToolHooks({
          toolName,
          input: before.input,
          output: denied,
          status: "error",
          agentId: meta.agentId,
          sessionId: meta.sessionId,
        });
      }

      try {
        const execResult = originalExecute(before.input, options);
        if (isAsyncIterable(execResult)) {
          let lastYielded: unknown;
          let hasYielded = false;
          for await (const chunk of execResult) {
            hasYielded = true;
            lastYielded = chunk;
            yield chunk;
          }
          if (!hasYielded) {
            return undefined;
          }
          const finalOut = await runner.runAfterToolHooks({
            toolName,
            input: before.input,
            output: lastYielded,
            status: "completed",
            agentId: meta.agentId,
            sessionId: meta.sessionId,
          });
          if (finalOut !== lastYielded) {
            yield finalOut;
          }
          return finalOut;
        }

        const resolved = await execResult;
        return await runner.runAfterToolHooks({
          toolName,
          input: before.input,
          output: resolved,
          status: "completed",
          agentId: meta.agentId,
          sessionId: meta.sessionId,
        });
      } catch (err) {
        await runner.runAfterToolHooks({
          toolName,
          input: before.input,
          output: {
            error: err instanceof Error ? err.message : String(err),
          },
          status: "error",
          agentId: meta.agentId,
          sessionId: meta.sessionId,
        });
        throw err;
      }
    };

    // Preserve regular Promise-returning tools as regular async functions when
    // originalExecute isn't an AsyncGeneratorFunction, so callers/AI SDK
    // handle return values cleanly without extra generator overhead.
    const isGeneratorFn =
      originalExecute.constructor?.name === "AsyncGeneratorFunction";

    const wrappedSimpleExecute = async (input: unknown, options: unknown) => {
      const before = await runner.runBeforeToolHooks({
        toolName,
        input,
        agentId: meta.agentId,
        sessionId: meta.sessionId,
      });

      if (!before.allow) {
        return await runner.runAfterToolHooks({
          toolName,
          input: before.input,
          output: {
            error: before.reason ?? "Blocked by Entry plugin policy",
            blockedByPlugin: true,
          },
          status: "error",
          agentId: meta.agentId,
          sessionId: meta.sessionId,
        });
      }

      try {
        const execResult = originalExecute(before.input, options);
        if (isAsyncIterable(execResult)) {
          let last: unknown;
          for await (const chunk of execResult) {
            last = chunk;
          }
          return await runner.runAfterToolHooks({
            toolName,
            input: before.input,
            output: last,
            status: "completed",
            agentId: meta.agentId,
            sessionId: meta.sessionId,
          });
        }
        const resolved = await execResult;
        return await runner.runAfterToolHooks({
          toolName,
          input: before.input,
          output: resolved,
          status: "completed",
          agentId: meta.agentId,
          sessionId: meta.sessionId,
        });
      } catch (err) {
        await runner.runAfterToolHooks({
          toolName,
          input: before.input,
          output: {
            error: err instanceof Error ? err.message : String(err),
          },
          status: "error",
          agentId: meta.agentId,
          sessionId: meta.sessionId,
        });
        throw err;
      }
    };

    const pluginRequiresApproval = runner.plugins.some((p) =>
      p.manifest.rules.requireApprovalTools?.includes(toolName),
    );

    const wrappedNeedsApproval = pluginRequiresApproval
      ? true
      : typeof originalNeedsApproval === "function"
        ? async (input: unknown, callCtx: unknown) => {
            const base = await originalNeedsApproval(input, callCtx);
            const baseEffect: "allow" | "deny" | "ask" = base ? "ask" : "allow";
            const evaluated = runner.runPermissionHooks({
              action: toolName,
              currentEffect: baseEffect,
              permissionMode: "ask",
            });
            return evaluated.effect === "ask";
          }
        : originalNeedsApproval;

    wrapped[toolName] = {
      ...t,
      execute: isGeneratorFn ? wrappedExecute : wrappedSimpleExecute,
      ...(wrappedNeedsApproval !== undefined
        ? { needsApproval: wrappedNeedsApproval }
        : {}),
    };
  }

  return wrapped as T;
}
