"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import type { AgentHubEntry } from "@/lib/agent-hub/derive-roster";
import { isLiveStatus } from "@/lib/agent-hub/derive-roster";
import { StreamingMarkdown } from "@/components/streaming-markdown";
import { Button } from "@/components/ui/button";
import { StatusBadge, SubagentIcon, SubagentRoleBadge } from "./agent-status";
import { useNow } from "./use-now";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function StatTile({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 transition-colors">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
        {value}
      </div>
      {secondary && (
        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {secondary}
        </div>
      )}
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
  /** Stops the whole run. */
  onStopRun?: () => void;
}) {
  const [copiedSession, setCopiedSession] = useState(false);
  const live = isLiveStatus(entry.status);
  const now = useNow(live && entry.startedAt !== null);
  const elapsed =
    entry.startedAt !== null && live
      ? formatElapsed(now - entry.startedAt)
      : "—";
  const gitPanel = useOptionalGitPanel();

  const handleCopySession = () => {
    if (!entry.sessionId) return;
    navigator.clipboard.writeText(entry.sessionId);
    setCopiedSession(true);
    setTimeout(() => setCopiedSession(false), 2000);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-5 bg-background">
      {/* Header Deck */}
      <div className="flex items-start gap-2.5">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to roster"
            className="-ml-2 h-8 w-8 shrink-0 active:scale-[0.97] transition-transform"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <SubagentIcon
              type={entry.subagentType}
              className="h-4 w-4 text-foreground/80"
            />
            <span className="font-mono text-xs text-muted-foreground font-medium">
              #{entry.index}
            </span>
            <SubagentRoleBadge subagentType={entry.subagentType} />
            <StatusBadge status={entry.status} size="sm" />
          </div>

          <h3 className="mt-1.5 text-base font-semibold leading-snug break-words text-foreground">
            {entry.title}
          </h3>

          <div className="mt-2 flex items-center gap-2">
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
                className="h-7 px-2.5 text-xs gap-1.5 active:scale-[0.97] transition-transform"
                aria-label={`Open subagent ${entry.title} in chat tab`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open in Tab</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Telemetry HUD Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          label="Elapsed"
          value={elapsed}
          secondary={live ? "live timer" : undefined}
        />
        <StatTile
          label="Tool Calls"
          value={
            entry.toolCallCount === null ? "—" : String(entry.toolCallCount)
          }
        />
        <StatTile
          label="Input Tokens"
          value={
            entry.inputTokens === null ? "—" : formatTokens(entry.inputTokens)
          }
        />
        <StatTile
          label="Output Tokens"
          value={
            entry.outputTokens === null ? "—" : formatTokens(entry.outputTokens)
          }
        />
      </div>

      {/* Live Stream / Assistant Thoughts Preview */}
      {entry.streamedText && (
        <section className="rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Live Stream Thoughts
            </span>
            {live && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Streaming
              </span>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto text-xs leading-relaxed text-foreground/90">
            <StreamingMarkdown
              content={entry.streamedText}
              isStreaming={live}
            />
          </div>
        </section>
      )}

      {/* Current or Last Tool Execution */}
      <section>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          <span>{live ? "Current Tool" : "Last Tool"}</span>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 font-mono text-xs break-all text-foreground">
          {pendingSummary(entry)}
        </div>
      </section>

      {/* Model Spec */}
      <section>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Model
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {entry.modelId ?? "default / inherit"}
        </div>
      </section>

      {/* Instructions / Task Definition */}
      {entry.instructions && (
        <section>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Parent Delegation Instructions
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 font-sans text-xs leading-relaxed text-muted-foreground max-h-36 overflow-y-auto">
            {entry.instructions}
          </div>
        </section>
      )}

      {/* Lineage Tree */}
      {(parent || childEntries.length > 0) && (
        <section>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Lineage
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <button
              type="button"
              disabled={!parent}
              onClick={() => parent && onSelect(parent.id)}
              className="text-left text-muted-foreground enabled:hover:text-foreground enabled:hover:underline active:scale-[0.99] transition-transform"
            >
              Parent:{" "}
              {parent ? `#${parent.index} ${parent.title}` : "Main Agent"}
            </button>
            {childEntries.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => onSelect(child.id)}
                className="text-left font-medium text-foreground hover:underline active:scale-[0.99] transition-transform"
              >
                Child: #{child.index} {child.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Error notice */}
      {entry.errorText && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          <p className="font-semibold">Subagent error:</p>
          <p className="mt-0.5">{entry.errorText}</p>
        </div>
      )}

      {/* Session ID */}
      {entry.sessionId && (
        <div className="flex items-center gap-2 pt-1">
          <span className="font-mono text-[11px] text-muted-foreground truncate">
            session: {entry.sessionId}
          </span>
          <button
            type="button"
            onClick={handleCopySession}
            className="text-muted-foreground hover:text-foreground active:scale-[0.95] transition-transform"
            aria-label="Copy session ID"
          >
            {copiedSession ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      )}

      {/* Emergency Stop Run */}
      {live && onStopRun && (
        <div className="mt-auto flex flex-col gap-1.5 pt-4">
          <Button
            variant="destructive"
            onClick={onStopRun}
            className="h-9 w-full text-xs font-semibold active:scale-[0.97] transition-transform"
          >
            <Square className="mr-1.5 h-3.5 w-3.5 fill-current" /> Stop Entire
            Run
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Terminates the active execution and all spawned subagents.
          </p>
        </div>
      )}
    </div>
  );
}
