"use client";

import type { ToolRenderState } from "@entry-agents/shared/lib/tool-state";
import { ChevronRight, CircleX, Loader2, OctagonPause } from "lucide-react";
import type React from "react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ApprovalButtons } from "./approval-buttons";
import { Elapsed } from "./elapsed";

export type ToolLayoutProps = {
  name: string;
  summary: ReactNode;
  summaryClassName?: string;
  meta?: ReactNode;
  /** When true, push meta to the far right of the header row. */
  rightAlignMeta?: boolean;
  /** Short label shown right-aligned in the error header (e.g. "exit 1"). */
  errorMeta?: ReactNode;
  state: ToolRenderState;
  output?: ReactNode;
  children?: ReactNode;
  expandedContent?: ReactNode;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
  defaultExpanded?: boolean;
  /** Controlled transition trigger: syncs expanded state only when value transitions. */
  autoExpanded?: boolean;
  /** Tool-specific icon (Lucide element). */
  icon?: ReactNode;
  /** @deprecated Use `icon` instead. */
  indicator?: ReactNode;
  nameClassName?: string;
  /** Optional custom click handler for the entire tool header row (e.g. opening subagent tab). */
  onHeaderClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;
};

function StatusIndicator({ state }: { state: ToolRenderState }) {
  if (state.interrupted) {
    return (
      <span className="inline-block h-2 w-2 rounded-full border border-yellow-500" />
    );
  }

  if (state.running) {
    return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />;
  }

  const color = state.denied
    ? "bg-red-500"
    : state.approvalRequested
      ? "bg-yellow-500"
      : state.error
        ? "bg-red-500"
        : "bg-green-500";

  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}

function hasRenderableContent(value: ReactNode) {
  return (
    value !== null && value !== undefined && value !== false && value !== ""
  );
}

const EXPANDED_CONTENT_TRANSITION_MS = 200;

function trimErrorPrefix(message: string) {
  return message.replace(/^Error:\s*/i, "").trim();
}

