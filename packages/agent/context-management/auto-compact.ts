import type { LanguageModel, ModelMessage } from "ai";
import {
  compactToolData,
  estimateCompactionSavings,
  findPendingCompactionCandidates,
  findSupersededReadToolCallKeys,
  indexToolCalls,
  type ToolCallIndex,
} from "./aggressive-compaction-helpers";
import { getContextWindowForModel } from "./context-windows";
import { emitCompactionEvent } from "./compaction-telemetry";

/**
 * Fraction of the effective context budget that, once crossed, triggers
 * auto-compaction of older tool call/result payloads.
 */
export const AUTO_COMPACT_THRESHOLD = 0.95;

/**
 * Minimum token savings required before pruning superseded file/dir reads
 * proactively ahead of the hard threshold (avoids tiny prefix churn on
 * small chats, while eliminating massive duplicate file-read bloat early).
 */
export const SUPERSEDED_PRUNE_MIN_SAVINGS_TOKENS = 24_000;

export const SYSTEM_AND_TOOLS_OVERHEAD_TOKENS = 15_000;

export const PROTECTED_RECENT_MESSAGES = 12;
export const MIN_PROTECTED_RECENT_MESSAGES = 4;
export const TAIL_TOKEN_BUDGET = 24_000;

/**
 * For 1M-context models (deepSeek, step-5, gemini, 1M claude), compacting only
 * at 950K tokens wastes cost and degrades attention. When no explicit threshold
 * override is given and the window is >= 800K, cap the effective pre-compaction
 * budget to 180K tokens (~171K trigger at 0.95).
 */
export const LARGE_CONTEXT_WINDOW_FLOOR = 800_000;
export const LARGE_CONTEXT_SOFT_CAP_TOKENS = 180_000;

const COMPACTED_TOOL_NOTICE =
  "[Older tool output removed by auto-compaction to stay within the model's context window. " +
  "Re-run the tool if you need the original output again.]";

export function estimateMessageTokens(message: ModelMessage): number {
  return Math.ceil(JSON.stringify(message).length / 4);
}

export function estimateMessagesTokens(messages: ModelMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += JSON.stringify(message).length;
  }
  return Math.ceil(chars / 4);
}

function getModelId(model: LanguageModel | string): string {
  return typeof model === "string" ? model : model.modelId;
}

/**
 * Compute how many recent messages to protect at the tail using both count
 * bounds (min 4, max PROTECTED_RECENT_MESSAGES=12) and a token ceiling
 * (TAIL_TOKEN_BUDGET=24K), never splitting a tool result from its assistant
 * tool-call message.
 */
export function selectProtectedRecentStart(messages: ModelMessage[]): number {
  const total = messages.length;
  if (total <= MIN_PROTECTED_RECENT_MESSAGES) {
    return 0;
  }

  let protectedTokens = 0;
  let start = total;
  const maxProtected = Math.min(total, PROTECTED_RECENT_MESSAGES);
  const earliestAllowed = total - maxProtected;

  for (let i = total - 1; i >= earliestAllowed; i--) {
    const countFromEnd = total - i;
    const msgTokens = estimateMessageTokens(messages[i]!);
    if (
      countFromEnd > MIN_PROTECTED_RECENT_MESSAGES &&
      protectedTokens + msgTokens > TAIL_TOKEN_BUDGET
    ) {
      break;
    }
    protectedTokens += msgTokens;
    start = i;
  }

  while (start > 0 && messages[start]?.role === "tool") {
    start--;
  }

  return start;
}

function collectRecentToolCallKeys(
  toolCallIndex: ToolCallIndex,
  recentStart: number,
  totalMessages: number,
): Set<string> {
  const recentToolCallKeys = new Set<string>();
  for (
    let messageIndex = recentStart;
    messageIndex < totalMessages;
    messageIndex++
  ) {
    const partKeys = toolCallIndex.byLocation.get(messageIndex);
    if (!partKeys) continue;
    for (const key of partKeys.values()) {
      recentToolCallKeys.add(key);
    }
  }
  return recentToolCallKeys;
}

