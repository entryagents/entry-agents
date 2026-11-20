import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import type { BillingMeResponse } from "@/components/sidebar-billing-widget";
import type { ModelOption } from "@/lib/model-options";
import {
  AUTO_COMPACT_BUFFER_RATIO,
  deriveContextWindowBreakdown,
  derivePlanLimitWindows,
  formatCostUsd,
  formatPercentDisplay,
  formatResetDuration,
  formatShare,
} from "./context-usage-model";

const MODELS: ModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    provider: "anthropic",
    label: "Claude Sonnet 4.5",
    shortLabel: "Sonnet 4.5",
    contextWindow: 200_000,
    cost: {
      input: 3,
      output: 15,
      cache_read: 0.3,
    },
  },
];

function makeAssistantMessage(
  id: string,
  metadata: NonNullable<WebAgentUIMessage["metadata"]>,
): WebAgentUIMessage {
  return {
    id,
    role: "assistant",
    parts: [],
    metadata,
  };
}

function makeUserMessage(id: string): WebAgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  };
}

describe("Sable 1:1 context usage formatters", () => {
  test("formatPercentDisplay renders <1 for tiny non-zero percentages", () => {
    expect(formatPercentDisplay(0)).toBe("0");
    expect(formatPercentDisplay(0.42)).toBe("<1");
    expect(formatPercentDisplay(0.99)).toBe("<1");
    expect(formatPercentDisplay(1)).toBe("1");
    expect(formatPercentDisplay(84.6)).toBe("85");
  });

  test("formatShare matches Sable's share() semantics", () => {
    expect(formatShare(0, 200_000)).toBe("0%");
    expect(formatShare(500, 200_000)).toBe("<1%");
    expect(formatShare(40_000, 200_000)).toBe("20%");
  });

  test("formatCostUsd matches Sable's money() semantics", () => {
    expect(formatCostUsd(undefined)).toBe("—");
    expect(formatCostUsd(0.004)).toBe("<$0.01");
    expect(formatCostUsd(0.42)).toBe("$0.42");
    expect(formatCostUsd(124.8)).toBe("$125");
  });

  test("formatResetDuration matches Sable's duration() semantics", () => {
    expect(formatResetDuration(10_000)).toBe("<1m");
    expect(formatResetDuration(38 * 60_000)).toBe("38m");
    expect(formatResetDuration((2 * 60 + 14) * 60_000)).toBe("2h 14m");
    expect(formatResetDuration(3 * 60 * 60_000)).toBe("3h");
    expect(formatResetDuration((3 * 24 + 4) * 60 * 60_000)).toBe("3d 4h");
  });
});

