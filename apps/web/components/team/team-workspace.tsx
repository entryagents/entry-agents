"use client";

import {
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
  type TeamFeedState,
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

export interface TeamWorkspaceProps {
  messages: WebAgentUIMessage[];
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

function SubagentsTab({
  entries,
  now,
  onSelectSubagent,
}: {
  entries: AgentHubEntry[];
  now: number;
  onSelectSubagent: TeamWorkspaceProps["onSelectSubagent"];
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <Users className="size-6 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="mt-2 text-sm font-medium text-foreground">
          No subagents yet
        </p>
        <p className="mt-1 max-w-[28ch] text-xs text-muted-foreground">
          Run /team or invoke a specialist subagent to inspect threads here.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {entries.map((entry) => {
        const live = isLiveStatus(entry.status);
        const roleName = getSubagentRoleTag(entry.subagentType);
        const elapsedMs =
          entry.startedAt != null && live
            ? Math.max(0, now - entry.startedAt)
            : null;
        const modelTag = formatSubagentModelTag(entry.modelId);

        return (
          <button
            key={entry.id}
            type="button"
            onClick={() =>
              onSelectSubagent(entry.id, entry.title, entry.subagentType)
            }
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-muted/50"
          >
            <EntryStatusIcon entry={entry} />
            <SubagentIcon
              subagentType={entry.subagentType}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-foreground">
                  {roleName}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                  {elapsedMs !== null
                    ? formatSubagentElapsed(elapsedMs)
                    : live
                      ? "Running"
                      : "Done"}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{entry.title}</span>
                {modelTag && (
                  <span className="ml-auto shrink-0 font-mono text-[10px]">
                    {modelTag}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground/70"
              strokeWidth={1.5}
            />
          </button>
        );
      })}
    </div>
  );
}

function BoardTab({ feed }: { feed: TeamFeedState }) {
  if (feed.tasks.length === 0 && feed.entries.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-xs text-muted-foreground">
        No active /team board in this conversation.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3.5">
      {feed.tasks.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Tasks</span>
            <span className="font-mono tabular-nums">
              {feed.tasks.filter((t) => t.status === "completed").length}/
              {feed.tasks.length}
            </span>
          </div>
          <div className="divide-y divide-border/60 rounded-lg border border-border/70">
            {feed.tasks.map((task) => (
              <div key={task.id} className="px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {task.title}
                  </span>
                  <span className="shrink-0 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {task.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{getSubagentRoleTag(task.assignedRole)}</span>
                  {task.worktreeBranch && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                      <GitBranch className="size-3" strokeWidth={1.5} />
                      {task.worktreeBranch}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {feed.entries.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Team log
          </div>
          <div className="divide-y divide-border/60 rounded-lg border border-border/70">
            {feed.entries.slice(-12).map((msg) => (
              <div key={msg.id} className="px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {msg.authorRole}
                    {msg.targetRole ? ` → ${msg.targetRole}` : ""}
                  </span>
                  <span className="font-mono text-[10px]">{msg.kind}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {msg.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelsTab({
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
    <div className="space-y-3 p-3.5">
      <p className="text-xs text-muted-foreground">
        Inherit uses your default Subagent / Chat model from{" "}
        <Link
          href="/settings/models"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Settings → Models
        </Link>
        . Pin a role below only to override it for this chat.
      </p>
      <div className="divide-y divide-border/60 rounded-lg border border-border/70">
        {TEAM_ROLE_IDS.map((role) => {
          const current = teamRoleModels?.[role] ?? "";
          return (
            <div
              key={role}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <SubagentIcon
                  subagentType={role}
                  className="size-3.5 text-muted-foreground"
                />
                <span>{getSubagentRoleTag(role)}</span>
              </div>
              <select
                aria-label={`${role} model`}
                value={current}
                disabled={!onUpdateRoleModel}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateRoleModel?.(role, val || null);
                }}
                className="h-7 max-w-[170px] rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
              >
                <option value="">
                  Inherit (
                  {formatSubagentModelTag(defaultModelId ?? null) ?? "default"})
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
  const roster = useMemo(() => deriveAgentHubRoster(messages), [messages]);
  const teamFeed = useMemo(() => deriveTeamFeed(messages), [messages]);
  const runningCount = useMemo(
    () => roster.filter((e) => isLiveStatus(e.status)).length,
    [roster],
  );
  const now = useNow(runningCount > 0);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/80 px-3.5 py-2.5">
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
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
            tab === "subagents"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Subagents
        </button>
        <button
          type="button"
          onClick={() => setTab("board")}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
            tab === "board"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Board
        </button>
        <button
          type="button"
          onClick={() => setTab("models")}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
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
