import { describe, expect, test } from "bun:test";
import type { LanguageModelUsage } from "ai";
import {
  enrichUsageWithProviderCache,
  extractCachedInputTokens,
  extractCacheWriteTokens,
} from "./usage-extract";

describe("usage-extract prompt cache helpers", () => {
  test("extracts DeepSeek prompt_cache_hit_tokens from providerMetadata", () => {
    const usage = {
      inputTokens: 12000,
      outputTokens: 450,
      totalTokens: 12450,
    } as LanguageModelUsage;

    const cached = extractCachedInputTokens(usage, {
      deepseek: { prompt_cache_hit_tokens: 9600 },
    });

    expect(cached).toBe(9600);
  });

  test("extracts OpenAI prompt_tokens_details.cached_tokens and Anthropic cache_creation_input_tokens", () => {
    const usage = {
      inputTokens: 8000,
      outputTokens: 300,
    } as LanguageModelUsage;

    expect(
      extractCachedInputTokens(usage, {
        openai: { prompt_tokens_details: { cached_tokens: 4096 } },
      }),
    ).toBe(4096);

    expect(
      extractCacheWriteTokens(usage, {
        anthropic: { cache_creation_input_tokens: 2048 },
      }),
    ).toBe(2048);
  });

  test("enrichUsageWithProviderCache populates inputTokenDetails and cachedInputTokens", () => {
    const usage = {
      inputTokens: 10000,
      outputTokens: 500,
      totalTokens: 10500,
    } as LanguageModelUsage;

    const enriched = enrichUsageWithProviderCache(usage, {
      gateway: {
        prompt_cache_hit_tokens: 8192,
        cache_creation_input_tokens: 1024,
      },
    });

    expect(enriched?.cachedInputTokens).toBe(8192);
    expect(enriched?.inputTokenDetails?.cacheReadTokens).toBe(8192);
    expect(enriched?.inputTokenDetails?.cacheWriteTokens).toBe(1024);
  });
});
