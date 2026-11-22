"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import "./tool-call/agent-row.css";

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function renderSegments(segments: string[]) {
  return segments.map((segment, i) => (
    <span key={i}>
      <span className="text-muted-foreground/40"> · </span>
      {segment}
    </span>
  ));
}

export function ToolCallsSummaryBar({
  isExpanded,
  onToggle,
  isStreaming,
  toolCallCount,
  changedFiles,
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
  /** Final generation duration in ms (for completed messages). */
  durationMs: number | null;
  /** ISO timestamp of when generation started — i.e. the preceding user
   *  message's createdAt — used for a live counter while streaming. */
  startedAt: string | null;
  /** Kept for backwards-compatible prop surface. */
  statusWordSeed: string | null;
}) {
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

  const statusLabel = isStreaming ? "Working" : "Worked";
  const stepLabel =
    toolCallCount > 0
      ? `${toolCallCount} step${toolCallCount !== 1 ? "s" : ""}`
      : null;

  const desktopSegments: string[] = [];
  const mobileSegments: string[] = [];

  if (elapsedSeconds > 0) {
    const elapsedLabel = formatElapsedTime(elapsedSeconds);
    desktopSegments.push(elapsedLabel);
    mobileSegments.push(elapsedLabel);
  }

  if (stepLabel) {
    desktopSegments.push(stepLabel);
  }

  if (changedFiles.length > 0) {
    const filesLabel = `${changedFiles.length} file${changedFiles.length !== 1 ? "s" : ""} changed`;
    desktopSegments.push(filesLabel);
  }

  if (stepLabel) {
    mobileSegments.push(stepLabel);
  }

  const fullSummary = [statusLabel, ...desktopSegments].join(" · ");

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={fullSummary}
        title={fullSummary}
        className={cn(
          "group -mx-1.5 flex min-h-[25px] max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[12.5px] text-muted-foreground tabular-nums transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/40 hover:text-foreground sm:inline-flex",
          isStreaming && "text-foreground/90",
        )}
      >
        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-none sm:flex-none sm:overflow-visible sm:whitespace-normal">
          <span className={isStreaming ? "shimmer" : undefined}>
            {statusLabel}
          </span>
          {mobileSegments.length > 0 && (
            <span className="inline-block max-w-full truncate align-bottom sm:hidden">
              {renderSegments(mobileSegments)}
            </span>
          )}
          {desktopSegments.length > 0 && (
            <span className="hidden sm:inline">
              {renderSegments(desktopSegments)}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-2.5 shrink-0 text-muted-foreground/60 opacity-0 transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-visible:opacity-100",
            isExpanded && "rotate-90 opacity-100",
          )}
        />
      </button>
    </div>
  );
}
