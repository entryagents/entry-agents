"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChatUiStatus } from "@/lib/chat-streaming-state";
import {
  isChatStoppedByUser,
  markChatStoppedByUser,
} from "@/lib/chat/stop-latch";
import { reportChatDiagnostic } from "@/lib/chat/report-chat-diagnostic";
import { StreamDivergenceTracker } from "@/lib/chat/stream-divergence-tracker";
import {
  SUBMITTED_PROBE_GRACE_MS,
  getStreamRecoveryDecision,
  getStreamRecoveryDelayMs,
  isChatStreamingProbeResponse,
  shouldScheduleStallRecovery,
} from "../stream-recovery-policy";

/**
 * How often a viewer re-probes the run while it believes a turn is in
 * flight. Long enough to be invisible against the API, short enough that
 * a returned user sees their conversation catch up without touching
 * anything. Only controls polling -- never whether we reconnect.
 */
const RECOVERY_POLL_INTERVAL_MS = 2_500;

type RetryChatStream = (opts?: {
  auto?: boolean;
  strategy?: "hard" | "soft" | "reconnect";
}) => void;

type UseStreamRecoveryParams = {
  sessionId: string;
  chatId: string;
  status: ChatUiStatus;
  isChatInFlight: boolean;
  hasAssistantRenderableContent: boolean;
  hasPendingTurn?: boolean;
  retryChatStream: RetryChatStream;
  getLastChunkReceivedAt?: () => number;
  getLastUiChunkReceivedAt?: () => number;
  getActiveWorkflowRunId?: () => string | null;
  hasActiveSendMessages?: () => boolean;
  isStreamOperationActive?: () => boolean;
  onReconcileSnapshot?: () => Promise<void> | void;
};

