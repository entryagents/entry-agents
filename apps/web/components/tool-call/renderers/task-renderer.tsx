"use client";

import type { TaskPendingToolCall } from "@entry-agents/agent";
import { formatTokens } from "@entry-agents/shared";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronRight,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import { SubagentIcon } from "@/components/agent-hub/agent-status";
import { useNow } from "@/components/agent-hub/use-now";
import {
  getSubagentRoleTag,
  getSubagentToolSummary,
  PendingSubagentToolItem,
  SubagentToolItem,
} from "@/components/subagent-chat/subagent-tool-item";
import { Button } from "@/components/ui/button";
import {
  extractConciseTaskSummary,
  extractSubagentToolParts,
  formatSubagentElapsed,
  formatSubagentModelTag,
} from "@/lib/agent-hub/subagent-tab-data";
import { extractCachedInputTokens } from "@/lib/chat/usage-extract";
import { cn } from "@/lib/utils";

function countToolCalls(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  return messages.filter(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      (message as { role?: string }).role === "tool",
  ).length;
}

function formatLatestStreamLine(streamedText: unknown): string | null {
  if (typeof streamedText !== "string") return null;
  const lines = streamedText
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line.length > 0 && line !== "---");
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1] ?? "";
  return last.length > 96 ? `${last.slice(0, 93)}...` : last;
}

// ---------------------------------------------------------------------------
// TaskRenderer — Flush Hairline Execution Trace Strip
// ---------------------------------------------------------------------------