export function ToolLayout({
  name,
  summary,
  summaryClassName,
  meta,
  rightAlignMeta = false,
  errorMeta,
  state,
  output,
  children,
  expandedContent,
  onApprove,
  onDeny,
  defaultExpanded = false,
  autoExpanded,
  icon,
  indicator,
  nameClassName,
  onHeaderClick,
}: ToolLayoutProps) {
  const initialExpanded = autoExpanded ?? defaultExpanded;
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const prevAutoExpandedRef = useRef(autoExpanded);
  const userInteractedRef = useRef(false);
  const showApprovalButtons = Boolean(
    state.approvalRequested && !state.isActiveApproval && state.approvalId,
  );
  const errorMessage =
    state.error && !state.denied ? trimErrorPrefix(state.error) : undefined;
  const hasError = Boolean(errorMessage);
  const isInterrupted = Boolean(state.interrupted);
  const hasExpandedDetails =
    hasRenderableContent(expandedContent) || hasError || isInterrupted;
  const hasOutput = hasRenderableContent(output);
  const hasMeta = hasRenderableContent(meta);
  const hasSummary =
    typeof summary === "string" ? summary.trim().length > 0 : summary != null;
  const showRunningNotice =
    state.approvalRequested && !showApprovalButtons && !state.interrupted;
  const isExpandedPanelVisible = isExpanded && hasExpandedDetails;
  const [shouldRenderExpandedContent, setShouldRenderExpandedContent] =
    useState(initialExpanded && hasExpandedDetails);

  // Error & interrupted state flags
  const showErrorHeader = hasError;
  const showInterruptedHeader = isInterrupted && !hasError;
  const showErrorExpanded = hasError && isExpandedPanelVisible;
  const showInterruptedExpanded =
    isInterrupted && !hasError && isExpandedPanelVisible;
  const hasErrorMeta = hasRenderableContent(errorMeta);
  const hasTrailingMeta = !showErrorHeader && !showInterruptedHeader && hasMeta;

  useEffect(() => {
    if (autoExpanded === undefined) {
      prevAutoExpandedRef.current = autoExpanded;
      return;
    }
    if (prevAutoExpandedRef.current === autoExpanded) {
      return;
    }
    prevAutoExpandedRef.current = autoExpanded;
    if (userInteractedRef.current) {
      return;
    }
    if (autoExpanded) {
      setShouldRenderExpandedContent(true);
    }
    setIsExpanded(autoExpanded);
  }, [autoExpanded]);

  useEffect(() => {
    if (!hasExpandedDetails) {
      setShouldRenderExpandedContent(false);
      return;
    }

    if (isExpandedPanelVisible) {
      setShouldRenderExpandedContent(true);
      return;
    }

    if (!shouldRenderExpandedContent) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShouldRenderExpandedContent(false);
    }, EXPANDED_CONTENT_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [hasExpandedDetails, isExpandedPanelVisible, shouldRenderExpandedContent]);

  const handleToggle = () => {
    if (!hasExpandedDetails) {
      return;
    }

    userInteractedRef.current = true;
    const nextExpanded = !isExpanded;

    if (nextExpanded) {
      setShouldRenderExpandedContent(true);
    }

    setIsExpanded(nextExpanded);
  };

  const isInteractiveHeader = hasExpandedDetails || Boolean(onHeaderClick);

  const handleClick = (e: React.MouseEvent) => {
    if (onHeaderClick) {
      onHeaderClick(e);
      return;
    }
    handleToggle();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (onHeaderClick) {
        onHeaderClick(e);
        return;
      }
      handleToggle();
    }
  };

  // Resolve the icon to show in the header.
  const isRunning = state.running;
  const resolvedIcon = isRunning ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  ) : (
    (icon ?? indicator ?? <StatusIndicator state={state} />)
  );

  return (
    <div className="-mx-1.5 rounded-md border border-transparent bg-transparent">
      <div
        className={cn(
          "group flex min-h-[25px] min-w-0 select-none items-center gap-2 rounded-md px-1.5 py-0.5 text-[12.5px]",
          isInteractiveHeader &&
            "cursor-pointer transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/40 active:bg-muted/60",
        )}
        {...(isInteractiveHeader && {
          onClick: handleClick,
          onKeyDown: handleKeyDown,
          role: "button",
          tabIndex: 0,
          "aria-expanded": isExpanded,
        })}
      >
        {/* Icon area */}
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/70 transition-[color,transform] duration-150 group-hover:-translate-y-px group-hover:text-muted-foreground">
          {showErrorHeader ? (
            <>
              <CircleX className="h-3.5 w-3.5 text-red-500" />
            </>
          ) : showInterruptedHeader ? (
            <>
              <OctagonPause className="h-3.5 w-3.5 text-yellow-500" />
            </>
          ) : hasExpandedDetails && !isRunning ? (
            <>{resolvedIcon}</>
          ) : (
            resolvedIcon
          )}
        </span>

        {/* Name + summary */}
        <span
          className={cn(
            "min-w-0 shrink truncate font-normal leading-none transition-colors duration-150",
            showErrorHeader
              ? "text-red-500"
              : showInterruptedHeader
                ? "text-yellow-500"
                : state.denied
                  ? "text-red-500"
                  : "text-muted-foreground group-hover:text-foreground",
            nameClassName,
          )}
        >
          {name}
        </span>

        <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
          {hasSummary && (
            <span
              className={cn(
                "min-w-0 shrink truncate text-[12.5px] leading-none",
                showErrorHeader
                  ? "text-red-400/80"
                  : showInterruptedHeader
                    ? "text-yellow-400/80"
                    : "text-muted-foreground",
                summaryClassName,
              )}
            >
              {summary}
            </span>
          )}

          {(rightAlignMeta || showErrorHeader || showInterruptedHeader) && (
            <span className="flex-1" />
          )}

          {showErrorHeader && hasErrorMeta && (
            <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[12px] leading-none text-red-400/70">
              {errorMeta}
            </span>
          )}

          {hasTrailingMeta ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] leading-none tabular-nums text-muted-foreground/80">
              {meta}
            </span>
          ) : isRunning ? (
            <Elapsed active />
          ) : null}
        </div>
        {hasExpandedDetails && !isRunning && (
          <ChevronRight
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 text-muted-foreground/60 opacity-0 transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-visible:opacity-100",
              isExpandedPanelVisible && "rotate-90 opacity-100",
            )}
          />
        )}
      </div>

      {children}

      {showRunningNotice && (
        <div className="mt-2 text-sm text-muted-foreground">Running...</div>
      )}

      {showApprovalButtons && (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <ApprovalButtons
            approvalId={state.approvalId!}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        </div>
      )}

      {hasOutput &&
        !state.approvalRequested &&
        !state.denied &&
        !state.interrupted && (
          <div className="mt-2 text-sm text-muted-foreground">{output}</div>
        )}

      {state.denied && (
        <div className="mt-2 text-sm text-red-500">
          Denied{state.denialReason ? `: ${state.denialReason}` : ""}
        </div>
      )}

      {hasExpandedDetails && (
        <div
          aria-hidden={!isExpandedPanelVisible}
          inert={!isExpandedPanelVisible}
          className={cn(
            "grid min-w-0 w-full overflow-hidden transition-[grid-template-rows,opacity,margin-top] motion-reduce:transition-none",
            isExpandedPanelVisible
              ? "grid-rows-[1fr] opacity-100 duration-200 ease-out"
              : "grid-rows-[0fr] opacity-0 pointer-events-none duration-150 ease-out",
          )}
        >
          <div className="min-h-0 min-w-0 w-full overflow-hidden">
            {shouldRenderExpandedContent && (
              <div className="sable-tool-details space-y-2 min-w-0 overflow-hidden">
                {showErrorExpanded &&
                  !hasRenderableContent(expandedContent) && (
                    <pre className="sable-tool-error max-h-48 overflow-x-auto overflow-y-auto">
                      {errorMessage}
                    </pre>
                  )}
                {showInterruptedExpanded && (
                  <pre className="sable-tool-error overflow-x-auto">
                    interrupted
                  </pre>
                )}
                {expandedContent}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
