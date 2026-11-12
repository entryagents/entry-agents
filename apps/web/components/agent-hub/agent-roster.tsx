"use client";

import { formatTokens } from "@entry-agents/shared";
import { CornerDownRight, Filter, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AgentHubEntry } from "@/lib/agent-hub/derive-roster";
import { isLiveStatus } from "@/lib/agent-hub/derive-roster";
import { cn } from "@/lib/utils";
import { StatusBadge, SubagentIcon, SubagentRoleBadge } from "./agent-status";

type FilterTab = "all" | "active" | "completed" | "failed";

function tokenLabel(entry: AgentHubEntry): string {
  return entry.inputTokens === null
    ? "usage —"
    : `${formatTokens(entry.inputTokens)} in`;
}

export function AgentRoster({
  entries,
  selectedId,
  onSelect,
}: {
  entries: AgentHubEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const counts = useMemo(() => {
    let active = 0;
    let completed = 0;
    let failed = 0;
    for (const e of entries) {
      if (isLiveStatus(e.status)) active++;
      else if (e.status === "completed") completed++;
      else if (e.status === "failed" || e.status === "denied") failed++;
    }
    return { all: entries.length, active, completed, failed };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      // Tab filter
      if (filterTab === "active" && !isLiveStatus(entry.status)) return false;
      if (filterTab === "completed" && entry.status !== "completed")
        return false;
      if (
        filterTab === "failed" &&
        entry.status !== "failed" &&
        entry.status !== "denied"
      ) {
        return false;
      }

      // Query filter
      if (!q) return true;
      const titleMatch = entry.title.toLowerCase().includes(q);
      const typeMatch = entry.subagentType.toLowerCase().includes(q);
      const idMatch = entry.id.toLowerCase().includes(q);
      const toolMatch = entry.pending?.name.toLowerCase().includes(q) ?? false;
      return titleMatch || typeMatch || idMatch || toolMatch;
    });
  }, [entries, filterTab, searchQuery]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Search and Filters Header */}
      <div className="shrink-0 space-y-2 border-b border-border/60 p-2.5 bg-muted/10">
        {/* Search bar */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subagents or tools..."
            className="h-8 w-full rounded-md border border-border/60 bg-muted/30 pl-8 pr-7 text-xs placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-hidden focus:ring-1 focus:ring-primary/20 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-muted-foreground/60 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[11px]">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors active:scale-[0.97]",
              filterTab === "all"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            All{" "}
            <span className="tabular-nums font-mono opacity-80">
              {counts.all}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("active")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors active:scale-[0.97]",
              filterTab === "active"
                ? "bg-emerald-600 text-white font-semibold"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            Active{" "}
            <span className="tabular-nums font-mono opacity-80">
              {counts.active}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("completed")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors active:scale-[0.97]",
              filterTab === "completed"
                ? "bg-foreground text-background font-semibold"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            Done{" "}
            <span className="tabular-nums font-mono opacity-80">
              {counts.completed}
            </span>
          </button>
          {counts.failed > 0 && (
            <button
              type="button"
              onClick={() => setFilterTab("failed")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors active:scale-[0.97]",
                filterTab === "failed"
                  ? "bg-red-600 text-white font-semibold"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              Failed{" "}
              <span className="tabular-nums font-mono opacity-80">
                {counts.failed}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Roster List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredEntries.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-muted-foreground">
            <Filter className="h-5 w-5 mb-1.5 opacity-40" />
            <p>No subagents match criteria</p>
          </div>
        ) : (
          <ul
            className="flex flex-col gap-1.5"
            role="listbox"
            aria-label="Subagents roster"
          >
            {filteredEntries.map((entry) => {
              const selected = entry.id === selectedId;
              const isLive = isLiveStatus(entry.status);

              return (
                <li key={entry.id} style={{ paddingLeft: entry.depth * 14 }}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onSelect(entry.id)}
                    className={cn(
                      "group relative flex w-full flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors",
                      "active:scale-[0.98] transition-transform duration-150",
                      "focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-2",
                      selected
                        ? "border-primary/50 bg-primary/5 shadow-xs"
                        : "border-border/60 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {entry.depth > 0 && (
                          <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <SubagentIcon
                          type={entry.subagentType}
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate text-xs font-semibold text-foreground">
                          {entry.title}
                        </span>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <StatusBadge status={entry.status} size="sm" />
                      </div>
                    </div>

                    {/* Metadata Sub-line */}
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px] text-muted-foreground">
                      <span className="text-foreground/80 font-medium">
                        #{entry.index}
                      </span>
                      <span>·</span>
                      <SubagentRoleBadge subagentType={entry.subagentType} />
                      <span>·</span>
                      <span className="tabular-nums">{tokenLabel(entry)}</span>
                      {entry.pending && (
                        <span className="truncate max-w-[130px] text-primary/80 dark:text-primary">
                          · {entry.pending.name}
                        </span>
                      )}
                    </div>

                    {/* Live streaming indicator bar */}
                    {isLive && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="font-mono text-[10px]">
                          Processing task...
                        </span>
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
