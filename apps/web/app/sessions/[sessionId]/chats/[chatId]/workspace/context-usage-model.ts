import type { WebAgentUIMessage } from "@/app/types";
import type { BillingMeResponse } from "@/components/sidebar-billing-widget";
import { extractCachedInputTokens } from "@/lib/chat/usage-extract";
import { formatUsdCents } from "@/lib/format-usd";
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
 * `packages/agent/context-management/auto-compact.ts` (5% autocompact buffer).
 */
export const AUTO_COMPACT_BUFFER_RATIO = 0.05;

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
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  turns: number;
  costUsd: number | undefined;
  costSource: CostSource | undefined;
}

export interface ContextWindowBreakdown {
  /** Active context window tokens from the most recent assistant step. */
  total: number;
  /** Maximum model context window in tokens. */
  max: number;
  /** Reserved autocompact buffer in tokens. */
  buffer: number;
  /** Remaining tokens before auto-compaction triggers. */
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

/**
 * Format milliseconds until a plan window reset, ported 1:1 from Sable's
 * `src/features/usage/format.ts` (`duration()`): `"<1m"`, `"38m"`, `"2h 14m"`, `"3d 4h"`.
 */
export function formatResetDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function deriveContextWindowBreakdown(
  messages: WebAgentUIMessage[],
  modelId: string,
  modelOptions: ModelOption[],
  contextLimitOverride?: number | null,
): ContextWindowBreakdown {
  let latestUncached = 0;
  let latestCached = 0;
  let latestOutput = 0;
  let latestTotal = 0;

  let totalInput = 0;
  let totalCached = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let hasGatewayCost = false;
  let hasEstimatedCost = false;
  let turns = 0;
  let activeModelId = modelId;

  for (const msg of messages) {
    if (msg.role === "user") {
      turns += 1;
      continue;
    }
    if (msg.role !== "assistant") continue;
    const meta = msg.metadata;
    if (!meta) continue;
    if (meta.modelId) {
      activeModelId = meta.modelId;
    }

    const lastUsage = meta.lastStepUsage ?? meta.totalMessageUsage;
    if (lastUsage) {
      const inp = lastUsage.inputTokens ?? 0;
      const cached = extractCachedInputTokens(lastUsage);
      const out = lastUsage.outputTokens ?? 0;
      latestCached = Math.min(cached, inp);
      latestUncached = Math.max(0, inp - latestCached);
      latestOutput = out;
      latestTotal = inp + out;
    }

    const msgUsage = meta.totalMessageUsage ?? meta.lastStepUsage;
    if (msgUsage) {
      const inp = msgUsage.inputTokens ?? 0;
      const cached = extractCachedInputTokens(msgUsage);
      const out = msgUsage.outputTokens ?? 0;
      totalInput += inp;
      totalCached += cached;
      totalOutput += out;

      if (typeof meta.totalMessageCost === "number") {
        totalCost += meta.totalMessageCost;
        hasGatewayCost = true;
      } else {
        const msgModel = meta.modelId ?? modelId;
        const costSpec = modelOptions.find((m) => m.id === msgModel)?.cost;
        const est = estimateModelUsageCost(
          {
            inputTokens: inp,
            cachedInputTokens: cached,
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

  const activeOption = modelOptions.find((m) => m.id === activeModelId);
  const max =
    (typeof contextLimitOverride === "number" && contextLimitOverride > 0
      ? contextLimitOverride
      : undefined) ??
    activeOption?.contextWindow ??
    DEFAULT_CONTEXT_LIMIT;

  const buffer = max > 0 ? Math.round(max * AUTO_COMPACT_BUFFER_RATIO) : 0;
  const free = Math.max(0, max - latestTotal - buffer);
  const pct = max > 0 ? Math.min(100, (latestTotal / max) * 100) : 0;

  const rawCategories: Array<{ name: string; tokens: number }> = [
    { name: "Input", tokens: latestUncached },
    { name: "Cached", tokens: latestCached },
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
    activeOption?.label ?? activeOption?.shortLabel ?? activeModelId ?? "";

  return {
    total: latestTotal,
    max,
    buffer,
    free,
    pct,
    warn: pct > 80,
    segments,
    detailed: segments.length > 0,
    modelId: activeModelId,
    modelName,
    sessionTotals: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCached,
      turns,
      costUsd: costSource ? totalCost : undefined,
      costSource,
    },
  };
}

export type PlanWindowLevel = "amber" | "red" | undefined;

export interface PlanLimitWindow {
  id: string;
  label: string;
  percent: number;
  level: PlanWindowLevel;
  resetsIn: string | null;
  past: boolean;
  note: string;
}

export interface PlanLimitsView {
  planName: string;
  windows: PlanLimitWindow[];
  hasResetColumn: boolean;
  footerNote: string | null;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function windowLevelForPercent(
  percent: number,
  past: boolean,
): PlanWindowLevel {
  if (past) return undefined;
  if (percent >= 100) return "red";
  if (percent >= 80) return "amber";
  return undefined;
}

/**
 * Maps Entry's `/api/billing/me` payload into Sable's compact `LimitsGlance`
 * window lines so the Workspace Context tab renders real Entry plan limits
 * with Sable's exact 1:1 visual structure.
 */
export function derivePlanLimitWindows(
  billing: BillingMeResponse | undefined,
  now: number,
): PlanLimitsView | null {
  if (!billing) return null;

  const windows: PlanLimitWindow[] = [];

  if (billing.usageWindows) {
    const entries = [
      { id: "five_hour", label: "5-hour", win: billing.usageWindows.fiveHour },
      { id: "weekly", label: "Weekly", win: billing.usageWindows.weekly },
      { id: "monthly", label: "Monthly", win: billing.usageWindows.monthly },
    ] as const;

    for (const { id, label, win } of entries) {
      if (win.limitCents <= 0) continue;
      const rawPct = (win.usedCents / win.limitCents) * 100;
      const percent = Math.max(0, Math.min(100, Math.round(rawPct)));
      const resetMs =
        parseIsoMs(win.resetsAt) ??
        (id === "monthly" ? parseIsoMs(billing.expiresAt) : null);
      const past = resetMs !== null && resetMs <= now;
      const resetsIn =
        resetMs === null
          ? null
          : past
            ? "Resetting"
            : formatResetDuration(resetMs - now);

      windows.push({
        id,
        label,
        percent: past ? 0 : percent,
        level: windowLevelForPercent(percent, past),
        resetsIn,
        past,
        note: `${formatUsdCents(win.usedCents)} of ${formatUsdCents(win.limitCents)}`,
      });
    }
  } else if (billing.creditGrantCents > 0) {
    const grant = billing.creditGrantCents;
    const remaining = Math.max(0, Math.min(billing.creditBalanceCents, grant));
    const used = Math.max(0, grant - remaining);
    const percent = Math.max(
      0,
      Math.min(100, Math.round((used / grant) * 100)),
    );
    const resetMs = parseIsoMs(billing.expiresAt);
    const past = resetMs !== null && resetMs <= now;
    const resetsIn =
      resetMs === null
        ? null
        : past
          ? "Resetting"
          : formatResetDuration(resetMs - now);

    windows.push({
      id: "plan_credits",
      label: "Plan credits",
      percent: past ? 0 : percent,
      level: windowLevelForPercent(percent, past),
      resetsIn,
      past,
      note: `${formatUsdCents(remaining)} left of ${formatUsdCents(grant)}`,
    });
  }

  if (windows.length === 0) return null;

  const topUpCents = billing.topUpBalanceCents ?? 0;
  const footerNote =
    topUpCents > 0 ? `Top-up balance: ${formatUsdCents(topUpCents)}` : null;

  return {
    planName: billing.planName || billing.plan,
    windows,
    hasResetColumn: windows.some((w) => w.resetsIn !== null),
    footerNote,
  };
}
