"use client";

import { formatTokens } from "@entry-agents/shared";
import { isToolUIPart } from "ai";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  PanelRight,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import {
  StatusBadge,
  SubagentIcon,
  SubagentRoleBadge,
} from "@/components/agent-hub/agent-status";
import { useNow } from "@/components/agent-hub/use-now";
import { ApprovalButtons } from "@/components/tool-call/approval-buttons";
import { Button } from "@/components/ui/button";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
  isLiveStatus,
  summarizeAgentHub,
  type AgentHubEntry,
  type TeamFeedTask,
} from "@/lib/agent-hub/derive-roster";
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

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function formatToolActivity(pending: AgentHubEntry["pending"]): string | null {
  if (!pending) return null;
  const input = pending.input;
  let detail = "";
  if (input && typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const candidate =
      rec.filePath ?? rec.path ?? rec.command ?? rec.pattern ?? rec.query;
    if (typeof candidate === "string") {
      detail = candidate.trim();
    }
  }
  if (detail.length > 56) {
    detail = `${detail.slice(0, 53)}...`;
  }
  return detail ? `${pending.name} · ${detail}` : pending.name;
}

function formatLiveExcerpt(rawText: string | null): string | null {
  if (!rawText) return null;
  const normalized = rawText.trim();
  if (!normalized) return null;
  if (normalized.length <= 280) return normalized;
  return `…${normalized.slice(-280).trimStart()}`;
}

