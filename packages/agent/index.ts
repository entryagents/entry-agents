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
export { seedBuiltinSkills } from "./skills/builtin/seed";
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
  createMcpToolSet,
  namespacedMcpToolName,
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

export {
  applyMcpCodeModeDefaults,
  BUILTIN_ENTRY_PLUGINS,
  buildPlanEnterReminder,
  type EntryPluginDescriptor,
  expandSlashCommandPrompt,
  type HookDomain,
  type McpInstructionServerSummary,
  optimizeSystemPromptForModel,
  PLAN_LEAVE_REMINDER,
  PROMPT_EXPLORE,
  PROMPT_GOAL_CONTINUATION,
  PROMPT_GOAL_JUDGE,
  PROMPT_GOAL_KICKOFF,
  PROMPT_GOAL_REMINDER,
  PROMPT_SUMMARY,
  PROMPT_TITLE,
  renderMcpInstructionsXml,
  repairToolInput,
  resolveToolAlias,
  supportsLowVerbosity,
} from "./plugins/entry-plugins";
export {
  buildModelIdentityBlock,
  PROMPT_ANTHROPIC,
  PROMPT_COMMAND_INITIALIZE,
  PROMPT_COMMAND_REVIEW,
  PROMPT_GPT,
  PROMPT_GPT_ASTRA,
  PROMPT_KIMI,
  PROMPT_META,
  PROMPT_SYSTEM_HARNESS,
  PROMPT_TRINITY,
  renderSessionSystemPrompt,
  renderToolGuidance,
} from "./prompts/entry-prompts";
