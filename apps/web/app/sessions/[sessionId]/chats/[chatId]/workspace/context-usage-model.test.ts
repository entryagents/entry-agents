import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import type { ModelOption } from "@/lib/model-options";
import {
  AUTO_COMPACT_BUFFER_RATIO,
  deriveContextWindowBreakdown,
  formatCostUsd,
  formatPercentDisplay,
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
      cache_write: 3.75,
    },
  },
  {
    id: "deepseek/deepseek-v4.1-flash:free",
    provider: "deepseek",
    label: "DeepSeek V4.1 Flash",
    shortLabel: "V4.1 Flash",
    contextWindow: 1_000_000,
    compactionThreshold: 0.85,
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
});

describe("deriveContextWindowBreakdown", () => {
  test("does not double-count cached tokens in Input + Cached for ring or session totals", () => {
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
    expect(view.segments.map((s) => [s.name, s.tokens])).toEqual([
      ["Cache read", 120_000],
      ["New input", 30_000],
      ["Output", 14_000],
    ]);
    // Sum of all segments equals exact total tokens in context.
    expect(view.segments.reduce((n, s) => n + s.tokens, 0)).toBe(view.total);
    expect(view.segments[0]?.color).toBe("rgb(var(--cx-step-rgb) / 0.9)");
    expect(view.segments[1]?.color).toBe("rgb(var(--cx-step-rgb) / 0.66)");
    expect(view.segments[2]?.color).toBe("rgb(var(--cx-step-rgb) / 0.48)");

    // Session totals split Input (uncached), Cache read, Cache write, and Reasoning cleanly without double-counting.
    expect(view.sessionTotals).toEqual({
      inputTokens: 30_000,
      outputTokens: 14_000,
      cacheReadTokens: 120_000,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 164_000,
      cacheHitRate: 80,
      turns: 1,
      costUsd: 0.55,
      costSource: "gateway",
    });
  });

  test("preserves context meter on trailing 0-token aborted message and tracks active selected model", () => {
    const messages: WebAgentUIMessage[] = [
      makeUserMessage("u1"),
      makeAssistantMessage("a1", {
        modelId: "anthropic/claude-sonnet-4.5",
        stepBreakdown: [
          {
            stepNumber: 1,
            finishReason: "stop",
            usage: {
              inputTokens: 40_000,
              outputTokens: 2_000,
              totalTokens: 42_000,
              inputTokenDetails: {
                noCacheTokens: 40_000,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              outputTokenDetails: {
                textTokens: 2_000,
                reasoningTokens: 0,
              },
            },
          },
        ],
      }),
      makeUserMessage("u2"),
      makeAssistantMessage("a2", {
        modelId: "deepseek/deepseek-v4.1-flash:free",
        lastStepUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputTokenDetails: {
            noCacheTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: {
            textTokens: 0,
            reasoningTokens: 0,
          },
        },
      }),
    ];

    const view = deriveContextWindowBreakdown(
      messages,
      "deepseek/deepseek-v4.1-flash:free",
      MODELS,
    );

    expect(view.total).toBe(42_000);
    expect(view.max).toBe(1_000_000);
    expect(view.buffer).toBe(150_000); // 1 - 0.85 compactionThreshold
    expect(view.modelName).toBe("DeepSeek V4.1 Flash");
    expect(view.sessionTotals.turns).toBe(2);
    expect(view.sessionTotals.inputTokens).toBe(40_000);
  });

  test("drops active context window on compaction notice without inflating session totals", () => {
    const messages: WebAgentUIMessage[] = [
      makeUserMessage("u1"),
      makeAssistantMessage("a1", {
        modelId: "anthropic/claude-sonnet-4.5",
        lastStepUsage: {
          inputTokens: 160_000,
          outputTokens: 4_000,
          totalTokens: 164_000,
          inputTokenDetails: {
            noCacheTokens: 160_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 4_000, reasoningTokens: 0 },
        },
        totalMessageUsage: {
          inputTokens: 160_000,
          outputTokens: 4_000,
          totalTokens: 164_000,
          inputTokenDetails: {
            noCacheTokens: 160_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 4_000, reasoningTokens: 0 },
        },
        totalMessageCost: 0.48,
      }),
      makeAssistantMessage("compact_1", {
        isCompactionNotice: true,
        compactionMeta: { preTokens: 164_000, postTokens: 20_000 },
        lastStepUsage: {
          inputTokens: 20_000,
          outputTokens: 0,
          totalTokens: 20_000,
          inputTokenDetails: {
            noCacheTokens: 20_000,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
        },
      }),
    ];

    const view = deriveContextWindowBreakdown(
      messages,
      "anthropic/claude-sonnet-4.5",
      MODELS,
    );
    expect(view.total).toBe(20_000);
    expect(view.pct).toBeCloseTo(10, 4);
    expect(view.warn).toBe(false);
    expect(view.sessionTotals).toEqual({
      inputTokens: 160_000,
      outputTokens: 4_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 164_000,
      cacheHitRate: 0,
      turns: 1,
      costUsd: 0.48,
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
