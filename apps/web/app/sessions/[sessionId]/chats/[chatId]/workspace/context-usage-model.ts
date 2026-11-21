import type { LanguageModelUsage } from "ai";
import type { WebAgentUIMessage, WebAgentStepCostBreakdown } from "@/app/types";
import {
  extractCachedInputTokens,
  extractCacheWriteTokens,
} from "@/lib/chat/usage-extract";
import type { ModelOption } from "@/lib/model-options";
import { DEFAULT_CONTEXT_LIMIT, estimateModelUsageCost } from "@/lib/models";

/**
 * Context categories in steps of monochrome ivory, brightest first —
 * ported 1:1 from Sable's `src/features/rail/ContextTab.tsx`.
 */
export const CONTEXT_STEPS = [
  0.9, 0.66, 0.48, 0.35, 0.26, 0.19, 0.14, 0.1,
] as const;

/**
 * Matches Entry's `AUTO_COMPACT_THRESHOLD = 0.95` from
 * `packages/agent/context-management/auto-compact.ts`.
 */
export const AUTO_COMPACT_THRESHOLD = 0.95;
export const AUTO_COMPACT_BUFFER_RATIO = 1 - AUTO_COMPACT_THRESHOLD;

export function contextStepTint(index: number): string {
  const step = CONTEXT_STEPS[Math.min(index, CONTEXT_STEPS.length - 1)] ?? 0.1;
  return `rgb(var(--cx-step-rgb) / ${step})`;
}

export interface ContextSegment {
  name: string;
  tokens: number;
  color: string;
}

export type CostSource = "gateway" | "estimated" | "mixed";

export interface SessionUsageTotals {
  /** Uncached / new input tokens across the session (excludes cache reads and writes). */
  inputTokens: number;
  /** Output tokens across the session (excluding reasoning tokens when separated). */
  outputTokens: number;
  /** Cached input (prompt cache read) tokens across the session. */
  cacheReadTokens: number;
  /** Prompt cache creation / write tokens across the session. */
  cacheWriteTokens: number;
  /** Model reasoning / thinking tokens across the session. */
  reasoningTokens: number;
  /** Total tokens processed across the session. */
  totalTokens: number;
  /** Prompt cache hit rate (0..100), or null when no input tokens yet. */
  cacheHitRate: number | null;
  /** Number of user turns in this conversation. */
  turns: number;
  /** Cumulative session cost in USD, if known. */
  costUsd: number | undefined;
  costSource: CostSource | undefined;
}

export interface ContextWindowBreakdown {
  /** Active context window tokens from the most recent non-empty assistant step. */
  total: number;
  /** Maximum model context window in tokens. */
  max: number;
  /** Reserved autocompact buffer in tokens. */
  buffer: number;
  /** Remaining tokens before auto-compaction triggers (or free space if buffer === 0). */
  free: number;
  /** Exact utilization percentage (0..100). */
  pct: number;
  /** Sable's warning threshold (`pct > 80`). */
  warn: boolean;
  /** Used segments sorted descending by tokens, painted brightest first. */
  segments: ContextSegment[];
  /** Whether a per-category breakdown is available. */
  detailed: boolean;
  /** Active model ID. */
  modelId: string;
  /** Display label for the active model. */
  modelName: string;
  /** Cumulative session totals across all turns. */
  sessionTotals: SessionUsageTotals;
}

/**
 * Format a context percentage the exact Sable way:
 * `<1` when strictly between 0 and 1, otherwise rounded integer string.
 */
export function formatPercentDisplay(pct: number): string {
  if (pct > 0 && pct < 1) return "<1";
  return String(Math.round(pct));
}

/**
 * Format a legend row share the exact Sable way (`share()` in ContextTab.tsx).
 */
export function formatShare(tokens: number, max: number): string {
  if (max <= 0 || tokens <= 0) return "0%";
  const p = (tokens / max) * 100;
  if (p > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

/**
 * Format USD session cost matching Sable's `formatCost` / `money`.
 */
export function formatCostUsd(usd: number | undefined): string {
  if (usd === undefined) return "—";
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: usd >= 100 ? 0 : 2,
    minimumFractionDigits: usd >= 100 ? 0 : 2,
  });
}

