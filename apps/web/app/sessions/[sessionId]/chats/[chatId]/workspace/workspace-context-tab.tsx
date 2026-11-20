"use client";

import { formatTokens } from "@entry-agents/shared";
import { Gauge, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { EntryMark } from "@/components/entry-mark";
import {
  triggerBillingSync,
  useBillingMe,
} from "@/components/sidebar-billing-widget";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ModelOption } from "@/lib/model-options";
import {
  type ContextSegment,
  deriveContextWindowBreakdown,
  derivePlanLimitWindows,
  formatCostUsd,
  formatPercentDisplay,
  formatShare,
  type PlanLimitWindow,
} from "./context-usage-model";

interface WorkspaceContextTabProps {
  messages: WebAgentUIMessage[];
  modelId: string;
  modelOptions: ModelOption[];
  contextLimit?: number | null;
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

function WindowLine({ window: w }: { window: PlanLimitWindow }) {
  const fillRatio = Math.max(w.percent, w.percent > 0 ? 1.5 : 0) / 100;
  return (
    <div
      className="ulw"
      data-level={w.level}
      data-past={w.past ? "" : undefined}
    >
      <span className="ulw-label truncate">{w.label}</span>
      <span className="ulw-bar">
        <span
          className="meter ulw-meter"
          data-level={w.level}
          role="progressbar"
          aria-label={w.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={w.percent}
        >
          <span
            className="meter-fill"
            style={{ "--p": fillRatio } as CSSProperties}
          />
        </span>
        <span className="ulw-pct num">{w.percent}%</span>
      </span>
      <span className="ulw-reset num">{w.resetsIn ?? "—"}</span>
      <span
        className="ulw-note"
        data-warn={w.level !== undefined ? "" : undefined}
      >
        {w.note}
      </span>
    </div>
  );
}

function PlanLimitsSection({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const router = useRouter();
  const { data: billing } = useBillingMe();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const limits = useMemo(
    () => derivePlanLimitWindows(billing, now),
    [billing, now],
  );

  if (!limits) return null;

  return (
    <section aria-label="Plan limits">
      <div className="rail-h">
        <span>Plan limits</span>
        <span className="ul-rail-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rail-btn"
                aria-label="Usage"
                onClick={() => router.push("/settings/usage")}
              >
                <Gauge size={13} strokeWidth={1.6} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Usage</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rail-btn"
                aria-label="Refresh limits"
                onClick={onRefresh}
              >
                <RefreshCw
                  size={13}
                  strokeWidth={1.6}
                  className={refreshing ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Refresh limits</TooltipContent>
          </Tooltip>
        </span>
      </div>
      <div className="sable-card ul-rail">
        <div className="ul-glance">
          <div className="ul-glance-head">
            <EntryMark className="ul-glance-mark h-3.5 w-3.5 text-[var(--text)]" />
            <span className="ul-glance-name truncate">Entry</span>
            <span className="ul-glance-plan">{limits.planName}</span>
            {limits.hasResetColumn && (
              <span className="ul-glance-col">Resets in</span>
            )}
          </div>
          <div className="ulw-list" data-compact="">
            {limits.windows.map((w) => (
              <WindowLine key={w.id} window={w} />
            ))}
          </div>
          {limits.footerNote && (
            <p className="ul-glance-foot num">{limits.footerNote}</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function WorkspaceContextTab({
  messages,
  modelId,
  modelOptions,
  contextLimit,
}: WorkspaceContextTabProps) {
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
    triggerBillingSync();
    window.setTimeout(() => setRefreshing(false), 500);
  }, []);

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
          </section>

          <section aria-label="Session totals">
            <div className="rail-h">
              <span>This session</span>
            </div>
            <div className="cx-stats">
              <Stat
                label="Input"
                value={formatTokens(view.sessionTotals.inputTokens)}
              />
              <Stat
                label="Output"
                value={formatTokens(view.sessionTotals.outputTokens)}
              />
              <Stat
                label="Cached"
                value={formatTokens(view.sessionTotals.cacheReadTokens)}
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

          <PlanLimitsSection
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        </div>
      </div>
    </div>
  );
}
