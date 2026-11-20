"use client";

import { Check, ChevronRight, Loader2, XCircle } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import {
  getSubagentRoleTag,
  SubagentIcon,
} from "@/components/team/subagent-helpers";
import { Button } from "@/components/ui/button";
import { formatAgentLine } from "@/lib/agent-hub/agent-line";
import { cn } from "@/lib/utils";

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
            "inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5 text-xs text-foreground transition-colors duration-150",
            canOpen
              ? "cursor-pointer hover:border-border hover:bg-muted/60"
              : "cursor-default",
          )}
        >
          {isRunning ? (
            <Loader2
              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
              strokeWidth={1.5}
            />
          ) : isFailed ? (
            <XCircle
              className="size-3.5 shrink-0 text-destructive"
              strokeWidth={1.5}
            />
          ) : (
            <Check
              className="size-3.5 shrink-0 text-emerald-500"
              strokeWidth={1.75}
            />
          )}

          <SubagentIcon
            subagentType={subagentType}
            className="size-3.5 shrink-0 text-muted-foreground"
          />

          <span className="font-medium text-foreground shrink-0">
            {roleName}
          </span>
          {title !== roleName && (
            <>
              <span className="text-muted-foreground/60" aria-hidden="true">
                ·
              </span>
              <span className="truncate text-muted-foreground max-w-[320px]">
                {title}
              </span>
            </>
          )}

          {canOpen && (
            <ChevronRight
              className="size-3 shrink-0 text-muted-foreground/70 ml-0.5"
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
            <span className="truncate block">{liveTicker}</span>
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
