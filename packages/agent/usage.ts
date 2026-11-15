import {
  getToolName,
  isToolUIPart,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";

export type TaskToolUsageEvent = {
  usage: LanguageModelUsage;
  modelId?: string;
  toolCallId?: string;
};

function addTokenCounts(
  tokenCount1: number | undefined,
  tokenCount2: number | undefined,
): number | undefined {
  if (tokenCount1 == null && tokenCount2 == null) {
    return undefined;
  }
  return (tokenCount1 ?? 0) + (tokenCount2 ?? 0);
}

export function addLanguageModelUsage(
  usage1: LanguageModelUsage,
  usage2: LanguageModelUsage,
): LanguageModelUsage {
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    inputTokenDetails: {
      noCacheTokens: addTokenCounts(
        usage1.inputTokenDetails?.noCacheTokens,
        usage2.inputTokenDetails?.noCacheTokens,
      ),
      cacheReadTokens: addTokenCounts(
        usage1.inputTokenDetails?.cacheReadTokens,
        usage2.inputTokenDetails?.cacheReadTokens,
      ),
      cacheWriteTokens: addTokenCounts(
        usage1.inputTokenDetails?.cacheWriteTokens,
        usage2.inputTokenDetails?.cacheWriteTokens,
      ),
    },
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    outputTokenDetails: {
      textTokens: addTokenCounts(
        usage1.outputTokenDetails?.textTokens,
        usage2.outputTokenDetails?.textTokens,
      ),
      reasoningTokens: addTokenCounts(
        usage1.outputTokenDetails?.reasoningTokens,
        usage2.outputTokenDetails?.reasoningTokens,
      ),
    },
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens),
    reasoningTokens: addTokenCounts(
      usage1.reasoningTokens,
      usage2.reasoningTokens,
    ),
    cachedInputTokens: addTokenCounts(
      usage1.cachedInputTokens,
      usage2.cachedInputTokens,
    ),
  };
}