export function useStreamRecovery({
  sessionId,
  chatId,
  status,
  isChatInFlight,
  hasAssistantRenderableContent,
  hasPendingTurn = false,
  retryChatStream,
  getLastChunkReceivedAt,
  getLastUiChunkReceivedAt,
  getActiveWorkflowRunId,
  hasActiveSendMessages,
  isStreamOperationActive,
  onReconcileSnapshot,
}: UseStreamRecoveryParams): void {
  const inFlightStartedAtRef = useRef<number | null>(null);
  const divergenceTrackerRef = useRef(new StreamDivergenceTracker());
  const retryChatStreamRef = useRef(retryChatStream);
  retryChatStreamRef.current = retryChatStream;
  const liveStateRef = useRef({
    status,
    isChatInFlight,
    hasAssistantRenderableContent,
    hasPendingTurn,
  });
  liveStateRef.current = {
    status,
    isChatInFlight,
    hasAssistantRenderableContent,
    hasPendingTurn,
  };
  const lastStreamRecoveryAtRef = useRef(0);
  const streamRecoveryProbeInFlightRef = useRef(false);
  const hasAutoRetriedCurrentErrorRef = useRef(false);
  const lastServerStampRef = useRef<{
    chatId: string;
    stamp: string;
    isStreaming: boolean;
  } | null>(null);

  useEffect(() => {
    if (status !== "error") {
      hasAutoRetriedCurrentErrorRef.current = false;
    }
  }, [status, chatId]);

  // Keep the recovery logic in a ref so event-listener effects never
  // churn during streaming. The ref is updated on every render (cheap) while
  // the stable wrapper below keeps a constant identity for effects.
  const maybeRecoverStreamRef = useRef(
    (_opts?: { isVisibilityRecovery?: boolean; isPoll?: boolean }) => {},
  );
  maybeRecoverStreamRef.current = (opts?: {
    isVisibilityRecovery?: boolean;
    isPoll?: boolean;
  }) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return;
    }

    if (isChatStoppedByUser(chatId)) {
      return;
    }

    const initialLive = liveStateRef.current;
    const now = Date.now();
    const recoveryDecision = getStreamRecoveryDecision({
      now,
      lastRecoveryAt: lastStreamRecoveryAtRef.current,
      status: initialLive.status,
      hasAssistantRenderableContent: initialLive.hasAssistantRenderableContent,
      inFlightStartedAt: inFlightStartedAtRef.current,
      isProbeInFlight: streamRecoveryProbeInFlightRef.current,
      isVisibilityRecovery: Boolean(opts?.isVisibilityRecovery || opts?.isPoll),
      hasActiveSendMessages: hasActiveSendMessages?.() ?? false,
      minIntervalMs: 2_000,
    });

    if (recoveryDecision === "none") {
      return;
    }

    if (recoveryDecision === "retry-error") {
      if (
        hasAutoRetriedCurrentErrorRef.current ||
        isChatStoppedByUser(chatId)
      ) {
        return;
      }
      hasAutoRetriedCurrentErrorRef.current = true;
      lastStreamRecoveryAtRef.current = now;
      retryChatStream({ auto: true });
      return;
    }

    lastStreamRecoveryAtRef.current = now;

    streamRecoveryProbeInFlightRef.current = true;

    void (async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/chats`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload: unknown = await response.json();
        if (!isChatStreamingProbeResponse(payload)) {
          return;
        }

        // Read LIVE client state AFTER the async network round-trip so a mount
        // or send transition that happened while this probe was in flight is
        // never misread through a stale closure.
        const live = liveStateRef.current;
        const operationActive = isStreamOperationActive?.() ?? false;

        const serverChat = payload.chats.find((chat) => chat.id === chatId);
        const serverStamp = serverChat
          ? `${serverChat.isStreaming}:${serverChat.status ?? ""}:${serverChat.updatedAt ?? ""}:${serverChat.lastAssistantMessageAt ?? ""}`
          : "missing";
        const previous =
          lastServerStampRef.current?.chatId === chatId
            ? lastServerStampRef.current
            : null;
        lastServerStampRef.current = {
          chatId,
          stamp: serverStamp,
          isStreaming: Boolean(serverChat?.isStreaming),
        };

        if (serverChat?.status === "cancelled") {
          divergenceTrackerRef.current.reset();
          markChatStoppedByUser(chatId);
          if (previous?.stamp !== serverStamp) {
            await onReconcileSnapshot?.();
          }
          return;
        }

        if (!serverChat?.isStreaming) {
          divergenceTrackerRef.current.reset();
          // Protect the initial POST /api/chat handshake while status is
          // "submitted" (before activeStreamId is claimed in DB), bounded to
          // SUBMITTED_PROBE_GRACE_MS so a hung POST can never disable recovery
          // forever. Never block once status is "streaming".
          const withinSubmittedGrace =
            inFlightStartedAtRef.current !== null
              ? Date.now() - inFlightStartedAtRef.current <
                SUBMITTED_PROBE_GRACE_MS
              : Boolean(hasActiveSendMessages?.());
          if (live.status === "submitted" && withinSubmittedGrace) {
            return;
          }
          // If the client thinks the chat is in flight, or the server completed/updated
          // a turn while this tab was backgrounded/offline/idle (including before mount),
          // reconcile immediately so the user never has to reload the page to see latest results.
          if (live.isChatInFlight && !isChatStoppedByUser(chatId)) {
            retryChatStream({ auto: true, strategy: "soft" });
          } else if (
            live.status === "error" &&
            serverChat &&
            serverChat.status !== "failed" &&
            serverChat.status !== "cancelled"
          ) {
            await onReconcileSnapshot?.();
          } else if (
            (previous !== null && previous.stamp !== serverStamp) ||
            (previous === null && live.hasPendingTurn)
          ) {
            await onReconcileSnapshot?.();
          }
          return;
        }

        // Attach when this device is not yet streaming or errored out, and no
        // single-flight mount resume / send operation is already connecting.
        if (
          ((!live.isChatInFlight && !operationActive) ||
            live.status === "error") &&
          !isChatStoppedByUser(chatId)
        ) {
          hasAutoRetriedCurrentErrorRef.current = false;
          retryChatStream({ auto: true, strategy: "soft" });
          return;
        }

        // Protect the initial POST /api/chat handshake while status is still
        // "submitted" (before HTTP 200 SSE headers arrive), so we never abort a
        // freshly submitted request before it receives `x-workflow-run-id`.
        const nowAfterProbe = Date.now();
        const withinSubmittedGraceForLive =
          inFlightStartedAtRef.current !== null
            ? nowAfterProbe - inFlightStartedAtRef.current <
              SUBMITTED_PROBE_GRACE_MS
            : Boolean(hasActiveSendMessages?.());
        if (live.status === "submitted" && withinSubmittedGraceForLive) {
          return;
        }

        // Detect ALL three silent live-stream stalls cleanly without false positives:
        // 1. Run handoff mismatch (`serverChat.activeStreamId !== clientActiveWorkflowRunId`)
        // 2. Server-ahead-of-stream: Postgres `updatedAt` keeps advancing with new
        //    reasoning/tool checkpoints while parsed UI chunks (`lastUiChunkAt`)
        //    stay frozen (even if 10s `: keepalive\n\n` bytes keep arriving!).
        // 3. Dead TCP socket: even 10s SSE keepalives stop arriving (>25s foreground,
        //    >5s after tab visibility return).
        const clientActiveWorkflowRunId = getActiveWorkflowRunId?.() ?? null;
        const clientLastUiChunkAt = getLastUiChunkReceivedAt?.() ?? 0;
        const clientLastTransportByteAt = getLastChunkReceivedAt?.() ?? 0;
        const divergence = divergenceTrackerRef.current.evaluate({
          now: nowAfterProbe,
          serverUpdatedAt: serverChat.updatedAt,
          serverActiveStreamId: serverChat.activeStreamId,
          clientActiveWorkflowRunId,
          clientLastUiChunkAt,
          clientLastTransportByteAt,
          inFlightStartedAt: inFlightStartedAtRef.current,
          isVisibilityRecovery: Boolean(opts?.isVisibilityRecovery),
        });

        if (divergence.kind === "reconnect") {
          inFlightStartedAtRef.current = nowAfterProbe;
          reportChatDiagnostic({
            sessionId,
            chatId,
            eventType: "stream-divergence",
            workflowRunId:
              serverChat.activeStreamId ?? clientActiveWorkflowRunId,
            details: {
              reason: divergence.reason,
              serverUpdatedAt: serverChat.updatedAt,
              clientRunId: clientActiveWorkflowRunId,
              serverRunId: serverChat.activeStreamId ?? null,
              lastChunkAgeMs:
                clientLastTransportByteAt > 0
                  ? Math.max(0, nowAfterProbe - clientLastTransportByteAt)
                  : null,
              lastUiChunkAgeMs:
                clientLastUiChunkAt > 0
                  ? Math.max(0, nowAfterProbe - clientLastUiChunkAt)
                  : null,
              isVisibilityRecovery: Boolean(opts?.isVisibilityRecovery),
            },
          });
          retryChatStream({ auto: true, strategy: "reconnect" });
        }
      } catch {
        // Ignore transient probe failures and try again on next interval.
      } finally {
        streamRecoveryProbeInFlightRef.current = false;
      }
    })();
  };

  // Stable identity wrappers – safe to use in effect dependency arrays without
  // causing teardown/re-register cycles.
  const maybeRecoverStream = useCallback(() => {
    maybeRecoverStreamRef.current();
  }, []);

  const maybeRecoverStreamOnVisibility = useCallback(() => {
    maybeRecoverStreamRef.current({ isVisibilityRecovery: true });
  }, []);

  const maybeRecoverStreamOnPoll = useCallback(() => {
    maybeRecoverStreamRef.current({ isPoll: true });
  }, []);

  useEffect(() => {
    if (isChatInFlight) {
      if (inFlightStartedAtRef.current === null) {
        inFlightStartedAtRef.current = Date.now();
      }
      return;
    }

    inFlightStartedAtRef.current = null;
    divergenceTrackerRef.current.reset();
  }, [isChatInFlight, chatId]);

  // Recover from transient connection drops when the tab regains visibility
  // or the network comes back. If the tab was backgrounded for >= 30s (or
  // restored from bfcache), force an immediate reconnect/reconcile so Chrome's
  // buffered SSE chunks can never keep the UI stuck on stale progress.
  useEffect(() => {
    const LONG_BACKGROUND_THRESHOLD_MS = 30_000;
    let hiddenAt: number | null =
      document.visibilityState === "hidden" ? Date.now() : null;

    const triggerLongBackgroundRecovery = () => {
      lastStreamRecoveryAtRef.current = 0;
      hasAutoRetriedCurrentErrorRef.current = false;
      if (liveStateRef.current.isChatInFlight && !isChatStoppedByUser(chatId)) {
        retryChatStreamRef.current({ auto: true, strategy: "reconnect" });
      } else {
        maybeRecoverStreamOnVisibility();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        const hiddenDurationMs = hiddenAt !== null ? Date.now() - hiddenAt : 0;
        hiddenAt = null;
        if (hiddenDurationMs >= LONG_BACKGROUND_THRESHOLD_MS) {
          triggerLongBackgroundRecovery();
          return;
        }
        maybeRecoverStreamOnVisibility();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        triggerLongBackgroundRecovery();
      }
    };

    const onFocus = () => {
      maybeRecoverStreamOnVisibility();
    };

    const onOnline = () => {
      // Reset throttle and error auto-retry latch so online recovery runs immediately.
      lastStreamRecoveryAtRef.current = 0;
      hasAutoRetriedCurrentErrorRef.current = false;
      maybeRecoverStreamOnVisibility();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    // Poll every 2.5s across all open devices so any device viewing the same
    // chat attaches to a newly started stream in real time and reconciles
    // immediately when a stream completes.
    maybeRecoverStreamOnVisibility();
    const recoveryPoll = window.setInterval(() => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        maybeRecoverStreamOnPoll();
      }
    }, RECOVERY_POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.clearInterval(recoveryPoll);
    };
  }, [chatId, maybeRecoverStreamOnPoll, maybeRecoverStreamOnVisibility]);

  useEffect(() => {
    const isDocumentVisible =
      typeof document === "undefined" || document.visibilityState === "visible";

    if (
      !shouldScheduleStallRecovery({
        isChatInFlight,
        hasAssistantRenderableContent,
        isDocumentVisible,
      })
    ) {
      return;
    }

    const waitMs = getStreamRecoveryDelayMs({
      now: Date.now(),
      inFlightStartedAt: inFlightStartedAtRef.current,
    });
    const timeout = setTimeout(() => {
      maybeRecoverStream();
    }, waitMs);

    return () => clearTimeout(timeout);
  }, [isChatInFlight, hasAssistantRenderableContent, maybeRecoverStream]);
}