function aggregateStepsUsage(
  steps: WebAgentStepCostBreakdown[] | undefined,
): LanguageModelUsage | undefined {
  if (!steps || steps.length === 0) return undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;
  let any = false;
  for (const s of steps) {
    if (!s.usage) continue;
    any = true;
    const inp = Math.max(0, s.usage.inputTokens ?? 0);
    const out = Math.max(0, s.usage.outputTokens ?? 0);
    const cr = extractCachedInputTokens(s.usage);
    const cw = extractCacheWriteTokens(s.usage);
    const rt =
      s.usage.outputTokenDetails?.reasoningTokens ??
      s.usage.reasoningTokens ??
      0;
    inputTokens += inp;
    outputTokens += out;
    cacheReadTokens += cr;
    cacheWriteTokens += cw;
    reasoningTokens += rt;
    totalTokens += s.usage.totalTokens ?? inp + out;
  }
  if (!any) return undefined;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: cacheReadTokens,
    inputTokenDetails: {
      noCacheTokens: Math.max(
        0,
        inputTokens - cacheReadTokens - cacheWriteTokens,
      ),
      cacheReadTokens,
      cacheWriteTokens,
    },
    outputTokenDetails: {
      textTokens: Math.max(0, outputTokens - reasoningTokens),
      reasoningTokens,
    },
  };
}

function usageTokenSum(usage: LanguageModelUsage | undefined): number {
  if (!usage) return 0;
  return (
    Math.max(0, usage.inputTokens ?? 0) + Math.max(0, usage.outputTokens ?? 0)
  );
}

