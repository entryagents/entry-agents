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
    ? "You've hit your usage limit"
    : message.metadata?.creditExhausted
      ? "You're out of credit"
      : message.metadata?.turnSpendCapped
        ? "Turn spend cap reached"
        : message.metadata?.turnTimedOut
          ? "Turn duration limit reached"
          : !isStreaming && message.metadata?.turnError
            ? message.metadata.turnError
            : null;

  const stopNoticeCard = stopNotice ? (
    <p role="status" className="mt-2 text-sm text-muted-foreground">
      {stopNotice}
    </p>
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
