"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Layers,
  Lock,
  Plug,
  ShieldCheck,
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
  formatDurationMs,
  formatUsd,
} from "./telemetry-charts";

function formatCentsUsd(cents: number): string {
  return formatUsd(cents / 100);
}

function formatRelativeIso(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function McpAndFailuresPanel({ data }: { data: AdminTelemetryPayload }) {
  const { mcp, recentFailures, window } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="rounded-xl lg:col-span-5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Plug
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                MCP fleet &amp; transports
              </CardTitle>
              <CardDescription className="text-xs">
                HTTP, SSE, and sandbox stdio MCP servers across users
              </CardDescription>
            </div>
            <Link
              href="/settings/mcp-servers"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              MCP settings
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Enabled</div>
              <div className="text-lg font-medium tabular-nums">
                {mcp.enabledServers}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {mcp.totalServers}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {mcp.distinctUsers} users
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Tools</div>
              <div className="text-lg font-medium tabular-nums">
                {mcp.totalDiscoveredTools}
              </div>
              <div className="text-[11px] text-muted-foreground">
                discovered
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Failing</div>
              <div
                className={`text-lg font-medium tabular-nums ${
                  mcp.failingServers > 0
                    ? "text-destructive"
                    : "text-foreground"
                }`}
              >
                {mcp.failingServers}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {mcp.disabledServers} disabled
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Transport breakdown
            </div>
            <DistributionChips
              entries={[
                { label: "http", count: mcp.byTransport.http },
                { label: "sse", count: mcp.byTransport.sse },
                { label: "stdio", count: mcp.byTransport.stdio },
              ]}
              emptyLabel="No MCP servers configured"
            />
          </div>

          {mcp.recentErrors.length === 0 ? (
            <div className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
              No MCP connection errors reported
            </div>
          ) : (
            <div className="max-h-44 space-y-1.5 overflow-auto">
              {mcp.recentErrors.map((err) => (
                <div
                  key={err.id}
                  className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {err.name}{" "}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        ({err.transport})
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatRelativeIso(err.checkedAt)}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2 font-mono text-[11px] text-destructive">
                    {err.error}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-7">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                Recent workflow failures ({window})
              </CardTitle>
              <CardDescription className="text-xs">
                Latest failed turns with secret-redacted diagnostic summaries
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={`font-normal tabular-nums ${
                recentFailures.length > 0
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {data.runs.failed} failed / {data.runs.total} total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {recentFailures.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-xs text-muted-foreground">
              Zero workflow failures in the {window} window
            </div>
          ) : (
            <div className="max-h-72 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Model / Chat</TableHead>
                    <TableHead className="text-xs">Error (redacted)</TableHead>
                    <TableHead className="text-right text-xs">Dur.</TableHead>
                    <TableHead className="text-right text-xs">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentFailures.map((fail) => (
                    <TableRow key={fail.id}>
                      <TableCell className="max-w-[160px] align-top">
                        <div className="truncate font-mono text-xs font-medium">
                          {fail.modelId ?? "default"}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {fail.chatId.slice(0, 10)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px] align-top">
                        <div className="line-clamp-2 font-mono text-[11px] text-destructive">
                          {fail.errorMessage ?? "Unknown workflow error"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top text-xs tabular-nums text-muted-foreground">
                        {formatDurationMs(fail.totalDurationMs)}
                      </TableCell>
                      <TableCell className="text-right align-top text-xs tabular-nums text-muted-foreground">
                        {formatRelativeIso(fail.finishedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function CompactionSecretsBillingPanel({
  data,
}: {
  data: AdminTelemetryPayload;
}) {
  const { compaction, secrets, usersAndBilling, platform, window } = data;

  const feedbackEntries = Object.entries(platform.feedbackBySentiment)
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="rounded-xl lg:col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Layers
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
            Compaction engine ({window})
          </CardTitle>
          <CardDescription className="text-xs">
            Context reclaimed, pruned tool calls, and recent auto-compactions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Events</div>
              <div className="text-lg font-medium tabular-nums">
                {compaction.eventsInWindow}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {compaction.chatsAffected} chats
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Avg saved</div>
              <div className="text-lg font-medium tabular-nums">
                {compaction.avgSavingsPct}%
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {formatTokens(compaction.avgPreCompactTokens)} →{" "}
                {formatTokens(compaction.avgPostCompactTokens)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Reclaimed</div>
              <div className="text-lg font-medium tabular-nums">
                {formatTokens(compaction.totalTokensReclaimed)}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {compaction.totalToolCallsCompacted} tools pruned
              </div>
            </div>
          </div>

          {compaction.recent.length === 0 ? (
            <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
              No compaction events triggered in this window
            </div>
          ) : (
            <div className="max-h-52 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Model</TableHead>
                    <TableHead className="text-right text-xs">
                      Pre → Post
                    </TableHead>
                    <TableHead className="text-right text-xs">Tools</TableHead>
                    <TableHead className="text-right text-xs">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compaction.recent.map((evt) => (
                    <TableRow key={evt.id}>
                      <TableCell className="max-w-[140px] truncate font-mono text-xs">
                        {evt.modelId ?? "unknown"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatTokens(evt.preCompactTokens)} →{" "}
                        <span className="font-medium text-emerald-500">
                          {formatTokens(evt.postCompactTokens)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {evt.compactedToolCalls}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {formatRelativeIso(evt.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                Secrets vault
              </CardTitle>
              <CardDescription className="text-xs">
                Zero-knowledge aggregate telemetry
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="gap-1 font-normal text-[11px] text-muted-foreground"
            >
              <Lock className="size-3" strokeWidth={1.5} />
              Aggregate only
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Total keys
              </div>
              <div className="text-lg font-medium tabular-nums">
                {secrets.totalSecrets}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {secrets.distinctUsersWithSecrets} users
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Uses ({window})
              </div>
              <div className="text-lg font-medium tabular-nums">
                {secrets.secretsUsedInWindow}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {secrets.totalUsagesAllTime} all-time
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Sandbox env injected
              </span>
              <span className="font-medium tabular-nums">
                {secrets.sandboxInjectedSecrets}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Host allowlisted</span>
              <span className="font-medium tabular-nums">
                {secrets.hostRestrictedSecrets}
              </span>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Aggregate counts only — plaintext values, hints, hosts, and secret
            names are never queried or exposed.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CreditCard
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                Users, billing &amp; platform
              </CardTitle>
              <CardDescription className="text-xs">
                Accounts, balances, transactions ({window}), and feedback
              </CardDescription>
            </div>
            <Link
              href="/settings/admin/users"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Manage
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Users</div>
              <div className="text-lg font-medium tabular-nums">
                {usersAndBilling.totalUsers}
              </div>
              <div className="text-[11px] text-emerald-500 tabular-nums">
                +{usersAndBilling.newUsersInWindow} new
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                GitHub OAuth
              </div>
              <div className="text-lg font-medium tabular-nums">
                {usersAndBilling.githubConnectedUsers}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {usersAndBilling.adminUsers} admins
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Zero credit
              </div>
              <div className="text-lg font-medium tabular-nums">
                {usersAndBilling.usersAtZeroCredit}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                accounts ≤ $0
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Credit liability
              </div>
              <div className="font-medium tabular-nums">
                {formatCentsUsd(usersAndBilling.totalCreditBalanceCents)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Plan grants
              </div>
              <div className="font-medium tabular-nums">
                {formatCentsUsd(usersAndBilling.totalPlanGrantBalanceCents)}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Plans &amp; transactions ({window})
            </div>
            <DistributionChips
              entries={usersAndBilling.planDistribution.map((p) => ({
                label: p.plan,
                count: p.count,
              }))}
            />
            {usersAndBilling.transactionsInWindow.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-muted-foreground tabular-nums">
                {usersAndBilling.transactionsInWindow.map((tx) => (
                  <span key={tx.type}>
                    {tx.type}: {tx.count} ({formatCentsUsd(tx.amountCents)})
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-t pt-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground tabular-nums">
              <span>
                Chats: {platform.totalChats.toLocaleString()} · Shares:{" "}
                {platform.totalShares.toLocaleString()}
              </span>
              <Link href="/settings/admin/feedback" className="hover:underline">
                Feedback: {platform.unreadFeedback} unread (
                {platform.feedbackInWindow} in {window})
              </Link>
            </div>
            {feedbackEntries.length > 0 && (
              <DistributionChips entries={feedbackEntries} />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                Free tier: {platform.freeTierEnabled ? "Enabled" : "Disabled"} ·
                Title:{" "}
                <span className="font-mono">
                  {platform.titleModelId ?? "default"}
                </span>
              </span>
              {platform.latestBenchmarkRun && (
                <span>
                  Bench {platform.latestBenchmarkRun.suiteVersion}:{" "}
                  {platform.latestBenchmarkRun.status}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
