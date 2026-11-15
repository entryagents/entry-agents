"use client";

import { formatTokens } from "@entry-agents/shared";
import { isToolUIPart } from "ai";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  FileCode2,
  GitBranch,
  Layers,
  PanelRight,
  PauseCircle,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { StatusBadge, SubagentIcon } from "@/components/agent-hub/agent-status";
import { useNow } from "@/components/agent-hub/use-now";
import {
  getSubagentRoleTag,
  getSubagentToolSummary,
} from "@/components/subagent-chat/subagent-tool-item";
import { ApprovalButtons } from "@/components/tool-call/approval-buttons";
import { Button } from "@/components/ui/button";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
  isLiveStatus,
  summarizeAgentHub,
  type AgentHubEntry,
  type TeamFeedEntry,
  type TeamFeedTask,
} from "@/lib/agent-hub/derive-roster";
import { formatSubagentModelTag } from "@/lib/agent-hub/subagent-tab-data";
import { cn } from "@/lib/utils";

export interface InlineTeamTimelineProps {
  message: WebAgentUIMessage;
  isStreaming: boolean;
  activeApprovalId?: string | null;
  onOpenSubagentTab?: (
    subagentId: string,
    title?: string,
    subagentType?: string,
  ) => void;
  onApproveTool?: (id: string) => void;
  onDenyTool?: (id: string, reason?: string) => void;
}

type RosterFilter = "all" | "live" | "done";

const ENTRY_KIND_STYLE: Record<TeamFeedEntry["kind"], string> = {
  contract:
    "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  challenge:
    "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  debate: "border-border/80 bg-muted/60 text-foreground",
  verification:
    "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  decision: "border-border/70 bg-muted/40 text-foreground",
  handoff: "border-border/70 bg-muted/40 text-foreground",
  finding: "border-border/70 bg-muted/40 text-muted-foreground",
  artifact: "border-border/70 bg-muted/40 text-muted-foreground",
  blocker: "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300",
  question: "border-border/70 bg-muted/40 text-muted-foreground",
};

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function formatToolActivity(pending: AgentHubEntry["pending"]): string | null {
  if (!pending) return null;
  const detail = getSubagentToolSummary(pending.name, pending.input);
  return detail ? `${pending.name} · ${detail}` : pending.name;
}

function formatLiveExcerpt(
  rawText: string | null,
  expanded: boolean,
): { text: string | null; truncated: boolean } {
  if (!rawText) return { text: null, truncated: false };
  const normalized = rawText.trim();
  if (!normalized) return { text: null, truncated: false };
  if (expanded || normalized.length <= 240) {
    return { text: normalized, truncated: normalized.length > 240 };
  }
  return {
    text: `…${normalized.slice(-240).trimStart()}`,
    truncated: true,
  };
}

function insertComposerMention(role: string) {
  const cleaned = role.trim().replace(/^@+/, "");
  if (!cleaned || cleaned === "all" || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("entry:insert-composer-prompt", {
      detail: { text: `@${cleaned} ` },
    }),
  );
}

function TaskStatusGlyph({ status }: { status: TeamFeedTask["status"] }) {
  switch (status) {
    case "completed":
      return (
        <CheckCircle2
          className="size-3.5 shrink-0 text-emerald-500"
          strokeWidth={1.5}
        />
      );
    case "in_progress":
      return (
        <Clock className="size-3.5 shrink-0 text-amber-500" strokeWidth={1.5} />
      );
    case "blocked":
      return (
        <AlertCircle
          className="size-3.5 shrink-0 text-red-500"
          strokeWidth={1.5}
        />
      );
    case "parked":
      return (
        <PauseCircle
          className="size-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
        />
      );
    default:
      return (
        <Circle
          className="size-3.5 shrink-0 text-muted-foreground/60"
          strokeWidth={1.5}
        />
      );
  }
}

