export {
  type GatewayConfig,
  type GatewayOptions,
  type ProviderOptionsByProvider,
  type SharedProviderModelId,
  createInertPlaceholderModel,
  isGeminiModelId,
  sharedProvider,
  gateway,
} from "./models";
export type {
  AgentModelSelection,
  AgentSandboxContext,
  OpenAgentCallOptions,
  OpenAgentModelInput,
} from "./open-agent";
export { defaultModel, defaultModelLabel, openAgent } from "./open-agent";
// Skills exports
export { discoverSkills, parseSkillFrontmatter } from "./skills/discovery";
export {
  getBuiltinSkillsMetadata,
  seedBuiltinSkills,
} from "./skills/builtin/seed";
export { extractSkillBody, substituteArguments } from "./skills/loader";
export type {
  SkillFrontmatter,
  SkillMetadata,
  SkillOptions,
} from "./skills/types";
export { frontmatterToOptions, skillFrontmatterSchema } from "./skills/types";
// Subagent type exports
export type {
  SubagentMessageMetadata,
  SubagentUIMessage,
} from "./subagents/types";
export type { SubagentBudgetGuard, SubagentBudgetPlan } from "./types";
export type { BuildSystemPromptOptions } from "./system-prompt";
export { buildSystemPrompt } from "./system-prompt";
export {
  type AskUserQuestionInput,
  type AskUserQuestionOutput,
  type AskUserQuestionToolUIPart,
} from "./tools/ask-user-question";
export type { SkillToolInput } from "./tools/skill";
export { isAllowedWebUrl, isPrivateHost } from "./tools/fetch";
export {
  createSecretRedactor,
  isHostAllowedForSecret,
  resolveSecretRecordTemplates,
  resolveSecretTemplates,
  SecretTemplateError,
  type RuntimeSecret,
  type SecretCatalogEntry,
  type SecretRedactor,
} from "./lib/secret-redactor";
export {
  createMcpToolSet,
  discoverMcpServerTools,
  namespacedMcpToolName,
  type CreateMcpToolSetOptions,
  type McpDiscoveredTool,
  type McpServerConfig,
  type McpToolSetResult,
  type McpConnectionFailure,
} from "./tools/mcp";
// Tool exports
export type {
  TaskPendingToolCall,
  TaskToolOutput,
  TaskToolUIPart,
} from "./tools/task";
export type {
  AgentContext,
  GithubApiRequestInput,
  GithubApiResult,
  GithubCliToolResult,
  GithubCommitToolResult,
  GithubRawCliResult,
  GithubToolContext,
  TodoItem,
  TodoStatus,
  VercelApiRequestInput,
  VercelApiResult,
  VercelCliToolResult,
  VercelToolContext,
} from "./types";
export {
  addLanguageModelUsage,
  collectTaskToolUsage,
  collectTaskToolUsageEvents,
  sumLanguageModelUsage,
} from "./usage";
export {
  runWithCompactionSink,
  emitCompactionEvent,
} from "./context-management/compaction-telemetry";
export type { CompactionEvent } from "./context-management/compaction-telemetry";
export {
  AUTO_COMPACT_THRESHOLD,
  PROTECTED_RECENT_MESSAGES,
  maybeCompactMessages,
} from "./context-management/auto-compact";
// Plugins exports
export {
  BUILTIN_PLUGIN_CATALOG,
  PLUGIN_HOOK_EVENTS,
  PLUGIN_SLUG_PATTERN,
  applyPluginHooksToTools,
  createPluginRunner,
  getBuiltinPluginBySlug,
  pluginCategorySchema,
  pluginConfigFieldSchema,
  pluginHookEventSchema,
  pluginManifestSchema,
  pluginRuleSetSchema,
  pluginSlashCommandSchema,
  type EntryPluginRuntimeHooks,
  type PluginAfterToolInput,
  type PluginBeforeToolInput,
  type PluginBeforeToolResult,
  type PluginCategory,
  type PluginConfigField,
  type PluginContextHookInput,
  type PluginContextHookResult,
  type PluginHookEvent,
  type PluginManifest,
  type PluginPermissionInput,
  type PluginPermissionResult,
  type PluginRuleSet,
  type PluginRunner,
  type PluginSlashCommand,
  type ResolvedEntryPlugin,
} from "./plugins";
// Multi-agent team exports
export {
  TeamBoard,
  clearTeamBoard,
  formatTeamContextSummary,
  getOrCreateTeamBoard,
  rebuildTeamBoardFromMessages,
  type TeamBoardEntry,
  type TeamBoardEntryKind,
  type TeamBoardSnapshot,
  type TeamTaskStatus,
  type TeamWorkItem,
} from "./team";
export type {
  TeamBoardToolInput,
  TeamBoardToolOutput,
  TeamBoardToolUIPart,
} from "./tools/team";
export {
  SUBAGENT_REGISTRY,
  SUBAGENT_TYPES,
  type SubagentType,
} from "./subagents/registry";
