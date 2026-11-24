"use client";

import { isReasoningUIPart, isToolUIPart } from "ai";
import { Check, Copy, FileText, GitBranch, Loader2 } from "lucide-react";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import type {
  WebAgentCommitDataPart,
  WebAgentPrDataPart,
  WebAgentSnippetDataPart,
  WebAgentUIMessage,
  WebAgentUIMessagePart,
  WebAgentUIToolPart,
} from "@/app/types";
import { AgentSwitchDivider } from "@/components/chat/agent-switch-divider";
import { TimelineStamp } from "@/components/chat/timeline-stamp";
import { TimelineTail } from "@/components/chat/timeline-tail";
import { detectModelSwitches } from "@/components/chat/timeline-util";
import { WidgetBlock } from "@/components/genui/widget-block";
import { MessageAttachmentChip } from "@/components/message-attachment-chip";
import { MessageModelPill } from "@/components/message-model-pill";
import { SnippetChip } from "@/components/snippet-chip";
import {
  FileShare,
  type SharedFileItem,
} from "@/components/timeline/file-card";
import { ToolCall } from "@/components/tool-call/tool-call";
import { UserMessageFold } from "@/components/user-message-fold";
import {
  hasRenderableAssistantPart,
  isGitDataPart,
  shouldKeepCollapsedReasoningStreaming,
  shouldRenderGitDataPart,
} from "@/lib/chat-streaming-state";
import { cn } from "@/lib/utils";
import { GitDataPartCard } from "./git-data-part-card";
import "./sable-timeline.css";
import type {
  ShowFlowChunk,
  TextFlowChunk,
  WorkItem,
} from "./sable-turn-grouping";
import { SableTurnView } from "./sable-turn-view";
import {
  SmoothedAssistantMarkdown,
  SmoothedThinkingBlock,
} from "./smoothed-stream-parts";
import { UserMessageAgain } from "./user-message-again";
import { UserMessageRewind } from "./user-message-rewind";

type ReasoningMessagePart = Extract<
  WebAgentUIMessagePart,
  { type: "reasoning" }
>;

type MessageRenderGroup =
  | {
      type: "part";
      part: WebAgentUIMessagePart;
      index: number;
      renderKey: string;
    }
  | {
      type: "reasoning-group";
      parts: ReasoningMessagePart[];
      startIndex: number;
      renderKey: string;
    };

interface GroupedRenderMessage {
  message: WebAgentUIMessage;
  groups: MessageRenderGroup[];
  isStreaming: boolean;
}

const messageRenderGroupsCache = new WeakMap<
  WebAgentUIMessage["parts"],
  MessageRenderGroup[]
>();

function getPartIdentity(part: WebAgentUIMessagePart): string {
  if (isToolUIPart(part)) {
    return part.toolCallId ? `tool:${part.toolCallId}` : `tool:${part.type}`;
  }

  if (isReasoningUIPart(part)) {
    return "reasoning";
  }

  if (part.type === "text") {
    return "text";
  }

  if (part.type === "file") {
    if (part.url) return `file:${part.url}`;
    if (part.filename) return `file:${part.filename}`;
    return "file";
  }

  if (part.type === "data-snippet") {
    const snippetPart = part as WebAgentSnippetDataPart;
    return snippetPart.id
      ? `snippet:${snippetPart.id}`
      : `snippet:${snippetPart.data?.filename || "file"}`;
  }

  if (isGitDataPart(part)) {
    return part.id ? `data:${part.type}:${part.id}` : `data:${part.type}`;
  }

  return `part:${part.type}`;
}

function getReasoningGroupText(parts: ReasoningMessagePart[]): string {
  return parts
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}

function getToolPartName(part: WebAgentUIMessagePart): string | undefined {
  if (!isToolUIPart(part)) return undefined;
  const named = (part as { toolName?: unknown; name?: unknown }).toolName;
  if (typeof named === "string") return named;
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return undefined;
}

