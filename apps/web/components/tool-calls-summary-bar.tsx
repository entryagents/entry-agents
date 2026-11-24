"use client";

import { ChevronRight, FileDiff } from "lucide-react";
import { useEffect, useState } from "react";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import { SableTiles } from "@/components/chat/sable-tiles";
import type { TurnFileChanges } from "@/components/chat/sable-turn-grouping";
import { cn } from "@/lib/utils";
import "./chat/sable-timeline.css";
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
    <div className="sable-work-head py-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={fullSummary}
        title={fullSummary}
        className={cn("sable-work-line", isStreaming && "sable-work-live")}
      >
        {isStreaming && (
          <span className="sable-work-ind">
            <SableTiles size={12} />
          </span>
        )}
        <span
          className={cn(
            "sable-work-label truncate tabular-nums",
            isStreaming && "shimmer",
          )}
        >
          {primaryLabel}
        </span>
        {isStreaming && took && (
          <span className="sable-work-time tabular-nums">{took}</span>
        )}
        {stepLabel && (
          <span className="sable-work-time tabular-nums">{stepLabel}</span>
        )}
        <ChevronRight
          size={10}
          strokeWidth={1.75}
          aria-hidden="true"
          className="sable-row-caret"
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
          className="sable-work-changes tabular-nums"
        >
          <FileDiff size={13} strokeWidth={1.6} aria-hidden="true" />
          <span>
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </span>
          {addLines > 0 && <span className="sable-t-add">+{addLines}</span>}
          {delLines > 0 && <span className="sable-t-del">−{delLines}</span>}
        </button>
      )}
    </div>
  );
}
