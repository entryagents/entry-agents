"use client";

import { formatTokens } from "@entry-agents/shared";
import { CornerDownRight } from "lucide-react";
import type { AgentHubEntry } from "@/lib/agent-hub/derive-roster";
import { cn } from "@/lib/utils";
import { StatusBadge, SubagentIcon } from "./agent-status";

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
  return (
    <ul
      className="flex flex-col gap-1 p-2"
      role="listbox"
      aria-label="Subagents"
    >
      {entries.map((entry) => {
        const selected = entry.id === selectedId;
        return (
          <li key={entry.id} style={{ paddingLeft: entry.depth * 14 }}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(entry.id)}
              className={cn(
                "flex w-full min-h-14 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
                "focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-2",
                selected
                  ? "border-neutral-400 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800"
                  : "border-transparent hover:bg-neutral-100/70 dark:hover:bg-neutral-800/60",
              )}
            >
              <span className="flex items-center gap-2">
                {entry.depth > 0 && (
                  <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                )}
                <SubagentIcon
                  type={entry.subagentType}
                  className="h-4 w-4 shrink-0 text-neutral-500"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {entry.title}
                </span>
                <StatusBadge status={entry.status} />
              </span>
              <span className="flex items-center gap-2 pl-6 font-mono text-xs text-neutral-500">
                <span>#{entry.index}</span>
                <span>{entry.subagentType}</span>
                <span>·</span>
                <span>{tokenLabel(entry)}</span>
                {entry.pending && (
                  <span className="min-w-0 flex-1 truncate text-neutral-400">
                    · {entry.pending.name}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
