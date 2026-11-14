"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  FileCode2,
  GitBranch,
  HelpCircle,
  Lightbulb,
  Share2,
} from "lucide-react";
import type {
  TeamFeedEntry,
  TeamFeedState,
  TeamFeedTask,
} from "@/lib/agent-hub/derive-roster";
import { cn } from "@/lib/utils";
import { SubagentRoleBadge } from "./agent-status";

const KIND_META: Record<
  TeamFeedEntry["kind"],
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge: string;
  }
> = {
  decision: {
    label: "Decision",
    icon: GitBranch,
    badge:
      "border-indigo-500/25 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  finding: {
    label: "Finding",
    icon: Lightbulb,
    badge: "border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
  artifact: {
    label: "Artifact",
    icon: FileCode2,
    badge:
      "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  handoff: {
    label: "Handoff",
    icon: Share2,
    badge:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  blocker: {
    label: "Blocker",
    icon: AlertCircle,
    badge: "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  question: {
    label: "Question",
    icon: HelpCircle,
    badge:
      "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
};

function TaskStatusIcon({ status }: { status: TeamFeedTask["status"] }) {
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

export function TeamBoardView({ feed }: { feed: TeamFeedState }) {
  if (feed.entries.length === 0 && feed.tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="rounded-full border border-border/70 bg-muted/30 p-3">
          <Share2 className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-sm font-medium text-foreground">
          No shared team notes yet
        </h3>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
          When the main agent or subagents post findings, contracts, or handoffs
          via <code className="font-mono text-foreground">team_board</code>,
          they stream here in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto bg-background p-4 sm:p-5">
      {feed.tasks.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Team Tasks (
              {feed.tasks.filter((t) => t.status === "completed").length}/
              {feed.tasks.length})
            </h3>
          </div>
          <div className="divide-y divide-border/60 rounded-lg border border-border/70 bg-muted/15">
            {feed.tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-2.5 px-3 py-2.5 text-xs"
              >
                <div className="pt-0.5">
                  <TaskStatusIcon status={task.status} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                  {task.notes && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {task.notes}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {task.id}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {feed.entries.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Teammate Handoffs &amp; Decisions ({feed.entries.length})
          </h3>
          <div className="space-y-2.5">
            {feed.entries.map((entry) => {
              const meta = KIND_META[entry.kind] ?? KIND_META.finding;
              const KindIcon = meta.icon;
              return (
                <article
                  key={entry.id}
                  className="space-y-2 rounded-lg border border-border/70 bg-card p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          meta.badge,
                        )}
                      >
                        <KindIcon className="size-3" />
                        {meta.label}
                      </span>
                      <SubagentRoleBadge subagentType={entry.authorRole} />
                      {entry.targetRole && (
                        <>
                          <ArrowRight className="size-3 text-muted-foreground" />
                          <SubagentRoleBadge subagentType={entry.targetRole} />
                        </>
                      )}
                    </div>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground">
                    {entry.title}
                  </h4>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {entry.content}
                  </p>
                  {entry.files && entry.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {entry.files.map((file) => (
                        <span
                          key={file}
                          className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/85"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
