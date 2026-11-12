"use client";

import { formatTokens } from "@entry-agents/shared";
import type { LanguageModelUsage } from "ai";
import { AlertCircle, ArrowLeft, Check, Square } from "lucide-react";
import { useMemo } from "react";
import type {
  WebAgentUIMessage,
  WebAgentUIMessagePart,
  WebAgentUIToolPart,
} from "@/app/types";
import {
  StatusBadge,
  SubagentIcon,
  SubagentRoleBadge,
} from "@/components/agent-hub/agent-status";
import { useNow } from "@/components/agent-hub/use-now";
import { ChatMessageFeed } from "@/components/chat/chat-message-feed";
import { Button } from "@/components/ui/button";
import { deriveSubagentTabData } from "@/lib/agent-hub/subagent-tab-data";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export interface SubagentChatViewProps {
  subagentId: string;
  messages: unknown;
  onClose: () => void;
  onStopRun?: () => void;
}

/**
 * Read-only Subagent Chat View.
 * Shares the exact same ChatMessageFeed, streaming, and tool call rendering
 * components as normal chat so fixes, streaming improvements, and unslop styling
 * automatically apply across both.
 */
export function SubagentChatView({
  subagentId,
  messages,
  onClose,
  onStopRun,
}: SubagentChatViewProps) {
  const data = useMemo(
    () => deriveSubagentTabData(messages, subagentId),
    [messages, subagentId],
  );

  const isLive = data?.status === "running" || data?.status === "starting";
  const now = useNow(isLive && data?.startedAt !== null);
  const elapsed =
    data?.startedAt !== null && data?.startedAt !== undefined
      ? formatElapsed((isLive ? now : Date.now()) - data.startedAt)
      : null;

  // Transform subagent execution state into standard WebAgentUIMessage[]
  // so it renders with the identical pipeline as main session chat
  const subagentMessages = useMemo<WebAgentUIMessage[]>(() => {
    if (!data) return [];

    const msgs: WebAgentUIMessage[] = [];

    // 1. Parent model delegation instructions (User role in subagent conversation)
    const promptText = data.instructions?.trim()
      ? data.instructions
      : data.title;

    if (promptText) {
      msgs.push({
        id: `${subagentId}-prompt`,
        role: "user",
        parts: [
          {
            type: "text",
            text: promptText,
          },
        ],
      });
    }

    // 2. Subagent execution response (Assistant role in subagent conversation)
    const assistantParts: WebAgentUIMessagePart[] = [];

    // All executed tool calls (write, edit, bash, glob, search, etc.)
    for (const toolPart of data.completedParts) {
      assistantParts.push(toolPart);
    }

    // Pending in-flight tool call if actively running
    if (data.pending && isLive) {
      assistantParts.push({
        type: `tool-${data.pending.name}`,
        toolCallId: `pending-${data.pending.name}`,
        state: "input-available",
        input: data.pending.input,
      } as unknown as WebAgentUIToolPart);
    }

    // Streamed or completed text output
    if (data.finalText) {
      assistantParts.push({
        type: "text",
        text: data.finalText,
      });
    }

    if (assistantParts.length > 0 || isLive) {
      msgs.push({
        id: `${subagentId}-response`,
        role: "assistant",
        parts: assistantParts,
        metadata: {
          modelId: data.modelId ?? undefined,
          totalMessageUsage:
            data.inputTokens !== null
              ? ({
                  inputTokens: data.inputTokens,
                  outputTokens: data.outputTokens ?? undefined,
                  totalTokens:
                    (data.inputTokens ?? 0) + (data.outputTokens ?? 0),
                  inputTokenDetails: {
                    noCacheTokens: undefined,
                    cacheReadTokens: undefined,
                    cacheWriteTokens: undefined,
                  },
                  outputTokenDetails: {
                    textTokens: undefined,
                    reasoningTokens: undefined,
                  },
                } as LanguageModelUsage)
              : undefined,
        },
      });
    }

    return msgs;
  }, [data, isLive, subagentId]);

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <SubagentIcon
          type="agent"
          className="h-10 w-10 text-muted-foreground/60 mb-3"
        />
        <h3 className="text-base font-semibold">Subagent not found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          This subagent session may have expired or is not present in the
          current chat history.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="mt-4 transition-colors"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Return to Main Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* 1. Subagent Top Control Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to main chat"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline text-xs">Chat</span>
          </Button>

          <div className="h-4 w-px bg-border shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <SubagentIcon
              type={data.subagentType}
              className="h-4 w-4 shrink-0 text-foreground"
            />
            <span className="text-sm font-semibold truncate max-w-[180px] sm:max-w-md">
              {data.title}
            </span>
            <SubagentRoleBadge subagentType={data.subagentType} />
            <StatusBadge status={data.status} />
          </div>
        </div>

        {/* Live Metrics Pill & Stop Run Button */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {elapsed && <span className="tabular-nums">{elapsed}</span>}
            {data.toolCallCount !== null && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  {data.toolCallCount} tool{data.toolCallCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
            {data.inputTokens !== null && (
              <>
                <span>·</span>
                <span className="tabular-nums">
                  {formatTokens(data.inputTokens)} tokens
                </span>
              </>
            )}
          </div>

          {isLive && onStopRun && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopRun}
              className="h-7 px-2.5 text-xs gap-1 transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop run</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Scrollable Messages Timeline: Same Stream and UI as Main Chat */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <ChatMessageFeed
            messages={subagentMessages}
            isStreaming={isLive}
            readOnly={true}
            agentName={`Entry · ${data.title}`}
            agentIcon={
              <SubagentIcon
                type={data.subagentType}
                className="h-3 w-3 text-foreground"
              />
            }
            emptyStateMessage="No subagent events recorded"
          />

          {/* Clean Error Notice if subagent failed */}
          {data.errorText && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4" />
                <span>Subagent encountered an error</span>
              </div>
              <p className="mt-1 text-xs">{data.errorText}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Read-Only Status Footer (No prompt composer for user) */}
      <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-3 select-none">
        <div className="mx-auto max-w-4xl flex items-center justify-between text-xs text-muted-foreground">
          {isLive ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/50" />
              <span>Subagent running autonomously · Read-only view</span>
            </div>
          ) : data.status === "failed" ? (
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Subagent execution stopped</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                Subagent execution complete · Output returned to main agent
              </span>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Return to chat
          </Button>
        </div>
      </div>
    </div>
  );
}
