"use client";

import { formatTokens } from "@entry-agents/shared";
import { ArrowLeft, Bot, Square, Terminal } from "lucide-react";
import { useMemo } from "react";
import { StatusBadge, SubagentIcon } from "@/components/agent-hub/agent-status";
import { useNow } from "@/components/agent-hub/use-now";
import { Button } from "@/components/ui/button";
import { deriveSubagentTabData } from "@/lib/agent-hub/subagent-tab-data";
import { SubagentParentCard } from "./subagent-parent-card";
import {
  PendingSubagentToolItem,
  SubagentToolItem,
} from "./subagent-tool-item";

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function SubagentChatView({
  subagentId,
  messages,
  onClose,
  onStopRun,
}: {
  subagentId: string;
  messages: unknown;
  onClose: () => void;
  onStopRun?: () => void;
}) {
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

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Bot className="h-10 w-10 text-muted-foreground/60 mb-3" />
        <h3 className="text-base font-semibold">Subagent not found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          This subagent session may have expired or is not present in the
          current chat history.
        </p>
        <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Return to Main Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Subagent Top Control Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground"
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
            <span className="text-sm font-semibold truncate max-w-[200px] sm:max-w-md">
              {data.title}
            </span>
            <StatusBadge status={data.status} />
          </div>
        </div>

        {/* Live Metrics Pill & Stop Run Button */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 font-mono text-xs text-muted-foreground">
            {elapsed && <span>{elapsed}</span>}
            {data.toolCallCount !== null && (
              <>
                <span>·</span>
                <span>
                  {data.toolCallCount} tool{data.toolCallCount !== 1 ? "s" : ""}
                </span>
              </>
            )}
            {data.inputTokens !== null && (
              <>
                <span>·</span>
                <span>{formatTokens(data.inputTokens)} tokens</span>
              </>
            )}
          </div>

          {isLive && onStopRun && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopRun}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop run</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Streaming Body */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* 1. First thing displayed: Parent Model Message */}
          <SubagentParentCard
            task={data.title}
            instructions={data.instructions}
            subagentType={data.subagentType}
            modelId={data.modelId}
          />

          {/* 2. Subagent Execution Timeline */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Terminal className="h-3.5 w-3.5" />
              <span>Subagent Execution</span>
            </div>

            {/* Completed Tool Calls */}
            {data.completedParts.length > 0 && (
              <div className="space-y-1.5 pl-2 border-l-2 border-border/60">
                {data.completedParts.map((toolPart) => (
                  <SubagentToolItem key={toolPart.toolCallId} part={toolPart} />
                ))}
              </div>
            )}

            {/* Streaming in-flight Tool Call */}
            {data.pending && isLive && (
              <div
                key={`pending-${data.pending.name}`}
                className="pl-2 border-l-2 border-emerald-500/50"
                style={{ animation: "slide-up-fade 150ms ease-out both" }}
              >
                <PendingSubagentToolItem pending={data.pending} />
              </div>
            )}

            {/* Final Assistant Text / Output Deliverables */}
            {data.finalText && (
              <div className="rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap shadow-xs">
                {data.finalText}
              </div>
            )}

            {/* Clean Error Notice (no raw slop string) */}
            {data.errorText && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
                <p className="font-semibold">Subagent encountered an error</p>
                <p className="mt-1 text-xs">{data.errorText}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
