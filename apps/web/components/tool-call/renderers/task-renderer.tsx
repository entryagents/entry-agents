"use client";

import { ChevronRight, Loader2, XCircle } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import {
  getSubagentRoleTag,
  SubagentIcon,
} from "@/components/team/subagent-helpers";
import { Button } from "@/components/ui/button";
import { formatAgentLine } from "@/lib/agent-hub/agent-line";
import { cn } from "@/lib/utils";
import "../agent-row.css";

/**
 * Sable-style subagent block: header row (role · task + chevron to open SubagentThreadView)
 * with a live step ticker while running and a crisp "Done · N steps · Xk tokens" hairline
 * summary when settled.
 */
export function TaskRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-task">) {
  const gitPanel = useOptionalGitPanel();
  const input = part.input;
  const subagentType = input?.subagentType;
  const roleName = getSubagentRoleTag(subagentType);
  const title = input?.task ?? roleName;

  const taskApprovalRequested = part.state === "approval-requested";
  const taskDenied = part.state === "output-denied";
  const taskErrored = part.state === "output-error";
  const hasOutput = part.state === "output-available";
  const isPreliminary = hasOutput && part.preliminary === true;
  const output = hasOutput
    ? (part.output as Record<string, unknown> | undefined)
    : undefined;
  const isInterrupted = state.interrupted || (isPreliminary && !state.running);
  const isFailed =
    taskDenied || taskErrored || output?.status === "failed" || isInterrupted;
  const isRunning = state.running;

  const toolCallCount =
    typeof output?.toolCallCount === "number" ? output.toolCallCount : null;
  const inputTokens =
    typeof output?.inputTokens === "number" ? output.inputTokens : null;
  const outputTokens =
    typeof output?.outputTokens === "number" ? output.outputTokens : null;
  const pending =
    output?.pending && typeof output.pending === "object"
      ? (output.pending as { name?: string })
      : null;
  const streamedText =
    typeof output?.streamedText === "string" ? output.streamedText : null;

  const line = formatAgentLine({
    status: typeof output?.status === "string" ? output.status : undefined,
    isRunning,
    isFailed,
    toolCallCount,
    inputTokens,
    outputTokens,
  });

  const liveTicker =
    isRunning && pending?.name
      ? `Running ${pending.name}…`
      : isRunning && streamedText
        ? streamedText.trim().split("\n").at(-1)?.slice(0, 120)
        : null;

  const canOpen = Boolean(gitPanel?.openSubagentTab && part.toolCallId);

  const handleOpen = () => {
    if (!canOpen) return;
    gitPanel?.openSubagentTab?.(part.toolCallId, title, subagentType);
  };

  return (
    <div className="my-1 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleOpen}
          disabled={!canOpen}
          className={cn(
            "group -mx-1.5 flex min-h-[25px] max-w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[12.5px] text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
            canOpen
              ? "cursor-pointer hover:bg-muted/40 hover:text-foreground active:bg-muted/60"
              : "cursor-default",
          )}
        >
          <span className="flex size-4 shrink-0 items-center justify-center transition-transform duration-150 group-hover:-translate-y-px">
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
            ) : isFailed ? (
              <XCircle
                className="size-3.5 text-destructive"
                strokeWidth={1.5}
              />
            ) : (
              <SubagentIcon
                subagentType={subagentType}
                className="size-3.5 shrink-0"
              />
            )}
          </span>

          <span className="shrink-0 text-foreground/90">{roleName}</span>
          {title !== roleName && (
            <>
              <span className="text-muted-foreground/60" aria-hidden="true">
                ·
              </span>
              <span className="min-w-0 truncate">{title}</span>
            </>
          )}

          {isRunning && toolCallCount ? (
            <span className="ml-auto shrink-0 pl-2 text-[11.5px] tabular-nums">
              {toolCallCount} {toolCallCount === 1 ? "step" : "steps"}
            </span>
          ) : null}

          {canOpen && (
            <ChevronRight
              className={cn(
                "size-2.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
                !(isRunning && toolCallCount) && "ml-auto",
              )}
              strokeWidth={1.5}
            />
          )}
        </button>

        {taskApprovalRequested && part.approval?.id && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-6 px-2 text-xs"
              onClick={() => onApprove?.(part.approval!.id)}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => onDeny?.(part.approval!.id)}
            >
              Deny
            </Button>
          </div>
        )}
      </div>

      {(liveTicker || !isRunning) && (
        <div className="ml-2.5 border-l border-border/70 pl-2.5 text-[11.5px] tabular-nums text-muted-foreground">
          {liveTicker ? (
            <span className="shimmer block truncate">{liveTicker}</span>
          ) : (
            <span
              className={line.tone === "error" ? "text-destructive" : undefined}
            >
              {[line.state, ...line.parts].join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
