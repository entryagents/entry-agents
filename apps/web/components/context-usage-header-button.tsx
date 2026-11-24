"use client";

import { formatTokens } from "@entry-agents/shared";
import { BrushCleaning, Loader2 } from "lucide-react";
import { useMemo } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import {
  deriveContextWindowBreakdown,
  formatCostUsd,
  formatPercentDisplay,
  formatShare,
} from "@/app/sessions/[sessionId]/chats/[chatId]/workspace/context-usage-model";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCompactionThreshold } from "@/hooks/use-compaction-threshold";
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";

interface ContextUsageHeaderButtonProps {
  messages: WebAgentUIMessage[];
  modelId: string;
  modelOptions: ModelOption[];
  contextLimit?: number | null;
  onOpenContextPanel?: () => void;
  /** "panel" (desktop header) jumps to the Context rail tab; "popover" (mobile composer) opens an inline popover. */
  variant?: "panel" | "popover";
  onCompactConversation?: () => void;
  isCompacting?: boolean;
  isBusy?: boolean;
}

export function ContextUsageHeaderButton({
  messages,
  modelId,
  modelOptions,
  contextLimit,
  onOpenContextPanel,
  variant = "panel",
  onCompactConversation,
  isCompacting = false,
  isBusy = false,
}: ContextUsageHeaderButtonProps) {
  const userCompactionThreshold = useCompactionThreshold();
  const view = useMemo(
    () =>
      deriveContextWindowBreakdown(
        messages,
        modelId,
        modelOptions,
        contextLimit,
        userCompactionThreshold,
      ),
    [messages, modelId, modelOptions, contextLimit, userCompactionThreshold],
  );

  if (view.total === 0 || view.max <= 0) {
    return null;
  }

  const pctDisplay = formatPercentDisplay(view.pct);
  const usedLabel = formatTokens(view.total);
  const maxLabel = formatTokens(view.max);

  const triggerButton = (
    <button
      type="button"
      onClick={variant === "panel" ? onOpenContextPanel : undefined}
      data-warn={view.warn ? "" : undefined}
      aria-label={`Context ${pctDisplay}% used`}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] pr-[9px] pl-[6px] text-[12px] font-medium tabular-nums transition-[background-color,color,transform] duration-100 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        view.warn
          ? "text-foreground hover:bg-black/[0.055] dark:hover:bg-white/[0.06]"
          : "text-muted-foreground hover:bg-black/[0.055] hover:text-foreground dark:hover:bg-white/[0.06]",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        width={16}
        height={16}
        aria-hidden="true"
        className="shrink-0"
      >
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.22}
          strokeWidth={1}
        />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${Math.max(1.5, view.pct)} 100`}
          transform="rotate(-90 8 8)"
        />
      </svg>
      <span className="tabular-nums">{pctDisplay}%</span>
    </button>
  );

  if (variant === "popover") {
    return (
      <Popover>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-72 rounded-xl border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
        >
          <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-border/60">
            <span className="truncate font-medium text-foreground">
              {view.modelName || "Context window"}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {pctDisplay}% · {usedLabel} / {maxLabel}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            {view.segments.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between gap-2 text-[11.5px]"
              >
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-mono tabular-nums text-foreground">
                  {formatTokens(s.tokens)}{" "}
                  <span className="text-muted-foreground">
                    ({formatShare(s.tokens, view.max)})
                  </span>
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
              <span>Free space</span>
              <span className="font-mono tabular-nums">
                {formatTokens(view.free)} ({formatShare(view.free, view.max)})
              </span>
            </div>
            {view.buffer > 0 && (
              <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                <span>Autocompact buffer</span>
                <span className="font-mono tabular-nums">
                  {formatTokens(view.buffer)} (
                  {formatShare(view.buffer, view.max)})
                </span>
              </div>
            )}
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border/60 pt-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total input</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatTokens(view.sessionTotals.totalInputTokens)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total cache</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatTokens(
                  view.sessionTotals.cacheReadTokens +
                    view.sessionTotals.cacheWriteTokens,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Output</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatTokens(
                  view.sessionTotals.outputTokens +
                    view.sessionTotals.reasoningTokens,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cache hit</span>
              <span className="font-mono tabular-nums text-foreground">
                {view.sessionTotals.cacheHitRate !== null
                  ? `${view.sessionTotals.cacheHitRate}%`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Compactions</span>
              <span className="font-mono tabular-nums text-foreground">
                {messages.filter((m) => m.metadata?.isCompactionNotice).length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cost</span>
              <span className="font-mono tabular-nums text-foreground">
                {formatCostUsd(view.sessionTotals.costUsd)}
              </span>
            </div>
          </div>

          {onCompactConversation && (
            <button
              type="button"
              disabled={isBusy || isCompacting || messages.length < 2}
              onClick={onCompactConversation}
              className="mt-2.5 flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-muted/50 text-[11.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-45"
            >
              {isCompacting ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : (
                <BrushCleaning className="size-3" aria-hidden="true" />
              )}
              <span>
                {isCompacting ? "Compacting…" : "Compact conversation"}
              </span>
            </button>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
      <TooltipContent side="bottom">
        {usedLabel} of {maxLabel} context used
      </TooltipContent>
    </Tooltip>
  );
}
