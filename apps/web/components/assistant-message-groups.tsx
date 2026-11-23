"use client";

import { isToolUIPart } from "ai";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { summarizeTurnWork } from "./chat/sable-turn-grouping";
import { ToolCallsSummaryBar } from "./tool-calls-summary-bar";

/**
 * Checks whether a message has an active approval request, which
 * should force the tool calls to be expanded so the user can respond.
 */
function messageHasActiveApproval(message: WebAgentUIMessage): boolean {
  return message.parts.some(
    (p) => isToolUIPart(p) && p.state === "approval-requested",
  );
}

export type AssistantMessageGroupsProps = {
  message: WebAgentUIMessage;
  isStreaming: boolean;
  /** Pre-computed generation duration in ms (for completed messages) */
  durationMs: number | null;
  /** ISO timestamp of the preceding user message's createdAt (for live timer while streaming) */
  startedAt: string | null;
  /**
   * Render function that produces the list of group elements.
   * Called with `isExpanded` so the caller can conditionally
   * skip rendering collapsible groups.
   */
  children: (isExpanded: boolean) => ReactNode;
};

/**
 * Wraps an assistant message's groups with a Sable-style collapsible work line.
 * Tool calls and reasoning fold behind a single summary line ("Thought for Xs",
 * "Worked Xs · N steps", plus a clickable diff button when files changed).
 */
export function AssistantMessageGroups({
  message,
  isStreaming,
  durationMs,
  startedAt,
  children,
}: AssistantMessageGroupsProps) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setManualExpanded(null);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const workSummary = useMemo(() => summarizeTurnWork(message), [message]);
  const {
    hasCollapsible,
    stepCount: toolCallCount,
    changedFiles,
  } = workSummary;

  const hasActiveApproval = useMemo(
    () => messageHasActiveApproval(message),
    [message],
  );

  // Stay expanded while streaming or when an active approval needs user
  // attention; collapse behind Sable's single TotalLine on completion.
  const effectiveExpanded =
    hasActiveApproval || (manualExpanded ?? isStreaming);

  // Stopped early because this turn tripped a billing safeguard.
  // Distinct wording per cause: creditExhausted means the account ran
  // out of balance; turnSpendCapped means the account still has
  // balance but this single turn alone got too expensive (runaway
  // multi-tool-call loop protection) -- see MAX_TURN_SPEND_CENTS in
  // app/workflows/chat.ts.
  const stopNotice = message.metadata?.windowExhausted
    ? "Your Entry plan's usage window reached its limit mid-response, so generation stopped here. Send a follow-up message when your window refills."
    : message.metadata?.creditExhausted
      ? "Ran out of credit mid-response, so generation stopped here. Top up or upgrade your plan to continue."
      : message.metadata?.turnSpendCapped
        ? "This turn crossed its $5 spend cap"
        : message.metadata?.turnTimedOut
          ? "This task reached the maximum turn duration"
          : !isStreaming && message.metadata?.turnError
            ? message.metadata.turnError
            : null;

  const dotIdx = stopNotice ? stopNotice.indexOf(". ") : -1;
  const stopNoticeTitle = stopNotice
    ? dotIdx !== -1
      ? `${stopNotice.slice(0, dotIdx)}.`
      : stopNotice
    : null;
  const stopNoticeBody =
    stopNotice && dotIdx !== -1 ? stopNotice.slice(dotIdx + 2) : null;

  const stopNoticeCard = stopNotice ? (
    <div
      role="status"
      className="flex w-fit max-w-full items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm text-foreground"
    >
      <svg
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <div className="min-w-0">
        <p className="font-medium text-foreground">{stopNoticeTitle}</p>
        {stopNoticeBody && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {stopNoticeBody}
          </p>
        )}
      </div>
    </div>
  ) : null;

  // If no collapsible content, just render children directly
  if (!hasCollapsible) {
    return (
      <>
        {children(true)}
        {stopNoticeCard}
      </>
    );
  }

  return (
    <>
      <ToolCallsSummaryBar
        isExpanded={effectiveExpanded}
        onToggle={() => setManualExpanded(!effectiveExpanded)}
        isStreaming={isStreaming}
        toolCallCount={toolCallCount}
        changedFiles={changedFiles}
        changes={workSummary.changes}
        thoughtOnly={workSummary.thoughtOnly}
        liveLabel={workSummary.liveLabel}
        durationMs={durationMs}
        startedAt={startedAt}
        statusWordSeed={message.id}
      />
      <div>{children(effectiveExpanded)}</div>
      {stopNoticeCard}
    </>
  );
}
