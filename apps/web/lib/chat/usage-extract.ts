import type { LanguageModelUsage } from "ai";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
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
