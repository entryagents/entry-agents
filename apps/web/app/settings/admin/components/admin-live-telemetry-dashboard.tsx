"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  Activity,
  Box,
  Database,
  DollarSign,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AdminTelemetryPayload,
  AdminTelemetryWindow,
} from "@/lib/db/admin-telemetry";
import {
  formatDurationMs,
  formatUsd,
  TelemetryTimeSeriesPanel,
} from "./telemetry-charts";
import {
  ActiveRunsAndSandboxesPanel,
  ModelPerformanceTable,
} from "./telemetry-live-panels";
import {
  CompactionSecretsBillingPanel,
  McpAndFailuresPanel,
} from "./telemetry-ops-panels";

type PollIntervalMs = 5000 | 15000 | 30000 | 0;

const WINDOW_OPTIONS: AdminTelemetryWindow[] = ["1h", "24h", "7d", "30d"];
const POLL_OPTIONS: Array<{ value: PollIntervalMs; label: string }> = [
  { value: 5000, label: "Live 5s" },
  { value: 15000, label: "15s" },
  { value: 30000, label: "30s" },
  { value: 0, label: "Paused" },
];

export function AdminLiveTelemetryDashboard() {
  const [windowRange, setWindowRange] = useState<AdminTelemetryWindow>("24h");
  const [pollMs, setPollMs] = useState<PollIntervalMs>(15000);
  const [data, setData] = useState<AdminTelemetryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const fetchTelemetry = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setRefreshing(true);
      }
      try {
        const res = await fetch(
          `/api/admin/telemetry?window=${encodeURIComponent(windowRange)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`Telemetry request failed (${res.status})`);
        }
        const json = (await res.json()) as AdminTelemetryPayload;
        setData(json);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load admin telemetry",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [windowRange],
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setIsVisible(visible);
      if (visible) {
        void fetchTelemetry({ silent: true });
      }
    };
    setIsVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchTelemetry]);

  useEffect(() => {
    void fetchTelemetry();
  }, [fetchTelemetry]);

  useEffect(() => {
    if (pollMs <= 0 || !isVisible) {
      return;
    }
    const timer = window.setInterval(() => {
      void fetchTelemetry({ silent: true });
    }, pollMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [pollMs, isVisible, fetchTelemetry]);

  const liveRunsTotal = data
    ? data.live.statusCounts.running +
      data.live.statusCounts.queued +
      data.live.statusCounts.sleeping +
      data.live.statusCounts.resuming
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <span
              className={`size-2 rounded-full ${
                pollMs > 0 && isVisible
                  ? "bg-emerald-500"
                  : "bg-muted-foreground/50"
              }`}
            />
            {pollMs > 0 && isVisible ? "Live telemetry" : "Polling paused"}
          </span>
          {data && (
            <>
              <Badge
                variant="outline"
                className="gap-1.5 font-mono text-[11px] font-normal tabular-nums"
              >
                <Database
                  className="size-3 text-muted-foreground"
                  strokeWidth={1.5}
                />
                DB {data.dbLatencyMs}ms
              </Badge>
              <span className="text-muted-foreground tabular-nums">
                Updated{" "}
                {new Date(data.generatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border/80 bg-muted/20 p-0.5 text-xs">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowRange(w)}
                className={`rounded px-2 py-1 font-medium transition-colors duration-150 ${
                  windowRange === w
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-md border border-border/80 bg-muted/20 p-0.5 text-xs">
            {POLL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPollMs(opt.value)}
                className={`rounded px-2 py-1 font-medium transition-colors duration-150 ${
                  pollMs === opt.value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchTelemetry()}
            disabled={refreshing}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <RefreshCw
              className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="rounded-xl">
              <CardHeader className="pb-2">
                <div className="h-3.5 w-24 rounded bg-muted/70" />
              </CardHeader>
              <CardContent>
                <div className="h-7 w-16 rounded bg-muted/70" />
                <div className="mt-2 h-3 w-32 rounded bg-muted/50" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Active runs
                  </CardTitle>
                  <Activity
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium tracking-tight tabular-nums">
                    {liveRunsTotal}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {data.live.statusCounts.running} running ·{" "}
                    {data.live.totalQueuedPrompts} queued ·{" "}
                    {data.live.unreadInboxMessages} inbox
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Throughput &amp; spend
                  </CardTitle>
                  <DollarSign
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium tracking-tight tabular-nums">
                    {formatUsd(data.usage.totalSpendUsd)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {data.usage.totalEvents} requests ({data.usage.webEvents}{" "}
                    web / {data.usage.desktopEvents} desktop ·{" "}
                    {data.usage.subagentEvents} subagent)
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Prompt cache
                  </CardTitle>
                  <Zap
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium tracking-tight tabular-nums">
                    {data.cache.overallHitPct.toFixed(1)}%
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    DeepSeek {data.cache.deepSeek.hitPct.toFixed(1)}% ·{" "}
                    {formatUsd(data.cache.estimatedSavingsUsd)} saved
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Reliability &amp; latency
                  </CardTitle>
                  <Gauge
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium tracking-tight tabular-nums">
                    {data.runs.errorRatePct.toFixed(1)}%{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      errors
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    P95 {formatDurationMs(data.runs.p95DurationMs)} ·{" "}
                    {data.runs.totalSteps} steps (
                    {formatDurationMs(data.runs.avgStepDurationMs)})
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Sandboxes &amp; MCP
                  </CardTitle>
                  <Box
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium tracking-tight tabular-nums">
                    {data.sandboxes.sessionsRunningStatus}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      / {data.sandboxes.activeCommands} active commands
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    MCP {data.mcp.enabledServers} active ·{" "}
                    {data.mcp.failingServers} failing ·{" "}
                    {data.mcp.totalDiscoveredTools} tools
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Vault &amp; compaction
                  </CardTitle>
                  <ShieldCheck
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-medium tracking-tight tabular-nums">
                    {data.secrets.totalSecrets}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      secrets
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {data.secrets.distinctUsersWithSecrets} users ·{" "}
                    {data.compaction.eventsInWindow} compactions (
                    {formatTokens(data.compaction.totalTokensReclaimed)})
                  </p>
                </CardContent>
              </Card>
            </div>

            <TelemetryTimeSeriesPanel
              buckets={data.timeSeries}
              window={data.window}
            />

            <ActiveRunsAndSandboxesPanel data={data} />

            <ModelPerformanceTable data={data} />

            <McpAndFailuresPanel data={data} />

            <CompactionSecretsBillingPanel data={data} />
          </>
        )
      )}
    </div>
  );
}