export interface ChatMessageFeedProps {
  messages: WebAgentUIMessage[];
  isStreaming?: boolean;
  onOpenFile?: (filePath: string) => void;
  activeApprovalId?: string | null;
  onApproveTool?: (id: string) => void;
  onDenyTool?: (id: string, reason?: string) => void;
  onOpenSubagentTab?: (
    subagentId: string,
    title?: string,
    subagentType?: string,
  ) => void;
  onCopyAssistantMessage?: (messageId: string, text: string) => void;
  copiedAssistantMessageId?: string | null;
  onForkAssistantMessage?: (messageId: string) => void;
  forkingAssistantMessageId?: string | null;
  onCopyUserMessage?: (messageId: string, text: string) => void;
  copiedUserMessageId?: string | null;
  onEditUserMessage?: (messageId: string) => void | Promise<void>;
  editingMessageId?: string | null;
  onResendUserMessage?: (messageId: string) => void | Promise<void>;
  resendingMessageId?: string | null;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
  deletingMessageId?: string | null;
  hasMessageActionInFlight?: boolean;
  modelOptions?: Parameters<typeof MessageModelPill>[0]["modelOptions"];
  messageDurationMap?: Record<string, number>;
  messageStartedAtMap?: Record<string, string>;
  lastSendTimestamp?: number | null;
  lastUserMessageSentAt?: string | null;
  cwd?: string;
  readOnly?: boolean;
  agentName?: string;
  agentIcon?: ReactNode;
  emptyStateMessage?: string;
  showThinkingIndicator?: boolean;
  workspaceStatusMessage?: string;
  isAwaitingInput?: boolean;
  onSwitchModel?: (modelId: string) => void;
}

interface ChatMessageRowProps {
  message: WebAgentUIMessage;
  groups: MessageRenderGroup[];
  isMessageStreaming: boolean;
  onOpenFile?: (filePath: string) => void;
  activeApprovalId: string | null;
  onApproveTool?: (id: string) => void;
  onDenyTool?: (id: string, reason?: string) => void;
  onOpenSubagentTab?: (
    subagentId: string,
    title?: string,
    subagentType?: string,
  ) => void;
  onCopyAssistantMessage?: (messageId: string, text: string) => void;
  isCopiedAssistant: boolean;
  onForkAssistantMessage?: (messageId: string) => void;
  isForkingAssistant: boolean;
  onCopyUserMessage?: (messageId: string, text: string) => void;
  isCopiedUser: boolean;
  onEditUserMessage?: (messageId: string) => void | Promise<void>;
  isEditingUser: boolean;
  isLastUserMessage: boolean;
  onResendUserMessage?: (messageId: string) => void | Promise<void>;
  isResendingUser: boolean;
  onDeleteMessage?: (messageId: string) => void | Promise<void>;
  isDeletingMessage: boolean;
  hasMessageActionInFlight: boolean;
  modelOptions: NonNullable<
    Parameters<typeof MessageModelPill>[0]["modelOptions"]
  >;
  durationMs: number | null;
  startedAt: string | null;
  cwd?: string;
  readOnly: boolean;
  isActionsActive: boolean;
  onToggleActions: (messageId: string) => void;
  workspaceStatusMessage?: string;
  isAwaitingInput?: boolean;
}