export function deriveContextWindowBreakdown(
  messages: WebAgentUIMessage[],
  modelId: string,
  modelOptions: ModelOption[],
  contextLimitOverride?: number | null,
): ContextWindowBreakdown {
  let latestNewInput = 0;
  let latestCacheRead = 0;
  let latestCacheWrite = 0;
  let latestReasoning = 0;
  let latestOutput = 0;
  let latestTotal = 0;

  let totalNewInput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalReasoning = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let hasGatewayCost = false;
  let hasEstimatedCost = false;
  let turns = 0;
  let lastMessageModelId = "";

  for (const msg of messages) {
    if (msg.role === "user") {
      turns += 1;
      continue;
    }
    if (msg.role !== "assistant") continue;
    const meta = msg.metadata;
    if (!meta) continue;

    if (meta.modelId) {
      lastMessageModelId = meta.modelId;
    }

    // Active context window occupancy = the last non-empty step sent to the model.
    // Ignore trailing aborted/error messages with 0 tokens so the meter never resets to 0.
    const lastUsage =
      meta.lastStepUsage ??
      meta.stepBreakdown?.at(-1)?.usage ??
      meta.totalMessageUsage;
    if (usageTokenSum(lastUsage) > 0 && lastUsage) {
      const inp = Math.max(0, lastUsage.inputTokens ?? 0);
      const cacheRead = Math.min(extractCachedInputTokens(lastUsage), inp);
      const cacheWrite = Math.min(
        extractCacheWriteTokens(lastUsage),
        Math.max(0, inp - cacheRead),
      );
      const out = Math.max(0, lastUsage.outputTokens ?? 0);
      const reasoning = Math.min(
        Math.max(
          0,
          lastUsage.outputTokenDetails?.reasoningTokens ??
            lastUsage.reasoningTokens ??
            0,
        ),
        out,
      );
      // AI SDK `inputTokens` = total prompt size (uncached + cacheRead + cacheWrite).
      // Splitting cleanly guarantees NewInput + CacheRead + CacheWrite + Reasoning + Output === total.
      latestCacheRead = cacheRead;
      latestCacheWrite = cacheWrite;
      latestNewInput = Math.max(0, inp - cacheRead - cacheWrite);
      latestReasoning = reasoning;
      latestOutput = Math.max(0, out - reasoning);
      latestTotal = inp + out;
    }

    // Synthetic compaction notices reset the live context occupancy without
    // adding fake tokens/cost to cumulative session billing totals.
    if (meta.isCompactionNotice) {
      continue;
    }

    // Cumulative session totals across all steps of the conversation.
    const msgUsage =
      meta.totalMessageUsage ??
      aggregateStepsUsage(meta.stepBreakdown) ??
      meta.lastStepUsage;
    if (msgUsage) {
      const inp = Math.max(0, msgUsage.inputTokens ?? 0);
      const cacheRead = Math.min(extractCachedInputTokens(msgUsage), inp);
      const cacheWrite = Math.min(
        extractCacheWriteTokens(msgUsage),
        Math.max(0, inp - cacheRead),
      );
      const out = Math.max(0, msgUsage.outputTokens ?? 0);
      const reasoning = Math.min(
        Math.max(
          0,
          msgUsage.outputTokenDetails?.reasoningTokens ??
            msgUsage.reasoningTokens ??
            0,
        ),
        out,
      );

      totalNewInput += Math.max(0, inp - cacheRead - cacheWrite);
      totalCacheRead += cacheRead;
      totalCacheWrite += cacheWrite;
      totalReasoning += reasoning;
      totalOutput += Math.max(0, out - reasoning);

      if (
        typeof meta.totalMessageCost === "number" &&
        Number.isFinite(meta.totalMessageCost)
      ) {
        totalCost += meta.totalMessageCost;
        hasGatewayCost = true;
      } else if (meta.stepBreakdown && meta.stepBreakdown.length > 0) {
        // Price per-step whenever stepBreakdown is available so multi-step summed
        // input tokens never falsely trigger single-step context pricing tiers.
        for (const step of meta.stepBreakdown) {
          if (typeof step.cost === "number" && Number.isFinite(step.cost)) {
            totalCost += step.cost;
            hasGatewayCost = true;
            continue;
          }
          if (!step.usage) continue;
          const stepModelId = step.modelId ?? meta.modelId ?? modelId;
          const costSpec = modelOptions.find((m) => m.id === stepModelId)?.cost;
          const sInp = Math.max(0, step.usage.inputTokens ?? 0);
          const sCacheRead = Math.min(
            extractCachedInputTokens(step.usage),
            sInp,
          );
          const sCacheWrite = Math.min(
            extractCacheWriteTokens(step.usage),
            Math.max(0, sInp - sCacheRead),
          );
          const est = estimateModelUsageCost(
            {
              inputTokens: sInp,
              cachedInputTokens: sCacheRead,
              cacheWriteInputTokens: sCacheWrite,
              outputTokens: Math.max(0, step.usage.outputTokens ?? 0),
            },
            costSpec,
          );
          if (typeof est === "number") {
            totalCost += est;
            hasEstimatedCost = true;
          }
        }
      } else {
        const msgModel = meta.modelId ?? modelId;
        const costSpec = modelOptions.find((m) => m.id === msgModel)?.cost;
        const est = estimateModelUsageCost(
          {
            inputTokens: inp,
            cachedInputTokens: cacheRead,
            cacheWriteInputTokens: cacheWrite,
            outputTokens: out,
          },
          costSpec,
        );
        if (typeof est === "number") {
          totalCost += est;
          hasEstimatedCost = true;
        }
      }
    }
  }

  // Always follow the live selected model so switching models updates the window
  // limit and model label immediately before the next message completes.
  const effectiveModelId = modelId || lastMessageModelId;
  const activeOption = modelOptions.find((m) => m.id === effectiveModelId);
  const max =
    (typeof contextLimitOverride === "number" && contextLimitOverride > 0
      ? contextLimitOverride
      : undefined) ??
    activeOption?.contextWindow ??
    DEFAULT_CONTEXT_LIMIT;

  const thresholdRatio =
    typeof activeOption?.compactionThreshold === "number" &&
    activeOption.compactionThreshold > 0 &&
    activeOption.compactionThreshold <= 1
      ? activeOption.compactionThreshold
      : AUTO_COMPACT_THRESHOLD;
  const compactAt = max > 0 ? Math.round(max * thresholdRatio) : 0;
  const buffer = max > 0 ? Math.max(0, max - compactAt) : 0;
  const free = Math.max(0, max - latestTotal - buffer);
  const pct = max > 0 ? Math.min(100, (latestTotal / max) * 100) : 0;

  const rawCategories: Array<{ name: string; tokens: number }> = [
    { name: "Cache read", tokens: latestCacheRead },
    { name: "Cache write", tokens: latestCacheWrite },
    { name: "New input", tokens: latestNewInput },
    { name: "Reasoning", tokens: latestReasoning },
    { name: "Output", tokens: latestOutput },
  ];

  const segments: ContextSegment[] = rawCategories
    .filter((c) => c.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .map((c, i) => ({
      name: c.name,
      tokens: c.tokens,
      color: contextStepTint(i),
    }));

  const costSource: CostSource | undefined =
    hasGatewayCost && hasEstimatedCost
      ? "mixed"
      : hasGatewayCost
        ? "gateway"
        : hasEstimatedCost
          ? "estimated"
          : undefined;

  const modelName =
    activeOption?.label ?? activeOption?.shortLabel ?? effectiveModelId ?? "";

  const totalInputAll = totalNewInput + totalCacheRead + totalCacheWrite;
  const totalTokens = totalInputAll + totalOutput + totalReasoning;
  const cacheHitRate =
    totalInputAll > 0
      ? Math.round((totalCacheRead / totalInputAll) * 100)
      : null;

  return {
    total: latestTotal,
    max,
    buffer,
    free,
    pct,
    warn: pct > 80,
    segments,
    detailed: segments.length > 0,
    modelId: effectiveModelId,
    modelName,
    sessionTotals: {
      inputTokens: totalNewInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
      reasoningTokens: totalReasoning,
      totalTokens,
      cacheHitRate,
      turns,
      costUsd: costSource ? totalCost : undefined,
      costSource,
    },
  };
}
