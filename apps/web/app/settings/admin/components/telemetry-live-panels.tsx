"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  Activity,
  ArrowUpRight,
  Box,
  Cpu,
  GitBranch,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminTelemetryPayload } from "@/lib/db/admin-telemetry";
import {
  DistributionChips,
  formatAgeSeconds,
  formatDurationMs,
  formatUsd,
} from "./telemetry-charts";

function runStatusBadgeClass(status: string): string {
  if (status === "running") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

function errorRateBadgeClass(ratePct: number): string {
  if (ratePct >= 10) {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (ratePct >= 2) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-500";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function ActiveRunsAndSandboxesPanel({
  data,
}: {
  data: AdminTelemetryPayload;
}) {
  const lifecycleEntries = Object.entries(data.sandboxes.byLifecycle)
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);

  const providerEntries = Object.entries(data.sandboxes.byProvider)
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="rounded-xl lg:col-span-7">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Activity
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                Live execution &amp; streams
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time workflow runs, queued prompts, and active streams
              </CardDescription>
            </div>
            <Link
              href="/settings/admin/chats"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All chats
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs tabular-nums">
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-500"
            >
              Running: {data.live.statusCounts.running}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Queued turns: {data.live.statusCounts.queued}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Sleeping: {data.live.statusCounts.sleeping}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Queued prompts: {data.live.totalQueuedPrompts}
            </Badge>
            <Badge variant="outline" className="font-normal">
              Unread inbox: {data.live.unreadInboxMessages}
            </Badge>
            {data.live.activeBillingLocks > 0 && (
              <Badge variant="outline" className="font-normal">
                Billing locks: {data.live.activeBillingLocks}
              </Badge>
            )}
          </div>

          {data.live.activeRuns.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
              No active workflows streaming right now
            </div>
          ) : (
            <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-lg border">
              <Table className="min-w-[520px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Chat / User</TableHead>
                    <TableHead className="text-xs">Model</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.live.activeRuns.map((run) => (
                    <TableRow key={run.chatId}>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate text-xs font-medium">
                          {run.chatTitle || run.chatId.slice(0, 8)}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {run.userEmail ??
                            run.username ??
                            run.chatId.slice(0, 8)}
                          {run.queuedCount > 0 &&
                            ` · +${run.queuedCount} queued`}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="truncate font-mono">
                          {run.modelId ?? "default"}
                        </div>
                        {run.reasoningEffort && (
                          <div className="text-[11px] text-muted-foreground">
                            effort: {run.reasoningEffort}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-normal ${runStatusBadgeClass(run.status)}`}
                        >
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {formatAgeSeconds(run.ageSeconds)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Box className="size-4 text-muted-foreground" strokeWidth={1.5} />
            Sandboxes, commands &amp; Git
          </CardTitle>
          <CardDescription className="text-xs">
            Container fleet state across providers and pull request activity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Sessions</div>
              <div className="text-lg font-medium tabular-nums">
                {data.sandboxes.totalSessions.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {data.sandboxes.sessionsRunningStatus} active
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Terminal className="size-3" strokeWidth={1.5} />
                Live cmds
              </div>
              <div className="text-lg font-medium tabular-nums">
                {data.sandboxes.activeCommands}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {data.sandboxes.migrationsFailing} migration errors
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <GitBranch className="size-3" strokeWidth={1.5} />
                PRs
              </div>
              <div className="text-lg font-medium tabular-nums">
                {data.sandboxes.git.prsOpen +
                  data.sandboxes.git.prsMerged +
                  data.sandboxes.git.prsClosed}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {data.sandboxes.git.prsOpen} open ·{" "}
                {data.sandboxes.git.prsMerged} merged
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Sandbox providers
            </div>
            <DistributionChips entries={providerEntries} />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Lifecycle states
            </div>
            <DistributionChips
              entries={lifecycleEntries}
              toneMap={{
                active:
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
                failed:
                  "border-destructive/30 bg-destructive/10 text-destructive",
              }}
            />
          </div>

          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>
              Repos linked: {data.sandboxes.git.connectedRepos.toLocaleString()}
            </span>
            <span className="tabular-nums">
              <span className="text-emerald-500">
                +{data.sandboxes.git.linesAddedWindow.toLocaleString()}
              </span>{" "}
              /{" "}
              <span className="text-destructive">
                -{data.sandboxes.git.linesRemovedWindow.toLocaleString()}
              </span>{" "}
              lines ({data.window})
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ModelPerformanceTable({
  data,
}: {
  data: AdminTelemetryPayload;
}) {
  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Cpu className="size-4 text-muted-foreground" strokeWidth={1.5} />
              Models, cache hit rates &amp; speed ({data.window})
            </CardTitle>
            <CardDescription className="text-xs">
              Per-model reliability, P50/P95 latency (
              {formatDurationMs(data.runs.p50DurationMs)} /{" "}
              {formatDurationMs(data.runs.p95DurationMs)}), throughput (TPS),
              and prompt caching performance
            </CardDescription>
          </div>
          <Link
            href="/settings/admin/models"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Configure models
            <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {data.perModel.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
            No model runs or usage events recorded in this window
          </div>
        ) : (
          <div className="max-h-96 overflow-x-auto overflow-y-auto rounded-lg border">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead className="text-right text-xs">Turns</TableHead>
                  <TableHead className="text-right text-xs">Error %</TableHead>
                  <TableHead className="text-right text-xs">
                    Avg latency
                  </TableHead>
                  <TableHead className="text-right text-xs">Est. TPS</TableHead>
                  <TableHead className="text-right text-xs">
                    Input / Out
                  </TableHead>
                  <TableHead className="text-right text-xs">
                    Cache hit
                  </TableHead>
                  <TableHead className="text-right text-xs">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perModel.map((row) => (
                  <TableRow key={row.modelId}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-medium">
                          {row.modelId}
                        </span>
                        {row.isDeepSeek && (
                          <Badge
                            variant="secondary"
                            className="px-1.5 py-0 font-mono text-[11px] font-normal"
                          >
                            DeepSeek KV
                          </Badge>
                        )}
                      </div>
                      {row.provider && (
                        <div className="text-[11px] text-muted-foreground">
                          {row.provider}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <div>{row.runs || row.usageEvents}</div>
                      {row.failedRuns > 0 && (
                        <div className="text-[11px] text-destructive">
                          {row.failedRuns} failed
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={`font-normal tabular-nums text-[11px] ${errorRateBadgeClass(row.errorRatePct)}`}
                      >
                        {row.errorRatePct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatDurationMs(row.avgDurationMs)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {row.estimatedTps !== null
                        ? `${row.estimatedTps}/s`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      <div>{formatTokens(row.inputTokens)}</div>
                      <div className="text-[11px]">
                        → {formatTokens(row.outputTokens)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      <span
                        className={
                          row.cacheHitPct >= 50
                            ? "font-medium text-emerald-500"
                            : row.cacheHitPct > 0
                              ? "text-foreground"
                              : "text-muted-foreground"
                        }
                      >
                        {row.cacheHitPct.toFixed(1)}%
                      </span>
                      <div className="text-[11px] text-muted-foreground">
                        {formatTokens(row.cachedInputTokens)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium tabular-nums">
                      {formatUsd(row.spendUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
