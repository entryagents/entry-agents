"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  Activity,
  Blocks,
  Box,
  Database,
  DollarSign,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Users,
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
import {
  IntegrationsAndPipelinePanel,
  PluginsAndTeamsPanel,
} from "./telemetry-plugins-teams-panels";

type PollIntervalMs = 5000 | 15000 | 30000 | 0;
type TelemetrySectionFilter = "all" | "live" | "plugins" | "sandboxes" | "ops";

const WINDOW_OPTIONS: AdminTelemetryWindow[] = ["1h", "24h", "7d", "30d"];
const POLL_OPTIONS: Array<{ value: PollIntervalMs; label: string }> = [
  { value: 5000, label: "Live 5s" },
  { value: 15000, label: "15s" },
  { value: 30000, label: "30s" },
  { value: 0, label: "Paused" },
];
const SECTION_TABS: Array<{ id: TelemetrySectionFilter; label: string }> = [
  { id: "all", label: "All 30 tables" },
  { id: "live", label: "Live & models" },
  { id: "plugins", label: "Plugins & teams" },
  { id: "sandboxes", label: "Sandboxes & MCP" },
  { id: "ops", label: "Auth, billing & ops" },
];

export function AdminLiveTelemetryDashboard() {
  const [windowRange, setWindowRange] = useState<AdminTelemetryWindow>("24h");
  const [pollMs, setPollMs] = useState<PollIntervalMs>(15000);
  const [section, setSection] = useState<TelemetrySectionFilter>("all");
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
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

      {/* Section filter bar (scrollable on mobile) */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border/80 bg-muted/20 p-1">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
              section === tab.id
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
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
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
                    {formatUsd(data.usage.totalSpendUsd)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {data.usage.totalEvents} turns ({data.usage.webEvents} web /{" "}
                    {data.usage.desktopEvents} desktop)
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
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
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
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
                    {data.runs.errorRatePct.toFixed(1)}%{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      errors
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    P95 {formatDurationMs(data.runs.p95DurationMs)} ·{" "}
                    {data.runs.totalSteps} steps
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Plugins &amp; hooks
                  </CardTitle>
                  <Blocks
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
                    {data.plugins.enabledPluginRows}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      / {data.plugins.builtinCatalogCount} built-in
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {data.plugins.triggeredInWindow} triggered ({data.window}) ·{" "}
                    {data.plugins.totalSlashCommands} slash cmds
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Agent teams
                  </CardTitle>
                  <Users
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
                    {data.teamsAndSubagents.subagentEventsInWindow}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      subagent turns
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {data.teamsAndSubagents.totalSubagentsSpawned} spawned ·{" "}
                    {data.teamsAndSubagents.boardEntriesTotal} board notes
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
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
                    {data.sandboxes.sessionsRunningStatus}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      / {data.sandboxes.activeCommands} cmds
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    MCP {data.mcp.enabledServers} active ·{" "}
                    {data.mcp.totalDiscoveredTools} tools
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Auth, vault &amp; compact
                  </CardTitle>
                  <ShieldCheck
                    className="size-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-medium tracking-tight tabular-nums sm:text-2xl">
                    {data.integrationsAndAuth.activeAuthSessions}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      live sessions
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    {data.secrets.totalSecrets} secrets ·{" "}
                    {formatTokens(data.compaction.totalTokensReclaimed)}{" "}
                    reclaimed
                  </p>
                </CardContent>
              </Card>
            </div>

            {(section === "all" || section === "live") && (
              <>
                <TelemetryTimeSeriesPanel
                  buckets={data.timeSeries}
                  window={data.window}
                />
                <ModelPerformanceTable data={data} />
              </>
            )}

            {(section === "all" ||
              section === "live" ||
              section === "sandboxes") && (
              <ActiveRunsAndSandboxesPanel data={data} />
            )}

            {(section === "all" || section === "plugins") && (
              <PluginsAndTeamsPanel data={data} />
            )}

            {(section === "all" || section === "sandboxes") && (
              <McpAndFailuresPanel data={data} />
            )}

            {(section === "all" || section === "ops") && (
              <>
                <IntegrationsAndPipelinePanel data={data} />
                <CompactionSecretsBillingPanel data={data} />
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
