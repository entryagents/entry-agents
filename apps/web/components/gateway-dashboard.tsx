"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  DollarSign,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthResponse {
  ok: boolean;
  status: string;
  uptime: number;
  routes: number;
  routedModels: string[];
  providers: string[];
  circuitBreakers: Record<string, string>;
  activeRequests: number;
  activeStreams: number;
  version?: string;
  gitCommit?: string | null;
}

interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg?: number;
  count: number;
}

interface MetricsBucket {
  requests: number;
  requests2xx: number;
  requests4xx: number;
  requests5xx: number;
  upstreamErrors: number;
  fallbacks: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    reasoning?: number;
    total: number;
    cacheHitRate?: number;
  };
  estimatedSpend: number;
  estimatedCacheSavingsUsd?: number;
  latency: LatencyStats;
  ttft: LatencyStats;
  statusBreakdown: Record<string, number>;
}

interface CircuitBreakerDetail {
  state: string;
  failures: number;
  openedAt: number;
  identity?: string;
}

interface DailyMetricsRow {
  day: string; // "YYYY-MM-DD" in Nigeria local time (12am WAT rollover)
  scope: string; // global | provider | model
  name: string;
  requests: number;
  requests2xx: number;
  requests4xx: number;
  requests5xx: number;
  upstreamErrors: number;
  fallbacks: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    reasoning?: number;
  };
  estimatedSpend: number;
}

interface MetricsResponse {
  uptime: number;
  activeRequests: number;
  activeStreams: number;
  global: MetricsBucket;
  byProvider: Record<string, MetricsBucket>;
  byModel: Record<string, MetricsBucket>;
  circuitBreakers: Record<string, CircuitBreakerDetail>;
  providers: string[];
  modelCount: number;
  providerCount: number;
  daily?: DailyMetricsRow[] | null;
  metricsBackend?: string;
  definitions?: {
    upstreamTimeoutMs?: string;
    [key: string]: string | undefined;
  };
}

interface ModelInfo {
  id: string;
  object?: string;
  name?: string;
  owned_by: string;
  protocols: string[];
}

