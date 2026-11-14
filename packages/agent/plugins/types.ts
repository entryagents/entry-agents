import { z } from "zod";

export const PLUGIN_HOOK_EVENTS = [
  "session.context",
  "tool.execute.before",
  "tool.execute.after",
  "permission.evaluate",
  "session.compaction",
  "session.idle",
] as const;

export const pluginHookEventSchema = z.enum(PLUGIN_HOOK_EVENTS);
export type PluginHookEvent = z.infer<typeof pluginHookEventSchema>;

export const PLUGIN_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export const pluginSlashCommandSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9_-]{0,31}$/,
      "Command name must be 1-32 lowercase letters, numbers, hyphens, or underscores",
    ),
  description: z.string().trim().min(1).max(160),
  promptTemplate: z.string().trim().min(1).max(4000),
  targetAgent: z
    .enum(["main", "architect", "explorer", "executor", "design", "reviewer"])
    .optional(),
});

export type PluginSlashCommand = z.infer<typeof pluginSlashCommandSchema>;

export const pluginBlockedToolRuleSchema = z.union([
  z.string().trim().min(1).max(80),
  z.object({
    tool: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(300).optional(),
  }),
]);

export const pluginRuleSetSchema = z.object({
  appendSystemPrompt: z.string().trim().max(4000).optional(),
  compactionHint: z.string().trim().max(1000).optional(),
  allowedTools: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  blockedTools: z.array(pluginBlockedToolRuleSchema).max(50).optional(),
  requireApprovalTools: z
    .array(z.string().trim().min(1).max(80))
    .max(50)
    .optional(),
  redactOutputPatterns: z
    .array(z.string().trim().min(1).max(200))
    .max(25)
    .optional(),
  toolNotes: z
    .record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(600))
    .optional(),
});

export type PluginRuleSet = z.infer<typeof pluginRuleSetSchema>;

export const pluginCategorySchema = z.enum([
  "quality",
  "agents",
  "security",
  "git",
  "performance",
  "custom",
]);

export type PluginCategory = z.infer<typeof pluginCategorySchema>;

export const pluginConfigFieldSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  secret: z.boolean().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().trim().max(120).optional(),
});

export type PluginConfigField = z.infer<typeof pluginConfigFieldSchema>;

export const pluginManifestSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(
      PLUGIN_SLUG_PATTERN,
      "Slug must be 1-40 lowercase letters, numbers, hyphens, or underscores",
    ),
  name: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(24).default("1.0.0"),
  description: z.string().trim().min(1).max(320),
  category: pluginCategorySchema.default("custom"),
  source: z.enum(["builtin", "custom"]).default("custom"),
  hooks: z.array(pluginHookEventSchema).default([]),
  slashCommands: z.array(pluginSlashCommandSchema).max(12).default([]),
  rules: pluginRuleSetSchema.default({}),
  configFields: z.array(pluginConfigFieldSchema).max(12).default([]),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export interface ResolvedEntryPlugin {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  manifest: PluginManifest;
  /** Decrypted runtime configuration key-values (server-side execution only). */
  config?: Record<string, string>;
}

export interface PluginContextHookInput {
  modelId?: string;
  agentId: string;
  sessionId?: string;
  toolNames: string[];
}

export interface PluginContextHookResult {
  systemAdditions: string[];
  allowedToolNames?: Set<string>;
  blockedToolReasons: Map<string, string>;
  compactionHints: string[];
}

export interface PluginBeforeToolInput {
  toolName: string;
  input: unknown;
  agentId: string;
  sessionId?: string;
  config?: Record<string, string>;
}

export interface PluginBeforeToolResult {
  allow: boolean;
  reason?: string;
  input: unknown;
}

export interface PluginAfterToolInput {
  toolName: string;
  input: unknown;
  output: unknown;
  status: "completed" | "error";
  agentId: string;
  sessionId?: string;
  config?: Record<string, string>;
}

export interface PluginPermissionInput {
  action: string;
  resource?: string;
  currentEffect: "allow" | "deny" | "ask";
  permissionMode: "ask" | "autoAccept" | "fullAccess";
}

export interface PluginPermissionResult {
  effect: "allow" | "deny" | "ask";
  reason?: string;
}

export interface EntryPluginRuntimeHooks {
  onContext?: (input: PluginContextHookInput) =>
    | {
        appendSystemPrompt?: string;
        compactionHint?: string;
        blockTools?: string[];
      }
    | undefined;
  beforeToolExecute?: (
    input: PluginBeforeToolInput,
  ) =>
    | Promise<{ allow?: boolean; reason?: string; input?: unknown } | undefined>
    | { allow?: boolean; reason?: string; input?: unknown }
    | undefined;
  afterToolExecute?: (
    input: PluginAfterToolInput,
  ) =>
    | Promise<{ output?: unknown } | undefined>
    | { output?: unknown }
    | undefined;
  evaluatePermission?: (
    input: PluginPermissionInput,
  ) => { effect?: "allow" | "deny" | "ask"; reason?: string } | undefined;
}
