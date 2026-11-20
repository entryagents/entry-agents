"use client";

import { ArrowLeft, Check, GitBranch, Loader2, XCircle } from "lucide-react";
import { useMemo } from "react";
import type { WebAgentUIMessage, WebAgentUIMessagePart } from "@/app/types";
import { ChatMessageFeed } from "@/components/chat/chat-message-feed";
import { Button } from "@/components/ui/button";
import {
  deriveSubagentTabData,
  formatSubagentElapsed,
  formatSubagentModelTag,
  type SubagentTabData,
} from "@/lib/agent-hub/subagent-tab-data";
import { getSubagentRoleTag, SubagentIcon, useNow } from "./subagent-helpers";

/**
 * Convert a SubagentTabData snapshot into a 1:1 WebAgentUIMessage[] pair
 * so the subagent thread renders through the exact same ChatMessageFeed
 * pipeline (markdown, diffs, tool renderers, reasoning) as the main chat.
 */
export function buildSubagentThreadMessages(
  subagent: SubagentTabData,
): WebAgentUIMessage[] {
  const userMessage: WebAgentUIMessage = {
    id: `${subagent.id}-user`,
    role: "user",
    parts: [
      {
        type: "text",
        text: subagent.instructions || subagent.title,
      },
    ],
  };

  const assistantParts: WebAgentUIMessagePart[] = [
    ...(subagent.completedParts as WebAgentUIMessagePart[]),
  ];

  if (subagent.pending) {
    const pendingPart: WebAgentUIMessagePart = {
      type: `tool-${subagent.pending.name}`,
      toolCallId: `${subagent.id}-pending`,
      state: "input-available",
      input: subagent.pending.input,
    } as WebAgentUIMessagePart;
    assistantParts.push(pendingPart);
  }

  const hasTextInCompleted = assistantParts.some(
    (p) => p.type === "text" && p.text.trim().length > 0,
  );

  if (
    !hasTextInCompleted &&
    subagent.finalText &&
    subagent.finalText.trim().length > 0
  ) {
    assistantParts.push({
      type: "text",
      text: subagent.finalText,
    });
  } else if (subagent.errorText && subagent.errorText.trim().length > 0) {
    assistantParts.push({
      type: "text",
      text: subagent.errorText,
    });
  }

  if (assistantParts.length === 0) {
    return [userMessage];
  }

  const assistantMessage: WebAgentUIMessage = {
    id: `${subagent.id}-assistant`,
    role: "assistant",
    parts: assistantParts,
  };

  return [userMessage, assistantMessage];
}

export interface SubagentThreadViewProps {
  subagentId: string;
  messages: WebAgentUIMessage[];
  isParentStreaming?: boolean;
  onOpenFile?: (filePath: string) => void;
  onClose: () => void;
  onStopRun?: () => void;
  onApproveTool?: (approvalId: string) => void;
  onDenyTool?: (approvalId: string) => void;
}

export function SubagentThreadView({
  subagentId,
  messages,
  isParentStreaming,
  onOpenFile,
  onClose,
  onStopRun: _onStopRun,
  onApproveTool,
  onDenyTool,
}: SubagentThreadViewProps) {
  const data = useMemo(
    () => deriveSubagentTabData(messages, subagentId, { isParentStreaming }),
    [messages, subagentId, isParentStreaming],
  );

  const isLive =
    data?.status === "starting" ||
    data?.status === "running" ||
    data?.status === "awaiting-approval";
  const now = useNow(isLive);

  const threadMessages = useMemo(
    () => (data ? buildSubagentThreadMessages(data) : []),
    [data],
  );

  const roleName = getSubagentRoleTag(data?.subagentType);
  const modelTag = formatSubagentModelTag(data?.modelId ?? null);
  const elapsedEndMs = data?.completedAt ?? (isLive ? now : null);
  const elapsedMs =
    data?.startedAt != null && elapsedEndMs != null
      ? Math.max(0, elapsedEndMs - data.startedAt)
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Compact view-only header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-background/95 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.5} />
            <span>Back</span>
          </Button>
          <span className="h-4 w-px bg-border/80" aria-hidden="true" />
          <SubagentIcon
            subagentType={data?.subagentType}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate text-sm font-medium text-foreground">
            {roleName}
          </span>
          {data?.status === "completed" ? (
            <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <Check className="size-3 text-emerald-500" strokeWidth={1.75} />
              Done
            </span>
          ) : data?.status === "failed" || data?.status === "denied" ? (
            <span className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
              <XCircle className="size-3" strokeWidth={1.5} />
              Failed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground">
              <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
              Running
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted-foreground tabular-nums">
          {data?.worktreeBranch && (
            <span className="hidden items-center gap-1 rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] sm:inline-flex">
              <GitBranch className="size-3" strokeWidth={1.5} />
              <span className="max-w-[140px] truncate">
                {data.worktreeBranch}
              </span>
            </span>
          )}
          {data?.toolCallCount != null && data.toolCallCount > 0 && (
            <span className="hidden sm:inline">
              {data.toolCallCount} tool{data.toolCallCount === 1 ? "" : "s"}
            </span>
          )}
          {modelTag && <span className="hidden sm:inline">{modelTag}</span>}
          {elapsedMs !== null && (
            <span>{formatSubagentElapsed(elapsedMs)}</span>
          )}
          <span className="hidden rounded border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] sm:inline">
            Read-only
          </span>
        </div>
      </div>

      {/* 1:1 Main-chat identical feed */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8">
          {data ? (
            <div className="space-y-6">
              <ChatMessageFeed
                messages={threadMessages}
                isStreaming={isLive}
                onOpenFile={onOpenFile}
                onApproveTool={onApproveTool}
                onDenyTool={onDenyTool}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Subagent thread unavailable.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
