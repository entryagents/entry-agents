"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  ArrowUpRight,
  Blocks,
  Cable,
  GitPullRequest,
  SlidersHorizontal,
  Users,
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
import { DistributionChips, formatUsd } from "./telemetry-charts";

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

export function PluginsAndTeamsPanel({
  data,
}: {
  data: AdminTelemetryPayload;
}) {
  const { plugins, teamsAndSubagents, window } = data;

  const hookEntries = Object.entries(plugins.byHook)
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);

  const roleEntries = Object.entries(teamsAndSubagents.byRole)
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);

  const boardKindEntries = Object.entries(teamsAndSubagents.boardEntriesByKind)
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);

  const boardTaskEntries = Object.entries(teamsAndSubagents.boardTasksByStatus)
    .map(([label, count]) => ({ label, count }))
    .toSorted((a, b) => b.count - a.count);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="rounded-xl lg:col-span-7">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Blocks
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                Plugins, lifecycle hooks &amp; slash commands
              </CardTitle>
              <CardDescription className="text-xs">
                Built-in and custom JSON plugins, encrypted config keys, and
                durable hook executions
              </CardDescription>
            </div>
            <Link
              href="/settings/plugins"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Manage plugins
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Catalog</div>
              <div className="text-lg font-medium tabular-nums">
                {plugins.builtinCatalogCount}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  built-in
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                +{plugins.customPluginRows} custom rows
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                User configs
              </div>
              <div className="text-lg font-medium tabular-nums">
                {plugins.enabledPluginRows}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {plugins.totalUserPluginRows}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {plugins.distinctUsers} users ·{" "}
                {plugins.secretConfiguredPlugins} encrypted
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Hook runs</div>
              <div className="text-lg font-medium tabular-nums">
                {plugins.totalTriggersAllTime.toLocaleString()}
              </div>
              <div className="text-[11px] text-emerald-500 tabular-nums">
                {plugins.triggeredInWindow} active in {window}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">/Commands</div>
              <div className="text-lg font-medium tabular-nums">
                {plugins.totalSlashCommands}
              </div>
              <div className="text-[11px] text-muted-foreground">
                composer &amp; palette
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Registered lifecycle hooks
            </div>
            <DistributionChips
              entries={hookEntries}
              emptyLabel="No lifecycle hooks registered"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[480px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Plugin</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-right text-xs">Enabled</TableHead>
                  <TableHead className="text-right text-xs">Triggers</TableHead>
                  <TableHead className="text-right text-xs">Last run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plugins.topPlugins.map((plugin) => (
                  <TableRow key={plugin.slug}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">
                          {plugin.name}
                        </span>
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 font-mono text-[10px] font-normal"
                        >
                          {plugin.source}
                        </Badge>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {plugin.slug}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {plugin.category}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {plugin.enabledCount}
                      {plugin.installs > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          / {plugin.installs}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium tabular-nums">
                      {plugin.triggers.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatRelativeIso(plugin.lastTriggeredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" strokeWidth={1.5} />
            Subagent teams &amp; Team Board ({window})
          </CardTitle>
          <CardDescription className="text-xs">
            Multi-agent delegation, role distribution, and shared Team Board
            artifacts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Subagent turns
              </div>
              <div className="text-lg font-medium tabular-nums">
                {teamsAndSubagents.subagentEventsInWindow.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {teamsAndSubagents.subagentShareOfEventsPct.toFixed(1)}% of all
                turns
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Subagent tokens
              </div>
              <div className="text-lg font-medium tabular-nums">
                {formatTokens(
                  teamsAndSubagents.subagentInputTokens +
                    teamsAndSubagents.subagentOutputTokens,
                )}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {teamsAndSubagents.subagentShareOfTokensPct.toFixed(1)}% share ·{" "}
                {formatUsd(teamsAndSubagents.subagentSpendUsd)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Team boards
              </div>
              <div className="text-lg font-medium tabular-nums">
                {teamsAndSubagents.sampledChatsWithTeamBoard}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {teamsAndSubagents.boardEntriesTotal} notes ·{" "}
                {teamsAndSubagents.boardTasksTotal} tasks
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Subagents spawned (sampled)
              </div>
              <div className="mt-0.5 font-medium tabular-nums">
                {teamsAndSubagents.totalSubagentsSpawned} across{" "}
                {teamsAndSubagents.sampledChatsWithSubagents} chats
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">
                Subagent tool calls ({window})
              </div>
              <div className="mt-0.5 font-medium tabular-nums">
                {teamsAndSubagents.subagentToolCalls.toLocaleString()} calls (
                {formatTokens(teamsAndSubagents.subagentCachedInputTokens)}{" "}
                cached)
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Delegated specialist roles
            </div>
            <DistributionChips
              entries={roleEntries}
              emptyLabel="No subagent delegations in sampled window"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Team Board entries by kind
            </div>
            <DistributionChips
              entries={boardKindEntries}
              emptyLabel="No Team Board entries in sampled window"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Team checklist task status
            </div>
            <DistributionChips
              entries={boardTaskEntries}
              toneMap={{
                completed:
                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
                blocked:
                  "border-destructive/30 bg-destructive/10 text-destructive",
              }}
              emptyLabel="No Team Board tasks in sampled window"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function IntegrationsAndPipelinePanel({
  data,
}: {
  data: AdminTelemetryPayload;
}) {
  const { integrationsAndAuth, messagesAndPipeline, window } = data;

  const permEntries = Object.entries(
    messagesAndPipeline.preferences.byPermissionMode,
  ).map(([label, count]) => ({ label, count }));

  const sandboxPrefEntries = Object.entries(
    messagesAndPipeline.preferences.bySandboxType,
  ).map(([label, count]) => ({ label, count }));

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="rounded-xl lg:col-span-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Cable
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                Auth, OAuth &amp; integrations
              </CardTitle>
              <CardDescription className="text-xs">
                Better-Auth sessions, GitHub App, Vercel links, and Composio
              </CardDescription>
            </div>
            <Link
              href="/settings/connections"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Connections
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Active web sessions
              </div>
              <div className="text-lg font-medium tabular-nums">
                {integrationsAndAuth.activeAuthSessions}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {integrationsAndAuth.totalAuthSessions} total ·{" "}
                {integrationsAndAuth.activeVerifications} pending auth
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                GitHub App
              </div>
              <div className="text-lg font-medium tabular-nums">
                {integrationsAndAuth.githubApp.totalInstallations}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {integrationsAndAuth.githubApp.orgInstallations} org ·{" "}
                {integrationsAndAuth.githubApp.userInstallations} user
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              OAuth accounts linked
            </div>
            <DistributionChips
              entries={integrationsAndAuth.oauthProviders.map((p) => ({
                label: `${p.provider} (${p.distinctUsers}u)`,
                count: p.linkedAccounts,
              }))}
              emptyLabel="No OAuth accounts linked"
            />
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                GitHub indexed repositories
              </span>
              <span className="font-medium tabular-nums">
                {integrationsAndAuth.githubApp.totalIndexedRepos.toLocaleString()}{" "}
                ({integrationsAndAuth.githubApp.indexedRepoInstallations}{" "}
                installs)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Vercel project links
              </span>
              <span className="font-medium tabular-nums">
                {integrationsAndAuth.vercelProjects.totalLinks} (
                {integrationsAndAuth.vercelProjects.distinctUsers} users ·{" "}
                {integrationsAndAuth.vercelProjects.distinctTeams} teams)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Composio tool router sessions
              </span>
              <span className="font-medium tabular-nums">
                {integrationsAndAuth.composio.totalSessions} (
                {integrationsAndAuth.composio.activeUsersInWindow} active in{" "}
                {window})
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <GitPullRequest
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
            Messages, durable steps &amp; preferences
          </CardTitle>
          <CardDescription className="text-xs">
            Transcript volume ({window}), step finish reasons, and user defaults
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Messages ({window})
              </div>
              <div className="text-lg font-medium tabular-nums">
                {messagesAndPipeline.messagesInWindow.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {messagesAndPipeline.totalMessagesAllTime.toLocaleString()} all
                time
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                User / Agent
              </div>
              <div className="text-lg font-medium tabular-nums">
                {messagesAndPipeline.userMessagesInWindow} /{" "}
                {messagesAndPipeline.assistantMessagesInWindow}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {messagesAndPipeline.totalChatReads.toLocaleString()} read
                states
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Prefs saved
              </div>
              <div className="text-lg font-medium tabular-nums">
                {messagesAndPipeline.preferences.configuredUsers}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {messagesAndPipeline.preferences.autoCreatePrUsers} auto-PR ·{" "}
                {messagesAndPipeline.preferences.autoCommitPushUsers} auto-push
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Workflow step finish reasons ({window})
            </div>
            <DistributionChips
              entries={messagesAndPipeline.stepsByFinishReason.map((s) => ({
                label: s.reason,
                count: s.count,
              }))}
              emptyLabel="No workflow steps recorded in window"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                Permission modes
              </div>
              <DistributionChips entries={permEntries} />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                Preferred sandboxes
              </div>
              <DistributionChips entries={sandboxPrefEntries} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl lg:col-span-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontal
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                Billing ledger, webhooks &amp; benchmarks
              </CardTitle>
              <CardDescription className="text-xs">
                Idempotent step debits, webhook deliveries, and model overrides
              </CardDescription>
            </div>
            <Link
              href="/settings/admin/models"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Models
              <ArrowUpRight className="size-3.5" strokeWidth={1.5} />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Step ledger ({window})
              </div>
              <div className="text-lg font-medium tabular-nums">
                {messagesAndPipeline.billingPipeline.usageLedgerEventsInWindow.toLocaleString()}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {formatUsd(
                  messagesAndPipeline.billingPipeline.usageLedgerUsdInWindow,
                )}{" "}
                accrued
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Webhooks</div>
              <div className="text-lg font-medium tabular-nums">
                {messagesAndPipeline.billingPipeline.webhookEventsInWindow}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {messagesAndPipeline.billingPipeline.webhookEventsAllTime} all
                time
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Overrides</div>
              <div className="text-lg font-medium tabular-nums">
                {messagesAndPipeline.modelOverrides.totalOverrides}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {messagesAndPipeline.modelOverrides.disabledModels} disabled
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Webhook events ({window})
            </div>
            <DistributionChips
              entries={messagesAndPipeline.billingPipeline.webhooksByType.map(
                (w) => ({
                  label: w.eventType,
                  count: w.count,
                }),
              )}
              emptyLabel="No billing webhooks received in window"
            />
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                Evaluation benchmarks (
                {messagesAndPipeline.benchmarks.totalRuns} runs)
              </span>
              <span className="font-mono tabular-nums text-foreground">
                {messagesAndPipeline.benchmarks.passedResultRows} /{" "}
                {messagesAndPipeline.benchmarks.totalResultRows} passed (
                {messagesAndPipeline.benchmarks.passRatePct.toFixed(1)}%)
              </span>
            </div>
            <DistributionChips
              entries={messagesAndPipeline.benchmarks.byBenchmark.map((b) => ({
                label: `${b.benchmark} (${b.passed}/${b.total})`,
                count: b.total,
              }))}
              emptyLabel="No benchmark result rows recorded yet"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
