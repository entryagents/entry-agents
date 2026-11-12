"use client";

import { formatTokens } from "@entry-agents/shared";
import { ArrowLeft, Bot, CornerDownLeft, Square, Terminal } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  StatusBadge,
  SubagentIcon,
  SubagentRoleBadge,
} from "@/components/agent-hub/agent-status";
import { useNow } from "@/components/agent-hub/use-now";
import { StreamingMarkdown } from "@/components/streaming-markdown";
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
  onSteerSubagent,
}: {
  subagentId: string;
  messages: unknown;
  onClose: () => void;
  onStopRun?: () => void;
  onSteerSubagent?: (
    subagentId: string,
    instruction: string,
    subagentTitle?: string,
  ) => void;
}) {
  const [steerInput, setSteerInput] = useState("");
  const [isSubmittingSteer, setIsSubmittingSteer] = useState(false);

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

  const handleSteerSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = steerInput.trim();
      if (!trimmed || !onSteerSubagent || isSubmittingSteer) return;

      setIsSubmittingSteer(true);
      try {
        onSteerSubagent(subagentId, trimmed, data?.title);
        setSteerInput("");
      } finally {
        setIsSubmittingSteer(false);
      }
    },
    [steerInput, onSteerSubagent, isSubmittingSteer, subagentId, data?.title],
  );

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Bot className="h-10 w-10 text-muted-foreground/60 mb-3" />
        <h3 className="text-base font-semibold">Subagent not found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          This subagent session may have expired or is not present in the
          current chat history.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="mt-4 active:scale-[0.97] transition-transform"
        >
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
            className="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground active:scale-[0.97] transition-transform"
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
              className="h-7 px-2.5 text-xs gap-1 active:scale-[0.97] transition-transform"
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
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5" />
                <span>Subagent execution trace</span>
              </span>
              {data.completedParts.length > 0 && (
                <span className="font-mono text-[11px] font-normal">
                  {data.completedParts.length} step
                  {data.completedParts.length !== 1 ? "s" : ""}
                </span>
              )}
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

            {/* Live Streaming Assistant Output with Syntax-Highlighted Markdown */}
            {data.finalText && (
              <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-colors">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50 text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    Output and findings
                  </span>
                  {isLive && (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live streaming
                    </span>
                  )}
                </div>
                <div className="text-sm leading-relaxed text-foreground">
                  <StreamingMarkdown
                    content={data.finalText}
                    isStreaming={isLive}
                  />
                </div>
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

      {/* 3. Interactive Steering Composer Bar */}
      {onSteerSubagent && (
        <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur-md p-3 sm:p-4">
          <div className="mx-auto max-w-4xl space-y-2">
            {/* Quick steer chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs text-muted-foreground">
              <span className="text-[11px] font-medium shrink-0">
                Quick steer:
              </span>
              <button
                type="button"
                onClick={() =>
                  setSteerInput(
                    "Summarize your progress and key discoveries so far",
                  )
                }
                className="shrink-0 rounded-full border border-border bg-muted/40 hover:bg-muted px-2.5 py-1 text-[11px] transition-colors active:scale-[0.97]"
              >
                Summarize findings
              </button>
              <button
                type="button"
                onClick={() =>
                  setSteerInput(
                    "Focus only on modified files and avoid broad file walks",
                  )
                }
                className="shrink-0 rounded-full border border-border bg-muted/40 hover:bg-muted px-2.5 py-1 text-[11px] transition-colors active:scale-[0.97]"
              >
                Focus on modified files
              </button>
              <button
                type="button"
                onClick={() =>
                  setSteerInput("Verify unit tests pass before completing")
                }
                className="shrink-0 rounded-full border border-border bg-muted/40 hover:bg-muted px-2.5 py-1 text-[11px] transition-colors active:scale-[0.97]"
              >
                Verify tests
              </button>
            </div>

            {/* Input + Action */}
            <form
              onSubmit={handleSteerSubmit}
              className="relative flex items-center rounded-xl border border-border bg-muted/30 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-colors"
            >
              <textarea
                value={steerInput}
                onChange={(e) => setSteerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSteerSubmit(e);
                  }
                }}
                rows={1}
                placeholder={`Steer ${data.title}... (Press Enter to send)`}
                className="flex-1 bg-transparent px-3.5 py-2.5 text-sm resize-none focus:outline-hidden placeholder:text-muted-foreground/60 min-h-[40px] max-h-32"
              />
              <div className="pr-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!steerInput.trim() || isSubmittingSteer}
                  className="h-8 px-3 text-xs gap-1.5 active:scale-[0.97] transition-transform"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Steer</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
