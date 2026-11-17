"use client";

import { type UseChatHelpers, useChat } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  WebAgentUIMessage,
  WebAgentWorkspaceStatusData,
} from "@/app/types";
import { AbortableChatTransport } from "@/lib/abortable-chat-transport";
import { triggerBillingSync } from "@/components/sidebar-billing-widget";
import { mergePreservingLocalWork } from "@/lib/chat/merge-preserving-local-work";
import { dedupeMessageList } from "@/lib/chat/dedupe-message-reasoning";
import {
  abortChatInstanceTransport,
  getOrCreateChatInstance,
} from "@/lib/chat-instance-manager";
import { cleanupChatRouteOnUnmount } from "@/lib/chat-route-cleanup";
import { isFriendlyChatErrorText } from "@/lib/chat/friendly-error";
import { getTeamRoleModelsSnapshot } from "@/lib/team/role-models-store";
import {
  CONTINUE_AFTER_ERROR_PROMPT,
  getDeadTurnRetryAction,
} from "@/app/sessions/[sessionId]/chats/[chatId]/stream-recovery-policy";
import {
  clearChatWorkspaceStatus,
  getChatWorkspaceStatusSnapshot,
  setChatWorkspaceStatus,
  subscribeChatWorkspaceStatus,
} from "@/lib/workspace-status-store";

// Keep stream updates close to the browser paint rate. The previous 75 ms
// throttle made reasoning text visibly lag behind the Gateway SSE stream.
const CHAT_UI_UPDATE_THROTTLE_MS = 16;

export type RetryChatStreamOptions = {
  auto?: boolean;
  strategy?: "hard" | "soft" | "reconnect";
};

type UseSessionChatRuntimeParams = {
  sessionId: string;
  chatId: string;
  initialMessages: WebAgentUIMessage[];
  initialChatActiveStreamId: string | null | undefined;
  contextLimit: number | null;
};

type UseSessionChatRuntimeReturn = {
  chat: UseChatHelpers<WebAgentUIMessage>;
  stopChatStream: () => void;
  retryChatStream: (opts?: RetryChatStreamOptions) => void;
  getLastChunkReceivedAt: () => number;
  isReconnecting: boolean;
  workspaceStatus: WebAgentWorkspaceStatusData | null;
  clearWorkspaceStatus: () => void;
};

/**
 * Custom predicate for auto-submitting messages.
 * Unlike the default `lastAssistantMessageIsCompleteWithApprovalResponses`,
 * this also checks for tools waiting in `input-available` state (e.g., AskUserQuestion).
 */
function shouldAutoSubmit({
  messages,
}: {
  messages: WebAgentUIMessage[];
}): boolean {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "assistant") return false;

  // Find the last step-start to get tools from the current step only
  const lastStepStartIndex = lastMessage.parts.reduce(
    (lastIndex, part, index) =>
      part.type === "step-start" ? index : lastIndex,
    -1,
  );

  // Get tool invocations from the last step (non-provider-executed)
  const lastStepToolInvocations = lastMessage.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart)
    .filter((part) => !part.providerExecuted);

  // If no tool invocations, don't auto-submit
  if (lastStepToolInvocations.length === 0) return false;

  // Auto-submit only if ALL tools are in terminal state
  // Terminal states: output-available, output-error, approval-responded
  // NOT terminal: input-available (waiting for user input, e.g., AskUserQuestion)
  return lastStepToolInvocations.every(
    (part) =>
      part.state === "output-available" ||
      part.state === "output-error" ||
      part.state === "approval-responded",
  );
}

