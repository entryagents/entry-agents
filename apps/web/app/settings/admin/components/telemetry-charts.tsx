"use client";

import { formatTokens } from "@entry-agents/shared";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AdminTelemetryWindow,
  TelemetryTimeBucket,
} from "@/lib/db/admin-telemetry";

export function formatUsd(amount: number): string {
  if (amount >= 100) return `$${amount.toFixed(0)}`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatAgeSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${seconds % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

type ChartMetric = "tokens" | "runs" | "spend";

export function TelemetryTimeSeriesPanel({
  buckets,
  window,
}: {
  buckets: TelemetryTimeBucket[];
  window: AdminTelemetryWindow;
}) {
  const [metric, setMetric] = useState<ChartMetric>("tokens");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxValue = Math.max(
    1,
    ...buckets.map((b) => {
      if (metric === "runs") return b.runs;
      if (metric === "spend") return b.spendUsd;
      return b.inputTokens + b.outputTokens;
    }),
  );

  const activeBucket =
    hoveredIdx !== null ? buckets[hoveredIdx] : buckets[buckets.length - 1];

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium">
              Traffic, cache &amp; execution
            </CardTitle>
            <CardDescription className="text-xs">
              Time-bucketed telemetry across {window}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border/80 bg-muted/20 p-0.5 text-xs">
            {(
              [
                { id: "tokens", label: "Tokens & cache" },
                { id: "runs", label: "Runs & errors" },
                { id: "spend", label: "Spend" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMetric(tab.id)}
                className={`rounded px-2 py-1 font-medium transition-colors duration-150 ${
                  metric === tab.id
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeBucket && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs">
            <span className="font-medium text-foreground">
              {activeBucket.label}
            </span>
            <div className="flex flex-wrap items-center gap-4 tabular-nums text-muted-foreground">
              <span>Runs: {activeBucket.runs}</span>
              <span
                className={
                  activeBucket.failures > 0
                    ? "font-medium text-destructive"
                    : ""
                }
              >
                Failed: {activeBucket.failures}
              </span>
              <span>
                In: {formatTokens(activeBucket.inputTokens)} (
                {formatTokens(activeBucket.cachedInputTokens)} cached)
              </span>
              <span>Out: {formatTokens(activeBucket.outputTokens)}</span>
              <span>Spend: {formatUsd(activeBucket.spendUsd)}</span>
            </div>
          </div>
        )}

        <div className="flex h-36 items-end gap-1.5 pt-2">
          {buckets.map((b, idx) => {
            const totalTokens = b.inputTokens + b.outputTokens;
            const value =
              metric === "runs"
                ? b.runs
                : metric === "spend"
                  ? b.spendUsd
                  : totalTokens;
            const totalHeightPct =
              value > 0 ? Math.max(6, Math.round((value / maxValue) * 100)) : 2;

            let cachedRatio = 0;
            if (metric === "tokens" && totalTokens > 0) {
              cachedRatio = Math.min(1, b.cachedInputTokens / totalTokens);
            } else if (metric === "runs" && b.runs > 0) {
              cachedRatio = Math.min(1, b.failures / b.runs);
            }

            return (
              <div
                key={`${b.startsAt}-${idx}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <div className="relative flex h-full w-full items-end overflow-hidden rounded-t bg-muted/30">
                  <div
                    style={{ height: `${totalHeightPct}%` }}
                    className={`relative w-full rounded-t transition-[background-color,opacity] duration-150 ${
                      metric === "spend"
                        ? "bg-emerald-500/75 group-hover:bg-emerald-500"
                        : "bg-foreground/20 group-hover:bg-foreground/30"
                    }`}
                  >
                    {metric === "tokens" && cachedRatio > 0 && (
                      <div
                        style={{ height: `${Math.round(cachedRatio * 100)}%` }}
                        className="absolute inset-x-0 bottom-0 rounded-t bg-emerald-500/85"
                      />
                    )}
                    {metric === "runs" && cachedRatio > 0 && (
                      <div
                        style={{ height: `${Math.round(cachedRatio * 100)}%` }}
                        className="absolute inset-x-0 top-0 rounded-t bg-destructive/90"
                      />
                    )}
                  </div>
                </div>
                <span className="max-w-full truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                  {idx % 2 === 0 || buckets.length <= 12 ? b.label : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          {metric === "tokens" && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-foreground/25" />
                Total tokens
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-emerald-500/85" />
                Prompt cache hits
              </span>
            </>
          )}
          {metric === "runs" && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-foreground/25" />
                Total turns
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-destructive/90" />
                Failed turns
              </span>
            </>
          )}
          {metric === "spend" && (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-emerald-500/75" />
              USD billed cost
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DistributionChips({
  entries,
  toneMap,
  emptyLabel = "None",
}: {
  entries: Array<{ label: string; count: number }>;
  toneMap?: Record<string, string>;
  emptyLabel?: string;
}) {
  const nonZero = entries.filter((e) => e.count > 0);
  if (nonZero.length === 0) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {nonZero.map((entry) => (
        <span
          key={entry.label}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${
            toneMap?.[entry.label] ?? "bg-muted/40 text-foreground"
          }`}
        >
          <span className="text-muted-foreground">{entry.label}</span>
          <span className="font-semibold tabular-nums">{entry.count}</span>
        </span>
      ))}
    </div>
  );
}
