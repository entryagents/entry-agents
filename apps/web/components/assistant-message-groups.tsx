"use client";

import { isReasoningUIPart, isToolUIPart } from "ai";
import { useMemo, useState, type ReactNode } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { ToolCallsSummaryBar } from "./tool-calls-summary-bar";

/**
 * Determines if a message has any tool call or reasoning content
 * that should be collapsible.
 */
function messageHasCollapsibleContent(message: WebAgentUIMessage): boolean {
  return message.parts.some((p) => isToolUIPart(p) || isReasoningUIPart(p));
}

function countToolCalls(message: WebAgentUIMessage): number {
  let count = 0;
  for (const part of message.parts) {
    if (isToolUIPart(part)) count++;
  }
  return count;
}

const FILE_MODIFYING_TOOLS = new Set(["tool-write", "tool-edit"]);

function getChangedFiles(message: WebAgentUIMessage): string[] {
  const files = new Set<string>();
  for (const part of message.parts) {
    if (
      isToolUIPart(part) &&
      FILE_MODIFYING_TOOLS.has(part.type) &&
      (part.input as { filePath?: string } | undefined)?.filePath
    ) {
      files.add((part.input as { filePath: string }).filePath);
    }
  }
  return Array.from(files);
}

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
 * Wraps an assistant message's groups with a collapsible summary bar.
 * By default, tool calls and reasoning are hidden behind a single-line
 * summary. Clicking the summary expands to show the full content.
 */
export function AssistantMessageGroups({
  message,
  isStreaming,
  durationMs,
  startedAt,
  children,
}: AssistantMessageGroupsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasCollapsible = useMemo(
    () => messageHasCollapsibleContent(message),
    [message],
  );

  const toolCallCount = useMemo(() => countToolCalls(message), [message]);

  const changedFiles = useMemo(() => getChangedFiles(message), [message]);

  const hasActiveApproval = useMemo(
    () => messageHasActiveApproval(message),
    [message],
  );

  // Force expand when there's an active approval the user needs to respond to
  const effectiveExpanded = isExpanded || hasActiveApproval;

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
        : null;

  const stopNoticeTitle = stopNotice
    ? stopNotice.split(". ")[0] + "."
    : null;
  const stopNoticeBody = stopNotice
    ? stopNotice.slice(stopNotice.indexOf(". ") + 2)
    : null;

  const stopNoticeCard = stopNotice ? (
    <div
      role="status"
      className="flex w-fit max-w-full items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-amber-500/[0.04] px-4 py-3 text-sm text-amber-800 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-amber-400/25 dark:from-amber-400/10 dark:to-amber-400/[0.03] dark:text-amber-300"
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <div className="min-w-0">
        <p className="font-medium">{stopNoticeTitle}</p>
        <p className="mt-0.5 text-[13px] opacity-90">{stopNoticeBody}</p>
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
        onToggle={() => setIsExpanded((v) => !v)}
        isStreaming={isStreaming}
        toolCallCount={toolCallCount}
        changedFiles={changedFiles}
        durationMs={durationMs}
        startedAt={startedAt}
        statusWordSeed={message.id}
      />
      <div className="space-y-1">{children(effectiveExpanded)}</div>
      {stopNoticeCard}
    </>
  );
}
