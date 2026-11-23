"use client";

import { ChevronRight, FileDiff } from "lucide-react";
import { useEffect, useState } from "react";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import type { TurnFileChanges } from "@/components/chat/sable-turn-grouping";
import { cn } from "@/lib/utils";
import "./tool-call/agent-row.css";

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function ToolCallsSummaryBar({
  isExpanded,
  onToggle,
  isStreaming,
  toolCallCount,
  changedFiles,
  changes,
  thoughtOnly = false,
  liveLabel,
  durationMs,
  startedAt,
  statusWordSeed: _statusWordSeed,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  isStreaming: boolean;
  toolCallCount: number;
  /** Unique file paths modified by write/edit tool calls in this turn. */
  changedFiles: string[];
  /** Aggregated file changes (+add / -del) matching Sable's work-changes button. */
  changes?: TurnFileChanges;
  /** True when the turn only had reasoning/thinking and 0 tool steps. */
  thoughtOnly?: boolean;
  /** Live activity label while streaming (e.g. "Reading app.ts", "Thinking"). */
  liveLabel?: string;
  /** Final generation duration in ms (for completed messages). */
  durationMs: number | null;
  /** ISO timestamp of when generation started — i.e. the preceding user
   *  message's createdAt — used for a live counter while streaming. */
  startedAt: string | null;
  /** Kept for backwards-compatible prop surface. */
  statusWordSeed: string | null;
}) {
  const gitPanel = useOptionalGitPanel();
  const startMs = startedAt ? new Date(startedAt).getTime() : null;

  const computeLiveElapsed = () =>
    startMs != null
      ? Math.max(0, Math.floor((Date.now() - startMs) / 1000))
      : 0;

  const [liveElapsed, setLiveElapsed] = useState(computeLiveElapsed);

  useEffect(() => {
    if (!isStreaming) return;

    setLiveElapsed(computeLiveElapsed());
    const interval = setInterval(() => {
      setLiveElapsed(computeLiveElapsed());
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable per startMs
  }, [isStreaming, startMs]);

  const elapsedSeconds = isStreaming
    ? liveElapsed
    : durationMs != null
      ? Math.max(0, Math.round(durationMs / 1000))
      : liveElapsed;

  const took = elapsedSeconds > 0 ? formatElapsedTime(elapsedSeconds) : "";
  const primaryLabel = isStreaming
    ? liveLabel || "Working"
    : thoughtOnly
      ? took
        ? `Thought for ${took}`
        : "Thought"
      : took
        ? `Worked ${took}`
        : "Worked";

  const stepLabel =
    toolCallCount > 0
      ? `${toolCallCount} ${toolCallCount === 1 ? "step" : "steps"}`
      : null;

  const fileCount = changes?.files ?? changedFiles.length;
  const addLines = changes?.add ?? 0;
  const delLines = changes?.del ?? 0;

  const fullSummary = [
    primaryLabel,
    isStreaming && took ? took : null,
    stepLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-2 py-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={fullSummary}
        title={fullSummary}
        className={cn(
          "sable-row-btn group inline-flex min-h-[25px] max-w-full cursor-pointer items-center gap-1.5 text-left text-[12.5px] text-muted-foreground tabular-nums transition-colors duration-150 hover:text-foreground",
          isStreaming && "text-foreground/90",
        )}
      >
        <span className={cn("truncate", isStreaming && "shimmer")}>
          {primaryLabel}
        </span>
        {isStreaming && took && (
          <span className="shrink-0 text-muted-foreground/75">{took}</span>
        )}
        {stepLabel && (
          <span className="shrink-0 text-muted-foreground/75">{stepLabel}</span>
        )}
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-2.5 shrink-0 text-muted-foreground/60 opacity-0 transition-[transform,opacity] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
            isExpanded && "rotate-90 opacity-100",
          )}
        />
      </button>

      {!isStreaming && fileCount > 0 && (
        <button
          type="button"
          onClick={() => {
            gitPanel?.setGitPanelTab("diff");
            gitPanel?.setGitPanelOpen(true);
          }}
          aria-label={`${fileCount} ${fileCount === 1 ? "file" : "files"} changed. Open Changes`}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground tabular-nums transition-colors hover:text-foreground cursor-pointer"
        >
          <FileDiff className="size-3.5 shrink-0" strokeWidth={1.6} />
          <span>
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </span>
          {addLines > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">
              +{addLines}
            </span>
          )}
          {delLines > 0 && (
            <span className="text-red-600 dark:text-red-400">−{delLines}</span>
          )}
        </button>
      )}
    </div>
  );
}