function TaskStatusGlyph({ status }: { status: TeamFeedTask["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />;
    case "in_progress":
      return <Clock className="size-3.5 shrink-0 text-amber-500" />;
    case "blocked":
      return <AlertCircle className="size-3.5 shrink-0 text-red-500" />;
    default:
      return <Circle className="size-3.5 shrink-0 text-muted-foreground/60" />;
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

  const completedTasks = teamFeed.tasks.filter(
    (t) => t.status === "completed",
  ).length;
  const hasBoardData = teamFeed.tasks.length > 0 || teamFeed.entries.length > 0;
  const isBoardOpen =
    boardExpanded !== null ? boardExpanded : anyLive || roster.length === 0;
  const totalTokens = totals.inputTokens + totals.outputTokens;

  return (
    <section
      aria-label="Agent team execution"
      className="my-2 min-w-0 w-full rounded-xl border border-border/80 bg-card text-card-foreground"
    >
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/25 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-foreground">
            <Users className="size-3.5" />
          </span>
          <span className="text-xs font-semibold text-foreground sm:text-sm">
            Team execution
          </span>
          {roster.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {totals.live > 0
                ? `${totals.live}/${roster.length} active`
                : `${roster.length} teammate${roster.length === 1 ? "" : "s"}`}
            </span>
          )}
          {teamFeed.tasks.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              · {completedTasks}/{teamFeed.tasks.length} tasks
            </span>
          )}
          {teamFeed.fileConflicts.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 tabular-nums">
              <AlertCircle className="size-3 shrink-0" />
              {teamFeed.fileConflicts.length} overlap
              {teamFeed.fileConflicts.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {totalTokens > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatTokens(totalTokens)} tok
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("entry:toggle-agent-hub"));
            }}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <PanelRight className="size-3.5" />
            <span>Inspect hub</span>
          </Button>
        </div>
      </div>

      {/* File overlap warning strip when active teammates claim the same path */}
      {teamFeed.fileConflicts.length > 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 sm:px-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
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

      {/* Live teammate cards directly in main chat */}
      {roster.length > 0 && (
        <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 sm:p-4">
          {roster.map((entry) => {
            const live = isLiveStatus(entry.status);
            const elapsed =
              live && entry.startedAt !== null
                ? formatElapsed(now - entry.startedAt)
                : null;
            const activity = live ? formatToolActivity(entry.pending) : null;
            const excerpt = formatLiveExcerpt(entry.streamedText);
            const approvalId = approvalIdByCallId.get(entry.id);
            const claimedFiles = filesByRole.get(entry.subagentType) ?? [];
            const entryTokens =
              (entry.inputTokens ?? 0) + (entry.outputTokens ?? 0);

            return (
              <article
                key={entry.id}
                className="flex min-w-0 flex-col justify-between gap-2.5 rounded-lg border border-border/70 bg-background/70 p-3 transition-colors"
              >
                <div className="min-w-0 space-y-2">
                  {/* Top row: Role + live status + elapsed timer */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <SubagentRoleBadge subagentType={entry.subagentType} />
                      <StatusBadge status={entry.status} size="sm" />
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {elapsed && <span>{elapsed}</span>}
                      {entry.toolCallCount !== null && (
                        <span>
                          {elapsed ? "· " : ""}
                          {entry.toolCallCount} tool
                          {entry.toolCallCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {entryTokens > 0 && (
                        <span>· {formatTokens(entryTokens)}</span>
                      )}
                    </div>
                  </div>

                  {/* Assigned task title */}
                  <div className="flex items-start gap-2 min-w-0">
                    <SubagentIcon
                      type={entry.subagentType}
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    />
                    <p className="min-w-0 text-xs font-medium leading-snug text-foreground line-clamp-2">
                      {entry.title}
                    </p>
                  </div>

                  {/* Current active tool target while streaming */}
                  {activity && (
                    <div className="truncate rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-[11px] text-foreground/85">
                      {activity}
                    </div>
                  )}

                  {/* Claimed files when mapped via team_board */}
                  {claimedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {claimedFiles.slice(0, 3).map((file) => (
                        <span
                          key={file}
                          className="max-w-full truncate rounded border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Real-time streamed text / summary excerpt */}
                  {excerpt && (
                    <p className="whitespace-pre-wrap break-words rounded-md bg-muted/25 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                      {excerpt}
                    </p>
                  )}

                  {/* Error text if teammate failed */}
                  {entry.errorText && (
                    <p className="break-words rounded-md border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400">
                      {entry.errorText}
                    </p>
                  )}

                  {/* Interactive tool approval if awaiting confirmation */}
                  {approvalId &&
                    (!activeApprovalId || activeApprovalId === approvalId) && (
                      <ApprovalButtons
                        approvalId={approvalId}
                        onApprove={onApproveTool}
                        onDeny={onDenyTool}
                      />
                    )}
                </div>

                {/* Card footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {entry.modelId ?? "Default model"}
                  </span>
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
                      className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                    >
                      <span>Open thread</span>
                      <ExternalLink className="size-3" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Inline shared checklist & handoffs */}
      {hasBoardData && (
        <div className="border-t border-border/70">
          <button
            type="button"
            onClick={() => setBoardExpanded(!isBoardOpen)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground sm:px-4 cursor-pointer"
          >
            <div className="flex items-center gap-1.5 font-medium">
              {isBoardOpen ? (
                <ChevronDown className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0" />
              )}
              <span>Shared team board</span>
            </div>
            <span className="font-mono text-[11px] tabular-nums">
              {teamFeed.tasks.length} task
              {teamFeed.tasks.length === 1 ? "" : "s"} ·{" "}
              {teamFeed.entries.length} note
              {teamFeed.entries.length === 1 ? "" : "s"}
            </span>
          </button>

          {isBoardOpen && (
            <div className="space-y-3 border-t border-border/60 bg-muted/15 px-3 py-3 sm:px-4">
              {teamFeed.tasks.length > 0 && (
                <div className="divide-y divide-border/50 rounded-lg border border-border/60 bg-background/80">
                  {teamFeed.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2 px-2.5 py-2 text-xs"
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
                          <SubagentRoleBadge subagentType={task.assignedRole} />
                        </div>
                        {task.files && task.files.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {task.files.map((file) => (
                              <span
                                key={file}
                                className="max-w-full truncate rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                              >
                                {file}
                              </span>
                            ))}
                          </div>
                        )}
                        {task.verification && (
                          <p className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 break-words">
                            Verified: {task.verification}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                        {task.id}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {teamFeed.entries.length > 0 && (
                <div className="space-y-1.5">
                  {teamFeed.entries.slice(-4).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-border/60 bg-background/80 px-2.5 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                          {entry.kind}
                        </span>
                        <span className="font-medium text-foreground">
                          {entry.authorRole}
                        </span>
                        {entry.targetRole && (
                          <>
                            <ArrowRight className="size-3 text-muted-foreground" />
                            <span className="font-medium text-foreground">
                              {entry.targetRole}
                            </span>
                          </>
                        )}
                        <span className="min-w-0 truncate text-muted-foreground">
                          · {entry.title}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                        {entry.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