const ChatMessageRow = memo(function ChatMessageRow({
  message: m,
  groups,
  isMessageStreaming,
  onOpenFile,
  activeApprovalId,
  onApproveTool,
  onDenyTool,
  onOpenSubagentTab: _onOpenSubagentTab,
  onCopyAssistantMessage,
  isCopiedAssistant,
  onForkAssistantMessage,
  isForkingAssistant,
  onCopyUserMessage,
  isCopiedUser,
  onEditUserMessage,
  isEditingUser,
  isLastUserMessage,
  onResendUserMessage,
  isResendingUser,
  onDeleteMessage,
  isDeletingMessage,
  hasMessageActionInFlight,
  modelOptions,
  durationMs,
  startedAt,
  cwd,
  readOnly,
  isActionsActive,
  onToggleActions,
  workspaceStatusMessage,
  isAwaitingInput = false,
}: ChatMessageRowProps) {
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);

  const renderShowPart = (
    p: WebAgentUIMessagePart,
    key: string,
    isToolPartStreaming: boolean,
  ) => {
    if (isToolUIPart(p)) {
      const toolName = getToolPartName(p);
      if (toolName === "show_widget") {
        const inp =
          typeof p.input === "object" && p.input !== null
            ? (p.input as Record<string, unknown>)
            : null;
        const code =
          (typeof inp?.widget_code === "string" && inp.widget_code) ||
          (typeof inp?.code === "string" && inp.code) ||
          (typeof inp?.html === "string" && inp.html) ||
          "";
        const title = typeof inp?.title === "string" ? inp.title : undefined;
        if (code) {
          return (
            <WidgetBlock
              key={key}
              id={p.toolCallId}
              title={title}
              code={code}
              isStreaming={isToolPartStreaming}
            />
          );
        }
      }

      if (toolName === "send_user_file") {
        const inp =
          typeof p.input === "object" && p.input !== null
            ? (p.input as Record<string, unknown>)
            : null;
        const out =
          typeof p.output === "object" && p.output !== null
            ? (p.output as Record<string, unknown>)
            : null;
        const rawFiles = Array.isArray(out?.files)
          ? out.files
          : Array.isArray(inp?.files)
            ? inp.files
            : typeof inp?.file_path === "string"
              ? [{ path: inp.file_path }]
              : typeof inp?.path === "string"
                ? [{ path: inp.path }]
                : [];
        const files: SharedFileItem[] = rawFiles
          .filter(
            (f): f is Record<string, unknown> =>
              typeof f === "object" && f !== null,
          )
          .map((f) => ({
            path: typeof f.path === "string" ? f.path : "",
            name: typeof f.name === "string" ? f.name : undefined,
            size: typeof f.size === "number" ? f.size : undefined,
          }))
          .filter((f) => f.path.length > 0);
        const caption =
          typeof inp?.caption === "string" ? inp.caption : undefined;
        if (files.length > 0) {
          return (
            <FileShare
              key={key}
              files={files}
              caption={caption}
              failed={p.state === "output-error"}
              onOpenFile={onOpenFile}
            />
          );
        }
      }

      return (
        <div key={key} className="min-w-0 w-full overflow-hidden">
          <ToolCall
            part={p as WebAgentUIToolPart}
            isStreaming={isToolPartStreaming}
            activeApprovalId={activeApprovalId}
            cwd={cwd}
            onApprove={onApproveTool}
            onDeny={onDenyTool}
          />
        </div>
      );
    }

    if (isGitDataPart(p)) {
      if (!shouldRenderGitDataPart(p)) {
        return null;
      }
      return (
        <div key={key} className="max-w-full">
          <GitDataPartCard
            part={p as WebAgentCommitDataPart | WebAgentPrDataPart}
          />
        </div>
      );
    }

    if (p.type === "file") {
      const isImage =
        p.mediaType?.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(p.filename ?? "");
      const isAudio =
        p.mediaType?.startsWith("audio/") ||
        /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(p.filename ?? "");

      return (
        <div
          key={key}
          className={cn(
            "flex",
            m.role === "user" ? "justify-end" : "justify-start",
          )}
        >
          <div className="group relative w-fit max-w-[80%]">
            {isImage ? (
              <MessageAttachmentChip
                url={p.url}
                filename={p.filename ?? "image"}
              />
            ) : isAudio ? (
              <div className="rounded-xl border border-border/80 bg-card p-3 shadow-xs">
                <p className="mb-2 text-xs font-medium text-foreground truncate max-w-xs">
                  {p.filename ?? "Audio clip"}
                </p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio
                  controls
                  src={p.url}
                  className="h-8 max-w-[260px] sm:max-w-xs"
                />
              </div>
            ) : (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="sable-user-file"
                title={p.filename ?? "Attached file"}
              >
                <FileText
                  className="size-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                <span className="truncate">{p.filename ?? "file"}</span>
              </a>
            )}
          </div>
        </div>
      );
    }

    if (p.type === "data-snippet") {
      const snippet = (p as WebAgentSnippetDataPart).data;
      if (!snippet) return null;
      return (
        <div
          key={key}
          className={cn(
            "flex",
            m.role === "user" ? "justify-end" : "justify-start",
          )}
        >
          <div className="max-w-[85%] sm:max-w-[80%]">
            <SnippetChip
              filename={snippet.filename}
              content={snippet.content}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  if (m.role === "assistant" && m.metadata?.isCompactionNotice) {
    const summaryLabel =
      m.parts
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text" && part.text.trim().length > 0,
        )
        .map((part) => part.text.trim())
        .join(" ") || "Conversation compacted";
    return (
      <div className="my-3 flex items-center gap-3 select-none text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
        <span className="shrink-0 font-medium">{summaryLabel}</span>
        <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
      </div>
    );
  }

  if (m.role === "assistant") {
    const combinedText = m.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          part.type === "text" && part.text.trim().length > 0,
      )
      .map((part) => part.text)
      .join("\n\n");
    const canCopyAssistant =
      !isMessageStreaming &&
      combinedText.length > 0 &&
      Boolean(onCopyAssistantMessage);

    const renderTextChunk = (chunk: TextFlowChunk) => (
      <div
        className={cn(
          "flex min-w-0 justify-start py-1.5",
          chunk.isAnswer &&
            !isMessageStreaming &&
            chunk.partIndex > 0 &&
            "pt-2.5",
        )}
      >
        <div
          className="group min-w-0 w-full overflow-hidden"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- wraps nested interactive buttons
          role="button"
          tabIndex={0}
          onClick={() => {
            if (!readOnly) {
              onToggleActions(m.id);
            }
          }}
          onKeyDown={(event) => {
            if (!readOnly && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onToggleActions(m.id);
            }
          }}
        >
          <div className="sable-md min-w-0 break-words [overflow-wrap:anywhere] select-text">
            <SmoothedAssistantMarkdown
              content={chunk.part.text}
              active={isMessageStreaming && chunk.part.state === "streaming"}
              streamKey={`${m.id}-${chunk.key}`}
              isStreaming={
                isMessageStreaming &&
                !m.parts
                  .slice(chunk.partIndex + 1)
                  .some(hasRenderableAssistantPart)
              }
              onOpenFile={onOpenFile}
            />
          </div>
        </div>
      </div>
    );

    const renderShowChunk = (chunk: ShowFlowChunk) =>
      renderShowPart(chunk.part, `${m.id}-${chunk.key}`, chunk.isStreaming);

    const renderWorkItem = (item: WorkItem) => {
      if (item.kind === "reasoning") {
        const hasRenderableContentAfterGroup = m.parts
          .slice(item.startIndex + item.parts.length)
          .some(hasRenderableAssistantPart);
        return (
          <div className="min-w-0 w-full overflow-hidden">
            <SmoothedThinkingBlock
              text={getReasoningGroupText(item.parts)}
              active={
                isMessageStreaming &&
                item.parts.some((part) => part.state === "streaming")
              }
              streamKey={`${m.id}-${item.key}`}
              isStreaming={shouldKeepCollapsedReasoningStreaming({
                isMessageStreaming,
                hasStreamingReasoningPart: item.parts.some(
                  (part) => part.state === "streaming",
                ),
                hasRenderableContentAfterGroup,
              })}
              partCount={item.parts.length}
            />
          </div>
        );
      }

      if (item.kind === "lead") {
        return (
          <div className="sable-lead-in min-w-0 break-words [overflow-wrap:anywhere] py-0.5 select-text">
            <SmoothedAssistantMarkdown
              content={item.part.text}
              active={isMessageStreaming && item.part.state === "streaming"}
              streamKey={`${m.id}-${item.key}`}
              isStreaming={item.isStreaming}
              onOpenFile={onOpenFile}
            />
          </div>
        );
      }

      return (
        <div className="min-w-0 w-full overflow-hidden">
          <ToolCall
            part={item.part}
            isStreaming={item.isStreaming}
            activeApprovalId={activeApprovalId}
            cwd={cwd}
            onApprove={onApproveTool}
            onDeny={onDenyTool}
          />
        </div>
      );
    };

    const footer = !isMessageStreaming ? (
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/40 pt-1.5 select-none text-xs text-muted-foreground">
        {canCopyAssistant ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCopyAssistantMessage?.(m.id, combinedText);
              }}
              aria-label="Copy assistant response"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]"
            >
              {isCopiedAssistant ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Copied
                  </span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
            {!readOnly && onForkAssistantMessage && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onForkAssistantMessage(m.id);
                }}
                disabled={hasMessageActionInFlight}
                aria-label="Fork conversation from this response"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isForkingAssistant ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitBranch className="h-3.5 w-3.5" />
                )}
                <span>Fork</span>
              </button>
            )}
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <TimelineStamp timestamp={startedAt} />
          <MessageModelPill metadata={m.metadata} modelOptions={modelOptions} />
        </div>
      </div>
    ) : null;

    return (
      <SableTurnView
        message={m}
        isStreaming={isMessageStreaming}
        durationMs={durationMs}
        startedAt={startedAt}
        activeApprovalId={activeApprovalId}
        cwd={cwd}
        onOpenFile={onOpenFile}
        workspaceStatusMessage={
          isMessageStreaming ? workspaceStatusMessage : null
        }
        isAwaitingInput={isMessageStreaming ? isAwaitingInput : false}
        renderTextChunk={renderTextChunk}
        renderShowChunk={renderShowChunk}
        renderWorkItem={renderWorkItem}
        footer={footer}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {groups.map((group) => {
        if (group.type !== "part") return null;
        const p = group.part;
        if (p.type === "text") {
          if (p.text.length === 0) return null;
          return (
            <div
              key={`${m.id}-${group.renderKey}`}
              data-nav-msg-id={group.index === 0 ? m.id : undefined}
              className="flex min-w-0 justify-end py-2"
            >
              <div className="group flex w-fit min-w-0 max-w-[85%] sm:max-w-[80%] flex-col items-end">
                <div
                  className="sable-user-card min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-left transition-opacity"
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- wraps nested interactive UserMessageFold controls
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!readOnly) {
                      onToggleActions(m.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      !readOnly &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onToggleActions(m.id);
                    }
                  }}
                >
                  <UserMessageFold text={p.text} />
                </div>
                {!readOnly && group.index === 0 && (
                  <div
                    data-open={userPopoverOpen || undefined}
                    className={cn(
                      "mt-1 flex items-center gap-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-within:opacity-100",
                      (isActionsActive || userPopoverOpen) && "opacity-100",
                    )}
                  >
                    {onCopyUserMessage && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onCopyUserMessage(m.id, p.text);
                        }}
                        aria-label="Copy message"
                        className="rounded p-1 transition-colors hover:text-foreground cursor-pointer"
                      >
                        {isCopiedUser ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <UserMessageAgain
                      messageId={m.id}
                      isLast={isLastUserMessage}
                      disabled={hasMessageActionInFlight}
                      isEditing={isEditingUser}
                      isRetrying={isResendingUser}
                      onEditAndSendAgain={onEditUserMessage}
                      onRetry={onResendUserMessage}
                      onPopoverOpenChange={setUserPopoverOpen}
                    />
                    {onDeleteMessage && (
                      <UserMessageRewind
                        messageId={m.id}
                        disabled={hasMessageActionInFlight}
                        isRewinding={isDeletingMessage}
                        onRewind={onDeleteMessage}
                        onPopoverOpenChange={setUserPopoverOpen}
                      />
                    )}
                    <TimelineStamp timestamp={startedAt} className="ml-1" />
                  </div>
                )}
              </div>
            </div>
          );
        }

        return renderShowPart(p, `${m.id}-${group.renderKey}`, false);
      })}
    </div>
  );
});

