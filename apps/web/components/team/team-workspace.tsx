"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  GitBranch,
  Loader2,
  SlidersHorizontal,
  Square,
  Users,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { Button } from "@/components/ui/button";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
  isLiveStatus,
  type AgentHubEntry,
  type TeamFeedEntry,
  type TeamFeedState,
  type TeamFeedTask,
} from "@/lib/agent-hub/derive-roster";
import {
  formatSubagentElapsed,
  formatSubagentModelTag,
} from "@/lib/agent-hub/subagent-tab-data";
import { TEAM_ROLE_IDS } from "@/lib/team/role-models-store";
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import { getSubagentRoleTag, SubagentIcon, useNow } from "./subagent-helpers";

export type TeamWorkspaceTab = "subagents" | "board" | "models";
type FeedFilter = "all" | "contract" | "challenge" | "decision" | "handoff";

export interface TeamWorkspaceProps {
  messages: WebAgentUIMessage[];
  isParentStreaming?: boolean;
  defaultModelId?: string | null;
  teamRoleModels?: Record<string, string>;
  onUpdateRoleModel?: (role: string, modelId: string | null) => void;
  modelOptions?: ModelOption[];
  isFreeTierLocked?: boolean;
  freePlanModelId?: string | null;
  freeTierAllowedModelIds?: string[];
  onSelectSubagent: (
    subagentId: string,
    title: string,
    subagentType?: string,
  ) => void;
  onStopRun?: () => void;
  onClose: () => void;
  className?: string;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  architect: "Contracts, dependencies & wave planning",
  explorer: "Fast read-only repository research",
  executor: "Isolated implementation & test runs",
  design: "Interface craft & frontend architecture",
  reviewer: "Diff review & command verification",
};

const TASK_STATUS_META: Record<
  TeamFeedTask["status"],
  { label: string; dotClass: string; textClass: string }
> = {
  completed: {
    label: "Done",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
  },
  in_progress: {
    label: "Active",
    dotClass: "bg-foreground",
    textClass: "text-foreground",
  },
  blocked: {
    label: "Blocked",
    dotClass: "bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-400",
  },
  open: {
    label: "Queued",
    dotClass: "bg-muted-foreground/50",
    textClass: "text-muted-foreground",
  },
  parked: {
    label: "Parked",
    dotClass: "bg-muted-foreground/30",
    textClass: "text-muted-foreground/75",
  },
};

const ENTRY_KIND_LABELS: Record<TeamFeedEntry["kind"], string> = {
  contract: "Contract",
  challenge: "Challenge",
  decision: "Decision",
  handoff: "Handoff",
  verification: "Verified",
  blocker: "Blocker",
  debate: "Debate",
  finding: "Finding",
  question: "Question",
  artifact: "Artifact",
};

function EntryStatusIcon({ entry }: { entry: AgentHubEntry }) {
  if (isLiveStatus(entry.status)) {
    return (
      <Loader2
        className="size-3.5 shrink-0 animate-spin text-foreground"
        strokeWidth={1.5}
      />
    );
  }
  if (entry.status === "failed" || entry.status === "denied") {
    return (
      <XCircle
        className="size-3.5 shrink-0 text-destructive"
        strokeWidth={1.5}
      />
    );
  }
  return (
    <Check className="size-3.5 shrink-0 text-emerald-500" strokeWidth={1.75} />
  );
}

