"use client";

import { formatTokens } from "@entry-agents/shared";
import { Bot, CornerDownRight, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { StatusBadge, SubagentIcon } from "@/components/agent-hub/agent-status";
import { Button } from "@/components/ui/button";
import {
  deriveAgentHubRoster,
  type AgentHubEntry,
  summarizeAgentHub,
} from "@/lib/agent-hub/derive-roster";

export function WorkspaceAgentsTab({
  messages,
  onSelectSubagent,
}: {
  messages: unknown;
  onSelectSubagent: (id: string, title?: string, subagentType?: string) => void;
}) {
  const roster = useMemo(() => deriveAgentHubRoster(messages), [messages]);
  const totals = useMemo(() => summarizeAgentHub(roster), [roster]);

  if (roster.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <Bot className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">No subagents active</p>
        <p className="text-xs mt-1 max-w-[220px]">
          When the main agent delegates work to Explorer, Executor, or Reviewer
          subagents, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top metrics summary */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">
            Subagents ({totals.total})
          </span>
          {totals.live > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {totals.live} active
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {formatTokens(totals.inputTokens)} in /{" "}
          {formatTokens(totals.outputTokens)} out
        </div>
      </div>

      {/* Subagent Tree List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {roster.map((entry: AgentHubEntry) => {
          return (
            <div
              key={entry.id}
              style={{ paddingLeft: entry.depth * 14 }}
              className="group relative rounded-lg border border-border/60 bg-card p-3 shadow-2xs hover:border-border transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {entry.depth > 0 && (
                    <CornerDownRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <SubagentIcon
                    type={entry.subagentType}
                    className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{entry.index}
                      </span>
                      <span className="text-xs font-semibold truncate text-foreground">
                        {entry.title}
                      </span>
                    </div>

                    {/* Metadata line */}
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      <span>{entry.subagentType}</span>
                      <span>·</span>
                      <span>
                        {entry.inputTokens === null
                          ? "usage —"
                          : `${formatTokens(entry.inputTokens)} tokens`}
                      </span>
                      {entry.pending && (
                        <span className="truncate max-w-[140px] text-foreground">
                          · {entry.pending.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <StatusBadge status={entry.status} />
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
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                    aria-label={`Open subagent ${entry.title} in chat tab`}
                  >
                    <span>View Tab</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {entry.errorText && (
                <div className="mt-2 rounded bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
                  {entry.errorText}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