/**
 * Shared message feed component for both Main Session Chat and Subagent Chat.
 * Ensures consistent streaming, tool call rendering, typography, pacing, and 2026 UI/UX.
 */
export const ChatMessageFeed = memo(function ChatMessageFeed({
  messages,
  isStreaming = false,
  onOpenFile,
  activeApprovalId = null,
  onApproveTool,
  onDenyTool,
  onOpenSubagentTab,
  onCopyAssistantMessage,
  copiedAssistantMessageId = null,
  onForkAssistantMessage,
  forkingAssistantMessageId = null,
  onCopyUserMessage,
  copiedUserMessageId = null,
  onEditUserMessage,
  editingMessageId = null,
  onResendUserMessage,
  resendingMessageId = null,
  onDeleteMessage,
  deletingMessageId = null,
  hasMessageActionInFlight = false,
  modelOptions = [],
  messageDurationMap = {},
  messageStartedAtMap = {},
  lastSendTimestamp = null,
  lastUserMessageSentAt = null,
  cwd,
  readOnly = false,
  agentName: _agentName = "Entry",
  agentIcon: _agentIcon,
  emptyStateMessage = "Send a message to get started",
  showThinkingIndicator = false,
  workspaceStatusMessage,
  isAwaitingInput = false,
  onSwitchModel,
}: ChatMessageFeedProps) {
  const [activeMessageActionsId, setActiveMessageActionsId] = useState<
    string | null
  >(null);

  const handleToggleActions = useCallback((messageId: string) => {
    setActiveMessageActionsId((current) =>
      current === messageId ? null : messageId,
    );
  }, []);

  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") {
        return messages[i]?.id ?? null;
      }
    }
    return null;
  }, [messages]);

  const groupedRenderMessages = useMemo<GroupedRenderMessage[]>(() => {
    return messages.map((message, messageIndex) => {
      let groups = messageRenderGroupsCache.get(message.parts);
      if (!groups) {
        groups = [];
        let currentReasoningGroup: ReasoningMessagePart[] = [];
        let reasoningGroupStartIndex = 0;
        const partIdentityCounts = new Map<string, number>();

        const getStablePartRenderKey = (
          part: WebAgentUIMessagePart,
        ): string => {
          const identity = getPartIdentity(part);

          if (isToolUIPart(part) && part.toolCallId) {
            return identity;
          }

          const count = partIdentityCounts.get(identity) ?? 0;
          partIdentityCounts.set(identity, count + 1);
          return `${identity}:${count}`;
        };

        const flushReasoningGroup = () => {
          if (currentReasoningGroup.length === 0) return;

          groups?.push({
            type: "reasoning-group",
            parts: currentReasoningGroup,
            startIndex: reasoningGroupStartIndex,
            renderKey: `reasoning-group:${getStablePartRenderKey(currentReasoningGroup[0])}`,
          });
          currentReasoningGroup = [];
        };

        message.parts.forEach((part, index) => {
          if (isReasoningUIPart(part)) {
            if (currentReasoningGroup.length === 0) {
              reasoningGroupStartIndex = index;
            }
            currentReasoningGroup.push(part);
            return;
          }

          flushReasoningGroup();
          groups?.push({
            type: "part",
            part,
            index,
            renderKey: getStablePartRenderKey(part),
          });
        });

        flushReasoningGroup();
        messageRenderGroupsCache.set(message.parts, groups);
      }

      return {
        message,
        groups,
        isStreaming: isStreaming && messageIndex === messages.length - 1,
      };
    });
  }, [messages, isStreaming]);

  const modelSwitches = useMemo(
    () => detectModelSwitches(messages),
    [messages],
  );

  const lastMessage = messages[messages.length - 1];
  const lastPart =
    lastMessage?.role === "assistant"
      ? lastMessage.parts[lastMessage.parts.length - 1]
      : undefined;
  const isActivelyStreamingProse =
    isStreaming &&
    Boolean(lastPart) &&
    (lastPart?.type === "text" || lastPart?.type === "reasoning") &&
    "text" in lastPart &&
    typeof lastPart.text === "string" &&
    lastPart.text.length > 0;

  const activeTurnStartedAtMs = useMemo(() => {
    if (lastSendTimestamp) return lastSendTimestamp;
    if (lastMessage && messageStartedAtMap[lastMessage.id]) {
      const parsed = Date.parse(messageStartedAtMap[lastMessage.id]);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (lastUserMessageSentAt) {
      const parsed = Date.parse(lastUserMessageSentAt);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }, [
    lastMessage,
    lastSendTimestamp,
    lastUserMessageSentAt,
    messageStartedAtMap,
  ]);

  const hasRunningAssistantTurn =
    isStreaming &&
    lastMessage?.role === "assistant" &&
    !lastMessage.metadata?.isCompactionNotice;
  const showTail =
    !hasRunningAssistantTurn &&
    (isAwaitingInput || showThinkingIndicator || isStreaming);

  if (groupedRenderMessages.length === 0 && !showTail) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupedRenderMessages.map(
        ({ message: m, groups, isStreaming: isMessageStreaming }) => {
          const modelSwitch = modelSwitches.get(m.id);
          return (
            <div
              key={m.id}
              data-find-msg-id={m.id}
              style={
                isMessageStreaming
                  ? undefined
                  : {
                      contentVisibility: "auto",
                      containIntrinsicSize: "auto 96px",
                    }
              }
            >
              {modelSwitch && (
                <AgentSwitchDivider
                  fromModelId={modelSwitch.fromModelId}
                  toModelId={modelSwitch.toModelId}
                  modelOptions={modelOptions}
                  isLatest={modelSwitch.isLatest}
                  isBusy={isStreaming || hasMessageActionInFlight}
                  onSwitchBack={readOnly ? undefined : onSwitchModel}
                />
              )}
              <ChatMessageRow
                message={m}
                groups={groups}
                isMessageStreaming={isMessageStreaming}
                onOpenFile={onOpenFile}
                activeApprovalId={activeApprovalId}
                onApproveTool={onApproveTool}
                onDenyTool={onDenyTool}
                onOpenSubagentTab={onOpenSubagentTab}
                onCopyAssistantMessage={onCopyAssistantMessage}
                isCopiedAssistant={copiedAssistantMessageId === m.id}
                onForkAssistantMessage={onForkAssistantMessage}
                isForkingAssistant={forkingAssistantMessageId === m.id}
                onCopyUserMessage={onCopyUserMessage}
                isCopiedUser={copiedUserMessageId === m.id}
                onEditUserMessage={onEditUserMessage}
                isEditingUser={editingMessageId === m.id}
                isLastUserMessage={
                  m.role === "user" && m.id === lastUserMessageId
                }
                onResendUserMessage={onResendUserMessage}
                isResendingUser={resendingMessageId === m.id}
                onDeleteMessage={onDeleteMessage}
                isDeletingMessage={deletingMessageId === m.id}
                hasMessageActionInFlight={
                  hasMessageActionInFlight || forkingAssistantMessageId !== null
                }
                modelOptions={modelOptions}
                durationMs={messageDurationMap[m.id] ?? null}
                startedAt={
                  messageStartedAtMap[m.id] ??
                  (isMessageStreaming
                    ? lastSendTimestamp
                      ? new Date(lastSendTimestamp).toISOString()
                      : lastUserMessageSentAt
                    : null)
                }
                cwd={cwd}
                readOnly={readOnly}
                isActionsActive={activeMessageActionsId === m.id}
                onToggleActions={handleToggleActions}
                workspaceStatusMessage={
                  isMessageStreaming ? workspaceStatusMessage : undefined
                }
                isAwaitingInput={
                  isMessageStreaming ? isAwaitingInput : undefined
                }
              />
            </div>
          );
        },
      )}

      {showTail && (
        <TimelineTail
          status={isAwaitingInput ? "awaiting" : "working"}
          activity={workspaceStatusMessage ?? "Working"}
          startedAtMs={activeTurnStartedAtMs}
          quiet={!isAwaitingInput && isActivelyStreamingProse}
        />
      )}
    </div>
  );
});