export interface CompactionStatsResult {
  messages: ModelMessage[];
  didCompact: boolean;
  tier: "none" | "superseded" | "tool-mask";
  preTokens: number;
  postTokens: number;
  effectiveThresholdTokens: number;
  contextWindow: number;
  protectedTailStart: number;
  needsCheckpointSummary: boolean;
}

export function compactMessagesWithStats({
  messages,
  model,
  contextWindowOverride,
  compactionThresholdOverride,
  systemAndToolsTokensOverride,
  lastKnownInputTokens,
}: {
  messages: ModelMessage[];
  model: LanguageModel | string;
  contextWindowOverride?: number;
  compactionThresholdOverride?: number;
  systemAndToolsTokensOverride?: number;
  lastKnownInputTokens?: number;
}): CompactionStatsResult {
  const modelId = getModelId(model);
  const contextWindow = getContextWindowForModel(
    modelId,
    contextWindowOverride,
  );
  const overheadTokens =
    typeof systemAndToolsTokensOverride === "number" &&
    systemAndToolsTokensOverride > 0
      ? systemAndToolsTokensOverride
      : SYSTEM_AND_TOOLS_OVERHEAD_TOKENS;

  const estimatedFromChars = estimateMessagesTokens(messages) + overheadTokens;
  const estimatedTokens =
    typeof lastKnownInputTokens === "number" && lastKnownInputTokens > 0
      ? Math.max(estimatedFromChars, lastKnownInputTokens)
      : estimatedFromChars;

  const thresholdRatio =
    typeof compactionThresholdOverride === "number" &&
    compactionThresholdOverride > 0 &&
    compactionThresholdOverride <= 1
      ? compactionThresholdOverride
      : AUTO_COMPACT_THRESHOLD;

  // Always honor the model's real context window from the gateway — never clamp
  // 1M-context models down to a hardcoded soft cap.
  const effectiveBudget = contextWindow;
  const thresholdTokens = Math.round(effectiveBudget * thresholdRatio);
  const checkpointTriggerTokens = Math.round(thresholdTokens * 0.85);

  if (messages.length <= MIN_PROTECTED_RECENT_MESSAGES) {
    return {
      messages,
      didCompact: false,
      tier: "none",
      preTokens: estimatedTokens,
      postTokens: estimatedTokens,
      effectiveThresholdTokens: thresholdTokens,
      contextWindow,
      protectedTailStart: 0,
      needsCheckpointSummary: false,
    };
  }

  const recentStart = selectProtectedRecentStart(messages);
  const toolCallIndex = indexToolCalls(messages);
  const recentToolCallKeys = collectRecentToolCallKeys(
    toolCallIndex,
    recentStart,
    messages.length,
  );

  // Phase A (below hard threshold): collapse superseded read/dir_list/git_status
  // results only when doing so reclaims significant duplicate bloat (>= 24K tokens).
  if (estimatedTokens < thresholdTokens) {
    const supersededKeys = findSupersededReadToolCallKeys({
      messages,
      toolCallIndex,
      recentToolCallKeys,
      compactedToolNotice: COMPACTED_TOOL_NOTICE,
    });
    if (supersededKeys.size === 0) {
      return {
        messages,
        didCompact: false,
        tier: "none",
        preTokens: estimatedTokens,
        postTokens: estimatedTokens,
        effectiveThresholdTokens: thresholdTokens,
        contextWindow,
        protectedTailStart: recentStart,
        needsCheckpointSummary:
          estimatedTokens >= thresholdTokens && recentStart > 2,
      };
    }

    const supersededCandidates = {
      pendingToolCallKeys: supersededKeys,
      pendingAnonymousToolResults: 0,
    };
    const savingsTokens = estimateCompactionSavings({
      messages,
      toolCallIndex,
      pendingCandidates: supersededCandidates,
      compactedToolNotice: COMPACTED_TOOL_NOTICE,
    });
    if (savingsTokens < SUPERSEDED_PRUNE_MIN_SAVINGS_TOKENS) {
      return {
        messages,
        didCompact: false,
        tier: "none",
        preTokens: estimatedTokens,
        postTokens: estimatedTokens,
        effectiveThresholdTokens: thresholdTokens,
        contextWindow,
        protectedTailStart: recentStart,
        needsCheckpointSummary: false,
      };
    }

    const compacted = compactToolData({
      messages,
      toolCallIndex,
      pendingCandidates: supersededCandidates,
      compactedToolNotice: COMPACTED_TOOL_NOTICE,
    });
    const compactedTokens = estimateMessagesTokens(compacted) + overheadTokens;
    emitCompactionEvent({
      preCompactTokens: estimatedTokens,
      postCompactTokens: compactedTokens,
      contextWindowTokens: contextWindow,
      threshold: thresholdRatio,
      compactedToolCalls: supersededKeys.size,
      compactedAnonymousToolResults: 0,
      modelId,
    });
    return {
      messages: compacted,
      didCompact: true,
      tier: "superseded",
      preTokens: estimatedTokens,
      postTokens: compactedTokens,
      effectiveThresholdTokens: thresholdTokens,
      contextWindow,
      protectedTailStart: recentStart,
      needsCheckpointSummary:
        compactedTokens >= checkpointTriggerTokens && recentStart > 2,
    };
  }

  // Phase B (threshold crossed): compact all eligible tool payloads outside tail.
  const pendingCandidates = findPendingCompactionCandidates({
    messages,
    toolCallIndex,
    recentToolCallKeys,
    compactedToolNotice: COMPACTED_TOOL_NOTICE,
  });

  if (
    pendingCandidates.pendingToolCallKeys.size === 0 &&
    pendingCandidates.pendingAnonymousToolResults === 0
  ) {
    return {
      messages,
      didCompact: false,
      tier: "none",
      preTokens: estimatedTokens,
      postTokens: estimatedTokens,
      effectiveThresholdTokens: thresholdTokens,
      contextWindow,
      protectedTailStart: recentStart,
      needsCheckpointSummary:
        estimatedTokens >= checkpointTriggerTokens && recentStart > 2,
    };
  }

  console.warn(
    `[auto-compact] ~${estimatedTokens} tokens (~${Math.round(
      (estimatedTokens / effectiveBudget) * 100,
    )}% of ${effectiveBudget}) -- compacting ${pendingCandidates.pendingToolCallKeys.size} tool call(s) and ${pendingCandidates.pendingAnonymousToolResults} anonymous tool result(s) before tail index ${recentStart}.`,
  );

  const compacted = compactToolData({
    messages,
    toolCallIndex,
    pendingCandidates,
    compactedToolNotice: COMPACTED_TOOL_NOTICE,
  });

  const compactedTokens = estimateMessagesTokens(compacted) + overheadTokens;
  console.warn(
    `[auto-compact] post-compaction request ~${compactedTokens} tokens (~${Math.round(
      (compactedTokens / effectiveBudget) * 100,
    )}% of ${effectiveBudget}).`,
  );

  emitCompactionEvent({
    preCompactTokens: estimatedTokens,
    postCompactTokens: compactedTokens,
    contextWindowTokens: contextWindow,
    threshold: thresholdRatio,
    compactedToolCalls: pendingCandidates.pendingToolCallKeys.size,
    compactedAnonymousToolResults:
      pendingCandidates.pendingAnonymousToolResults,
    modelId,
  });

  return {
    messages: compacted,
    didCompact: true,
    tier: "tool-mask",
    preTokens: estimatedTokens,
    postTokens: compactedTokens,
    effectiveThresholdTokens: thresholdTokens,
    contextWindow,
    protectedTailStart: recentStart,
    needsCheckpointSummary:
      compactedTokens >= checkpointTriggerTokens && recentStart > 2,
  };
}

export function maybeCompactMessages({
  messages,
  model,
  contextWindowOverride,
  compactionThresholdOverride,
  systemAndToolsTokensOverride,
  lastKnownInputTokens,
}: {
  messages: ModelMessage[];
  model: LanguageModel | string;
  contextWindowOverride?: number;
  compactionThresholdOverride?: number;
  systemAndToolsTokensOverride?: number;
  lastKnownInputTokens?: number;
}): ModelMessage[] {
  return compactMessagesWithStats({
    messages,
    model,
    contextWindowOverride,
    compactionThresholdOverride,
    systemAndToolsTokensOverride,
    lastKnownInputTokens,
  }).messages;
}
