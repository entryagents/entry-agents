"use client";

import type { TaskPendingToolCall } from "@entry-agents/agent";
import { formatTokens, toRelativePath } from "@entry-agents/shared";
import type { ToolRenderState } from "@entry-agents/shared/lib/tool-state";
import { extractCachedInputTokens } from "@/lib/chat/usage-extract";
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  FilePlus,
  FileText,
  FolderSearch,
  Globe,
  Hammer,
  Layers,
  Paintbrush,
  Pencil,
  Search,
  Share2,
  ShieldCheck,
  Telescope,
  Terminal,
  Zap,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  extractRenderState,
  getToolName,
  type ToolRendererProps,
} from "@/app/lib/render-tool";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import type { WebAgentUIToolPart } from "@/app/types";
import { Button } from "@/components/ui/button";
import { DEFAULT_WORKING_DIRECTORY } from "@/lib/sandbox/config";
import { cn } from "@/lib/utils";
import { ToolLayout } from "../tool-layout";
import { AskUserQuestionRenderer } from "./ask-user-question-renderer";
import { BashRenderer } from "./bash-renderer";
import { EditRenderer } from "./edit-renderer";
import { FetchRenderer } from "./fetch-renderer";
import { GlobRenderer } from "./glob-renderer";
import { GrepRenderer } from "./grep-renderer";
import { ReadRenderer } from "./read-renderer";
import { SkillRenderer } from "./skill-renderer";
import { TeamBoardRenderer } from "./team-board-renderer";
import { TodoRenderer } from "./todo-renderer";
import { WriteRenderer } from "./write-renderer";

// ---------------------------------------------------------------------------
// Tool name → icon / display name mapping
// ---------------------------------------------------------------------------

type ToolMeta = { displayName: string; icon: ReactNode };

const TOOL_ICON_CLASS = "h-3.5 w-3.5";

