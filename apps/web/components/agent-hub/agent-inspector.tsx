"use client";

import { formatTokens } from "@entry-agents/shared";
import { ArrowLeft, ExternalLink, Square } from "lucide-react";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import type { AgentHubEntry } from "@/lib/agent-hub/derive-roster";
import { isLiveStatus } from "@/lib/agent-hub/derive-roster";
import { Button } from "@/components/ui/button";
import { StatusBadge, SubagentIcon } from "./agent-status";
import { useNow } from "./use-now";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function pendingSummary(entry: AgentHubEntry): string {
  if (!entry.pending) return "—";
  const input = entry.pending.input;
  let detail = "";
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const hint =
      record.command ?? record.filePath ?? record.pattern ?? record.url;
    if (typeof hint === "string") detail = hint;
  }
  return detail ? `${entry.pending.name} · ${detail}` : entry.pending.name;
}

export function AgentInspector({
  entry,
  parent,
  childEntries,
  onBack,
  onSelect,
  onStopRun,
}: {
  entry: AgentHubEntry;
  parent: AgentHubEntry | null;
  childEntries: AgentHubEntry[];
  /** Mobile only: return to the roster. */
  onBack?: () => void;
  onSelect: (id: string) => void;
  /** Stops the whole run (subagents cannot be stopped individually yet). */
  onStopRun?: () => void;
}) {
  const live = isLiveStatus(entry.status);
  const now = useNow(live && entry.startedAt !== null);
  const elapsed =
    entry.startedAt !== null && live
      ? formatElapsed(now - entry.startedAt)
      : "—";
  const gitPanel = useOptionalGitPanel();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-start gap-2">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to roster"
            className="-ml-2 h-9 w-9 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SubagentIcon
              type={entry.subagentType}
              className="h-4 w-4 text-neutral-500"
            />
            <span className="font-mono text-xs text-neutral-500">
              #{entry.index} · {entry.subagentType}
            </span>
          </div>
          <h3 className="mt-1 text-base leading-snug font-semibold break-words">
            {entry.title}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={entry.status} />
            {gitPanel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  gitPanel.openSubagentTab(
                    entry.id,
                    entry.title,
                    entry.subagentType,
                  );
                }}
                className="h-6 px-2 text-xs gap-1"
                aria-label={`Open subagent ${entry.title} in chat tab`}
              >
                <ExternalLink className="h-3 w-3" />
                <span>Open in Tab</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Tool calls"
          value={
            entry.toolCallCount === null ? "—" : String(entry.toolCallCount)
          }
        />
        <Stat label="Elapsed" value={elapsed} />
        <Stat
          label="Input tokens"
          value={
            entry.inputTokens === null
              ? "usage —"
              : formatTokens(entry.inputTokens)
          }
        />
        <Stat
          label="Output tokens"
          value={
            entry.outputTokens === null
              ? "usage —"
              : formatTokens(entry.outputTokens)
          }
        />
      </div>

      <section>
        <h4 className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
          {live ? "Current tool" : "Last tool"}
        </h4>
        <div className="rounded-lg bg-neutral-100 px-3 py-2 font-mono text-xs break-all dark:bg-neutral-900">
          {pendingSummary(entry)}
        </div>
      </section>

      <section>
        <h4 className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Model
        </h4>
        <div className="font-mono text-xs break-all">
          {entry.modelId ?? "—"}
        </div>
      </section>

      {(parent || childEntries.length > 0) && (
        <section>
          <h4 className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Lineage
          </h4>
          <div className="flex flex-col gap-1 text-sm">
            <button
              type="button"
              disabled={!parent}
              onClick={() => parent && onSelect(parent.id)}
              className="text-left text-neutral-500 enabled:hover:underline"
            >
              Parent:{" "}
              {parent ? `#${parent.index} ${parent.title}` : "main agent"}
            </button>
            {childEntries.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelect(child.id)}
                className="text-left hover:underline"
              >
                Child: #{child.index} {child.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {entry.errorText && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {entry.errorText}
        </p>
      )}

      {entry.sessionId && (
        <div className="font-mono text-xs break-all text-neutral-500">
          session {entry.sessionId}
        </div>
      )}

      {live && onStopRun && (
        <div className="mt-auto flex flex-col gap-1 pt-2">
          <Button
            variant="destructive"
            onClick={onStopRun}
            className="h-11 w-full"
          >
            <Square className="mr-2 h-4 w-4" /> Stop run
          </Button>
          <p className="text-center text-xs text-neutral-500">
            Stops the whole run, including every subagent.
          </p>
        </div>
      )}
    </div>
  );
}
