import type { LanguageModel } from "ai";
import { z } from "zod";
import type { ReadFileState } from "../tools/read-state";
import type { AgentContext, SandboxExecutionContext } from "../types";

export const sharedSubagentCallOptionsFields = {
  sandbox: z
    .custom<SandboxExecutionContext["sandbox"]>()
    .describe("Sandbox for file system and shell operations"),
  model: z.custom<LanguageModel>().describe("Language model for this subagent"),
  teamId: z.string().optional(),
  teamContext: z.string().optional(),
  // Per-step output clamp threaded from the host's billing guard
  maxOutputTokens: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
  compactionThreshold: z.number().positive().optional(),
  // Permission mode inherited from the parent agent turn
  permissionMode: z.enum(["ask", "autoAccept", "fullAccess"]).optional(),
  // Security & runtime hooks inherited from the parent agent turn
  secrets: z.custom<AgentContext["secrets"]>().optional(),
  secretCatalog: z.custom<AgentContext["secretCatalog"]>().optional(),
  secretRedactor: z.custom<AgentContext["secretRedactor"]>().optional(),
  onSecretUsed: z.custom<AgentContext["onSecretUsed"]>().optional(),
  sandboxLifecycleHooks: z
    .custom<AgentContext["sandboxLifecycleHooks"]>()
    .optional(),
};

export function buildSubagentExperimentalContext(
  options: {
    sandbox: SandboxExecutionContext["sandbox"];
    model?: LanguageModel;
    teamId?: string;
    contextWindow?: number;
    compactionThreshold?: number;
    permissionMode?: "ask" | "autoAccept" | "fullAccess";
    secrets?: AgentContext["secrets"];
    secretCatalog?: AgentContext["secretCatalog"];
    secretRedactor?: AgentContext["secretRedactor"];
    onSecretUsed?: AgentContext["onSecretUsed"];
    sandboxLifecycleHooks?: AgentContext["sandboxLifecycleHooks"];
  },
  model: LanguageModel,
  agentRole: NonNullable<AgentContext["agentRole"]>,
  readFileState?: ReadFileState,
): Record<string, unknown> {
  return {
    sandbox: options.sandbox,
    model,
    teamId: options.teamId ?? "default-team",
    agentRole,
    contextWindow: options.contextWindow,
    compactionThreshold: options.compactionThreshold,
    permissionMode: options.permissionMode ?? "ask",
    ...(options.secrets ? { secrets: options.secrets } : {}),
    ...(options.secretCatalog ? { secretCatalog: options.secretCatalog } : {}),
    ...(options.secretRedactor
      ? { secretRedactor: options.secretRedactor }
      : {}),
    ...(options.onSecretUsed ? { onSecretUsed: options.onSecretUsed } : {}),
    ...(options.sandboxLifecycleHooks
      ? { sandboxLifecycleHooks: options.sandboxLifecycleHooks }
      : {}),
    ...(readFileState ? { readFileState } : {}),
  };
}
