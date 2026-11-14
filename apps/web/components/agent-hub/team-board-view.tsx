"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  FileCode2,
  GitBranch,
  HelpCircle,
  Lightbulb,
  Share2,
} from "lucide-react";
import { useState } from "react";
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
    badge: "border-border/80 bg-muted/60 text-foreground",
  },
  finding: {
    label: "Finding",
    icon: Lightbulb,
    badge: "border-border/80 bg-muted/60 text-foreground",
  },
  artifact: {
    label: "Artifact",
    icon: FileCode2,
    badge: "border-border/80 bg-muted/60 text-foreground",
  },
  handoff: {
    label: "Handoff",
    icon: Share2,
    badge: "border-border/80 bg-muted/60 text-foreground",
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

function formatBoardAsMarkdown(feed: TeamFeedState): string {
  const lines: string[] = ["# Team Board"];
  if (feed.tasks.length > 0) {
    lines.push("", "## Tasks");
    for (const task of feed.tasks) {
      const box = task.status === "completed" ? "[x]" : "[ ]";
      lines.push(
        `- ${box} **${task.id}** ${task.title} _(${task.assignedRole}, ${task.status})_`,
      );
      if (task.notes) {
        lines.push(`  - ${task.notes}`);
      }
    }
  }
  if (feed.entries.length > 0) {
    lines.push("", "## Decisions & Handoffs");
    for (const entry of feed.entries) {
      const target = entry.targetRole ? ` → ${entry.targetRole}` : "";
      lines.push(
        `### [${entry.kind}] ${entry.title} (${entry.authorRole}${target})`,
      );
      lines.push(entry.content);
      if (entry.files && entry.files.length > 0) {
        lines.push(`Files: ${entry.files.map((f) => `\`${f}\``).join(", ")}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

export function TeamBoardView({ feed }: { feed: TeamFeedState }) {
  const [kindFilter, setKindFilter] = useState<"all" | TeamFeedEntry["kind"]>(
    "all",
  );
  const [copied, setCopied] = useState(false);

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

  const filteredEntries =
    kindFilter === "all"
      ? feed.entries
      : feed.entries.filter((e) => e.kind === kindFilter);

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(formatBoardAsMarkdown(feed));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto bg-background p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: "all", label: "All" },
              { id: "decision", label: "Decisions" },
              { id: "finding", label: "Findings" },
              { id: "handoff", label: "Handoffs" },
              { id: "blocker", label: "Blockers" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setKindFilter(tab.id)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
                kindFilter === tab.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleCopyMarkdown()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="size-3 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy markdown</span>
            </>
          )}
        </button>
      </div>

      {feed.tasks.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground tabular-nums">
              Team tasks (
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
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {task.id}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredEntries.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground tabular-nums">
            Decisions &amp; handoffs ({filteredEntries.length})
          </h3>
          <div className="space-y-2.5">
            {filteredEntries.map((entry) => {
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
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
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
