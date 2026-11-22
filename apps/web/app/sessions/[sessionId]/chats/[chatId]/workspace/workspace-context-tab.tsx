"use client";

import { formatTokens } from "@entry-agents/shared";
import { BrushCleaning, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import type { WebAgentUIMessage } from "@/app/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ModelOption } from "@/lib/model-options";
import {
  type ContextSegment,
  deriveContextWindowBreakdown,
  formatCostUsd,
  formatPercentDisplay,
  formatShare,
} from "./context-usage-model";

interface WorkspaceContextTabProps {
  messages: WebAgentUIMessage[];
  modelId: string;
  modelOptions: ModelOption[];
  contextLimit?: number | null;
  onCompactConversation?: () => void;
  isCompacting?: boolean;
  isBusy?: boolean;
}

const R = 52;
const STROKE = 11;
const C = 2 * Math.PI * R;
const GAP = 2.2;

/**
 * The context window as a ring, ported 1:1 from Sable's `ContextTab.tsx`:
 * used categories as monochrome ivory arcs with gaps, the autocompact buffer
 * hatched at 45°, free space as the track.
 */
export function ContextWindowRing({
  segments,
  max,
  buffer,
  size = 128,
  className = "cx-ring",
}: {
  segments: ContextSegment[];
  max: number;
  buffer: number;
  size?: number;
  className?: string;
}) {
  const hatchId = useId();
  let offset = 0;
  const arcs = segments.map((s) => {
    const len = max > 0 ? (s.tokens / max) * C : 0;
    const arc = { ...s, len, offset };
    offset += len;
    return arc;
  });
  const bufLen = max > 0 ? (buffer / max) * C : 0;
  const bufStart = C - bufLen;

  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      width={size}
      height={size}
      aria-hidden="true"
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
            strokeWidth="1.4"
          />
        </pattern>
      </defs>
      <g transform="rotate(-90 64 64)">
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={STROKE}
        />
        {bufLen > 0 && (
          <circle
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke={`url(#${hatchId})`}
            strokeWidth={STROKE}
            strokeDasharray={`${Math.max(0, bufLen - GAP)} ${C}`}
            strokeDashoffset={-bufStart}
          />
        )}
        {arcs.map((a) => (
          <circle
            key={a.name}
            className="cx-arc"
            cx="64"
            cy="64"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={STROKE}
            strokeDasharray={`${Math.max(0.8, a.len - (arcs.length > 1 ? GAP : 0))} ${C}`}
            strokeDashoffset={-a.offset}
          />
        ))}
      </g>
    </svg>
  );
}

function Stat({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className="sable-card cx-stat" data-wide={wide ? "" : undefined}>
      <span className="cx-stat-value num">{value}</span>
      <span className="cx-stat-label">{label}</span>
    </div>
  );
}

