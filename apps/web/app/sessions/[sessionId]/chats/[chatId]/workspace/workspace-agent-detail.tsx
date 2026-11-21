"use client";

import { formatTokens } from "@entry-agents/shared";
import { isToolUIPart } from "ai";
import {
  Check,
  ExternalLink,
  FileText,
  FolderSearch,
  Globe,
  Loader2,
  MessageSquare,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { WebAgentUIMessage, WebAgentUIMessagePart } from "@/app/types";
import { StreamingMarkdown } from "@/components/streaming-markdown";
import { getSubagentRoleTag } from "@/components/team/subagent-helpers";
import type { AgentHubEntry } from "@/lib/agent-hub/derive-roster";
import { deriveSubagentTabData } from "@/lib/agent-hub/subagent-tab-data";

const RECENT_STEPS = 6;
const LONG_REPORT_CHARS = 520;

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function getToolName(part: WebAgentUIMessagePart): string {
  if (part.type === "dynamic-tool") {
    return part.toolName;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return "";
}

function summarizeStepTitle(part: WebAgentUIMessagePart): string {
  const name = getToolName(part) || "step";
  const input =
    "input" in part && part.input && typeof part.input === "object"
      ? (part.input as Record<string, unknown>)
      : null;

  if (name === "bash" || name === "execute_command") {
    const cmd = typeof input?.command === "string" ? input.command.trim() : "";
    return cmd ? cmd.split("\n")[0]!.slice(0, 64) : "Run command";
  }

  const filePath =
    typeof input?.file_path === "string"
      ? input.file_path
      : typeof input?.path === "string"
        ? input.path
        : typeof input?.filePath === "string"
          ? input.filePath
          : "";
  if (filePath) {
    const base = filePath.split("/").pop() || filePath;
    return `${name} · ${base}`;
  }

  const pattern =
    typeof input?.pattern === "string"
      ? input.pattern
      : typeof input?.query === "string"
        ? input.query
        : "";
  if (pattern) {
    return `${name} · ${pattern.slice(0, 48)}`;
  }

  return name;
}

function StepIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower === "bash" || lower === "execute_command") {
    return <Terminal size={12} className="agx-step-icon" aria-hidden="true" />;
  }
  if (
    lower === "read" ||
    lower === "read_file" ||
    lower === "view_file" ||
    lower === "edit" ||
    lower === "write"
  ) {
    return <FileText size={12} className="agx-step-icon" aria-hidden="true" />;
  }
  if (lower === "grep" || lower === "glob" || lower === "search") {
    return (
      <FolderSearch size={12} className="agx-step-icon" aria-hidden="true" />
    );
  }
  if (lower === "web_fetch" || lower === "web_search" || lower === "fetch") {
    return <Globe size={12} className="agx-step-icon" aria-hidden="true" />;
  }
  return <Wrench size={12} className="agx-step-icon" aria-hidden="true" />;
}

interface WorkspaceAgentDetailProps {
  entry: AgentHubEntry;
  messages: WebAgentUIMessage[];
  isParentStreaming: boolean;
  live: boolean;
  onRevealInConversation: (entry: AgentHubEntry) => void;
  onOpenFullThread: (entry: AgentHubEntry) => void;
}

/**
 * Collapsible subagent inspection view ported 1:1 from Sable's `AgentDetail.tsx`.
 */
