"use client";

import { formatTokens } from "@entry-agents/shared";
import { useMemo } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import {
  deriveContextWindowBreakdown,
  formatPercentDisplay,
} from "@/app/sessions/[sessionId]/chats/[chatId]/workspace/context-usage-model";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";

interface ContextUsageHeaderButtonProps {
  messages: WebAgentUIMessage[];
  modelId: string;
  modelOptions: ModelOption[];
  contextLimit?: number | null;
  onOpenContextPanel?: () => void;
}

/**
 * Sable 1:1 `<ContextMeter />` (`src/app/App.tsx:689-705`):
 * a compact 16×16 hairline ring + percentage button with a single-line tooltip
 * (`${used} of ${max} context used`) that jumps directly to the Workspace
 * Context tab on click—no duplicated breakdown popover.
 */
export function ContextUsageHeaderButton({
  messages,
  modelId,
  modelOptions,
  contextLimit,
  onOpenContextPanel,
}: ContextUsageHeaderButtonProps) {
  const view = useMemo(
    () =>
      deriveContextWindowBreakdown(
        messages,
        modelId,
        modelOptions,
        contextLimit,
      ),
    [messages, modelId, modelOptions, contextLimit],
  );

  if (view.total === 0 || view.max <= 0) {
    return null;
  }

  const pctDisplay = formatPercentDisplay(view.pct);
  const usedLabel = formatTokens(view.total);
  const maxLabel = formatTokens(view.max);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpenContextPanel}
          data-warn={view.warn ? "" : undefined}
          aria-label={`Context ${pctDisplay}% used`}
          className={cn(
            "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] pr-[9px] pl-[6px] text-[12px] font-medium tabular-nums transition-[background-color,color,transform] duration-100 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            view.warn
              ? "text-amber-600 hover:bg-black/[0.055] dark:text-amber-400 dark:hover:bg-white/[0.06]"
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
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {usedLabel} of {maxLabel} context used
      </TooltipContent>
    </Tooltip>
  );
}