describe("deriveContextWindowBreakdown", () => {
  test("sorts used segments descending, reserves 5% autocompact buffer, and flags warn > 80%", () => {
    const messages: WebAgentUIMessage[] = [
      makeUserMessage("u1"),
      makeAssistantMessage("a1", {
        modelId: "anthropic/claude-sonnet-4.5",
        lastStepUsage: {
          inputTokens: 150_000,
          outputTokens: 14_000,
          totalTokens: 164_000,
          cachedInputTokens: 120_000,
          inputTokenDetails: {
            noCacheTokens: 30_000,
            cacheReadTokens: 120_000,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: {
            textTokens: 14_000,
            reasoningTokens: 0,
          },
        },
        totalMessageUsage: {
          inputTokens: 150_000,
          outputTokens: 14_000,
          totalTokens: 164_000,
          cachedInputTokens: 120_000,
          inputTokenDetails: {
            noCacheTokens: 30_000,
            cacheReadTokens: 120_000,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: {
            textTokens: 14_000,
            reasoningTokens: 0,
          },
        },
        totalMessageCost: 0.55,
      }),
    ];

    const view = deriveContextWindowBreakdown(
      messages,
      "anthropic/claude-sonnet-4.5",
      MODELS,
    );

    expect(view.total).toBe(164_000);
    expect(view.max).toBe(200_000);
    expect(view.buffer).toBe(Math.round(200_000 * AUTO_COMPACT_BUFFER_RATIO));
    expect(view.free).toBe(26_000);
    expect(view.pct).toBeCloseTo(82, 4);
    expect(view.warn).toBe(true);
    expect(view.modelName).toBe("Claude Sonnet 4.5");
    expect(view.segments.map((s) => s.name)).toEqual([
      "Cached",
      "Input",
      "Output",
    ]);
    expect(view.segments[0]?.color).toBe("rgb(var(--cx-step-rgb) / 0.9)");
    expect(view.segments[1]?.color).toBe("rgb(var(--cx-step-rgb) / 0.66)");
    expect(view.segments[2]?.color).toBe("rgb(var(--cx-step-rgb) / 0.48)");
    expect(view.sessionTotals).toEqual({
      inputTokens: 150_000,
      outputTokens: 14_000,
      cacheReadTokens: 120_000,
      turns: 1,
      costUsd: 0.55,
      costSource: "gateway",
    });
  });

  test("honors runtime contextLimitOverride when provided", () => {
    const messages: WebAgentUIMessage[] = [
      makeUserMessage("u1"),
      makeAssistantMessage("a1", {
        lastStepUsage: {
          inputTokens: 50_000,
          outputTokens: 2_000,
          totalTokens: 52_000,
          inputTokenDetails: {
            noCacheTokens: 50_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: {
            textTokens: 2_000,
            reasoningTokens: 0,
          },
        },
      }),
    ];

    const view = deriveContextWindowBreakdown(
      messages,
      "anthropic/claude-sonnet-4.5",
      MODELS,
      100_000,
    );

    expect(view.max).toBe(100_000);
    expect(view.buffer).toBe(5_000);
    expect(view.free).toBe(43_000);
    expect(view.warn).toBe(false);
  });
});

describe("derivePlanLimitWindows", () => {
  test("maps rolling usage windows with Sable amber/red thresholds and reset durations", () => {
    const now = Date.parse("2026-11-20T12:00:00.000Z");
    const billing: BillingMeResponse = {
      plan: "entry",
      planName: "Entry",
      creditBalanceCents: 1200,
      creditGrantCents: 2800,
      usageWindows: {
        mode: "rolling",
        fiveHour: {
          usedCents: 495,
          limitCents: 600,
          resetsAt: "2026-11-20T14:15:00.000Z",
        },
        weekly: {
          usedCents: 1400,
          limitCents: 1400,
          resetsAt: "2026-11-23T16:00:00.000Z",
        },
        monthly: {
          usedCents: 700,
          limitCents: 2800,
          resetsAt: "2026-12-01T12:00:00.000Z",
        },
      },
    };

    const view = derivePlanLimitWindows(billing, now);
    expect(view).not.toBeNull();
    expect(view?.planName).toBe("Entry");
    expect(view?.hasResetColumn).toBe(true);
    expect(
      view?.windows.map((w) => [w.label, w.percent, w.level, w.resetsIn]),
    ).toEqual([
      ["5-hour", 83, "amber", "2h 15m"],
      ["Weekly", 100, "red", "3d 4h"],
      ["Monthly", 25, undefined, "11d"],
    ]);
  });

  test("maps credit-grant plans without usage windows into a Plan credits line", () => {
    const now = Date.parse("2026-11-20T12:00:00.000Z");
    const billing: BillingMeResponse = {
      plan: "pro",
      planName: "Pro",
      creditBalanceCents: 600,
      creditGrantCents: 2000,
      topUpBalanceCents: 500,
      expiresAt: "2026-11-25T12:00:00.000Z",
      usageWindows: null,
    };

    const view = derivePlanLimitWindows(billing, now);
    expect(view).not.toBeNull();
    expect(view?.windows).toHaveLength(1);
    expect(view?.windows[0]).toMatchObject({
      id: "plan_credits",
      label: "Plan credits",
      percent: 70,
      level: undefined,
      resetsIn: "5d",
    });
    expect(view?.footerNote).toBe("Top-up balance: $5.00");
  });
});