export function WorkspaceAgentDetail({
  entry,
  messages,
  isParentStreaming,
  live,
  onRevealInConversation,
  onOpenFullThread,
}: WorkspaceAgentDetailProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [reportExpanded, setReportExpanded] = useState(false);

  const detail = useMemo(
    () =>
      deriveSubagentTabData(messages, entry.id, {
        isParentStreaming,
      }),
    [messages, entry.id, isParentStreaming],
  );

  const toolSteps = useMemo(() => {
    const parts = detail?.completedParts ?? [];
    const filtered = parts.filter((p) => isToolUIPart(p));
    return filtered.slice(-RECENT_STEPS);
  }, [detail]);

  const roleLabel = getSubagentRoleTag(entry.subagentType);
  const stepsCount =
    entry.toolCallCount ?? detail?.toolCallCount ?? toolSteps.length;
  const totalTokens =
    (entry.inputTokens ?? 0) +
    (entry.outputTokens ?? 0) +
    (entry.cachedInputTokens ?? 0) +
    (entry.cacheWriteTokens ?? 0);

  const facts = [
    roleLabel,
    entry.startedAt ? `Started ${formatClock(entry.startedAt)}` : "",
    !live && stepsCount > 0 ? plural(stepsCount, "step") : "",
  ].filter(Boolean);

  const failed =
    !live && (entry.status === "failed" || entry.status === "denied");
  const errorText = failed
    ? entry.errorText?.trim() || "Stopped before finishing"
    : "";
  const reportText = !failed ? detail?.finalText?.trim() || "" : "";
  const isLongReport = reportText.length > LONG_REPORT_CHARS;
  const promptText = entry.instructions.trim();

  return (
    <div className="agx-detail">
      {(facts.length > 0 || totalTokens > 0) && (
        <div className="agx-facts">
          {facts.join(" · ")}
          {totalTokens > 0 && (
            <span> · {formatTokens(totalTokens)} tokens</span>
          )}
        </div>
      )}

      {errorText && <div className="agx-error">{errorText}</div>}

      {promptText && (
        <button
          type="button"
          className="agx-prompt"
          data-whole={promptExpanded || undefined}
          aria-expanded={promptExpanded}
          aria-label={
            promptExpanded ? "Show less of the task" : "Show the whole task"
          }
          onClick={() => setPromptExpanded((v) => !v)}
        >
          {promptText}
        </button>
      )}

      {toolSteps.length > 0 && (
        <div className="agx-steps" aria-label="Latest steps">
          {toolSteps.map((step, idx) => {
            const name = getToolName(step);
            const state = "state" in step ? String(step.state) : "";
            const stepRunning =
              state === "input-available" || state === "input-streaming";
            const stepFailed = state === "output-error";
            const key =
              "toolCallId" in step && typeof step.toolCallId === "string"
                ? step.toolCallId
                : `${entry.id}-step-${idx}`;
            return (
              <div key={key} className="agx-step">
                <StepIcon name={name} />
                <span className="agx-step-title truncate">
                  {summarizeStepTitle(step)}
                </span>
                <span className="agx-step-meta">
                  {stepRunning ? (
                    <Loader2
                      size={10}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : stepFailed ? (
                    <X
                      size={10}
                      strokeWidth={2.2}
                      className="agx-fail"
                      aria-hidden="true"
                    />
                  ) : (
                    <Check size={10} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {reportText && (
        <div
          className="agx-report"
          data-folded={(isLongReport && !reportExpanded) || undefined}
        >
          <div className="agx-report-text">
            <StreamingMarkdown content={reportText} isStreaming={false} />
          </div>
          {isLongReport && (
            <button
              type="button"
              className="agx-more"
              aria-expanded={reportExpanded}
              onClick={() => setReportExpanded((v) => !v)}
            >
              {reportExpanded ? "Show less" : "Show the whole report"}
            </button>
          )}
        </div>
      )}

      <div className="agx-actions">
        <button
          type="button"
          className="agx-goto"
          onClick={() => onRevealInConversation(entry)}
        >
          <MessageSquare size={13} strokeWidth={1.6} aria-hidden="true" />
          <span>Show in conversation</span>
        </button>
        <button
          type="button"
          className="agx-goto"
          onClick={() => onOpenFullThread(entry)}
        >
          <ExternalLink size={12} strokeWidth={1.6} aria-hidden="true" />
          <span>Open thread</span>
        </button>
      </div>
    </div>
  );
}