function SubagentRow({
  entry,
  now,
  onSelectSubagent,
}: {
  entry: AgentHubEntry;
  now: number;
  onSelectSubagent: TeamWorkspaceProps["onSelectSubagent"];
}) {
  const live = isLiveStatus(entry.status);
  const roleName = getSubagentRoleTag(entry.subagentType);
  const elapsedMs =
    entry.startedAt != null && live ? Math.max(0, now - entry.startedAt) : null;
  const modelTag = formatSubagentModelTag(entry.modelId);

  return (
    <button
      type="button"
      onClick={() =>
        onSelectSubagent(entry.id, entry.title, entry.subagentType)
      }
      className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/45 cursor-pointer"
    >
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
        <SubagentIcon subagentType={entry.subagentType} className="size-4" />
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <EntryStatusIcon entry={entry} />
            <span className="truncate text-[13px] font-medium text-foreground">
              {roleName}
            </span>
            {entry.toolCallCount != null && entry.toolCallCount > 0 ? (
              <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {entry.toolCallCount} tools
              </span>
            ) : null}
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
            {elapsedMs !== null
              ? formatSubagentElapsed(elapsedMs)
              : live
                ? "Running"
                : entry.status === "failed" || entry.status === "denied"
                  ? "Failed"
                  : "Done"}
          </span>
        </div>

        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {entry.title}
        </p>

        {(live && entry.pending) || entry.worktreeBranch || modelTag ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
            {live && entry.pending ? (
              <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                Running {entry.pending.name}
              </span>
            ) : null}
            {entry.worktreeBranch ? (
              <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px]">
                <GitBranch className="size-3 shrink-0" strokeWidth={1.5} />
                <span className="max-w-[140px] truncate">
                  {entry.worktreeBranch}
                </span>
              </span>
            ) : null}
            {modelTag ? (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/80">
                {modelTag}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <ChevronRight
        className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5"
        strokeWidth={1.5}
      />
    </button>
  );
}

function DoneRow({
  entry,
  onSelectSubagent,
}: {
  entry: AgentHubEntry;
  onSelectSubagent: TeamWorkspaceProps["onSelectSubagent"];
}) {
  const failed = entry.status === "failed" || entry.status === "denied";
  return (
    <button
      type="button"
      onClick={() =>
        onSelectSubagent(entry.id, entry.title, entry.subagentType)
      }
      className="flex h-8 w-full cursor-pointer items-center gap-2.5 px-4 text-left text-[13px] text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/45 hover:text-foreground"
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <EntryStatusIcon entry={entry} />
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums">
        {failed ? "Failed" : getSubagentRoleTag(entry.subagentType)}
      </span>
    </button>
  );
}

function SubagentsTab({
  entries,
  now,
  onSelectSubagent,
}: {
  entries: AgentHubEntry[];
  now: number;
  onSelectSubagent: TeamWorkspaceProps["onSelectSubagent"];
}) {
  const active = entries.filter((e) => isLiveStatus(e.status));
  const finished = entries.filter((e) => !isLiveStatus(e.status));

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <Users className="size-6 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="mt-2.5 text-sm font-medium text-foreground">
          No active agents yet
        </p>
        <p className="mt-1 max-w-[30ch] text-xs text-muted-foreground">
          Invoke a specialist agent or start a coordinated /team run to track
          live progress here.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/70">
      {active.length > 0 ? (
        <div>
          <div className="bg-muted/30 px-4 py-1.5 text-[11px] font-medium text-muted-foreground">
            Active ({active.length})
          </div>
          <div className="divide-y divide-border/60">
            {active.map((entry) => (
              <SubagentRow
                key={entry.id}
                entry={entry}
                now={now}
                onSelectSubagent={onSelectSubagent}
              />
            ))}
          </div>
        </div>
      ) : null}

      {finished.length > 0 ? (
        <div>
          {active.length > 0 ? (
            <div className="bg-muted/30 px-4 py-1.5 text-[11px] font-medium text-muted-foreground">
              Done ({finished.length})
            </div>
          ) : null}
          <div className="divide-y divide-border/60">
            {finished.map((entry) => (
              <DoneRow
                key={entry.id}
                entry={entry}
                onSelectSubagent={onSelectSubagent}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({ task }: { task: TeamFeedTask }) {
  const statusMeta = TASK_STATUS_META[task.status];
  return (
    <div className="space-y-1.5 px-3 py-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-snug text-foreground">
          {task.title}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums",
            statusMeta.textClass,
          )}
        >
          <span
            className={cn("size-1.5 rounded-full", statusMeta.dotClass)}
            aria-hidden="true"
          />
          {statusMeta.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
          <SubagentIcon
            subagentType={task.assignedRole}
            className="size-3.5 text-muted-foreground"
          />
          {getSubagentRoleTag(task.assignedRole)}
        </span>

        {task.dependsOn && task.dependsOn.length > 0 ? (
          <span className="font-mono text-[10px] text-muted-foreground/80">
            after {task.dependsOn.join(", ")}
          </span>
        ) : null}

        {task.worktreeBranch ? (
          <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]">
            <GitBranch className="size-3 shrink-0" strokeWidth={1.5} />
            {task.worktreeBranch}
          </span>
        ) : null}
      </div>

      {task.files && task.files.length > 0 ? (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {task.files.slice(0, 3).map((file) => (
            <span
              key={file}
              className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {file.split("/").slice(-2).join("/")}
            </span>
          ))}
          {task.files.length > 3 ? (
            <span className="px-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              +{task.files.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      {task.verification ? (
        <div className="flex items-center gap-1.5 rounded border border-emerald-500/25 bg-emerald-500/5 px-2 py-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
          <Check className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{task.verification}</span>
        </div>
      ) : null}
    </div>
  );
}

export function BoardTab({ feed }: { feed: TeamFeedState }) {
  const [filter, setFilter] = useState<FeedFilter>("all");

  if (feed.tasks.length === 0 && feed.entries.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-xs text-muted-foreground">
        No coordinated team plan or notes recorded in this conversation yet.
      </div>
    );
  }

  const completedTasks = feed.tasks.filter(
    (t) => t.status === "completed",
  ).length;
  const pct =
    feed.tasks.length > 0
      ? Math.round((completedTasks / feed.tasks.length) * 100)
      : 0;

  const taskById = new Map(feed.tasks.map((t) => [t.id, t]));
  const filteredEntries =
    filter === "all"
      ? feed.entries
      : feed.entries.filter((e) => e.kind === filter);

  return (
    <div className="space-y-4 p-4">
      {feed.tasks.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-border/70 bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Execution plan</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {completedTasks}/{feed.tasks.length} done ({pct}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-foreground transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {feed.fileConflicts.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span>
              {feed.fileConflicts.length} overlapping file claim
              {feed.fileConflicts.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-1">
            {feed.fileConflicts.slice(0, 4).map((conflict) => (
              <div
                key={conflict.file}
                className="flex items-center justify-between gap-2 text-[11px] text-amber-800/90 dark:text-amber-200/90"
              >
                <span className="truncate font-mono">{conflict.file}</span>
                <span className="shrink-0">{conflict.roles.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {feed.waves.length > 0 ? (
        <div className="space-y-3">
          {feed.waves.map((wave) => {
            const waveTasks = wave.taskIds
              .map((id) => taskById.get(id))
              .filter((t): t is TeamFeedTask => t !== undefined);
            if (waveTasks.length === 0) return null;
            return (
              <div key={wave.wave} className="space-y-1.5">
                <div className="flex items-center justify-between px-0.5 text-xs">
                  <span className="font-medium text-muted-foreground">
                    Wave {wave.wave}
                  </span>
                  <span className="font-mono text-[11px] capitalize text-muted-foreground tabular-nums">
                    {wave.status}
                  </span>
                </div>
                <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-card">
                  {waveTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : feed.tasks.length > 0 ? (
        <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-card">
          {feed.tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : null}

      {feed.entries.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Team feed ({feed.entries.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {(
                ["all", "contract", "challenge", "decision", "handoff"] as const
              ).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setFilter(kind)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize transition-colors duration-150 cursor-pointer",
                    filter === kind
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {kind}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-card">
            {filteredEntries.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No {filter} entries yet.
              </div>
            ) : (
              filteredEntries.slice(-16).map((msg) => (
                <div key={msg.id} className="space-y-1 px-3 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium text-foreground">
                      {getSubagentRoleTag(msg.authorRole)}
                      {msg.targetRole
                        ? ` → @${getSubagentRoleTag(msg.targetRole)}`
                        : ""}
                    </span>
                    <span className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {ENTRY_KIND_LABELS[msg.kind] ?? msg.kind}
                    </span>
                  </div>
                  <p className="font-medium text-foreground">{msg.title}</p>
                  {msg.content ? (
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                      {msg.content}
                    </p>
                  ) : null}
                  {msg.files && msg.files.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {msg.files.slice(0, 3).map((file) => (
                        <span
                          key={file}
                          className="rounded border border-border/50 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ModelsTab({
  defaultModelId,
  teamRoleModels,
  onUpdateRoleModel,
  modelOptions,
  isFreeTierLocked,
  freePlanModelId,
  freeTierAllowedModelIds,
}: Pick<
  TeamWorkspaceProps,
  | "defaultModelId"
  | "teamRoleModels"
  | "onUpdateRoleModel"
  | "modelOptions"
  | "isFreeTierLocked"
  | "freePlanModelId"
  | "freeTierAllowedModelIds"
>) {
  const allowedOptions = useMemo(() => {
    const opts = modelOptions ?? [];
    if (!isFreeTierLocked) return opts;
    const allowed = new Set(
      freeTierAllowedModelIds?.length
        ? freeTierAllowedModelIds
        : freePlanModelId
          ? [freePlanModelId]
          : [],
    );
    return opts.filter((o) => allowed.has(o.id));
  }, [
    freePlanModelId,
    freeTierAllowedModelIds,
    isFreeTierLocked,
    modelOptions,
  ]);

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Inherit uses your preference from{" "}
        <Link
          href="/settings/models"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Settings → Models
        </Link>
        . Override any specialist role below for this chat.
      </p>
      <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-card">
        {TEAM_ROLE_IDS.map((role) => {
          const current = teamRoleModels?.[role] ?? "";
          return (
            <div
              key={role}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <SubagentIcon
                  subagentType={role}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">
                    {getSubagentRoleTag(role)}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {ROLE_DESCRIPTIONS[role] ?? "Team specialist"}
                  </div>
                </div>
              </div>
              <select
                aria-label={`${role} model`}
                value={current}
                disabled={!onUpdateRoleModel}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateRoleModel?.(role, val || null);
                }}
                className="h-8 max-w-[164px] shrink-0 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
              >
                <option value="">
                  Inherit (
                  {formatSubagentModelTag(defaultModelId ?? null) ?? "latest"})
                </option>
                {allowedOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TeamWorkspace({
  messages,
  isParentStreaming,
  defaultModelId,
  teamRoleModels,
  onUpdateRoleModel,
  modelOptions,
  isFreeTierLocked,
  freePlanModelId,
  freeTierAllowedModelIds,
  onSelectSubagent,
  onStopRun,
  onClose,
  className,
}: TeamWorkspaceProps) {
  const [tab, setTab] = useState<TeamWorkspaceTab>("subagents");
  const roster = useMemo(
    () => deriveAgentHubRoster(messages, { isParentStreaming }),
    [messages, isParentStreaming],
  );
  const teamFeed = useMemo(() => deriveTeamFeed(messages), [messages]);
  const runningCount = useMemo(
    () => roster.filter((e) => isLiveStatus(e.status)).length,
    [roster],
  );
  const now = useNow(runningCount > 0);
  const activeWave = teamFeed.waves.find((w) => w.status === "active");

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Users
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <span className="text-sm font-medium text-foreground">Team</span>
          <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {runningCount > 0
              ? `${runningCount} running`
              : `${roster.length} total`}
          </span>
          {activeWave ? (
            <span className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
              Wave {activeWave.wave}/{teamFeed.waves.length}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {runningCount > 0 && onStopRun && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onStopRun}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Square className="size-3 fill-current" />
              <span>Stop</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close team workspace"
            className="size-7 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/80 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setTab("subagents")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer",
            tab === "subagents"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>Subagents</span>
          {roster.length > 0 ? (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {roster.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setTab("board")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer",
            tab === "board"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>Board</span>
          {teamFeed.tasks.length > 0 ? (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {teamFeed.tasks.filter((t) => t.status === "completed").length}/
              {teamFeed.tasks.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setTab("models")}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 cursor-pointer",
            tab === "models"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="size-3" strokeWidth={1.5} />
          <span>Models</span>
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "subagents" && (
          <SubagentsTab
            entries={roster}
            now={now}
            onSelectSubagent={onSelectSubagent}
          />
        )}
        {tab === "board" && <BoardTab feed={teamFeed} />}
        {tab === "models" && (
          <ModelsTab
            defaultModelId={defaultModelId}
            teamRoleModels={teamRoleModels}
            onUpdateRoleModel={onUpdateRoleModel}
            modelOptions={modelOptions}
            isFreeTierLocked={isFreeTierLocked}
            freePlanModelId={freePlanModelId}
            freeTierAllowedModelIds={freeTierAllowedModelIds}
          />
        )}
      </div>
    </div>
  );
}