export function sumLanguageModelUsage(
  usage1: LanguageModelUsage | undefined,
  usage2: LanguageModelUsage | undefined,
): LanguageModelUsage | undefined {
  if (!usage1) {
    return usage2;
  }
  if (!usage2) {
    return usage1;
  }
  return addLanguageModelUsage(usage1, usage2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isLanguageModelUsage(value: unknown): value is LanguageModelUsage {
  if (!isRecord(value)) {
    return false;
  }
  const inputTokenDetails = value.inputTokenDetails;
  const outputTokenDetails = value.outputTokenDetails;
  return (
    isRecord(inputTokenDetails) ||
    isRecord(outputTokenDetails) ||
    isNumber(value.inputTokens) ||
    isNumber(value.outputTokens) ||
    isNumber(value.totalTokens) ||
    isNumber(value.cachedInputTokens) ||
    isNumber(value.reasoningTokens)
  );
}

function extractTaskOutputUsage(
  output: unknown,
  toolCallId?: string,
): TaskToolUsageEvent | undefined {
  if (!isRecord(output)) {
    return undefined;
  }

  // New output shape: {
  //   usage?: LanguageModelUsage,
  //   final?: ModelMessage[],
  //   modelId?: string,
  // }
  const usage = output.usage;
  const modelId =
    typeof output.modelId === "string" ? output.modelId : undefined;
  if (isLanguageModelUsage(usage)) {
    return { usage, modelId, toolCallId };
  }

  // Legacy fallback: { metadata: { totalMessageUsage?, lastStepUsage?, modelId? } }
  const metadata = output.metadata;
  if (!isRecord(metadata)) {
    return undefined;
  }
  const legacyModelId =
    typeof metadata.modelId === "string" ? metadata.modelId : undefined;
  const totalMessageUsage = metadata.totalMessageUsage;
  if (isLanguageModelUsage(totalMessageUsage)) {
    return { usage: totalMessageUsage, modelId: legacyModelId, toolCallId };
  }
  const lastStepUsage = metadata.lastStepUsage;
  if (isLanguageModelUsage(lastStepUsage)) {
    return { usage: lastStepUsage, modelId: legacyModelId, toolCallId };
  }
  return undefined;
}

export function collectTaskToolUsageEvents(
  message: UIMessage,
): TaskToolUsageEvent[] {
  const events: TaskToolUsageEvent[] = [];
  for (const part of message.parts) {
    if (!isToolUIPart(part)) {
      continue;
    }
    const toolName = getToolName(part);
    if (toolName !== "task" && part.type !== "tool-task") {
      continue;
    }
    if (!part.output) {
      continue;
    }
    const toolCallId =
      typeof part.toolCallId === "string" ? part.toolCallId : undefined;
    const usage = extractTaskOutputUsage(part.output, toolCallId);
    if (!usage) {
      continue;
    }
    events.push(usage);
  }
  return events;
}

export function collectTaskToolUsage(
  message: UIMessage,
): LanguageModelUsage | undefined {
  const events = collectTaskToolUsageEvents(message);
  let totalUsage: LanguageModelUsage | undefined;
  for (const event of events) {
    totalUsage = totalUsage
      ? addLanguageModelUsage(totalUsage, event.usage)
      : event.usage;
  }
  return totalUsage;
}

function asNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Extracts prompt cache read tokens across AI SDK normalized fields AND raw
 * provider metadata shapes (DeepSeek `prompt_cache_hit_tokens`, OpenAI
 * `prompt_tokens_details.cached_tokens`, Anthropic `cache_read_input_tokens`,
 * OpenAI-compatible gateway shims).
 */
export function extractCachedInputTokens(
  usage: LanguageModelUsage | undefined,
  providerMetadata?: unknown,
): number {
  const direct =
    asNonNegativeNumber(usage?.inputTokenDetails?.cacheReadTokens) ??
    asNonNegativeNumber(usage?.cachedInputTokens);

  if (direct !== undefined && direct > 0) {
    return direct;
  }

  const meta = asRecord(providerMetadata);
  if (meta) {
    const candidates: unknown[] = [
      meta.prompt_cache_hit_tokens,
      meta.promptCacheHitTokens,
      meta.cached_tokens,
      meta.cachedInputTokens,
      meta.cache_read_input_tokens,
      meta.cacheReadInputTokens,
    ];

    for (const nsKey of [
      "deepseek",
      "openai",
      "anthropic",
      "google",
      "gateway",
    ]) {
      const ns = asRecord(meta[nsKey]);
      if (!ns) continue;
      candidates.push(
        ns.prompt_cache_hit_tokens,
        ns.promptCacheHitTokens,
        ns.cachedPromptTokens,
        ns.cached_tokens,
        ns.cacheReadInputTokens,
        ns.cache_read_input_tokens,
        ns.cachedContentTokenCount,
      );
      const nsDetails = asRecord(ns.prompt_tokens_details ?? ns.usage);
      if (nsDetails) {
        candidates.push(
          nsDetails.cached_tokens,
          nsDetails.prompt_cache_hit_tokens,
          nsDetails.cache_read_input_tokens,
        );
      }
    }

    for (const candidate of candidates) {
      const num = asNonNegativeNumber(candidate);
      if (num !== undefined && num > 0) {
        return num;
      }
    }
  }

  return direct ?? 0;
}

export function extractCacheWriteTokens(
  usage: LanguageModelUsage | undefined,
  providerMetadata?: unknown,
): number {
  const direct = asNonNegativeNumber(
    usage?.inputTokenDetails?.cacheWriteTokens,
  );
  if (direct !== undefined && direct > 0) {
    return direct;
  }

  const meta = asRecord(providerMetadata);
  if (meta) {
    const candidates: unknown[] = [
      meta.cache_creation_input_tokens,
      meta.cacheCreationInputTokens,
      meta.cache_write_input_tokens,
    ];
    for (const nsKey of ["anthropic", "deepseek", "openai", "gateway"]) {
      const ns = asRecord(meta[nsKey]);
      if (!ns) continue;
      candidates.push(
        ns.cacheCreationInputTokens,
        ns.cache_creation_input_tokens,
        ns.cacheWriteInputTokens,
      );
    }
    for (const candidate of candidates) {
      const num = asNonNegativeNumber(candidate);
      if (num !== undefined && num > 0) {
        return num;
      }
    }
  }

  return direct ?? 0;
}

/**
 * Ensures AI SDK `LanguageModelUsage` carries accurate `inputTokenDetails`
 * cache metrics even when a gateway/provider only exposes them in raw
 * `providerMetadata` (e.g., DeepSeek `prompt_cache_hit_tokens`).
 */
export function enrichUsageWithProviderCache(
  usage: LanguageModelUsage | undefined,
  providerMetadata?: unknown,
): LanguageModelUsage | undefined {
  if (!usage) return usage;
  const cacheRead = extractCachedInputTokens(usage, providerMetadata);
  const cacheWrite = extractCacheWriteTokens(usage, providerMetadata);
  const currentRead = usage.inputTokenDetails?.cacheReadTokens;
  const currentWrite = usage.inputTokenDetails?.cacheWriteTokens;

  if (
    (cacheRead === 0 || currentRead === cacheRead) &&
    (cacheWrite === 0 || currentWrite === cacheWrite) &&
    (usage.cachedInputTokens === cacheRead || cacheRead === 0)
  ) {
    return usage;
  }

  return {
    ...usage,
    cachedInputTokens: Math.max(usage.cachedInputTokens ?? 0, cacheRead),
    inputTokenDetails: {
      ...usage.inputTokenDetails,
      cacheReadTokens: Math.max(currentRead ?? 0, cacheRead),
      cacheWriteTokens: Math.max(currentWrite ?? 0, cacheWrite),
    },
  };
}
