"use client";

import { useState } from "react";
import type {
  WebAgentMessageMetadata,
  WebAgentStepCostBreakdown,
} from "@/app/types";
import type { ModelOption } from "@/lib/model-options";
import { estimateModelUsageCost } from "@/lib/models";
import {
  ProviderIcon,
  getProviderFromModelId,
  stripProviderPrefix,
} from "@/components/provider-icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MessageModelPillProps {
  metadata?: WebAgentMessageMetadata;
  modelOptions: ModelOption[];
}

/**
 * Format a USD cost for compact display alongside the model name.
 * Uses 4 decimals for sub-dollar amounts (typical for a single message)
 * and 2 decimals once we cross $1.
 */
function formatCostUsd(amount: number): string {
  if (amount === 0) {
    return "$0";
  }
  if (amount >= 1) {
    return (
      "$" +
      amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  // Show at least one significant digit for very small costs; cap at 4 decimals.
  if (amount < 0.0001) {
    return "<$0.0001";
  }
  return (
    "$" +
    amount.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  );
}

function formatTokenCount(n: number | undefined): string {
  if (!n) return "0";
  return n.toLocaleString("en-US");
}

/**
 * One row in the usage breakdown dropdown: a single model step, its tokens,
 * which tools it called, and its estimated cost.
 */
function StepBreakdownRow({
  step,
  modelOptions,
}: {
  step: WebAgentStepCostBreakdown;
  modelOptions: ModelOption[];
}) {
  const option = step.modelId
    ? modelOptions.find((o) => o.id === step.modelId)
    : undefined;
  const provider =
    option?.provider ?? getProviderFromModelId(step.modelId ?? "");
  const label = option
    ? (option.shortLabel ?? stripProviderPrefix(option.label, provider))
    : (step.modelId ?? "unknown model");

  const cachedTokens = step.usage?.inputTokenDetails?.cacheReadTokens;
  const reasoningTokens = step.usage?.outputTokenDetails?.reasoningTokens;

  return (
    <div className="flex flex-col gap-1 border-b border-border/50 py-2 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <ProviderIcon provider={provider} className="size-3.5 shrink-0" />
          <span className="truncate text-xs font-medium">
            Step {step.stepNumber} · {label}
          </span>
        </div>
        {typeof step.cost === "number" && (
          <span className="shrink-0 text-xs tabular-nums font-medium text-foreground/80">
            {formatCostUsd(step.cost)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>in {formatTokenCount(step.usage?.inputTokens)}</span>
        <span>out {formatTokenCount(step.usage?.outputTokens)}</span>
        {Boolean(reasoningTokens) && (
          <span>reasoning {formatTokenCount(reasoningTokens)}</span>
        )}
        {Boolean(cachedTokens) && (
          <span>cached {formatTokenCount(cachedTokens)}</span>
        )}
        {typeof step.tps === "number" &&
          Number.isFinite(step.tps) &&
          step.tps > 0 && (
            <span className="tabular-nums">
              {step.tps >= 10
                ? `${Math.round(step.tps)} tok/s`
                : `${step.tps.toFixed(1)} tok/s`}
            </span>
          )}
      </div>
      {step.toolCallNames && step.toolCallNames.length > 0 && (
        <div className="text-[11px] text-muted-foreground/80">
          tools: {step.toolCallNames.join(", ")}
        </div>
      )}
    </div>
  );
}

/**
 * Compact pill shown below an assistant message to indicate model attribution
 * and turn cost/tokens. Survives stops, errors, completions, and real-time streaming.
 */
export function MessageModelPill({
  metadata,
  modelOptions,
}: MessageModelPillProps) {
  const [isOpen, setIsOpen] = useState(false);

  const {
    selectedModelId,
    modelId: resolvedModelId,
    totalMessageCost,
    totalMessageUsage,
    lastStepUsage,
    stepBreakdown,
    tps,
  } = metadata ?? {};

  const formattedTps =
    typeof tps === "number" && Number.isFinite(tps) && tps > 0
      ? tps >= 10
        ? `${Math.round(tps)} tok/s`
        : `${tps.toFixed(1)} tok/s`
      : null;

  const stepAggregatedUsage =
    stepBreakdown && stepBreakdown.length > 0
      ? stepBreakdown.reduce(
          (acc, step) => {
            const u = step.usage;
            if (!u) return acc;
            const input = u.inputTokens ?? 0;
            const output = u.outputTokens ?? 0;
            const cacheRead =
              u.inputTokenDetails?.cacheReadTokens ?? u.cachedInputTokens ?? 0;
            const cacheWrite = u.inputTokenDetails?.cacheWriteTokens ?? 0;
            const reasoning =
              u.outputTokenDetails?.reasoningTokens ?? u.reasoningTokens ?? 0;
            const total = u.totalTokens ?? input + output;
            return {
              inputTokens: acc.inputTokens + input,
              outputTokens: acc.outputTokens + output,
              cacheReadTokens: acc.cacheReadTokens + cacheRead,
              cacheWriteTokens: acc.cacheWriteTokens + cacheWrite,
              reasoningTokens: acc.reasoningTokens + reasoning,
              totalTokens: acc.totalTokens + total,
            };
          },
          {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
          },
        )
      : undefined;

  const rawUsage = totalMessageUsage ?? lastStepUsage;
  const effectiveInputTokens =
    rawUsage?.inputTokens ?? stepAggregatedUsage?.inputTokens ?? 0;
  const effectiveOutputTokens =
    rawUsage?.outputTokens ?? stepAggregatedUsage?.outputTokens ?? 0;
  const effectiveCacheReadTokens =
    rawUsage?.inputTokenDetails?.cacheReadTokens ??
    rawUsage?.cachedInputTokens ??
    stepAggregatedUsage?.cacheReadTokens ??
    0;
  const effectiveCacheWriteTokens =
    rawUsage?.inputTokenDetails?.cacheWriteTokens ??
    stepAggregatedUsage?.cacheWriteTokens ??
    0;
  const effectiveReasoningTokens =
    rawUsage?.outputTokenDetails?.reasoningTokens ??
    rawUsage?.reasoningTokens ??
    stepAggregatedUsage?.reasoningTokens ??
    0;
  const totalTokens =
    rawUsage?.totalTokens ??
    (effectiveInputTokens + effectiveOutputTokens > 0
      ? effectiveInputTokens + effectiveOutputTokens
      : (stepAggregatedUsage?.totalTokens ?? 0));

  // Uncached input = full-price input tokens (in minus any cache read/write).
  const effectiveUncachedInputTokens = Math.max(
    0,
    effectiveInputTokens -
      effectiveCacheReadTokens -
      effectiveCacheWriteTokens,
  );

  const hasDirectCost =
    typeof totalMessageCost === "number" &&
    Number.isFinite(totalMessageCost) &&
    totalMessageCost >= 0;

  if (
    !selectedModelId &&
    !resolvedModelId &&
    totalTokens === 0 &&
    !hasDirectCost
  ) {
    return null;
  }

  const selectedOption = selectedModelId
    ? modelOptions.find((o) => o.id === selectedModelId)
    : undefined;
  const resolvedOption = resolvedModelId
    ? modelOptions.find((o) => o.id === resolvedModelId)
    : undefined;

  const option = selectedOption ?? resolvedOption;
  const displayLabel =
    option?.shortLabel ??
    option?.label ??
    selectedModelId ??
    resolvedModelId ??
    "Agent";

  const provider =
    option?.provider ??
    getProviderFromModelId(selectedModelId ?? resolvedModelId ?? "");

  const shortLabel = option
    ? (option.shortLabel ?? stripProviderPrefix(option.label, provider))
    : displayLabel;

  // Price per-step whenever stepBreakdown is available so multi-step summed
  // input tokens never falsely trigger single-step context pricing tiers.
  const perStepEstimatedCost =
    !hasDirectCost && stepBreakdown && stepBreakdown.length > 0
      ? stepBreakdown.reduce<number | undefined>((sum, step) => {
          if (typeof step.cost === "number" && Number.isFinite(step.cost)) {
            return (sum ?? 0) + step.cost;
          }
          if (!step.usage) return sum;
          const stepOption = step.modelId
            ? modelOptions.find((o) => o.id === step.modelId)
            : option;
          const stepCost = stepOption?.cost
            ? estimateModelUsageCost(
                {
                  inputTokens: step.usage.inputTokens ?? 0,
                  cachedInputTokens:
                    step.usage.inputTokenDetails?.cacheReadTokens ??
                    step.usage.cachedInputTokens ??
                    0,
                  cacheWriteInputTokens:
                    step.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
                  outputTokens: step.usage.outputTokens ?? 0,
                },
                stepOption.cost,
              )
            : undefined;
          return stepCost !== undefined ? (sum ?? 0) + stepCost : sum;
        }, undefined)
      : undefined;

  const singleTurnFallbackCost =
    !hasDirectCost &&
    perStepEstimatedCost === undefined &&
    rawUsage &&
    option?.cost
      ? estimateModelUsageCost(
          {
            inputTokens: effectiveInputTokens,
            cachedInputTokens: effectiveCacheReadTokens,
            cacheWriteInputTokens: effectiveCacheWriteTokens,
            outputTokens: effectiveOutputTokens,
          },
          option.cost,
        )
      : undefined;

  const estimatedCost = perStepEstimatedCost ?? singleTurnFallbackCost;

  const displayCost = hasDirectCost
    ? (totalMessageCost as number)
    : typeof estimatedCost === "number" && Number.isFinite(estimatedCost)
      ? estimatedCost
      : undefined;

  const hasBreakdown = Boolean(
    (stepBreakdown && stepBreakdown.length > 0) ||
    totalTokens > 0 ||
    displayCost !== undefined,
  );

  const pill = (
    <span className="inline-flex max-w-[380px] items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground/70 transition-colors hover:text-muted-foreground">
      <ProviderIcon provider={provider} className="size-3 shrink-0" />
      <span className="truncate">{shortLabel}</span>
      {displayCost !== undefined ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span className="tabular-nums font-medium text-foreground/80">
            {formatCostUsd(displayCost)}
          </span>
        </>
      ) : null}
      {totalTokens > 0 && displayCost === undefined ? (
        <>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span className="tabular-nums text-muted-foreground/80">
            {formatTokenCount(totalTokens)} tok
          </span>
        </>
      ) : null}
    </span>
  );

  if (!hasBreakdown) {
    return pill;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Show usage breakdown"
        >
          {pill}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-80 p-3 shadow-lg border border-border/80 bg-popover"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold">Turn Usage</span>
          {displayCost !== undefined && (
            <span className="text-xs tabular-nums font-semibold">
              {formatCostUsd(displayCost)}
            </span>
          )}
        </div>
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>in {formatTokenCount(effectiveInputTokens)}</span>
          <span>uncached {formatTokenCount(effectiveUncachedInputTokens)}</span>
          <span>out {formatTokenCount(effectiveOutputTokens)}</span>
          {Boolean(effectiveReasoningTokens) && (
            <span>reasoning {formatTokenCount(effectiveReasoningTokens)}</span>
          )}
          {Boolean(effectiveCacheReadTokens) && (
            <span>cached {formatTokenCount(effectiveCacheReadTokens)}</span>
          )}
          {Boolean(effectiveCacheWriteTokens) && (
            <span>
              cache write {formatTokenCount(effectiveCacheWriteTokens)}
            </span>
          )}
          {formattedTps && <span>speed {formattedTps}</span>}
        </div>
        {stepBreakdown && stepBreakdown.length > 0 && (
          <div className="max-h-64 overflow-y-auto">
            {stepBreakdown.map((step, idx) => (
              <StepBreakdownRow
                key={`${step.stepNumber}-${idx}`}
                step={step}
                modelOptions={modelOptions}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
