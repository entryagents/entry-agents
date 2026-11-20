"use client";

import { formatTokens } from "@entry-agents/shared";
import { PanelRight } from "lucide-react";
import { type CSSProperties, useId, useMemo, useState } from "react";
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
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";

interface ContextUsageHeaderButtonProps {
  messages: WebAgentUIMessage[];
  modelId: string;
  modelOptions: ModelOption[];
  contextLimit?: number | null;
  onOpenContextPanel?: () => void;
}

const MINI_R = 5.5;
const MINI_C = 2 * Math.PI * MINI_R;

const POP_R = 30;
const POP_STROKE = 7;
const POP_C = 2 * Math.PI * POP_R;
const POP_GAP = 1.6;

/**
 * Sable-styled monochrome context usage trigger for the SessionHeader bar
 * (desktop & mobile). Replaces the cramped composer toolbar slot so it never
 * clips on mobile or split-screen desktop, and bridges in one click to the
 * full Workspace Context tab (`Alt+6`).
 */
export function ContextUsageHeaderButton({
  messages,
  modelId,
  modelOptions,
  contextLimit,
  onOpenContextPanel,
}: ContextUsageHeaderButtonProps) {
  const [open, setOpen] = useState(false);
  const hatchId = useId();

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

  if (view.total === 0) {
    return null;
  }

  const pctDisplay = formatPercentDisplay(view.pct);
  const miniDash = (Math.min(100, view.pct) / 100) * MINI_C;

  let arcOffset = 0;
  const popArcs = view.segments.map((s) => {
    const len = view.max > 0 ? (s.tokens / view.max) * POP_C : 0;
    const arc = { ...s, len, offset: arcOffset };
    arcOffset += len;
    return arc;
  });
  const bufLen = view.max > 0 ? (view.buffer / view.max) * POP_C : 0;
  const bufStart = POP_C - bufLen;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="View context usage breakdown"
          className={cn(
            "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 text-xs tabular-nums transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            view.warn
              ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 14 14"
            aria-hidden="true"
            className="shrink-0 -rotate-90"
          >
            <circle
              cx="7"
              cy="7"
              r={MINI_R}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.18}
              strokeWidth={1.8}
            />
            <circle
              cx="7"
              cy="7"
              r={MINI_R}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeDasharray={`${Math.max(0.7, miniDash)} ${MINI_C}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="font-mono text-[11px] font-medium">
            {pctDisplay}%
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        className="w-[292px] border border-border/80 bg-popover p-0 shadow-lg [--cx-step-rgb:24_24_27] dark:[--cx-step-rgb:242_241_238] [--ring-track:rgb(0_0_0/0.07)] dark:[--ring-track:rgb(255_255_255/0.06)] [--ring-hatch-bg:rgb(0_0_0/0.04)] dark:[--ring-hatch-bg:rgb(255_255_255/0.04)] [--ring-hatch-line:rgb(0_0_0/0.2)] dark:[--ring-hatch-line:rgb(255_255_255/0.2)]"
      >
        <div className="p-3.5">
          {view.modelName ? (
            <div className="mb-2.5 truncate text-[11px] font-medium text-muted-foreground">
              {view.modelName}
            </div>
          ) : null}

          <div className="flex items-center gap-3.5">
            <svg
              width={72}
              height={72}
              viewBox="0 0 72 72"
              aria-hidden="true"
              className="shrink-0"
            >
              <defs>
                <pattern
                  id={hatchId}
                  width="4"
                  height="4"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width="4" height="4" fill="var(--ring-hatch-bg)" />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="4"
                    stroke="var(--ring-hatch-line)"
                    strokeWidth="1.2"
                  />
                </pattern>
              </defs>
              <g transform="rotate(-90 36 36)">
                <circle
                  cx="36"
                  cy="36"
                  r={POP_R}
                  fill="none"
                  stroke="var(--ring-track)"
                  strokeWidth={POP_STROKE}
                />
                {bufLen > 0 && (
                  <circle
                    cx="36"
                    cy="36"
                    r={POP_R}
                    fill="none"
                    stroke={`url(#${hatchId})`}
                    strokeWidth={POP_STROKE}
                    strokeDasharray={`${Math.max(0, bufLen - POP_GAP)} ${POP_C}`}
                    strokeDashoffset={-bufStart}
                  />
                )}
                {popArcs.map((a) => (
                  <circle
                    key={a.name}
                    cx="36"
                    cy="36"
                    r={POP_R}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={POP_STROKE}
                    strokeDasharray={`${Math.max(0.8, a.len - (popArcs.length > 1 ? POP_GAP : 0))} ${POP_C}`}
                    strokeDashoffset={-a.offset}
                  />
                ))}
              </g>
            </svg>

            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums",
                  view.warn
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground",
                )}
              >
                {pctDisplay}
                <span className="ml-0.5 text-sm font-normal text-muted-foreground">
                  %
                </span>
              </div>
              <div className="mt-1.5 text-xs font-medium tabular-nums text-foreground/85">
                {formatTokens(view.total)} of {formatTokens(view.max)} tokens
              </div>
              <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {view.buffer > 0
                  ? `${formatTokens(view.free)} left before it compacts`
                  : `${formatTokens(view.free)} free`}
              </div>
            </div>
          </div>

          <ul className="mt-3 space-y-1 border-t border-border/60 pt-2.5 text-xs">
            {view.segments.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: s.color } as CSSProperties}
                />
                <span className="flex-1 truncate text-muted-foreground">
                  {s.name}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatTokens(s.tokens)}
                </span>
                <span className="w-8 text-right tabular-nums text-muted-foreground">
                  {formatShare(s.tokens, view.max)}
                </span>
              </li>
            ))}
            {view.buffer > 0 && (
              <li className="flex items-center gap-2 text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-border/80 opacity-70"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)",
                  }}
                />
                <span className="flex-1 truncate">Autocompact buffer</span>
                <span className="tabular-nums">
                  {formatTokens(view.buffer)}
                </span>
                <span className="w-8 text-right tabular-nums">
                  {formatShare(view.buffer, view.max)}
                </span>
              </li>
            )}
            <li className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-border/80 bg-muted/60" />
              <span className="flex-1 truncate">Free space</span>
              <span className="tabular-nums">{formatTokens(view.free)}</span>
              <span className="w-8 text-right tabular-nums">
                {formatShare(view.free, view.max)}
              </span>
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-3.5 py-2 text-[11px] tabular-nums text-muted-foreground">
          <span>
            {view.sessionTotals.turns}{" "}
            {view.sessionTotals.turns === 1 ? "turn" : "turns"}
            {view.sessionTotals.costUsd !== undefined
              ? ` · ${formatCostUsd(view.sessionTotals.costUsd)}`
              : ""}
          </span>
          {onOpenContextPanel ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 font-medium text-foreground/85 transition-colors hover:text-foreground"
              onClick={() => {
                setOpen(false);
                onOpenContextPanel();
              }}
            >
              <PanelRight className="h-3 w-3" aria-hidden="true" />
              <span>Context tab</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