export function InlineTeamTimeline({
  message,
  isStreaming,
  activeApprovalId = null,
  onOpenSubagentTab,
  onApproveTool,
  onDenyTool,
}: InlineTeamTimelineProps) {
  const singleMessageArray = useMemo(() => [message], [message]);
  const roster = useMemo(
    () => deriveAgentHubRoster(singleMessageArray),
    [singleMessageArray],
  );
  const totals = useMemo(() => summarizeAgentHub(roster), [roster]);
  const teamFeed = useMemo(
    () => deriveTeamFeed(singleMessageArray),
    [singleMessageArray],
  );

  const anyLive = isStreaming && totals.live > 0;
  const now = useNow(anyLive);
  const [boardExpanded, setBoardExpanded] = useState<boolean | null>(null);
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("all");
  const [expandedLanes, setExpandedLanes] = useState<Record<string, boolean>>(
    {},
  );

  const approvalIdByCallId = useMemo(() => {
    const map = new Map<string, string>();
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      if (part.state !== "approval-requested") continue;
      const approval = (part as { approval?: { id?: unknown } }).approval;
      if (typeof approval?.id === "string" && part.toolCallId) {
        map.set(part.toolCallId, approval.id);
      }
    }
    return map;
  }, [message.parts]);

  const filesByRole = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const task of teamFeed.tasks) {
      if (!task.files || task.files.length === 0) continue;
      const existing = map.get(task.assignedRole) ?? [];
      for (const file of task.files) {
        if (!existing.includes(file)) {
          existing.push(file);
        }
      }
      map.set(task.assignedRole, existing);
    }
    return map;
  }, [teamFeed.tasks]);

  const worktreeByRole = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of teamFeed.tasks) {
      if (task.worktreeBranch && !map.has(task.assignedRole)) {
        map.set(task.assignedRole, task.worktreeBranch);
      }
    }
    return map;
  }, [teamFeed.tasks]);

  const visibleRoster = useMemo(() => {
    if (rosterFilter === "live") {
      return roster.filter((entry) => isLiveStatus(entry.status));
    }
    if (rosterFilter === "done") {
      return roster.filter((entry) => !isLiveStatus(entry.status));
    }
    return roster;
  }, [roster, rosterFilter]);

  const completedTasks = teamFeed.tasks.filter(
    (t) => t.status === "completed",
  ).length;
  const contractCount = teamFeed.entries.filter(
    (e) => e.kind === "contract",
  ).length;
  const hasBoardData = teamFeed.tasks.length > 0 || teamFeed.entries.length > 0;
  const isBoardOpen =
    boardExpanded !== null ? boardExpanded : anyLive || roster.length === 0;
  const totalTokens = totals.inputTokens + totals.outputTokens;
  const teamCacheHitPct =
    totals.inputTokens > 0 && totals.cachedInputTokens > 0
      ? Math.min(
          100,
          Math.round((totals.cachedInputTokens / totals.inputTokens) * 100),
        )
      : null;

  return (
    <section
      aria-label="Agent team execution"
      className="my-2 w-full min-w-0 overflow-hidden rounded-lg border border-border/80 bg-background text-foreground"
    >
      {/* Dense ledger header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Users
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <span className="text-xs font-semibold text-foreground">
            Team execution
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            /team
          </span>
          {roster.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {totals.live > 0
                ? `${totals.live}/${roster.length} active`
                : `${roster.length} teammate${roster.length === 1 ? "" : "s"}`}
            </span>
          )}
          {teamFeed.waves.length > 1 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              · {teamFeed.waves.length} waves
            </span>
          )}
          {teamFeed.tasks.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              · {completedTasks}/{teamFeed.tasks.length} tasks
            </span>
          )}
          {contractCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              <FileCode2 className="size-3 shrink-0" strokeWidth={1.5} />
              {contractCount} contract{contractCount === 1 ? "" : "s"}
            </span>
          )}
          {teamFeed.fileConflicts.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 tabular-nums">
              <AlertCircle className="size-3 shrink-0" strokeWidth={1.5} />
              {teamFeed.fileConflicts.length} overlap
              {teamFeed.fileConflicts.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {roster.length > 2 && (
            <div className="inline-flex items-center rounded-md border border-border/70 bg-background p-0.5 text-[11px]">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "live", label: `Live (${totals.live})` },
                  {
                    id: "done",
                    label: `Done (${roster.length - totals.live})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRosterFilter(tab.id)}
                  className={cn(
                    "rounded px-2 py-0.5 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] tabular-nums cursor-pointer",
                    rosterFilter === tab.id
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          {totalTokens > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatTokens(totalTokens)} tok
              {teamCacheHitPct !== null ? ` · ${teamCacheHitPct}% cached` : ""}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("entry:toggle-agent-hub"));
            }}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground"
          >
            <PanelRight className="size-3.5" strokeWidth={1.5} />
            <span>Team pane</span>
          </Button>
        </div>
      </div>

      {/* Dependency Wave Pipeline bar */}
      {teamFeed.waves.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 bg-muted/10 px-3 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
            <Layers className="size-3 shrink-0" strokeWidth={1.5} />
            Waves:
          </span>
          {teamFeed.waves.map((wave, idx) => (
            <div key={wave.wave} className="inline-flex items-center gap-1.5">
              {idx > 0 && (
                <ArrowRight
                  className="size-3 text-muted-foreground/60"
                  strokeWidth={1.5}
                />
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono tabular-nums",
                  wave.status === "completed" &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  wave.status === "active" &&
                    "border-amber-500/35 bg-amber-500/10 text-foreground",
                  wave.status === "blocked" &&
                    "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
                  wave.status === "queued" &&
                    "border-border/70 bg-muted/30 text-muted-foreground",
                )}
              >
                <span>Wave {wave.wave}</span>
                <span className="opacity-75">({wave.taskIds.length})</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* File overlap warning strip when active teammates claim the same path */}
      {teamFeed.fileConflicts.length > 0 && (
        <div className="border-b border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0"
              strokeWidth={1.5}
            />
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">
                Overlapping file claims across active tasks
              </p>
              <p className="font-mono text-[11px] break-all text-amber-700/90 dark:text-amber-300/90">
                {teamFeed.fileConflicts
                  .slice(0, 3)
                  .map((c) => `${c.file} (${c.roles.join(", ")})`)
                  .join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Flush hairline-divided teammate lanes matching TaskRenderer */}
      {visibleRoster.length > 0 && (
        <div className="divide-y divide-border/70">
          {visibleRoster.map((entry) => {
            const live = isLiveStatus(entry.status);
            const failed =
              entry.status === "failed" || entry.status === "denied";
            const elapsed =
              live && entry.startedAt !== null
                ? formatElapsed(now - entry.startedAt)
                : null;
            const activity = live ? formatToolActivity(entry.pending) : null;
            const isLaneExpanded = Boolean(expandedLanes[entry.id]);
            const excerpt = formatLiveExcerpt(
              entry.streamedText,
              isLaneExpanded,
            );
            const approvalId = approvalIdByCallId.get(entry.id);
            const claimedFiles = filesByRole.get(entry.subagentType) ?? [];
            const worktreeBranch =
              entry.worktreeBranch ??
              worktreeByRole.get(entry.subagentType) ??
              null;
            const entryTokens =
              (entry.inputTokens ?? 0) + (entry.outputTokens ?? 0);
            const cacheHitPct =
              entry.inputTokens &&
              entry.inputTokens > 0 &&
              entry.cachedInputTokens &&
              entry.cachedInputTokens > 0
                ? Math.min(
                    100,
                    Math.round(
                      (entry.cachedInputTokens / entry.inputTokens) * 100,
                    ),
                  )
                : null;
            const roleTag = getSubagentRoleTag(entry.subagentType);
            const modelTag = formatSubagentModelTag(entry.modelId);

            return (
              <div
                key={entry.id}
                className={cn(
                  "min-w-0 border-l-2 py-2.5 pl-3 pr-3 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  failed
                    ? "border-l-destructive/75"
                    : live
                      ? "border-l-foreground/45"
                      : "border-l-border hover:border-l-foreground/35",
                )}
              >
                {/* Primary Single-Row Lane Header */}
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                      {failed ? (
                        <XCircle
                          className="size-3.5 text-destructive"
                          strokeWidth={1.5}
                        />
                      ) : entry.status === "completed" ? (
                        <Check
                          className="size-3.5 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={() => insertComposerMention(entry.subagentType)}
                      title={`Tag @${entry.subagentType} in composer`}
                      className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-medium text-foreground/85 hover:underline cursor-pointer"
                    >
                      <SubagentIcon
                        type={entry.subagentType}
                        className="size-3.5 text-muted-foreground"
                      />
                      <span>@{roleTag}</span>
                    </button>

                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[13px] font-medium",
                        failed ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {entry.title}
                    </span>

                    <StatusBadge status={entry.status} size="sm" />
                  </div>

                  {/* Right telemetry + Trace action */}
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {elapsed && <span>{elapsed}</span>}
                      {entry.toolCallCount !== null && (
                        <span>
                          {elapsed ? "· " : ""}
                          {entry.toolCallCount}{" "}
                          {entry.toolCallCount === 1 ? "step" : "steps"}
                        </span>
                      )}
                      {entryTokens > 0 && (
                        <span className="hidden sm:inline">
                          · {formatTokens(entryTokens)} tok
                        </span>
                      )}
                      {cacheHitPct !== null && (
                        <span className="hidden md:inline">
                          · {cacheHitPct}% cached
                        </span>
                      )}
                      {modelTag && (
                        <span
                          className="hidden max-w-[110px] truncate lg:inline"
                          title={entry.modelId ?? undefined}
                        >
                          · {modelTag}
                        </span>
                      )}
                    </div>

                    {onOpenSubagentTab && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenSubagentTab(
                            entry.id,
                            entry.title,
                            entry.subagentType,
                          )
                        }
                        aria-label={`Inspect trace for ${entry.title}`}
                        className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground cursor-pointer"
                      >
                        <span>Inspect trace</span>
                        <ArrowUpRight className="size-3" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Live single-line activity ticker */}
                {activity && (
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 pl-6 font-mono text-[11px] text-muted-foreground">
                    <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="truncate">{activity}</span>
                  </div>
                )}

                {/* Worktree branch + claimed files strip */}
                {(worktreeBranch || claimedFiles.length > 0) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6">
                    {worktreeBranch && (
                      <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        <GitBranch className="size-3" strokeWidth={1.5} />
                        {worktreeBranch}
                      </span>
                    )}
                    {claimedFiles.slice(0, 4).map((file) => (
                      <span
                        key={file}
                        className="max-w-full truncate rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                      >
                        {file}
                      </span>
                    ))}
                  </div>
                )}

                {/* Streamed excerpt */}
                {excerpt.text && (
                  <div className="mt-1.5 pl-6">
                    <p
                      className={cn(
                        "whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground",
                        !isLaneExpanded && "line-clamp-2",
                      )}
                    >
                      {excerpt.text}
                    </p>
                    {excerpt.truncated && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedLanes((prev) => ({
                            ...prev,
                            [entry.id]: !isLaneExpanded,
                          }))
                        }
                        className="mt-0.5 text-[11px] font-medium text-foreground/80 hover:text-foreground cursor-pointer"
                      >
                        {isLaneExpanded ? "Show less" : "Show full output"}
                      </button>
                    )}
                  </div>
                )}

                {/* Error text if teammate failed */}
                {entry.errorText && (
                  <p className="mt-1.5 ml-6 break-words rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400">
                    {entry.errorText}
                  </p>
                )}

                {/* Interactive tool approval if awaiting confirmation */}
                {approvalId &&
                  (!activeApprovalId || activeApprovalId === approvalId) && (
                    <div className="mt-2 pl-6">
                      <ApprovalButtons
                        approvalId={approvalId}
                        onApprove={onApproveTool}
                        onDeny={onDenyTool}
                      />
                    </div>
                  )}
              </div>
            );
          })}
        </div>
      )}

      {/* Live Inter-Agent Comms, Debate & Handoff Stream */}
      {teamFeed.entries.length > 0 && (
        <div className="border-t border-border/70 bg-muted/10">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
            <span className="text-[11px] font-medium text-foreground/85">
              Teammate comms &amp; handoffs
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {teamFeed.entries.length}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {teamFeed.entries.slice(-6).map((entry) => {
              const kindBadgeClass =
                ENTRY_KIND_STYLE[entry.kind] ?? ENTRY_KIND_STYLE.finding;
              const extraMentions = (entry.mentions ?? []).filter(
                (mention) =>
                  mention !== entry.authorRole && mention !== entry.targetRole,
              );

              return (
                <div key={entry.id} className="space-y-1 px-3 py-2 text-xs">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => insertComposerMention(entry.authorRole)}
                      className="font-mono text-[11px] font-semibold text-foreground hover:underline cursor-pointer"
                    >
                      @{entry.authorRole}
                    </button>
                    {entry.targetRole && (
                      <>
                        <ArrowRight
                          className="size-3 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            entry.targetRole &&
                            insertComposerMention(entry.targetRole)
                          }
                          className="font-mono text-[11px] font-semibold text-foreground/85 hover:underline cursor-pointer"
                        >
                          @{entry.targetRole}
                        </button>
                      </>
                    )}
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize",
                        kindBadgeClass,
                      )}
                    >
                      {entry.kind}
                    </span>
                    <span className="min-w-0 truncate font-medium text-foreground/90">
                      {entry.title}
                    </span>
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                    {entry.content}
                  </p>
                  {(extraMentions.length > 0 ||
                    (entry.files && entry.files.length > 0)) && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {extraMentions.map((mention) => (
                        <button
                          key={mention}
                          type="button"
                          onClick={() => insertComposerMention(mention)}
                          className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 hover:bg-muted cursor-pointer"
                        >
                          @{mention}
                        </button>
                      ))}
                      {entry.files?.slice(0, 4).map((file) => (
                        <span
                          key={file}
                          className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline shared task checklist */}
      {hasBoardData && teamFeed.tasks.length > 0 && (
        <div className="border-t border-border/70">
          <button
            type="button"
            onClick={() => setBoardExpanded(!isBoardOpen)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/30 hover:text-foreground cursor-pointer"
          >
            <div className="flex items-center gap-1.5 font-medium">
              {isBoardOpen ? (
                <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.5} />
              ) : (
                <ChevronRight className="size-3.5 shrink-0" strokeWidth={1.5} />
              )}
              <span>Shared task wave board</span>
            </div>
            <span className="font-mono text-[11px] tabular-nums">
              {completedTasks}/{teamFeed.tasks.length} completed
            </span>
          </button>

          {isBoardOpen && (
            <div className="divide-y divide-border/60 border-t border-border/60 bg-muted/10">
              {teamFeed.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-2 px-3 py-2 text-xs"
                >
                  <div className="pt-0.5">
                    <TaskStatusGlyph status={task.status} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "font-medium text-foreground",
                          task.status === "completed" &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        {task.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => insertComposerMention(task.assignedRole)}
                        className="font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                      >
                        @{task.assignedRole}
                      </button>
                      {task.status === "parked" && (
                        <span className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          Parked
                        </span>
                      )}
                      {task.dependsOn && task.dependsOn.length > 0 && (
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          after {task.dependsOn.join(", ")}
                        </span>
                      )}
                      {task.worktreeBranch && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                          <GitBranch className="size-3" strokeWidth={1.5} />
                          {task.worktreeBranch}
                        </span>
                      )}
                    </div>
                    {task.files && task.files.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {task.files.map((file) => (
                          <span
                            key={file}
                            className="max-w-full truncate rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                          >
                            {file}
                          </span>
                        ))}
                      </div>
                    )}
                    {task.verification && (
                      <p className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 break-words">
                        Verified: {task.verification}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                    {task.id}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