export function useSessionChatRuntime({
  sessionId,
  chatId,
  initialMessages,
  initialChatActiveStreamId,
  contextLimit,
}: UseSessionChatRuntimeParams): UseSessionChatRuntimeReturn {
  const contextLimitRef = useRef<number | null>(contextLimit);
  const workspaceStatus = useSyncExternalStore(
    useCallback(
      (listener) => subscribeChatWorkspaceStatus(chatId, listener),
      [chatId],
    ),
    useCallback(() => getChatWorkspaceStatusSnapshot(chatId), [chatId]),
    () => null,
  );

  useEffect(() => {
    contextLimitRef.current = contextLimit;
  }, [contextLimit]);

  const [isReconnecting, setIsReconnecting] = useState(false);
  const forceReconcileOnFinishRef = useRef(false);

  const transport = useMemo(
    () =>
      new AbortableChatTransport({
        api: "/api/chat",
        body: () => {
          const requestContextLimit = contextLimitRef.current;
          const teamRoleModels = getTeamRoleModelsSnapshot(chatId);
          return {
            sessionId,
            chatId,
            ...(Object.keys(teamRoleModels).length > 0
              ? { teamRoleModels }
              : {}),
            ...(requestContextLimit !== null
              ? {
                  context: {
                    contextLimit: requestContextLimit,
                  },
                }
              : {}),
          };
        },
        onReconnectNeeded: () => {
          forceReconcileOnFinishRef.current = true;
          setIsReconnecting(true);
        },
        onCompletedSnapshotNeeded: () => {
          forceReconcileOnFinishRef.current = true;
        },
        // Always start from chunk 0 so the stream's `start` (messageId) and
        // `*-start` chunks are received on every reload and secondary device,
        // preventing @workflow/ai's orphanFilter from dropping live deltas.
        initialStartIndex: 0,
        prepareReconnectToStreamRequest: ({ id }) => ({
          api: `/api/chat/${id}/stream`,
        }),
      }),
    [sessionId, chatId],
  );

  const { instance: chatInstance, alreadyExisted } = useMemo(
    () =>
      getOrCreateChatInstance(chatId, {
        id: chatId,
        transport,
        messages: initialMessages,
        onData: (dataPart) => {
          setIsReconnecting(false);
          if (dataPart.type === "data-workspace-status") {
            setChatWorkspaceStatus(chatId, dataPart.data);
          }
          triggerBillingSync();
        },
        onFinish: () => {
          setIsReconnecting(false);
          triggerBillingSync();
          const shouldReconcileAfterDrop = forceReconcileOnFinishRef.current;
          forceReconcileOnFinishRef.current = false;
          const dedupedLocal = dedupeMessageList(chatInstance.messages);
          if (
            dedupedLocal.length !== chatInstance.messages.length ||
            dedupedLocal.some((m, i) => m !== chatInstance.messages[i])
          ) {
            chat.setMessages(dedupedLocal);
          }
          const lastMsg = dedupedLocal[dedupedLocal.length - 1];
          const hasNonErrorReply =
            lastMsg?.role === "assistant" &&
            lastMsg.parts.some(
              (p) =>
                (p.type === "text" &&
                  p.text.trim().length > 0 &&
                  !isFriendlyChatErrorText(p.text)) ||
                p.type.startsWith("tool-") ||
                p.type === "reasoning",
            );
          if (hasNonErrorReply) {
            chat.clearError();
          }
          if (!hasNonErrorReply || shouldReconcileAfterDrop) {
            void fetch(`/api/sessions/${sessionId}/chats/${chatId}`, {
              cache: "no-store",
            })
              .then(async (res) => {
                if (!res.ok) return;
                const data = (await res.json()) as {
                  messages?: WebAgentUIMessage[];
                };
                if (Array.isArray(data.messages) && data.messages.length > 0) {
                  chat.setMessages(
                    mergePreservingLocalWork(
                      data.messages,
                      chatInstance.messages,
                    ),
                  );
                }
              })
              .catch(() => {});
          }
        },
        onError: () => {
          setIsReconnecting(false);
          triggerBillingSync();
        },
        sendAutomaticallyWhen: shouldAutoSubmit,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only create once per chatId; init values are only used at creation time
    [chatId],
  );

  // Track explicit user-initiated stops so auto-recovery doesn't immediately
  // reconnect to the still-running server stream (the main cause of the
  // "need to tap stop 3 times on iOS" bug).
  const userStoppedRef = useRef(false);
  const retryInFlightRef = useRef(false);
  const retryGenerationRef = useRef(0);

  const stopChatStream = useCallback(() => {
    userStoppedRef.current = true;

    // Send the current assistant message snapshot so the server can persist
    // mid-step output before cancelling the workflow.
    const lastMessage = chatInstance.messages[chatInstance.messages.length - 1];
    const assistantMessage =
      lastMessage?.role === "assistant" ? lastMessage : undefined;

    // We intentionally do not await this request so UI stop stays instant.
    void fetch(`/api/chat/${chatId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assistantMessage ? { assistantMessage } : {}),
    }).catch(() => {});

    void chatInstance.stop();
    abortChatInstanceTransport(chatId);
    triggerBillingSync();
  }, [chatId, chatInstance]);

  // Compute resume only once on mount. If this tracks `chatInstance.status`
  // reactively, transient ready/submitted transitions during tool loops can
  // retrigger `resumeStream()` and replay recent chunks on top of the live
  // stream, causing visible jank.
  const shouldResumeOnMountRef = useRef(
    !!initialChatActiveStreamId &&
      (!alreadyExisted ||
        chatInstance.status === "ready" ||
        chatInstance.status === "error"),
  );

  const chat = useChat<WebAgentUIMessage>({
    chat: chatInstance,
    resume: shouldResumeOnMountRef.current,
    experimental_throttle: CHAT_UI_UPDATE_THROTTLE_MS,
  });

  /**
   * Clear a transient chat error (e.g. iOS "Load failed") and attempt to
   * resume the server-side stream if one is still active.
   *
   * When called from a manual "Retry" button we always want to reconnect, so
   * the stopped flag is reset.  When called from the automatic
   * visibility-change / online recovery handler, the flag is checked first so
   * that a user-initiated stop is respected and the stream is not silently
   * restarted.
   */
  const retryChatStream = useCallback(
    (opts?: RetryChatStreamOptions) => {
      const strategy = opts?.strategy ?? (opts?.auto ? "soft" : "hard");
      // If the user explicitly stopped the stream, don't auto-reconnect.
      // This prevents the "tap stop 3 times" loop on iOS where aborting the
      // transport causes a transient error that the auto-recovery immediately
      // reconnects.
      if (opts?.auto && userStoppedRef.current) {
        // Still clear the error so the UI doesn't show a stale error banner.
        chat.clearError();
        return;
      }
      if (
        opts?.auto &&
        typeof navigator !== "undefined" &&
        navigator.onLine === false
      ) {
        return;
      }
      if (retryInFlightRef.current && strategy === "soft") {
        return;
      }
      userStoppedRef.current = false;
      retryInFlightRef.current = true;
      const retryGeneration = ++retryGenerationRef.current;

      void (async () => {
        try {
          if (strategy === "hard") {
            // Manual retry: clear the error IMMEDIATELY for snappy feedback.
            chat.clearError();
          }

          // Check authoritative server state FIRST before assuming a live
          // stream exists. If the workflow already completed while the client
          // was offline/away, reconcile silently without flashing
          // "Reconnecting to live stream".
          let serverKnownStreaming: boolean | null = null;
          let serverSnapshotData: {
            status?: string;
            messages?: WebAgentUIMessage[];
            isStreaming?: boolean;
          } | null = null;

          try {
            const probeRes = await fetch(
              `/api/sessions/${sessionId}/chats/${chatId}`,
              { cache: "no-store" },
            );
            if (probeRes.ok) {
              serverSnapshotData = (await probeRes.json()) as {
                status?: string;
                messages?: WebAgentUIMessage[];
                isStreaming?: boolean;
              };
              serverKnownStreaming = Boolean(serverSnapshotData?.isStreaming);
            }
          } catch {
            // Network probe failed; fall through to resumeStream() attempt.
          }

          if (retryGenerationRef.current !== retryGeneration) {
            return;
          }

          if (serverKnownStreaming === false && serverSnapshotData) {
            if (
              chatInstance.status === "streaming" ||
              chatInstance.status === "submitted"
            ) {
              try {
                await chatInstance.stop();
              } catch {
                // Ignore stop failure
              }
              abortChatInstanceTransport(chatId);
            }

            const mergedMessages = serverSnapshotData.messages
              ? mergePreservingLocalWork(
                  serverSnapshotData.messages,
                  chatInstance.messages,
                )
              : chatInstance.messages;
            if (serverSnapshotData.messages) {
              chat.setMessages(mergedMessages);
            }
            clearChatWorkspaceStatus(chatId);
            triggerBillingSync();

            const lastMerged = mergedMessages[mergedMessages.length - 1];
            const lastIsCompletedNonErrorAssistant =
              lastMerged?.role === "assistant" &&
              lastMerged.parts.some(
                (part) =>
                  (part.type === "text" &&
                    part.text.trim().length > 0 &&
                    !isFriendlyChatErrorText(part.text)) ||
                  part.type.startsWith("tool-") ||
                  part.type === "reasoning",
              );

            if (
              serverSnapshotData.status === "completed" ||
              (serverSnapshotData.status !== "failed" &&
                serverSnapshotData.status !== "cancelled" &&
                lastIsCompletedNonErrorAssistant)
            ) {
              chat.clearError();
              return;
            }

            if (userStoppedRef.current) {
              return;
            }

            const retryAction = getDeadTurnRetryAction(
              mergedMessages,
              strategy === "hard" ? "hard" : "soft",
            );
            if (retryAction === "continue") {
              await chat.sendMessage({
                text: CONTINUE_AFTER_ERROR_PROMPT,
              });
            } else if (retryAction === "regenerate") {
              await chat.regenerate();
            }
            return;
          }

          // Server confirmed an active stream (or probe failed and we are
          // attempting recovery). Now show the reconnecting indicator.
          setIsReconnecting(true);

          if (strategy === "hard" || strategy === "reconnect") {
            // Tear down any stale/hung local fetch before reconnecting.
            try {
              await chatInstance.stop();
            } catch {
              // Ignore stale local stop failures and still attempt reconnect.
            }
            abortChatInstanceTransport(chatId);
          }

          if (serverSnapshotData?.messages) {
            chat.setMessages(
              mergePreservingLocalWork(
                serverSnapshotData.messages,
                chatInstance.messages,
              ),
            );
          }

          const messagesBeforeResume = chatInstance.messages;
          const lastMessageIdBeforeResume =
            messagesBeforeResume[messagesBeforeResume.length - 1]?.id;

          await chat.resumeStream();

          const messagesAfterResume = chatInstance.messages;
          const lastMessageIdAfterResume =
            messagesAfterResume[messagesAfterResume.length - 1]?.id;
          const resumeAttachedToNothing =
            messagesAfterResume.length === messagesBeforeResume.length &&
            lastMessageIdAfterResume === lastMessageIdBeforeResume &&
            chatInstance.status !== "streaming" &&
            chatInstance.status !== "submitted";

          const shouldReconcileSnapshot =
            resumeAttachedToNothing ||
            chatInstance.status === "streaming" ||
            chatInstance.status === "submitted";

          if (shouldReconcileSnapshot) {
            try {
              const res = await fetch(
                `/api/sessions/${sessionId}/chats/${chatId}`,
                {
                  cache: "no-store",
                },
              );
              if (!res.ok) {
                return;
              }
              const data = (await res.json()) as {
                status?: string;
                messages?: WebAgentUIMessage[];
                isStreaming?: boolean;
              };
              if (!data?.isStreaming) {
                if (
                  chatInstance.status === "streaming" ||
                  chatInstance.status === "submitted"
                ) {
                  try {
                    await chatInstance.stop();
                  } catch {
                    // Ignore stop failure
                  }
                  abortChatInstanceTransport(chatId);
                }
                const mergedMessages = data?.messages
                  ? mergePreservingLocalWork(
                      data.messages,
                      chatInstance.messages,
                    )
                  : chatInstance.messages;
                if (data?.messages) {
                  chat.setMessages(mergedMessages);
                }
                clearChatWorkspaceStatus(chatId);
                triggerBillingSync();

                const lastMerged = mergedMessages[mergedMessages.length - 1];
                const lastIsCompletedNonErrorAssistant =
                  lastMerged?.role === "assistant" &&
                  lastMerged.parts.some(
                    (part) =>
                      (part.type === "text" &&
                        part.text.trim().length > 0 &&
                        !isFriendlyChatErrorText(part.text)) ||
                      part.type.startsWith("tool-") ||
                      part.type === "reasoning",
                  );

                if (
                  data?.status === "completed" ||
                  (data?.status !== "failed" &&
                    data?.status !== "cancelled" &&
                    lastIsCompletedNonErrorAssistant)
                ) {
                  chat.clearError();
                  return;
                }

                if (userStoppedRef.current) {
                  return;
                }

                const retryAction = getDeadTurnRetryAction(
                  mergedMessages,
                  strategy === "hard" ? "hard" : "soft",
                );
                if (retryAction === "continue") {
                  await chat.sendMessage({
                    text: CONTINUE_AFTER_ERROR_PROMPT,
                  });
                } else if (retryAction === "regenerate") {
                  await chat.regenerate();
                }
                return;
              }
              if (resumeAttachedToNothing) {
                if (data?.messages) {
                  chat.setMessages(
                    mergePreservingLocalWork(
                      data.messages,
                      chatInstance.messages,
                    ),
                  );
                }
                chat.clearError();
                abortChatInstanceTransport(chatId);
                await chat.resumeStream();
                return;
              }
            } catch {
              return;
            }

            if (!resumeAttachedToNothing || userStoppedRef.current) {
              return;
            }

            const retryAction = getDeadTurnRetryAction(
              messagesBeforeResume,
              strategy === "hard" ? "hard" : "soft",
            );
            if (retryAction === "continue") {
              await chat.sendMessage({
                text: CONTINUE_AFTER_ERROR_PROMPT,
              });
            } else if (retryAction === "regenerate") {
              await chat.regenerate();
            }
          }
        } catch (error) {
          console.error("[chat-runtime] retryChatStream failed", {
            chatId,
            strategy,
            error,
          });
        } finally {
          if (retryGenerationRef.current === retryGeneration) {
            retryInFlightRef.current = false;
            setIsReconnecting(false);
          }
        }
      })();
    },
    [chat, chatId, chatInstance, sessionId],
  );

  // Reset the user-stopped flag when a new message is sent so that
  // auto-recovery works normally for the new stream.
  useEffect(() => {
    if (chat.status === "submitted") {
      userStoppedRef.current = false;
      clearChatWorkspaceStatus(chatId);
      return;
    }

    if (chat.status === "ready" || chat.status === "error") {
      clearChatWorkspaceStatus(chatId);
    }
  }, [chat.status, chatId]);

  useEffect(() => {
    if (!workspaceStatus) {
      return;
    }

    const lastMessage = chat.messages[chat.messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.parts.length > 0) {
      clearChatWorkspaceStatus(chatId);
    }
  }, [chat.messages, chatId, workspaceStatus]);

  const clearWorkspaceStatus = useCallback(() => {
    clearChatWorkspaceStatus(chatId);
  }, [chatId]);

  // Reactive resume fallback.
  //
  // `useChat({ resume })` only evaluates its argument once at mount, based on
  // SSR-time `initialChatActiveStreamId`. That leaves a gap: if the user
  // submits a message, navigates away before the server persists
  // `activeStreamId`, and comes back quickly, the page can SSR with
  // `activeStreamId = null` even though a workflow is (or is about to be)
  // running. The server-side fix — having the workflow self-register its
  // runId on step 1 — means the slot becomes populated shortly after the
  // workflow starts executing, but we need to discover that from the client.
  //
  // Strategy: if we mounted without a known active stream AND the
  // conversation ends with an unanswered user message, probe the resume
  // endpoint a few times with backoff. `GET /api/chat/:id/stream` returns
  // 204 when there's no active stream (cheap), so this is safe to call
  // speculatively.
  useEffect(() => {
    const lastMessage = chatInstance.messages[chatInstance.messages.length - 1];
    const endsWithUserMessage = lastMessage?.role === "user";
    const hasUnfinishedAssistant =
      lastMessage?.role === "assistant" &&
      !lastMessage.parts.some(
        (p) =>
          (p.type as string) === "step-finish" ||
          (p.type as string) === "finish",
      );

    // If there is no active stream recorded and no in-flight turn in SSR props,
    // still run a single immediate check against the server in case Next.js
    // router cache served stale SSR state after navigating away and back.
    if (
      !initialChatActiveStreamId &&
      !endsWithUserMessage &&
      !hasUnfinishedAssistant
    ) {
      let cancelled = false;
      void fetch(`/api/sessions/${sessionId}/chats/${chatId}`, {
        cache: "no-store",
      })
        .then(async (res) => {
          if (cancelled || !res.ok) return;
          const data = (await res.json()) as {
            isStreaming?: boolean;
            messages?: WebAgentUIMessage[];
          };
          if (cancelled) return;
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            chat.setMessages(
              mergePreservingLocalWork(data.messages, chatInstance.messages),
            );
          }
          if (
            data.isStreaming &&
            chatInstance.status === "ready" &&
            !userStoppedRef.current
          ) {
            setIsReconnecting(true);
            await chat.resumeStream();
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setIsReconnecting(false);
        });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    // If `useChat({ resume: true })` already initiated resume on mount,
    // skip the 0ms duplicate probe so we don't attach twice simultaneously.
    const delaysMs = shouldResumeOnMountRef.current
      ? [1_500, 3_500, 7_000]
      : [0, 1_000, 2_500, 5_500, 10_000];
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const attemptResume = async () => {
      if (cancelled || retryInFlightRef.current || userStoppedRef.current) {
        return;
      }

      // Skip if a local send / resume is already in flight for this chat.
      const status = chatInstance.status;
      if (status !== "ready") {
        return;
      }

      try {
        // GET /api/chat/:id/stream returns 204 when there's no active stream
        // (cheap no-op for the AI SDK) and 200 + stream bytes when one is
        // live. resumeStream handles both paths.
        await chat.resumeStream();
      } catch {
        // Transient failure (network, stale session, etc.) — let the next
        // scheduled attempt retry.
      }
    };

    const schedule = (index: number) => {
      if (cancelled || index >= delaysMs.length) return;
      timeoutId = setTimeout(async () => {
        await attemptResume();
        if (cancelled) return;
        // Keep probing until budget exhausted. Once resume attaches to a
        // live stream, subsequent attempts self-skip via the status guard.
        schedule(index + 1);
      }, delaysMs[index]);
    };

    schedule(0);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only probe; chatInstance/chat identities are stable per chatId
  }, [chatId, initialChatActiveStreamId]);

  // Cleanup: release per-route chat instances and abort local transport
  // connections so unmounted routes do not keep consuming client resources.
  //
  // Important: do NOT call chatInstance.stop() during route teardown.
  // stop() publishes a server stop signal; when users leave the page during
  // long-running tool/subagent work that would cancel generation and drop
  // persistence. We only stop explicitly via the UI stop action.
  useEffect(() => {
    return () => {
      cleanupChatRouteOnUnmount(chatId);
    };
  }, [chatId]);

  const getLastChunkReceivedAt = useCallback(
    () => transport.getLastChunkReceivedAt(),
    [transport],
  );

  return {
    chat,
    stopChatStream,
    retryChatStream,
    getLastChunkReceivedAt,
    isReconnecting,
    workspaceStatus,
    clearWorkspaceStatus,
  };
}