function getToolMeta(toolName: string): ToolMeta {
  switch (toolName) {
    case "bash":
      return {
        displayName: "bash",
        icon: <Terminal className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "read":
      return {
        displayName: "read",
        icon: <FileText className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "write":
      return {
        displayName: "write",
        icon: <FilePlus className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "edit":
      return {
        displayName: "edit",
        icon: <Pencil className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "grep":
      return {
        displayName: "grep",
        icon: <Search className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "glob":
      return {
        displayName: "glob",
        icon: <FolderSearch className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "web_fetch":
      return {
        displayName: "fetch",
        icon: <Globe className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "skill":
      return {
        displayName: "skill",
        icon: <Zap className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "team_board":
      return {
        displayName: "team_board",
        icon: <Share2 className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "task":
      return {
        displayName: "task",
        icon: <Telescope className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    default: {
      return { displayName: toolName, icon: undefined };
    }
  }
}

function getToolSummary(name: string, input: unknown): string {
  const inp = input as Record<string, unknown> | undefined;
  if (!inp) return "";
  switch (name) {
    case "read":
    case "write":
    case "edit": {
      const fp = inp.filePath ?? "";
      return fp ? toRelativePath(String(fp), DEFAULT_WORKING_DIRECTORY) : "";
    }
    case "grep":
    case "glob":
      return inp.pattern ? `'${inp.pattern}'` : "";
    case "bash":
      return inp.command ? String(inp.command) : "";
    case "team_board":
      return inp.action ? String(inp.action) : "";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Extract completed tool calls and concise summary from final messages
// ---------------------------------------------------------------------------

/** Unwrap AI SDK tool output envelope: { type: "json", value: { ... } } */
function unwrapToolOutput(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const o = output as Record<string, unknown>;
  if (o.type === "json" && o.value && typeof o.value === "object") {
    return o.value;
  }
  return output;
}

function extractToolParts(
  messages: unknown,
  executedTools?: unknown,
): WebAgentUIToolPart[] {
  if (Array.isArray(messages) && messages.length > 0) {
    type CallInfo = { id: string; name: string; input: unknown };
    const calls: CallInfo[] = [];
    for (const msg of messages) {
      if (
        typeof msg !== "object" ||
        msg === null ||
        (msg as { role?: string }).role !== "assistant"
      )
        continue;

      const content = (msg as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;

      for (const part of content) {
        if (
          typeof part === "object" &&
          part !== null &&
          (part as { type?: string }).type === "tool-call"
        ) {
          const tc = part as {
            toolCallId?: string;
            toolName?: string;
            input?: unknown;
          };
          if (tc.toolName && tc.toolCallId) {
            calls.push({
              id: tc.toolCallId,
              name: tc.toolName,
              input: tc.input,
            });
          }
        }
      }
    }

    const resultMap = new Map<string, unknown>();
    for (const msg of messages) {
      if (
        typeof msg !== "object" ||
        msg === null ||
        (msg as { role?: string }).role !== "tool"
      )
        continue;

      const content = (msg as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;

      for (const part of content) {
        if (
          typeof part === "object" &&
          part !== null &&
          (part as { type?: string }).type === "tool-result"
        ) {
          const tr = part as { toolCallId?: string; output?: unknown };
          if (tr.toolCallId) {
            resultMap.set(tr.toolCallId, tr.output);
          }
        }
      }
    }

    if (calls.length > 0) {
      return calls.map((call) => {
        const rawOutput = resultMap.get(call.id);
        const output = unwrapToolOutput(rawOutput);
        return {
          type: `tool-${call.name}`,
          toolCallId: call.id,
          state: "output-available",
          input: call.input,
          output,
        } as unknown as WebAgentUIToolPart;
      });
    }
  }

  if (Array.isArray(executedTools) && executedTools.length > 0) {
    return executedTools.map((raw, idx) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        type: `tool-${String(item.name ?? "tool")}`,
        toolCallId: String(item.toolCallId ?? `exec-${idx}`),
        state:
          item.state === "running" ? "input-available" : "output-available",
        input: item.input,
        output: item.output,
      } as unknown as WebAgentUIToolPart;
    });
  }

  return [];
}

function extractConciseSummary(
  messages: unknown,
  streamedText: unknown,
): string | null {
  let rawText = "";
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (
        typeof msg !== "object" ||
        msg === null ||
        (msg as { role?: string }).role !== "assistant"
      )
        continue;
      const content = (msg as { content?: unknown }).content;
      if (typeof content === "string") {
        rawText = content;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (
            typeof part === "object" &&
            part !== null &&
            (part as { type?: string }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            rawText = (part as { text: string }).text;
          }
        }
      }
    }
  }
  if (!rawText && typeof streamedText === "string") {
    rawText = streamedText;
  }
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // Prefer explicit **Summary**: block if present
  const summaryMatch = trimmed.match(
    /\*\*Summary\*\*:?\s*([\s\S]*?)(?:\n\s*\*\*Answer\*\*|$)/i,
  );
  const candidate = (summaryMatch?.[1] ?? trimmed)
    .replace(/^---+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate) return null;
  return candidate.length > 220 ? `${candidate.slice(0, 217)}...` : candidate;
}

function countToolCalls(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  return messages.filter(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      (message as { role?: string }).role === "tool",
  ).length;
}

// ---------------------------------------------------------------------------
// Subagent helpers
// ---------------------------------------------------------------------------

function getSubagentIcon(
  subagentType: string | undefined,
  className: string,
): ReactNode {
  switch (subagentType) {
    case "architect":
      return <Layers className={className} strokeWidth={1.5} />;
    case "executor":
      return <Hammer className={className} strokeWidth={1.5} />;
    case "design":
      return <Paintbrush className={className} strokeWidth={1.5} />;
    case "explorer":
      return <Telescope className={className} strokeWidth={1.5} />;
    case "reviewer":
      return <ShieldCheck className={className} strokeWidth={1.5} />;
    default:
      return <Bot className={className} strokeWidth={1.5} />;
  }
}

function getSubagentRoleTag(subagentType: string | undefined): string {
  switch (subagentType) {
    case "architect":
      return "architect";
    case "executor":
      return "executor";
    case "design":
      return "design";
    case "explorer":
      return "explorer";
    case "reviewer":
      return "reviewer";
    default:
      return subagentType ? subagentType.toLowerCase() : "subagent";
  }
}

const IDLE_STATE: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

function SubagentToolCall({ part }: { part: WebAgentUIToolPart }) {
  const state = extractRenderState(part, null, false);
  const cwd = DEFAULT_WORKING_DIRECTORY;

  switch (part.type) {
    case "tool-bash":
      return <BashRenderer part={part} state={state} />;
    case "tool-read":
      return <ReadRenderer part={part} state={state} cwd={cwd} />;
    case "tool-write":
      return <WriteRenderer part={part} state={state} cwd={cwd} />;
    case "tool-edit":
      return <EditRenderer part={part} state={state} cwd={cwd} />;
    case "tool-glob":
      return <GlobRenderer part={part} state={state} />;
    case "tool-grep":
      return <GrepRenderer part={part} state={state} />;
    case "tool-todo_write":
      return <TodoRenderer part={part} state={state} />;
    case "tool-ask_user_question":
      return <AskUserQuestionRenderer part={part} state={state} />;
    case "tool-web_fetch":
      return <FetchRenderer part={part} state={state} />;
    case "tool-skill":
      return <SkillRenderer part={part} state={state} />;
    case "tool-team_board":
      return <TeamBoardRenderer part={part} state={state} />;
    default: {
      const toolName = getToolName(part);
      const name = toolName.charAt(0).toUpperCase() + toolName.slice(1);
      const input = part.input as Record<string, unknown> | undefined;
      const summary = input ? JSON.stringify(input).slice(0, 40) : "...";
      return (
        <ToolLayout
          name={name}
          summary={summary}
          summaryClassName="font-mono"
          meta={part.state === "output-available" ? "Done" : undefined}
          state={state}
        />
      );
    }
  }
}

function PendingMiniToolCall({
  name,
  input,
}: {
  name: string;
  input: unknown;
}) {
  const meta = getToolMeta(name);
  const summary = getToolSummary(name, input);

  return (
    <ToolLayout
      name={meta.displayName}
      icon={meta.icon}
      summary={summary}
      summaryClassName="font-mono"
      state={IDLE_STATE}
    />
  );
}

// ---------------------------------------------------------------------------
// TaskRenderer — High-Signal Execution Trace Strip
// ---------------------------------------------------------------------------

export function TaskRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-task">) {
  const input = part.input;
  const desc = input?.task ?? "Subagent task";
  const subagentType = input?.subagentType;
  const roleTag = getSubagentRoleTag(subagentType);
  const taskApprovalRequested = part.state === "approval-requested";
  const taskDenied = part.state === "output-denied";
  const taskErrored = part.state === "output-error";

  const hasOutput = part.state === "output-available";
  const isPreliminary = hasOutput && part.preliminary === true;
  const isComplete = hasOutput && !isPreliminary;
  const output = hasOutput ? part.output : undefined;
  const isFailed = taskDenied || taskErrored || output?.status === "failed";
  const isRunning = state.running || isPreliminary;

  const pendingToolCall: TaskPendingToolCall | null = output?.pending ?? null;
  const completedParts = extractToolParts(output?.final, output?.executedTools);
  const toolCount =
    output?.toolCallCount ??
    (completedParts.length > 0
      ? completedParts.length
      : countToolCalls(output?.final));
  const inputTokens = output?.usage?.inputTokens ?? null;
  const cachedTokens = extractCachedInputTokens(output?.usage);
  const cacheHitPct =
    inputTokens && inputTokens > 0 && cachedTokens > 0
      ? Math.min(100, Math.round((cachedTokens / inputTokens) * 100))
      : null;

  const summaryPreview = extractConciseSummary(
    output?.final,
    output?.streamedText,
  );

  const [stepsExpanded, setStepsExpanded] = useState(false);
  const gitPanel = useOptionalGitPanel();

  const activeStepTicker =
    isRunning && pendingToolCall
      ? `${pendingToolCall.name} ${getToolSummary(pendingToolCall.name, pendingToolCall.input)}`.trim()
      : null;

  const hasSteps = completedParts.length > 0 || Boolean(pendingToolCall);

  return (
    <div
      className={cn(
        "my-1.5 rounded-lg border bg-card/40 transition-colors duration-150",
        isFailed
          ? "border-destructive/35 bg-destructive/[0.03]"
          : isRunning
            ? "border-border bg-muted/20"
            : "border-border/70 hover:border-border",
      )}
    >
      {/* Primary Trace Row */}
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (hasSteps) {
              setStepsExpanded((prev) => !prev);
            } else if (gitPanel) {
              gitPanel.openSubagentTab(part.toolCallId, desc, subagentType);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
        >
          {/* Status / Expand Indicator */}
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
            {hasSteps ? (
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150",
                  stepsExpanded && "rotate-90 text-foreground",
                )}
                strokeWidth={1.5}
              />
            ) : isFailed ? (
              <AlertCircle
                className="h-3.5 w-3.5 text-destructive"
                strokeWidth={1.5}
              />
            ) : isComplete ? (
              <Check
                className="h-3.5 w-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
            ) : (
              getSubagentIcon(subagentType, "h-3.5 w-3.5 text-foreground")
            )}
          </span>

          {/* Role Tag Pill */}
          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground/90">
            {getSubagentIcon(subagentType, "h-3 w-3 text-muted-foreground")}
            <span>@{roleTag}</span>
          </span>

          {/* Task Title */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] font-medium",
              isFailed ? "text-destructive" : "text-foreground",
            )}
          >
            {desc}
          </span>
        </button>

        {/* Right Telemetry + Inspect Drawer Trigger */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Live tool ticker on desktop */}
          {activeStepTicker && (
            <span className="hidden max-w-[200px] truncate rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground md:inline-block">
              {activeStepTicker}
            </span>
          )}

          {/* Tabular metrics */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {toolCount > 0 && (
              <span>
                {toolCount} {toolCount === 1 ? "step" : "steps"}
              </span>
            )}
            {inputTokens !== null && (
              <span className="hidden sm:inline">
                {toolCount > 0 ? "· " : ""}
                {formatTokens(inputTokens)} tok
              </span>
            )}
            {cacheHitPct !== null && (
              <span
                className="hidden rounded border border-border/70 bg-muted/50 px-1 py-0.2 text-[10px] text-foreground/80 md:inline-block"
                title={`${formatTokens(cachedTokens)} cached input tokens`}
              >
                {cacheHitPct}% cached
              </span>
            )}
          </div>

          {/* Open Subagent Trace Drawer button */}
          {gitPanel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                gitPanel.openSubagentTab(part.toolCallId, desc, subagentType);
              }}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded border border-border/80 bg-background/80 px-2 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground"
              title="Inspect full subagent execution trace"
            >
              <span>Inspect</span>
              <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Live Step Ticker */}
      {activeStepTicker && (
        <div className="border-t border-border/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground md:hidden">
          <span className="truncate block">{activeStepTicker}</span>
        </div>
      )}

      {/* Concise Deliverable Preview (2 lines max, no need to open drawer just to read conclusion) */}
      {summaryPreview && !stepsExpanded && (
        <div className="border-t border-border/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <p className="line-clamp-2">{summaryPreview}</p>
        </div>
      )}

      {/* Approval Bar if requested */}
      {taskApprovalRequested && state.approvalId && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            {subagentType === "executor"
              ? "Executor subagent requests write and shell access"
              : "Approve subagent task execution"}
          </span>
          <div className="flex items-center gap-1.5">
            {onDeny && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => state.approvalId && onDeny(state.approvalId)}
                className="h-6 px-2 text-xs"
              >
                Deny
              </Button>
            )}
            {onApprove && (
              <Button
                size="sm"
                onClick={() => state.approvalId && onApprove(state.approvalId)}
                className="h-6 px-2.5 text-xs"
              >
                Approve
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Inline Tool Steps */}
      {stepsExpanded && hasSteps && (
        <div className="space-y-0.5 border-t border-border/60 bg-background/40 px-3 py-2">
          {completedParts.map((toolPart) => (
            <SubagentToolCall key={toolPart.toolCallId} part={toolPart} />
          ))}
          {pendingToolCall && !isComplete && (
            <PendingMiniToolCall
              name={pendingToolCall.name}
              input={pendingToolCall.input}
            />
          )}
        </div>
      )}
    </div>
  );
}