export function TaskRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-task">) {
  const input = part.input;
  const desc = input?.task ?? "Subagent task";
  const subagentType = input?.subagentType;
  const roleTag = getSubagentRoleTag(subagentType);
  const taskApprovalRequested = part.state === "approval-requested";
  const taskDenied = part.state === "output-denied";
  const taskErrored = part.state === "output-error";

  const hasOutput = part.state === "output-available";
  const isPreliminary = hasOutput && part.preliminary === true;
  const isComplete = hasOutput && !isPreliminary;
  const output = hasOutput ? part.output : undefined;
  const isFailed = taskDenied || taskErrored || output?.status === "failed";
  const isRunning = state.running || isPreliminary;

  const pendingToolCall: TaskPendingToolCall | null = output?.pending ?? null;
  const completedParts = extractSubagentToolParts(
    output?.final,
    output?.executedTools,
  );
  const toolCount =
    output?.toolCallCount ??
    (completedParts.length > 0
      ? completedParts.length
      : countToolCalls(output?.final));
  const inputTokens = output?.usage?.inputTokens ?? null;
  const cachedTokens = extractCachedInputTokens(output?.usage);
  const cacheHitPct =
    inputTokens && inputTokens > 0 && cachedTokens > 0
      ? Math.min(100, Math.round((cachedTokens / inputTokens) * 100))
      : null;

  const startedAt =
    typeof output?.startedAt === "number" ? output.startedAt : null;
  const completedAt =
    typeof (output as { completedAt?: unknown } | undefined)?.completedAt ===
    "number"
      ? (output as { completedAt: number }).completedAt
      : null;
  const now = useNow(isRunning && startedAt !== null);
  const elapsedLabel =
    isRunning && startedAt !== null
      ? formatSubagentElapsed(now - startedAt)
      : completedAt !== null && startedAt !== null
        ? formatSubagentElapsed(completedAt - startedAt)
        : null;

  const modelTag = formatSubagentModelTag(output?.modelId ?? null);
  const summaryPreview = extractConciseTaskSummary(
    output?.final,
    output?.streamedText,
    140,
  );

  const [stepsExpanded, setStepsExpanded] = useState(false);
  const gitPanel = useOptionalGitPanel();

  const liveActivityLine = isRunning
    ? pendingToolCall
      ? `${pendingToolCall.name} ${getSubagentToolSummary(pendingToolCall.name, pendingToolCall.input)}`.trim()
      : formatLatestStreamLine(output?.streamedText)
    : null;

  const hasSteps =
    completedParts.length > 0 || (Boolean(pendingToolCall) && !isComplete);

  const openFullTrace = () => {
    if (!gitPanel) return;
    gitPanel.openSubagentTab(part.toolCallId, desc, subagentType);
  };

  return (
    <div
      className={cn(
        "my-1 min-w-0 border-l-2 py-0.5 pl-3 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isFailed
          ? "border-l-destructive/75"
          : isRunning
            ? "border-l-foreground/45"
            : "border-l-border hover:border-l-foreground/35",
      )}
    >
      {/* Primary Single-Row Trace Header */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (hasSteps) {
              setStepsExpanded((prev) => !prev);
            } else {
              openFullTrace();
            }
          }}
          aria-expanded={hasSteps ? stepsExpanded : undefined}
          className="-mx-1.5 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {/* Status / Expand Indicator */}
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
            {hasSteps ? (
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  stepsExpanded && "rotate-90 text-foreground",
                )}
                strokeWidth={1.5}
              />
            ) : taskDenied ? (
              <XCircle
                className="h-3.5 w-3.5 text-destructive"
                strokeWidth={1.5}
              />
            ) : isFailed ? (
              <AlertCircle
                className="h-3.5 w-3.5 text-destructive"
                strokeWidth={1.5}
              />
            ) : isComplete ? (
              <Check
                className="h-3.5 w-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </span>

          {/* Role Token (unboxed inline monospace) */}
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-medium text-foreground/85">
            <SubagentIcon
              type={subagentType ?? "agent"}
              className="h-3.5 w-3.5 text-muted-foreground"
            />
            <span>@{roleTag}</span>
          </span>

          {/* Task Title */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] font-medium",
              isFailed ? "text-destructive" : "text-foreground",
            )}
          >
            {desc}
          </span>
        </button>

        {/* Tabular Telemetry + Direct Trace Link */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {elapsedLabel && <span>{elapsedLabel}</span>}
            {toolCount > 0 && (
              <span>
                {elapsedLabel ? "· " : ""}
                {toolCount} {toolCount === 1 ? "step" : "steps"}
              </span>
            )}
            {inputTokens !== null && (
              <span className="hidden sm:inline">
                · {formatTokens(inputTokens)} tok
              </span>
            )}
            {cacheHitPct !== null && (
              <span
                className="hidden text-muted-foreground/80 md:inline"
                title={`${formatTokens(cachedTokens)} cached input tokens`}
              >
                · {cacheHitPct}% cached
              </span>
            )}
            {modelTag && (
              <span
                className="hidden max-w-[120px] truncate text-muted-foreground/70 lg:inline"
                title={output?.modelId ?? undefined}
              >
                · {modelTag}
              </span>
            )}
          </div>

          {gitPanel && (
            <button
              type="button"
              onClick={openFullTrace}
              aria-label={`Open full trace for ${desc}`}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
            >
              <span>Open</span>
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Live Single-Line Ticker (while running and collapsed) */}
      {liveActivityLine && !stepsExpanded && (
        <div className="flex min-w-0 items-center gap-1.5 py-0.5 pl-6 font-mono text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate">{liveActivityLine}</span>
        </div>
      )}

      {/* Concise Outcome Line (when complete/failed and collapsed) */}
      {!isRunning && summaryPreview && !stepsExpanded && (
        <p
          className={cn(
            "truncate py-0.5 pl-6 text-xs",
            isFailed ? "text-destructive/90" : "text-muted-foreground",
          )}
        >
          {summaryPreview}
        </p>
      )}

      {/* Inline Approval Controls */}
      {taskApprovalRequested && state.approvalId && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/25 px-2.5 py-1.5 text-xs">
          <span className="text-muted-foreground">
            {subagentType === "executor"
              ? "Executor subagent requests write and shell access"
              : "Approve subagent task execution"}
          </span>
          <div className="flex items-center gap-1.5">
            {onDeny && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => state.approvalId && onDeny(state.approvalId)}
                className="h-6 px-2 text-xs active:scale-[0.97]"
              >
                Deny
              </Button>
            )}
            {onApprove && (
              <Button
                size="sm"
                onClick={() => state.approvalId && onApprove(state.approvalId)}
                className="h-6 px-2.5 text-xs active:scale-[0.97]"
              >
                Approve
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Expanded Step Ledger */}
      {stepsExpanded && hasSteps && (
        <div className="mt-1.5 space-y-0.5 border-l border-border/50 pl-2">
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {completedParts.map((toolPart) => (
              <SubagentToolItem key={toolPart.toolCallId} part={toolPart} />
            ))}
            {pendingToolCall && !isComplete && (
              <PendingSubagentToolItem pending={pendingToolCall} />
            )}
          </div>
          {gitPanel && (
            <button
              type="button"
              onClick={openFullTrace}
              className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/50 hover:text-foreground"
            >
              <span>Inspect full trace</span>
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
