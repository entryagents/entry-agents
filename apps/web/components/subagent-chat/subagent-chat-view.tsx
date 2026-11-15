"use client";

import { formatTokens } from "@entry-agents/shared";
import type { LanguageModelUsage } from "ai";
import { extractCachedInputTokens } from "@/lib/chat/usage-extract";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  Square,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

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
 * Focused Subagent Execution Trace Inspector.
 * Presents a collapsible Delegation Brief header so the subagent's live tool
 * execution and final deliverable are immediately visible above the fold.
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
  const [briefExpanded, setBriefExpanded] = useState(false);

  const isLive = data?.status === "running" || data?.status === "starting";
  const now = useNow(isLive && data?.startedAt !== null);
  const elapsed =
    data?.startedAt !== null && data?.startedAt !== undefined
      ? formatElapsed((isLive ? now : Date.now()) - data.startedAt)
      : null;

  // Transform subagent execution into a focused assistant execution trace message
  const subagentMessages = useMemo<WebAgentUIMessage[]>(() => {
    if (!data) return [];

    const assistantParts: WebAgentUIMessagePart[] = [];

    for (const toolPart of data.completedParts) {
      assistantParts.push(toolPart);
    }

    if (data.pending && isLive) {
      assistantParts.push({
        type: `tool-${data.pending.name}`,
        toolCallId: `pending-${data.pending.name}`,
        state: "input-available",
        input: data.pending.input,
      } as unknown as WebAgentUIToolPart);
    }

    if (data.finalText) {
      assistantParts.push({
        type: "text",
        text: data.finalText,
      });
    }

    if (assistantParts.length === 0 && !isLive) {
      return [];
    }

    return [
      {
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
      },
    ];
  }, [data, isLive, subagentId]);

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <SubagentIcon
          type="agent"
          className="mb-3 h-8 w-8 text-muted-foreground/60"
        />
        <h3 className="text-sm font-semibold">Subagent trace unavailable</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          This subagent run is not present in the current chat history.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="mt-4 h-8 text-xs transition-colors"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
          Return to chat
        </Button>
      </div>
    );
  }

  const promptText = data.instructions?.trim() || data.title;
  const cachedTokens = extractCachedInputTokens(
    subagentMessages[0]?.metadata?.totalMessageUsage,
  );
  const cacheHitPct =
    data.inputTokens && data.inputTokens > 0 && cachedTokens > 0
      ? Math.min(100, Math.round((cachedTokens / data.inputTokens) * 100))
      : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* 1. Compact Instrument Header Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 select-none sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="-ml-1.5 h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to main chat"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Back</span>
          </Button>

          <div className="h-3.5 w-px shrink-0 bg-border" />

          <SubagentRoleBadge subagentType={data.subagentType} />

          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground sm:text-sm">
            {data.title}
          </span>

          <StatusBadge status={data.status} size="sm" />
        </div>

        {/* Right Telemetry & Stop Control */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {data.modelId && (
              <span className="hidden rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground/80 lg:inline-block">
                {data.modelId}
              </span>
            )}
            {elapsed && <span>{elapsed}</span>}
            {data.toolCallCount !== null && (
              <>
                {elapsed && <span>·</span>}
                <span>
                  {data.toolCallCount}{" "}
                  {data.toolCallCount === 1 ? "step" : "steps"}
                </span>
              </>
            )}
            {data.inputTokens !== null && (
              <span className="hidden sm:inline">
                · {formatTokens(data.inputTokens)} tok
              </span>
            )}
            {cacheHitPct !== null && (
              <span className="hidden rounded border border-border/70 bg-muted/50 px-1 py-0.2 text-[10px] text-foreground/80 md:inline-block">
                {cacheHitPct}% cached
              </span>
            )}
          </div>

          {isLive && onStopRun && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopRun}
              className="h-7 gap-1 px-2.5 text-xs transition-colors"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Scrollable Execution Trace Body */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {/* Collapsible Delegation Brief Card */}
          {promptText && (
            <div className="rounded-lg border border-border/80 bg-muted/20">
              <button
                type="button"
                onClick={() => setBriefExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                      briefExpanded && "rotate-90 text-foreground",
                    )}
                    strokeWidth={1.5}
                  />
                  <FileText
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <span className="font-medium text-foreground">
                    Delegation brief
                  </span>
                  {!briefExpanded && (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      — {promptText.replace(/\s+/g, " ")}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {briefExpanded ? "Hide" : "View brief"}
                </span>
              </button>

              {briefExpanded && (
                <div className="border-t border-border/60 bg-background/50 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {promptText}
                </div>
              )}
            </div>
          )}

          {/* Subagent Execution Trace & Deliverable */}
          <ChatMessageFeed
            messages={subagentMessages}
            isStreaming={isLive}
            readOnly={true}
            agentName={`@${data.subagentType}`}
            agentIcon={
              <SubagentIcon
                type={data.subagentType}
                className="h-3 w-3 text-foreground"
              />
            }
            emptyStateMessage="Waiting for subagent tool execution"
          />

          {/* Error Notice if subagent failed */}
          {data.errorText && (
            <div className="rounded-lg border border-destructive/35 bg-destructive/[0.04] p-3 text-xs text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Subagent encountered an error</span>
              </div>
              <p className="mt-1 text-muted-foreground">{data.errorText}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Compact Status Footer */}
      <div className="shrink-0 border-t border-border bg-card/40 px-3 py-2 select-none sm:px-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 text-xs text-muted-foreground">
          {isLive ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Subagent running autonomously</span>
            </div>
          ) : data.status === "failed" ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Subagent execution stopped</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Check
                className="h-3.5 w-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span>Deliverable returned to main agent</span>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Return to chat
          </Button>
        </div>
      </div>
    </div>
  );
}
