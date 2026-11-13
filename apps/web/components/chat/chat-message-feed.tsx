"use client";

import { isReasoningUIPart, isToolUIPart } from "ai";
import {
  Check,
  Copy,
  GitBranch,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type {
  WebAgentCommitDataPart,
  WebAgentPrDataPart,
  WebAgentSnippetDataPart,
  WebAgentUIMessage,
  WebAgentUIMessagePart,
  WebAgentUIToolPart,
} from "@/app/types";
import { AssistantMessageGroups } from "@/components/assistant-message-groups";
import { MessageAttachmentChip } from "@/components/message-attachment-chip";
import { MessageModelPill } from "@/components/message-model-pill";
import { SnippetChip } from "@/components/snippet-chip";
import { StreamingMarkdown } from "@/components/streaming-markdown";
import { ThinkingBlock } from "@/components/thinking-block";
import { ToolCall } from "@/components/tool-call/tool-call";
import {
  hasRenderableAssistantPart,
  isGitDataPart,
  shouldKeepCollapsedReasoningStreaming,
  shouldRenderGitDataPart,
} from "@/lib/chat-streaming-state";
import { cn } from "@/lib/utils";
import { UserMessageFold } from "@/components/user-message-fold";
import { GitDataPartCard } from "./git-data-part-card";
import {
  SmoothedAssistantMarkdown,
  SmoothedThinkingBlock,
} from "./smoothed-stream-parts";

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

export interface ChatMessageFeedProps {
  messages: WebAgentUIMessage[];
  isStreaming?: boolean;
  streamdownComponents?: Parameters<typeof StreamingMarkdown>[0]["components"];
  activeApprovalId?: string | null;
  onApproveTool?: (id: string) => void;
  onDenyTool?: (id: string, reason?: string) => void;
  onCopyAssistantMessage?: (messageId: string, text: string) => void;
  copiedAssistantMessageId?: string | null;
  onForkAssistantMessage?: (messageId: string) => void;
  forkingAssistantMessageId?: string | null;
  onCopyUserMessage?: (messageId: string, text: string) => void;
  copiedUserMessageId?: string | null;
  onResendUserMessage?: (messageId: string) => void;
  resendingMessageId?: string | null;
  onDeleteMessage?: (messageId: string) => void;
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
}

/**
 * Shared message feed component for both Main Session Chat and Subagent Chat.
 * Ensures consistent streaming, tool call rendering, typography, pacing, and 2026 UI/UX.
 */
export function ChatMessageFeed({
  messages,
  isStreaming = false,
  streamdownComponents,
  activeApprovalId = null,
  onApproveTool,
  onDenyTool,
  onCopyAssistantMessage,
  copiedAssistantMessageId = null,
  onForkAssistantMessage,
  forkingAssistantMessageId = null,
  onCopyUserMessage,
  copiedUserMessageId = null,
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
}: ChatMessageFeedProps) {
  const [activeMessageActionsId, setActiveMessageActionsId] = useState<
    string | null
  >(null);

  const groupedRenderMessages = useMemo<GroupedRenderMessage[]>(() => {
    return messages.map((message, messageIndex) => {
      const groups: MessageRenderGroup[] = [];
      let currentReasoningGroup: ReasoningMessagePart[] = [];
      let reasoningGroupStartIndex = 0;
      const partIdentityCounts = new Map<string, number>();

      const getStablePartRenderKey = (part: WebAgentUIMessagePart): string => {
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

        groups.push({
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
        groups.push({
          type: "part",
          part,
          index,
          renderKey: getStablePartRenderKey(part),
        });
      });

      flushReasoningGroup();

      return {
        message,
        groups,
        isStreaming: isStreaming && messageIndex === messages.length - 1,
      };
    });
  }, [messages, isStreaming]);

  if (groupedRenderMessages.length === 0 && !showThinkingIndicator) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedRenderMessages.map(
        ({ message: m, groups, isStreaming: isMessageStreaming }) => {
          const renderGroups = (isToolCallsExpanded: boolean) =>
            groups.map((group) => {
              if (group.type === "reasoning-group") {
                if (!isToolCallsExpanded) return null;
                const hasRenderableContentAfterGroup = m.parts
                  .slice(group.startIndex + group.parts.length)
                  .some(hasRenderableAssistantPart);

                return (
                  <div
                    key={`${m.id}-${group.renderKey}`}
                    className="min-w-0 w-full overflow-hidden pl-0 sm:pl-[22px]"
                  >
                    <SmoothedThinkingBlock
                      text={getReasoningGroupText(group.parts)}
                      active={
                        isMessageStreaming &&
                        group.parts.some((part) => part.state === "streaming")
                      }
                      streamKey={`${m.id}-${group.renderKey}`}
                      isStreaming={shouldKeepCollapsedReasoningStreaming({
                        isMessageStreaming,
                        hasStreamingReasoningPart: group.parts.some(
                          (part) => part.state === "streaming",
                        ),
                        hasRenderableContentAfterGroup,
                      })}
                      partCount={group.parts.length}
                    />
                  </div>
                );
              }

              const p = group.part;

              if (isReasoningUIPart(p)) {
                if (!isToolCallsExpanded) return null;
                const hasRenderableContentAfterGroup = m.parts
                  .slice(group.index + 1)
                  .some(hasRenderableAssistantPart);

                return (
                  <div
                    key={`${m.id}-${group.renderKey}`}
                    className="min-w-0 w-full overflow-hidden pl-0 sm:pl-[22px]"
                  >
                    <SmoothedThinkingBlock
                      text={p.text}
                      active={isMessageStreaming && p.state === "streaming"}
                      streamKey={`${m.id}-${group.renderKey}`}
                      isStreaming={shouldKeepCollapsedReasoningStreaming({
                        isMessageStreaming,
                        hasStreamingReasoningPart: p.state === "streaming",
                        hasRenderableContentAfterGroup,
                      })}
                    />
                  </div>
                );
              }

              if (p.type === "text") {
                if (p.text.length === 0) {
                  return null;
                }

                const isFinalAssistantTextPart =
                  m.role === "assistant" &&
                  !m.parts
                    .slice(group.index + 1)
                    .some((messagePart) => messagePart.type === "text");

                return (
                  <div
                    key={`${m.id}-${group.renderKey}`}
                    className={cn(
                      "flex min-w-0 py-2",
                      m.role === "user" ? "justify-end" : "justify-start",
                      isFinalAssistantTextPart && group.index > 0 && "mt-3",
                    )}
                  >
                    {m.role === "user" ? (
                      <div className="group flex w-fit min-w-0 max-w-[85%] sm:max-w-[80%] flex-col items-end">
                        <div
                          className="rounded-2xl bg-secondary px-4 py-2.5 text-left transition-colors hover:bg-secondary/90 shadow-xs"
                          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- wraps nested interactive UserMessageFold controls
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (!readOnly) {
                              setActiveMessageActionsId((current) =>
                                current === m.id ? null : m.id,
                              );
                            }
                          }}
                          onKeyDown={(event) => {
                            if (
                              !readOnly &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              setActiveMessageActionsId((current) =>
                                current === m.id ? null : m.id,
                              );
                            }
                          }}
                        >
                          <UserMessageFold text={p.text} />
                        </div>
                        {!readOnly && group.index === 0 && (
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 focus-within:opacity-100",
                              activeMessageActionsId === m.id && "opacity-100",
                            )}
                          >
                            {onCopyUserMessage && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onCopyUserMessage(m.id, p.text);
                                }}
                                aria-label="Copy message text"
                                className="rounded p-1 transition-colors hover:text-foreground"
                              >
                                {copiedUserMessageId === m.id ? (
                                  <Check className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {onResendUserMessage && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onResendUserMessage(m.id);
                                }}
                                disabled={hasMessageActionInFlight}
                                aria-label="Resend this message"
                                className="rounded p-1 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {resendingMessageId === m.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {onDeleteMessage && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onDeleteMessage(m.id);
                                }}
                                disabled={hasMessageActionInFlight}
                                aria-label="Delete this message and everything after it"
                                className="rounded p-1 transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {deletingMessageId === m.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="group min-w-0 w-full overflow-hidden"
                        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- wraps nested interactive buttons
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (!readOnly) {
                            setActiveMessageActionsId((current) =>
                              current === m.id ? null : m.id,
                            );
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            !readOnly &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            setActiveMessageActionsId((current) =>
                              current === m.id ? null : m.id,
                            );
                          }
                        }}
                      >
                        {/* Markdown prose text */}
                        <div className="text-[14.5px] leading-[1.65] text-foreground select-text">
                          <SmoothedAssistantMarkdown
                            content={p.text}
                            active={
                              isMessageStreaming && p.state === "streaming"
                            }
                            streamKey={`${m.id}-${group.renderKey}`}
                            isStreaming={
                              isMessageStreaming &&
                              !m.parts
                                .slice(group.index + 1)
                                .some(hasRenderableAssistantPart)
                            }
                            components={streamdownComponents}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              if (isToolUIPart(p)) {
                const toolName = (p as { toolName?: string }).toolName;
                const isAlwaysVisibleTool =
                  p.type === "tool-task" ||
                  toolName === "task" ||
                  p.type === "tool-visualize" ||
                  toolName === "visualize";
                if (!isToolCallsExpanded && !isAlwaysVisibleTool) return null;
                return (
                  <div
                    key={`${m.id}-${group.renderKey}`}
                    className={cn(
                      "min-w-0 w-full overflow-hidden",
                      isAlwaysVisibleTool ? "py-1" : "pl-0 sm:pl-[22px]",
                    )}
                  >
                    <ToolCall
                      part={p as WebAgentUIToolPart}
                      isStreaming={isMessageStreaming}
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
                  <div
                    key={`${m.id}-${group.renderKey}`}
                    className="max-w-full"
                  >
                    <GitDataPartCard
                      part={p as WebAgentCommitDataPart | WebAgentPrDataPart}
                    />
                  </div>
                );
              }

              // Render file attachments (images, audio/music, documents/code)
              if (p.type === "file") {
                if (!isToolCallsExpanded && m.role === "assistant") {
                  return null;
                }

                const isImage =
                  p.mediaType?.startsWith("image/") ||
                  /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(p.filename ?? "");
                const isAudio =
                  p.mediaType?.startsWith("audio/") ||
                  /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(p.filename ?? "");

                return (
                  <div
                    key={`${m.id}-${group.renderKey}`}
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
                        <MessageAttachmentChip
                          url={p.url}
                          filename={p.filename ?? "file"}
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // Render text snippet attachments
              if (p.type === "data-snippet") {
                const snippet = (p as WebAgentSnippetDataPart).data;
                if (!snippet) return null;
                return (
                  <div
                    key={`${m.id}-${group.renderKey}`}
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
            });

          if (m.role === "assistant") {
            return (
              <AssistantMessageGroups
                key={m.id}
                message={m}
                isStreaming={isMessageStreaming}
                durationMs={messageDurationMap[m.id] ?? null}
                startedAt={
                  messageStartedAtMap[m.id] ??
                  (isMessageStreaming
                    ? lastSendTimestamp
                      ? new Date(lastSendTimestamp).toISOString()
                      : lastUserMessageSentAt
                    : null)
                }
              >
                {(isExpanded) => {
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

                  return (
                    <>
                      {renderGroups(isExpanded)}
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
                              {copiedAssistantMessageId === m.id ? (
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
                                disabled={forkingAssistantMessageId !== null}
                                aria-label="Fork conversation from this response"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {forkingAssistantMessageId === m.id ? (
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
                        <MessageModelPill
                          metadata={m.metadata}
                          modelOptions={modelOptions}
                        />
                      </div>
                    </>
                  );
                }}
              </AssistantMessageGroups>
            );
          }

          return (
            <div key={m.id} className="flex flex-col gap-1">
              {renderGroups(true)}
            </div>
          );
        },
      )}

      {showThinkingIndicator && (
        <div className="my-1.5 border border-transparent py-0.5 select-none">
          <div className="inline-flex items-center gap-2 rounded-md py-px text-sm text-muted-foreground">
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
            </span>
            <span className="leading-none">
              {workspaceStatusMessage ?? "Thinking…"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
