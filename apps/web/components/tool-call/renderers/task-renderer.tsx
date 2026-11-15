"use client";

import { Check, ChevronRight, Loader2, XCircle } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import {
  getSubagentRoleTag,
  SubagentIcon,
} from "@/components/team/subagent-helpers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Dense, name-only inline tool-call row for subagent and /team calls.
 * Clicking opens the 1:1 SubagentThreadView; no big inline card in main chat.
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
  const output = hasOutput ? part.output : undefined;
  const isFailed = taskDenied || taskErrored || output?.status === "failed";
  const isRunning = state.running || isPreliminary;

  const canOpen = Boolean(gitPanel?.openSubagentTab && part.toolCallId);

  const handleOpen = () => {
    if (!canOpen) return;
    gitPanel?.openSubagentTab?.(part.toolCallId, title, subagentType);
  };

  return (
    <div className="my-0.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleOpen}
        disabled={!canOpen}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-xs text-foreground transition-colors duration-150",
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

        <span className="font-medium text-foreground">{roleName}</span>

        {canOpen && (
          <ChevronRight
            className="size-3 shrink-0 text-muted-foreground/70"
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
  );
}
