"use client";

import { formatTokens } from "@entry-agents/shared";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Square,
} from "lucide-react";
import { useState } from "react";
import { SubagentIcon } from "@/components/agent-hub/agent-status";
import { useNow } from "@/components/agent-hub/use-now";
import { StreamingMarkdown } from "@/components/streaming-markdown";
import { Button } from "@/components/ui/button";
import {
  deriveSubagentTabData,
  formatSubagentElapsed,
  formatSubagentModelTag,
  type SubagentStatus,
} from "@/lib/agent-hub/subagent-tab-data";
import { cn } from "@/lib/utils";
import {
  getSubagentRoleTag,
  PendingSubagentToolItem,
  SubagentToolItem,
} from "./subagent-tool-item";

const STATUS_DISPLAY: Record<
  SubagentStatus,
  { label: string; dot: string; text: string }
> = {
  starting: {
    label: "Starting",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  running: {
    label: "Running",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  "awaiting-approval": {
    label: "Approval needed",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  completed: {
    label: "Done",
    dot: "bg-muted-foreground/60",
    text: "text-muted-foreground",
  },
  failed: {
    label: "Failed",
    dot: "bg-destructive",
    text: "text-destructive",
  },
  denied: {
    label: "Stopped",
    dot: "bg-destructive",
    text: "text-destructive",
  },
};

export interface SubagentChatViewProps {
  subagentId: string;
  messages: unknown;
  onClose: () => void;
  onStopRun?: () => void;
}

/**
 * Focused Subagent Execution Trace Inspector.
 * Shares the same hairline execution-rail grammar as inline `TaskRenderer`
 * so transitioning from chat to full trace feels seamless and immediately legible.
 */
export function SubagentChatView({
  subagentId,
  messages,
  onClose,
  onStopRun,
}: SubagentChatViewProps) {
  const data = deriveSubagentTabData(messages, subagentId);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(true);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [copiedSession, setCopiedSession] = useState(false);

  const isLive = data?.status === "running" || data?.status === "starting";
  const now = useNow(isLive && data?.startedAt !== null);

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <SubagentIcon
          type="agent"
          className="mb-3 h-7 w-7 text-muted-foreground/60"
        />
        <h3 className="text-sm font-medium text-foreground">
          Subagent trace unavailable
        </h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          This subagent run is not present in the current chat history.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="mt-4 h-8 text-xs active:scale-[0.97]"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
          Return to chat
        </Button>
      </div>
    );
  }

  const roleTag = getSubagentRoleTag(data.subagentType);
  const statusInfo = STATUS_DISPLAY[data.status];
  const elapsed =
    isLive && data.startedAt !== null
      ? formatSubagentElapsed(now - data.startedAt)
      : data.completedAt !== null && data.startedAt !== null
        ? formatSubagentElapsed(data.completedAt - data.startedAt)
        : null;

  const modelTag = formatSubagentModelTag(data.modelId);
  const promptText = data.instructions.trim() || data.title;
  const cacheHitPct =
    data.inputTokens &&
    data.inputTokens > 0 &&
    data.cachedInputTokens &&
    data.cachedInputTokens > 0
      ? Math.min(
          100,
          Math.round((data.cachedInputTokens / data.inputTokens) * 100),
        )
      : null;

  const hasSteps =
    data.completedParts.length > 0 || (isLive && Boolean(data.pending));
  const stepCount =
    data.toolCallCount ??
    data.completedParts.length + (isLive && data.pending ? 1 : 0);

  const handleCopyOutput = async () => {
    if (
      !data.finalText ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(data.finalText);
      setCopiedOutput(true);
      window.setTimeout(() => setCopiedOutput(false), 1800);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  const handleCopySession = async () => {
    if (
      !data.sessionId ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(data.sessionId);
      setCopiedSession(true);
      window.setTimeout(() => setCopiedSession(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* 1. Compact Instrument Header Bar */}
      <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/95 px-3 py-1.5 backdrop-blur-xs select-none sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="-ml-1.5 h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground transition-[transform,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground active:scale-[0.97]"
            aria-label="Back to main chat"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Back</span>
          </Button>

          <div className="h-3.5 w-px shrink-0 bg-border/80" />

          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs font-medium text-foreground/90">
            <SubagentIcon
              type={data.subagentType}
              className="h-3.5 w-3.5 text-muted-foreground"
            />
            <span>@{roleTag}</span>
          </span>

          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
            {data.title}
          </span>
        </div>

        {/* Right Telemetry + Controls */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] font-medium tabular-nums",
              statusInfo.text,
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                statusInfo.dot,
              )}
            />
            <span>{statusInfo.label}</span>
          </span>

          <div className="hidden items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums sm:flex">
            {modelTag && (
              <span
                className="hidden max-w-[140px] truncate text-muted-foreground/80 lg:inline"
                title={data.modelId ?? undefined}
              >
                {modelTag} ·
              </span>
            )}
            {elapsed && <span>{elapsed} ·</span>}
            <span>
              {stepCount} {stepCount === 1 ? "step" : "steps"}
            </span>
            {data.inputTokens !== null && (
              <span>· {formatTokens(data.inputTokens)} in</span>
            )}
            {cacheHitPct !== null && (
              <span
                className="hidden md:inline"
                title={`${formatTokens(data.cachedInputTokens ?? 0)} cached tokens`}
              >
                · {cacheHitPct}% cached
              </span>
            )}
          </div>

          {isLive && onStopRun && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopRun}
              className="h-7 gap-1 px-2 text-xs active:scale-[0.97]"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop</span>
            </Button>
          )}
        </div>
      </header>

      {/* 2. Collapsible Delegation Brief Bar */}
      {promptText && (
        <div className="shrink-0 border-b border-border/60 bg-muted/15">
          <button
            type="button"
            onClick={() => setBriefExpanded((prev) => !prev)}
            aria-expanded={briefExpanded}
            className="flex h-8 w-full items-center justify-between gap-2 px-3 text-left text-xs transition-colors duration-150 hover:bg-muted/35 sm:px-4"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  briefExpanded && "rotate-90 text-foreground",
                )}
                strokeWidth={1.5}
              />
              <FileText
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="shrink-0 font-medium text-foreground/85">
                Brief
              </span>
              {!briefExpanded && (
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {promptText.replace(/\s+/g, " ")}
                </span>
              )}
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {briefExpanded ? "Hide" : "Expand"}
            </span>
          </button>

          {briefExpanded && (
            <div className="max-h-56 overflow-y-auto border-t border-border/50 bg-background/60 px-3 py-3 text-xs text-muted-foreground sm:px-6">
              <div className="mx-auto max-w-3xl">
                <StreamingMarkdown content={promptText} isStreaming={false} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Scrollable Execution Trace & Output Body */}
      <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Error Banner */}
          {data.errorText && (
            <div className="border-l-2 border-l-destructive bg-destructive/[0.04] px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-destructive">
                <AlertCircle
                  className="h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.5}
                />
                <span>Execution error</span>
              </div>
              <p className="mt-1 text-muted-foreground">{data.errorText}</p>
            </div>
          )}

          {/* Direct Step Ledger (immediately visible, matches inline TaskRenderer) */}
          {hasSteps && (
            <section aria-label="Execution steps">
              <button
                type="button"
                onClick={() => setTraceExpanded((prev) => !prev)}
                aria-expanded={traceExpanded}
                className="mb-2 flex w-full items-center justify-between gap-2 text-left text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      traceExpanded && "rotate-90 text-foreground",
                    )}
                    strokeWidth={1.5}
                  />
                  <span>Trace</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
                    {stepCount} {stepCount === 1 ? "step" : "steps"}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground/75">
                  {traceExpanded ? "Collapse" : "Show"}
                </span>
              </button>

              {traceExpanded && (
                <div className="space-y-0.5 border-l border-border/70 pl-3">
                  {data.completedParts.map((toolPart) => (
                    <SubagentToolItem
                      key={toolPart.toolCallId}
                      part={toolPart}
                    />
                  ))}
                  {isLive && data.pending && (
                    <PendingSubagentToolItem pending={data.pending} />
                  )}
                </div>
              )}
            </section>
          )}

          {/* Subagent Output / Deliverable */}
          {data.finalText && (
            <section aria-label="Subagent output">
              <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Output
                </span>
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted hover:text-foreground active:scale-[0.97]"
                >
                  {copiedOutput ? (
                    <>
                      <Check
                        className="h-3 w-3 text-emerald-500"
                        strokeWidth={1.5}
                      />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" strokeWidth={1.5} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-[14.5px] leading-[1.65] text-foreground select-text">
                <StreamingMarkdown
                  content={data.finalText}
                  isStreaming={isLive}
                />
              </div>
            </section>
          )}

          {/* Waiting / Empty State */}
          {!hasSteps && !data.finalText && !data.errorText && (
            <div className="border-l-2 border-l-border pl-3 py-1 text-xs text-muted-foreground">
              {isLive
                ? "Waiting for subagent tool execution"
                : "No execution trace recorded"}
            </div>
          )}
        </div>
      </div>

      {/* 4. Compact Status Footer */}
      <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border/70 bg-background px-3 text-xs text-muted-foreground select-none sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Running autonomously</span>
            </span>
          ) : data.status === "failed" || data.status === "denied" ? (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>
                {data.status === "denied"
                  ? "Subagent stopped"
                  : "Subagent failed"}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Returned to coordinator</span>
            </span>
          )}

          {data.sessionId && (
            <button
              type="button"
              onClick={handleCopySession}
              className="hidden items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground/75 transition-colors hover:text-foreground sm:inline-flex"
              title="Copy subagent session ID"
            >
              <span>
                {copiedSession
                  ? "Copied session"
                  : `session ${data.sessionId.slice(0, 8)}`}
              </span>
              {!copiedSession && (
                <Copy className="h-2.5 w-2.5" strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 px-2 text-xs text-muted-foreground transition-[transform,color] duration-150 hover:text-foreground active:scale-[0.97]"
        >
          Return to chat
        </Button>
      </footer>
    </div>
  );
}
