"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  Bot,
  CornerDownRight,
  ExternalLink,
  Filter,
  Terminal,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  StatusBadge,
  SubagentIcon,
  SubagentRoleBadge,
} from "@/components/agent-hub/agent-status";
import { Button } from "@/components/ui/button";
import {
  deriveAgentHubRoster,
  type AgentHubEntry,
  isLiveStatus,
  summarizeAgentHub,
} from "@/lib/agent-hub/derive-roster";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "active" | "completed";

export function WorkspaceAgentsTab({
  messages,
  onSelectSubagent,
}: {
  messages: unknown;
  onSelectSubagent: (id: string, title?: string, subagentType?: string) => void;
}) {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const roster = useMemo(() => deriveAgentHubRoster(messages), [messages]);
  const totals = useMemo(() => summarizeAgentHub(roster), [roster]);

  const filteredRoster = useMemo(() => {
    if (filterMode === "active") {
      return roster.filter((e) => isLiveStatus(e.status));
    }
    if (filterMode === "completed") {
      return roster.filter((e) => e.status === "completed");
    }
    return roster;
  }, [roster, filterMode]);

  if (roster.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 mb-3 border border-border/50">
          <Bot className="h-6 w-6 opacity-60 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          No subagents active
        </p>
        <p className="text-xs mt-1 max-w-[240px] leading-relaxed">
          When the parent model delegates work to Explorer, Executor, Reviewer,
          or Design subagents, their live telemetry and traces appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Mission Control Top Bar */}
      <div className="border-b border-border/70 bg-muted/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              Subagents Roster
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              ({totals.total})
            </span>
          </div>

          {totals.live > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {totals.live} live
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground font-mono">
              All settled
            </span>
          )}
        </div>

        {/* Telemetry Token Counter & Filter Pills */}
        <div className="flex items-center justify-between pt-1 text-[11px]">
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border border-border/50">
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={cn(
                "rounded-md px-2 py-0.5 font-medium transition-colors active:scale-[0.97]",
                filterMode === "all"
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All ({totals.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("active")}
              className={cn(
                "rounded-md px-2 py-0.5 font-medium transition-colors active:scale-[0.97]",
                filterMode === "active"
                  ? "bg-emerald-600 text-white font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Active ({totals.live})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("completed")}
              className={cn(
                "rounded-md px-2 py-0.5 font-medium transition-colors active:scale-[0.97]",
                filterMode === "completed"
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Done ({totals.total - totals.live})
            </button>
          </div>

          <div className="font-mono text-[10px] text-muted-foreground tabular-nums hidden sm:block">
            {formatTokens(totals.inputTokens)} in /{" "}
            {formatTokens(totals.outputTokens)} out
          </div>
        </div>
      </div>

      {/* Subagents List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredRoster.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-muted-foreground">
            <Filter className="h-4 w-4 mb-1 opacity-40" />
            <p>No subagents match filter</p>
          </div>
        ) : (
          filteredRoster.map((entry: AgentHubEntry) => {
            const isLive = isLiveStatus(entry.status);

            return (
              <div
                key={entry.id}
                style={{ paddingLeft: entry.depth * 14 }}
                className={cn(
                  "group relative rounded-xl border p-3 shadow-2xs transition-colors",
                  "active:scale-[0.99] transition-transform duration-150",
                  isLive
                    ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/15"
                    : "border-border/70 bg-card hover:border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {entry.depth > 0 && (
                      <CornerDownRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                    )}
                    <SubagentIcon
                      type={entry.subagentType}
                      className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] text-muted-foreground font-semibold">
                          #{entry.index}
                        </span>
                        <span className="text-xs font-semibold truncate text-foreground">
                          {entry.title}
                        </span>
                      </div>

                      {/* Role & Telemetry subline */}
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap font-mono text-[11px] text-muted-foreground">
                        <SubagentRoleBadge subagentType={entry.subagentType} />
                        <span>·</span>
                        <span className="tabular-nums">
                          {entry.inputTokens === null
                            ? "usage —"
                            : `${formatTokens(entry.inputTokens)} tokens`}
                        </span>
                        {entry.pending && (
                          <span className="flex items-center gap-1 truncate max-w-[140px] text-foreground font-sans text-xs">
                            <Terminal className="h-3 w-3 text-primary shrink-0" />
                            {entry.pending.name}
                          </span>
                        )}
                      </div>

                      {/* Live streamed thoughts snippet preview */}
                      {entry.streamedText && (
                        <div className="mt-2 flex items-start gap-1 rounded-md bg-muted/40 p-1.5 text-[11px] text-muted-foreground line-clamp-2">
                          <Bot className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="truncate">{entry.streamedText}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions column */}
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <StatusBadge status={entry.status} size="sm" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        onSelectSubagent(
                          entry.id,
                          entry.title,
                          entry.subagentType,
                        )
                      }
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted gap-1 active:scale-[0.97] transition-transform"
                      aria-label={`Open subagent ${entry.title} in chat tab`}
                    >
                      <span>View Tab</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {entry.errorText && (
                  <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
                    {entry.errorText}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