export function WorkspaceContextTab({
  messages,
  modelId,
  modelOptions,
  contextLimit,
  onCompactConversation,
  isCompacting = false,
  isBusy = false,
}: WorkspaceContextTabProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 450);
  }, [router]);

  const hasContext = view.total > 0;
  const pctDisplay = formatPercentDisplay(view.pct);

  return (
    <div className="rail-col">
      <div className="rail-bar">
        <span className="rail-bar-title truncate">
          {view.modelName || "Context window"}
        </span>
        <span className="rail-bar-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rail-btn"
                aria-label="Refresh"
                onClick={handleRefresh}
              >
                <RefreshCw
                  size={14}
                  strokeWidth={1.6}
                  className={refreshing ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
          </Tooltip>
        </span>
      </div>

      <div className="rail-scroll">
        <div className="rail-stack cx-stack">
          <section className="sable-card cx-card" aria-label="Context window">
            {hasContext ? (
              <>
                <div className="cx-figure">
                  <ContextWindowRing
                    segments={view.segments}
                    max={view.max}
                    buffer={view.buffer}
                  />
                  <div className="cx-numbers">
                    <div
                      className="cx-pct num"
                      data-warn={view.warn ? "" : undefined}
                    >
                      {pctDisplay}
                      <span className="cx-pct-sign">%</span>
                    </div>
                    <div className="cx-of num">
                      {formatTokens(view.total)} of {formatTokens(view.max)}{" "}
                      tokens
                    </div>
                    <div className="cx-left num">
                      {view.buffer > 0
                        ? `${formatTokens(view.free)} left before it compacts`
                        : `${formatTokens(view.free)} free`}
                    </div>
                  </div>
                </div>

                {view.detailed && (
                  <ul className="cx-legend">
                    {view.segments.map((s) => (
                      <li key={s.name} className="cx-row">
                        <span
                          className="cx-swatch"
                          style={{ "--c": s.color } as CSSProperties}
                        />
                        <span className="cx-name truncate">{s.name}</span>
                        <span className="cx-tokens num">
                          {formatTokens(s.tokens)}
                        </span>
                        <span className="cx-share num">
                          {formatShare(s.tokens, view.max)}
                        </span>
                      </li>
                    ))}
                    {view.buffer > 0 && (
                      <li className="cx-row cx-row-quiet">
                        <span className="cx-swatch cx-swatch-buffer" />
                        <span className="cx-name truncate">
                          Autocompact buffer
                        </span>
                        <span className="cx-tokens num">
                          {formatTokens(view.buffer)}
                        </span>
                        <span className="cx-share num">
                          {formatShare(view.buffer, view.max)}
                        </span>
                      </li>
                    )}
                    <li className="cx-row cx-row-quiet">
                      <span className="cx-swatch cx-swatch-free" />
                      <span className="cx-name truncate">Free space</span>
                      <span className="cx-tokens num">
                        {formatTokens(view.free)}
                      </span>
                      <span className="cx-share num">
                        {formatShare(view.free, view.max)}
                      </span>
                    </li>
                  </ul>
                )}
              </>
            ) : (
              <p className="cx-note">
                Context usage appears after the first reply.
              </p>
            )}
            {onCompactConversation && (
              <div className="cx-compact">
                {isBusy || isCompacting ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cx-compact-wrap">
                        <button type="button" className="sable-btn-sm" disabled>
                          {isCompacting ? (
                            <Loader2
                              size={14}
                              strokeWidth={1.6}
                              className="animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <BrushCleaning
                              size={14}
                              strokeWidth={1.6}
                              aria-hidden="true"
                            />
                          )}
                          {isCompacting
                            ? "Compacting…"
                            : "Compact conversation"}
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isCompacting
                        ? "Compacting conversation…"
                        : "Available when this turn ends"}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    className="sable-btn-sm"
                    disabled={messages.length < 2}
                    onClick={onCompactConversation}
                  >
                    <BrushCleaning
                      size={14}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    Compact conversation
                  </button>
                )}
              </div>
            )}
          </section>

          <section aria-label="Session totals">
            <div className="rail-h">
              <span>This session</span>
            </div>
            <div className="cx-stats">
              <Stat
                label="Total input"
                value={formatTokens(view.sessionTotals.totalInputTokens)}
              />
              <Stat
                label="New input"
                value={formatTokens(view.sessionTotals.inputTokens)}
              />
              <Stat
                label="Output"
                value={formatTokens(view.sessionTotals.outputTokens)}
              />
              <Stat
                label="Cache read"
                value={formatTokens(view.sessionTotals.cacheReadTokens)}
              />
              <Stat
                label="Cache write"
                value={formatTokens(view.sessionTotals.cacheWriteTokens)}
              />
              <Stat
                label="Reasoning"
                value={formatTokens(view.sessionTotals.reasoningTokens)}
              />
              <Stat
                label="Cache hit"
                value={
                  view.sessionTotals.cacheHitRate !== null
                    ? `${view.sessionTotals.cacheHitRate}%`
                    : "—"
                }
              />
              <Stat
                label="Turns"
                value={String(view.sessionTotals.turns)}
                wide
              />
              <Stat
                label="Cost"
                value={formatCostUsd(view.sessionTotals.costUsd)}
                wide
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