interface RouteInfo {
  id: string;
  protocol: string;
  provider?: string;
  upstreamBaseURL?: string;
  upstreamModel?: string;
  upstreamApiKeyEnv?: string;
  priority: number;
  enabled: boolean;
  source?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatLatency(ms: number): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatMoney(n: number): string {
  if (n == null || Number.isNaN(n)) return "$0.00";
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function worstBreakerState(states: string[]): string {
  if (states.includes("open")) return "open";
  if (states.includes("half_open")) return "half_open";
  if (states.includes("closed")) return "closed";
  return "closed";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function GatewayDashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [status, setStatus] = useState<
    | "disconnected"
    | "connecting"
    | "connected"
    | "reconnecting"
    | "stale"
    | "error"
  >("connecting");
  const [statusText, setStatusText] = useState("Connecting…");
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastGoodTime, setLastGoodTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const consecutiveFailuresRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const lastGoodUpdateRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setIsRefreshing(true);

    try {
      const results = await Promise.allSettled([
        fetch("/api/settings/gateway-metrics?path=/health", {
          cache: "no-store",
        }),
        fetch("/api/settings/gateway-metrics?path=/metrics&daily=global", {
          cache: "no-store",
        }),
        fetch("/api/settings/gateway-metrics?path=/v1/models", {
          cache: "no-store",
        }),
        fetch("/api/settings/gateway-metrics?path=/v1/debug/routes", {
          cache: "no-store",
        }),
      ]);

      const [healthRes, metricsRes, modelsRes, routesRes] = results;

      let healthData: HealthResponse | null = null;
      let metricsData: MetricsResponse | null = null;
      let modelsData: { data: ModelInfo[] } | null = null;
      let routesData: { routes: RouteInfo[] } | null = null;

      const failedEndpoints: string[] = [];

      if (healthRes.status === "fulfilled" && healthRes.value.ok) {
        healthData = await healthRes.value.json();
      } else {
        failedEndpoints.push("health");
      }

      if (metricsRes.status === "fulfilled" && metricsRes.value.ok) {
        metricsData = await metricsRes.value.json();
      } else {
        failedEndpoints.push("metrics");
      }

      if (modelsRes.status === "fulfilled" && modelsRes.value.ok) {
        modelsData = await modelsRes.value.json();
      } else {
        failedEndpoints.push("models");
      }

      if (routesRes.status === "fulfilled" && routesRes.value.ok) {
        routesData = await routesRes.value.json();
      } else {
        failedEndpoints.push("routes");
      }

      if (failedEndpoints.length === 4) {
        consecutiveFailuresRef.current += 1;
        if (lastGoodUpdateRef.current > 0) {
          setStatus(
            consecutiveFailuresRef.current >= 3 ? "error" : "reconnecting",
          );
          setStatusText(
            consecutiveFailuresRef.current >= 3
              ? "Disconnected — retrying"
              : "Reconnecting…",
          );
          setStaleMessage(
            `Connection issue — showing data from ${new Date(
              lastGoodUpdateRef.current,
            ).toLocaleTimeString()}. Retrying…`,
          );
        } else {
          setStatus("error");
          setStatusText("Error");
          setErrorMessage(
            "All gateway endpoints failed to respond. Check GATEWAY_BASE_URL and authentication credentials.",
          );
        }
        return;
      }

      // At least some endpoints succeeded
      if (healthData) setHealth(healthData);
      if (metricsData) setMetrics(metricsData);
      if (modelsData?.data) setModels(modelsData.data);
      if (routesData?.routes) setRoutes(routesData.routes);

      consecutiveFailuresRef.current = 0;
      lastGoodUpdateRef.current = Date.now();
      setLastGoodTime(new Date());
      setStatus("connected");
      setStatusText("Connected");
      setErrorMessage(null);

      if (failedEndpoints.length > 0) {
        setStaleMessage(
          `Partial update: [${failedEndpoints.join(", ")}] failed — other sections show live data from ${new Date(
            lastGoodUpdateRef.current,
          ).toLocaleTimeString()}.`,
        );
      } else {
        setStaleMessage(null);
      }
    } catch (err) {
      consecutiveFailuresRef.current += 1;
      const msg = err instanceof Error ? err.message : "Network error";
      if (lastGoodUpdateRef.current > 0) {
        setStatus("reconnecting");
        setStatusText("Reconnecting…");
        setStaleMessage(
          `Connection interrupted (${msg}). Showing last good data.`,
        );
      } else {
        setStatus("error");
        setStatusText("Error");
        setErrorMessage(msg);
      }
    } finally {
      fetchInFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();

    // Auto-refresh every 5 seconds
    intervalRef.current = setInterval(() => {
      void fetchData();
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  // Staleness watch: if no successful snapshot for 15s, mark stale
  useEffect(() => {
    const checkStale = setInterval(() => {
      if (
        lastGoodUpdateRef.current > 0 &&
        Date.now() - lastGoodUpdateRef.current > 15000
      ) {
        setStatus("stale");
        setStatusText("Stale — retrying");
      }
    }, 3000);

    return () => clearInterval(checkStale);
  }, []);

  const g = metrics?.global;
  const requests = g?.requests || 0;
  const upstreamErrors = g?.upstreamErrors || 0;
  const tokensTotal = g?.tokens?.total || 0;
  const cacheRead = g?.tokens?.cacheRead || 0;
  const cacheWrite = g?.tokens?.cacheWrite || 0;
  const estimatedSpend = g?.estimatedSpend || 0;
  const activeRequests = metrics?.activeRequests ?? health?.activeRequests ?? 0;
  const activeStreams = metrics?.activeStreams ?? 0;
  const latency = g?.latency;
  const statusBreakdown = g?.statusBreakdown || {};

  const errorRate = requests > 0 ? (upstreamErrors / requests) * 100 : 0;

  // Provider -> Models map for mapping circuit breaker states
  const providerModels = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of routes) {
      const provider = r.provider || r.upstreamApiKeyEnv || "unknown";
      let set = map.get(provider);
      if (!set) {
        set = new Set<string>();
        map.set(provider, set);
      }
      set.add(r.id);
    }
    return map;
  }, [routes]);

  // Unified circuit breaker states
  const cbStates = useMemo(() => {
    const states: Record<
      string,
      { state: string; failures?: number; openedAt?: number; identity?: string }
    > = {};
    if (metrics?.circuitBreakers) {
      for (const [k, v] of Object.entries(metrics.circuitBreakers)) {
        states[k] = typeof v === "string" ? { state: v } : v;
      }
    }
    if (health?.circuitBreakers) {
      for (const [k, v] of Object.entries(health.circuitBreakers)) {
        if (!states[k]) states[k] = { state: v };
      }
    }
    return states;
  }, [metrics?.circuitBreakers, health?.circuitBreakers]);

  // Cache hit rate rows
  const cacheRows = useMemo(() => {
    const byModelCache = metrics?.byModel || {};
    return Object.keys(byModelCache)
      .map((name) => {
        const t = byModelCache[name].tokens || {
          input: 0,
          cacheRead: 0,
          cacheWrite: 0,
        };
        const input = t.input || 0;
        const read = t.cacheRead || 0;
        const write = t.cacheWrite || 0;
        const denom = input + read + write;
        const pct =
          typeof t.cacheHitRate === "number"
            ? t.cacheHitRate * 100
            : denom > 0
              ? (read / denom) * 100
              : 0;
        return { name, input, cacheRead: read, denom, pct };
      })
      .filter((r) => r.denom > 0)
      .sort((a, b) => b.pct - a.pct || b.denom - a.denom);
  }, [metrics?.byModel]);

  const totalCacheDenom = useMemo(
    () => cacheRows.reduce((acc, r) => acc + r.denom, 0),
    [cacheRows],
  );
  const totalCacheRead = useMemo(
    () => cacheRows.reduce((acc, r) => acc + r.cacheRead, 0),
    [cacheRows],
  );
  const avgCachePct =
    totalCacheDenom > 0 ? (totalCacheRead / totalCacheDenom) * 100 : 0;

  // Daily rows (Africa/Lagos / WAT timezone)
  const dailyRows = useMemo(() => {
    if (!Array.isArray(metrics?.daily)) return [];
    return metrics.daily
      .filter((r) => r.scope === "global")
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
      .slice(-14)
      .toReversed();
  }, [metrics?.daily]);

  const maxDailyRequests = useMemo(() => {
    return Math.max(...dailyRows.map((r) => r.requests || 0), 1);
  }, [dailyRows]);

  // Stat cards definitions
  const statCards = [
    {
      label: "Upstream Attempts",
      value: formatNumber(requests),
      sublabel: `${activeRequests} in-flight now · ${activeStreams} streams`,
      icon: Activity,
      accent: false,
      isError: false,
    },
    {
      label: "Avg Latency",
      value: latency ? formatLatency(latency.avg ?? latency.p50) : "—",
      sublabel: latency
        ? `p50 ${formatLatency(latency.p50)} · p95 ${formatLatency(latency.p95)}`
        : "no records yet",
      icon: Clock,
      accent: false,
      isError: false,
    },
    {
      label: "Upstream Errors",
      value: formatNumber(upstreamErrors),
      sublabel:
        requests > 0
          ? `${errorRate.toFixed(1)}% of attempts`
          : "no attempts yet",
      icon: AlertTriangle,
      accent: upstreamErrors > 0,
      isError: upstreamErrors > 0,
    },
    {
      label: "Total Tokens",
      value: formatNumber(tokensTotal),
      sublabel: `${formatNumber(cacheRead)} cache-read · ${formatNumber(cacheWrite)} cache-write`,
      icon: TrendingUp,
      accent: false,
      isError: false,
    },
    {
      label: "Est. Spend",
      value: formatMoney(estimatedSpend),
      sublabel: "estimated · all-time",
      icon: DollarSign,
      accent: true,
      isError: false,
    },
  ];

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes cacheSheen {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-cache-sheen {
          background-size: 200% 100%;
          animation: cacheSheen 2.6s ease-in-out infinite;
        }
      `}</style>

      {/* ─── Header ─── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Gateway Admin
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time monitoring — per-provider and aggregate metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isRefreshing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-[#ff8a3d]" />
              <span>Updating…</span>
            </div>
          )}

          {lastGoodTime && !isRefreshing && (
            <span className="font-mono text-xs text-muted-foreground">
              Updated {lastGoodTime.toLocaleTimeString()}
            </span>
          )}

          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium">
            <span
              className={cn(
                "size-2 rounded-full",
                status === "connected" && "animate-pulse bg-emerald-400",
                (status === "reconnecting" || status === "stale") &&
                  "bg-amber-400",
                status === "error" && "bg-red-400",
                status === "disconnected" && "bg-muted-foreground",
              )}
            />
            <span>{statusText}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            disabled={isRefreshing}
            className="gap-1.5 border-border text-xs hover:border-[#ff8a3d]/50 hover:text-[#ff8a3d]"
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                isRefreshing && "animate-spin text-[#ff8a3d]",
              )}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* ─── Banners ─── */}
      {staleMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-400">
          <span>⏳</span>
          <span>{staleMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ─── Stat Grid ─── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((c) => (
          <div
            key={c.label}
            className={cn(
              "relative overflow-hidden rounded-xl border bg-card p-5 transition-all",
              c.accent && "border-[#ff8a3d]/30",
              c.isError && "border-red-500/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {c.label}
                </p>
                <p
                  className={cn(
                    "mt-2 text-2xl font-semibold tracking-tight",
                    c.accent && "text-[#ff8a3d]",
                    c.isError && "text-red-400",
                  )}
                >
                  {c.value}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {c.sublabel}
                </p>
              </div>

              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  c.accent
                    ? "border-[#ff8a3d]/20 bg-[#ff8a3d]/10 text-[#ff8a3d]"
                    : c.isError
                      ? "border-red-500/20 bg-red-500/10 text-red-400"
                      : "border-border bg-muted/30 text-muted-foreground",
                )}
              >
                <c.icon className="size-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Two Column: Latency Distribution & Request Status ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Latency Distribution */}
        <div className="flex flex-col rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-[#ff8a3d]">⏱</span>
              Latency Distribution
            </h3>
          </div>

          <div className="flex-1 space-y-3 p-5">
            {!latency || latency.count === 0 ? (
              <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                No latency records yet
              </div>
            ) : (
              <>
                {[
                  { label: "avg", val: latency.avg ?? latency.p50 },
                  { label: "p50", val: latency.p50 },
                  { label: "p95", val: latency.p95 },
                  { label: "p99", val: latency.p99 },
                ].map((row) => {
                  const maxLat = Math.max(
                    latency.p50,
                    latency.p95,
                    latency.p99,
                    latency.avg || 0,
                    1,
                  );
                  const pct = Math.min((row.val / maxLat) * 100, 100);
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                        {row.label}
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[#ff8a3d] transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-xs font-medium text-foreground">
                        {formatLatency(row.val)}
                      </span>
                    </div>
                  );
                })}

                <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>min: {formatLatency(latency.min || 0)}</span>
                  <span>max: {formatLatency(latency.max || 0)}</span>
                  <span>count: {formatNumber(latency.count || 0)}</span>
                </div>
              </>
            )}
          </div>

          <div className="border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Percentiles (nearest-rank) and mean over the most recent 500
            recorded upstream attempts, all-time. TTFT = time to first streamed
            byte. A p95/p99 clustered at the upstream timeout ceiling means that
            share of attempts is hitting the hard timeout, not that every
            request is slow.
          </div>
        </div>

        {/* Request Status */}
        <div className="flex flex-col rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-[#ff8a3d]">📡</span>
              Request Status
            </h3>
          </div>

          <div className="flex-1 space-y-2 p-5">
            {Object.keys(statusBreakdown).length === 0 ? (
              <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                No status breakdown yet
              </div>
            ) : (
              (() => {
                const entries = Object.entries(statusBreakdown)
                  .map(([code, count]) => ({ code: Number(code), count }))
                  .sort((a, b) => b.count - a.count);
                const total = entries.reduce((s, e) => s + e.count, 0) || 1;

                return entries.map((entry) => {
                  const pct = (entry.count / total) * 100;
                  const is2xx = entry.code >= 200 && entry.code < 300;
                  const is4xx = entry.code >= 400 && entry.code < 500;
                  const is5xx = entry.code >= 500;

                  return (
                    <div key={entry.code} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                        POST
                      </span>
                      <span
                        className={cn(
                          "w-10 shrink-0 font-mono text-xs font-semibold",
                          is2xx && "text-emerald-400",
                          is4xx && "text-amber-400",
                          is5xx && "text-red-400",
                          !is2xx && !is4xx && !is5xx && "text-muted-foreground",
                        )}
                      >
                        {entry.code === 0 ? "0 (fail)" : entry.code}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            is2xx && "bg-emerald-500/80",
                            is4xx && "bg-amber-500/80",
                            is5xx && "bg-red-500/80",
                            !is2xx &&
                              !is4xx &&
                              !is5xx &&
                              "bg-muted-foreground/60",
                          )}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-xs font-medium text-foreground">
                        {entry.count}
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                });
              })()
            )}
          </div>

          <div className="border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Counts upstream attempts (a request retried on a fallback route
            counts once per attempt). Status 0 = the attempt produced no
            upstream response: client disconnect, timeout, circuit-open
            rejection, or gateway config error. All proxied traffic is POST.
          </div>
        </div>
      </div>

      {/* ─── Per-Provider Breakdown Table ─── */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-[#ff8a3d]">🔌</span>
            Per-Provider Breakdown
          </h3>
          <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {metrics?.providers?.length ||
              Object.keys(metrics?.byProvider || {}).length}{" "}
            providers
          </span>
        </div>

        <div className="overflow-x-auto">
          {Object.keys(metrics?.byProvider || {}).length === 0 ? (
            <div className="p-5 text-center text-xs text-muted-foreground">
              No provider data yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Provider
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    Attempts
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    2xx
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    4xx
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    5xx
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    Tokens In
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    Tokens Out
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    Spend
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    p50
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    Upstream Err
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Breaker / Health
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.keys(metrics?.byProvider || {}).map((name) => {
                  const p = metrics!.byProvider[name];
                  const provModels =
                    providerModels.get(name) || new Set<string>();

                  const matchingKeys = Object.keys(cbStates).filter(
                    (k) =>
                      (k.startsWith("model:") &&
                        provModels.has(k.slice("model:".length))) ||
                      k.startsWith(`${name}:`),
                  );

                  const worst = worstBreakerState(
                    matchingKeys.map((k) => cbStates[k]?.state || "closed"),
                  );
                  const isStaleOpen =
                    worst === "open" &&
                    matchingKeys.some((k) => {
                      const openedAt = cbStates[k]?.openedAt || 0;
                      return openedAt > 0 && Date.now() - openedAt > 30000;
                    });

                  const attempts = p.requests || 0;
                  const errors = p.upstreamErrors || 0;
                  const errPct = attempts > 0 ? (errors / attempts) * 100 : 0;

                  return (
                    <TableRow
                      key={name}
                      className="border-border hover:bg-muted/40"
                    >
                      <TableCell className="text-xs font-medium text-foreground">
                        {name}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(attempts)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-emerald-400">
                        {formatNumber(p.requests2xx || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-amber-400">
                        {formatNumber(p.requests4xx || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-red-400">
                        {formatNumber(p.requests5xx || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(p.tokens?.input || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatNumber(p.tokens?.output || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[#ff8a3d]">
                        {formatMoney(p.estimatedSpend || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {p.latency?.count ? formatLatency(p.latency.p50) : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-xs",
                          errPct >= 5 && "font-semibold text-red-400",
                        )}
                      >
                        {formatNumber(errors)}
                        {attempts > 0 && (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            ({errPct.toFixed(1)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              worst === "open" && "bg-red-400",
                              worst === "half_open" && "bg-amber-400",
                              worst === "closed" && "bg-emerald-400",
                            )}
                          />
                          <span
                            className={cn(
                              "font-mono text-xs capitalize",
                              worst === "open" && "text-red-400",
                              worst === "half_open" && "text-amber-400",
                              worst === "closed" && "text-emerald-400",
                            )}
                          >
                            {worst}
                          </span>
                          {isStaleOpen && (
                            <span className="text-[11px] text-muted-foreground">
                              (cooldown elapsed)
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ─── Daily History (Nigeria Time / WAT) ─── */}
      {Array.isArray(metrics?.daily) && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-[#ff8a3d]">📅</span>
              Daily History (Nigeria time)
            </h3>
            <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {dailyRows.length} day{dailyRows.length !== 1 ? "s" : ""} ·
              unbounded retention
            </span>
          </div>

          <div className="overflow-x-auto">
            {dailyRows.length === 0 ? (
              <div className="p-5 text-center text-xs text-muted-foreground">
                No history recorded yet — days appear here as requests flow.
                Retention is unbounded.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs font-medium text-muted-foreground">
                      Day (WAT)
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Requests
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      2xx
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      4xx
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      5xx
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Errors
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium text-muted-foreground">
                      Spend
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyRows.map((r) => {
                    const reqWidth = Math.max(
                      (r.requests / maxDailyRequests) * 44,
                      r.requests > 0 ? 3 : 0,
                    );
                    return (
                      <TableRow
                        key={r.day}
                        className="border-border hover:bg-muted/40"
                      >
                        <TableCell className="font-mono text-xs text-foreground">
                          {r.day}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <span className="inline-flex items-center justify-end gap-2">
                            <span
                              className="inline-block h-1.5 rounded-sm bg-[#ff8a3d]/70"
                              style={{ width: `${reqWidth}px` }}
                            />
                            {formatNumber(r.requests || 0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-emerald-400">
                          {formatNumber(r.requests2xx || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-amber-400">
                          {formatNumber(r.requests4xx || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-red-400">
                          {formatNumber(r.requests5xx || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatNumber(r.upstreamErrors || 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-[#ff8a3d]">
                          {formatMoney(r.estimatedSpend || 0)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* ─── Cache Hit Rate by Model ─── */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-[#ff8a3d]">💎</span>
            Cache Hit Rate by Model
          </h3>
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {avgCachePct.toFixed(1)}% avg
          </span>
        </div>

        <div className="space-y-3.5 p-5">
          {cacheRows.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No request traffic with cache data yet
            </div>
          ) : (
            <>
              {cacheRows.map((r) => {
                const gradient =
                  r.pct >= 60
                    ? "linear-gradient(90deg, #ff8a3d, #10b981)"
                    : r.pct > 0
                      ? "linear-gradient(90deg, #9ca3af, #ff8a3d)"
                      : "var(--muted)";

                const colorClass =
                  r.pct >= 60
                    ? "text-emerald-400"
                    : r.pct >= 25
                      ? "text-[#ff8a3d]"
                      : r.pct > 0
                        ? "text-amber-400"
                        : "text-muted-foreground";

                return (
                  <div key={r.name} className="flex items-center gap-3.5">
                    <span
                      className="w-44 shrink-0 truncate font-mono text-xs font-medium text-foreground"
                      title={r.name}
                    >
                      {r.name}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="animate-cache-sheen relative h-full rounded-full transition-all duration-500 after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)]"
                        style={{
                          width: `${Math.max(r.pct, r.pct > 0 ? 2 : 0)}%`,
                          background: gradient,
                        }}
                      />
                    </div>
                    <span
                      className={cn(
                        "w-36 shrink-0 text-right font-mono text-xs font-semibold",
                        colorClass,
                      )}
                    >
                      {r.pct.toFixed(1)}%
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        {formatNumber(r.cacheRead)}/{formatNumber(r.denom)}
                      </span>
                    </span>
                  </div>
                );
              })}

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  {cacheRows.length} model{cacheRows.length !== 1 ? "s" : ""}{" "}
                  with traffic
                </span>
                <span>
                  {formatNumber(totalCacheRead)} /{" "}
                  {formatNumber(totalCacheDenom)} prompt tokens served from
                  cache
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Circuit Breakers ─── */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-[#ff8a3d]">⚡</span>
            Circuit Breakers
          </h3>
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {Object.keys(cbStates).length} breakers
          </span>
        </div>

        <div className="p-5">
          {Object.keys(cbStates).length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <span>✓</span>
              <span>
                No circuit breakers recorded (all circuits closed / healthy)
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(cbStates).map(([key, cb]) => {
                const state = cb?.state || "closed";
                const staleOpen =
                  state === "open" &&
                  cb?.openedAt &&
                  Date.now() - cb.openedAt > 30000;
                const legacy = cb?.identity === "legacy" ? " · legacy key" : "";

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
                    title={
                      staleOpen
                        ? "Cooldown elapsed — the breaker probes again on the next request."
                        : `Failures: ${cb?.failures ?? 0}`
                    }
                  >
                    <span className="mr-2 truncate font-mono text-muted-foreground">
                      {key}
                      {legacy}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono font-medium",
                        state === "closed" && "text-emerald-400",
                        state === "half_open" && "text-amber-400",
                        state === "open" && "text-red-400",
                      )}
                    >
                      {state}
                      {staleOpen && " *"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
          * cooldown elapsed — the breaker probes again on the next request.
          Rows for models no longer configured persist until they next see
          traffic; they cannot trip or recover while unused.
        </div>
      </div>

      {/* ─── Model Routes ─── */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-[#ff8a3d]">🛤</span>
            Model Routes
          </h3>
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {routes.length} route{routes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="overflow-x-auto">
          {routes.length === 0 ? (
            <div className="p-5 text-center text-xs text-muted-foreground">
              No routes configured
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    ID
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Protocol
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Provider
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">
                    Priority
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((route) => (
                  <TableRow
                    key={route.id}
                    className="border-border hover:bg-muted/40"
                  >
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      {route.id}
                    </TableCell>
                    <TableCell>
                      <span className="inline-block rounded border border-[#ff8a3d]/20 bg-[#ff8a3d]/10 px-2 py-0.5 font-mono text-[11px] text-[#ff8a3d]">
                        {route.protocol}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {route.provider || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {route.priority ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            route.enabled
                              ? "bg-emerald-400"
                              : "bg-muted-foreground",
                          )}
                        />
                        <span
                          className={cn(
                            route.enabled
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {route.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ─── Available Models ─── */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-[#ff8a3d]">✦</span>
            Available Models
          </h3>
          <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {models.length} model{models.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="p-5">
          {models.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No models available
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-mono font-medium text-foreground">
                      {m.id}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {m.protocols?.join(", ") || "openai-chat"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {m.owned_by || "gateway"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
