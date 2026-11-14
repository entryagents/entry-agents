import type { LanguageModel, ModelMessage } from "ai";
import {
  compactToolData,
  estimateCompactionSavings,
  findPendingCompactionCandidates,
  findSupersededReadToolCallKeys,
  indexToolCalls,
} from "./aggressive-compaction-helpers";
import { getContextWindowForModel } from "./context-windows";
import { emitCompactionEvent } from "./compaction-telemetry";

/**
 * Fraction of the model's context window that, once crossed, triggers
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

const COMPACTED_TOOL_NOTICE =
  "[Older tool output removed by auto-compaction to stay within the model's context window. " +
  "Re-run the tool if you need the original output again.]";

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

export function maybeCompactMessages({
  messages,
  model,
  contextWindowOverride,
  compactionThresholdOverride,
}: {
  messages: ModelMessage[];
  model: LanguageModel | string;
  contextWindowOverride?: number;
  compactionThresholdOverride?: number;
}): ModelMessage[] {
  if (messages.length <= PROTECTED_RECENT_MESSAGES) {
    return messages;
  }

  const contextWindow = getContextWindowForModel(
    getModelId(model),
    contextWindowOverride,
  );
  const estimatedTokens =
    estimateMessagesTokens(messages) + SYSTEM_AND_TOOLS_OVERHEAD_TOKENS;

  const thresholdRatio =
    typeof compactionThresholdOverride === "number" &&
    compactionThresholdOverride > 0 &&
    compactionThresholdOverride <= 1
      ? compactionThresholdOverride
      : AUTO_COMPACT_THRESHOLD;

  const thresholdTokens = Math.round(contextWindow * thresholdRatio);
  const toolCallIndex = indexToolCalls(messages);

  const recentToolCallKeys = new Set<string>();
  const recentStart = messages.length - PROTECTED_RECENT_MESSAGES;
  for (
    let messageIndex = recentStart;
    messageIndex < messages.length;
    messageIndex++
  ) {
    const partKeys = toolCallIndex.byLocation.get(messageIndex);
    if (!partKeys) continue;
    for (const key of partKeys.values()) {
      recentToolCallKeys.add(key);
    }
  }

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
      return messages;
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
      return messages;
    }

    const compacted = compactToolData({
      messages,
      toolCallIndex,
      pendingCandidates: supersededCandidates,
      compactedToolNotice: COMPACTED_TOOL_NOTICE,
    });
    const compactedTokens =
      estimateMessagesTokens(compacted) + SYSTEM_AND_TOOLS_OVERHEAD_TOKENS;
    emitCompactionEvent({
      preCompactTokens: estimatedTokens,
      postCompactTokens: compactedTokens,
      contextWindowTokens: contextWindow,
      threshold: thresholdRatio,
      compactedToolCalls: supersededKeys.size,
      compactedAnonymousToolResults: 0,
      modelId: getModelId(model),
    });
    return compacted;
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
    return messages;
  }

  console.warn(
    `[auto-compact] ~${estimatedTokens} tokens (~${Math.round(
      (estimatedTokens / contextWindow) * 100,
    )}% of ${contextWindow}) -- compacting ${pendingCandidates.pendingToolCallKeys.size} tool call(s) and ${pendingCandidates.pendingAnonymousToolResults} anonymous tool result(s) older than the last ${PROTECTED_RECENT_MESSAGES} messages.`,
  );

  const compacted = compactToolData({
    messages,
    toolCallIndex,
    pendingCandidates,
    compactedToolNotice: COMPACTED_TOOL_NOTICE,
  });

  const compactedTokens =
    estimateMessagesTokens(compacted) + SYSTEM_AND_TOOLS_OVERHEAD_TOKENS;
  console.warn(
    `[auto-compact] post-compaction request ~${compactedTokens} tokens (~${Math.round(
      (compactedTokens / contextWindow) * 100,
    )}% of ${contextWindow}).`,
  );

  emitCompactionEvent({
    preCompactTokens: estimatedTokens,
    postCompactTokens: compactedTokens,
    contextWindowTokens: contextWindow,
    threshold: thresholdRatio,
    compactedToolCalls: pendingCandidates.pendingToolCallKeys.size,
    compactedAnonymousToolResults:
      pendingCandidates.pendingAnonymousToolResults,
    modelId: getModelId(model),
  });

  return compacted;
}
