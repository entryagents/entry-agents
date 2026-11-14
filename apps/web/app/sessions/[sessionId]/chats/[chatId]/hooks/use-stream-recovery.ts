"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ChatUiStatus } from "@/lib/chat-streaming-state";
import {
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
const HUNG_STREAM_THRESHOLD_MS = 45_000;

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
  onReconcileSnapshot,
}: UseStreamRecoveryParams): void {
  const inFlightStartedAtRef = useRef<number | null>(null);
  const lastStreamRecoveryAtRef = useRef(0);
  const streamRecoveryProbeInFlightRef = useRef(false);
  const lastServerStampRef = useRef<{
    chatId: string;
    stamp: string;
    isStreaming: boolean;
  } | null>(null);

  // Keep the recovery logic in a ref so event-listener effects never
  // churn during streaming. The ref is updated on every render (cheap) while
  // the stable wrapper below keeps a constant identity for effects.
  const maybeRecoverStreamRef = useRef(
    (_opts?: { isVisibilityRecovery?: boolean }) => {},
  );
  maybeRecoverStreamRef.current = (opts?: {
    isVisibilityRecovery?: boolean;
  }) => {
    const now = Date.now();
    const recoveryDecision = getStreamRecoveryDecision({
      now,
      lastRecoveryAt: lastStreamRecoveryAtRef.current,
      status,
      hasAssistantRenderableContent,
      inFlightStartedAt: inFlightStartedAtRef.current,
      isProbeInFlight: streamRecoveryProbeInFlightRef.current,
      isVisibilityRecovery: opts?.isVisibilityRecovery,
      minIntervalMs: 2_000,
    });

    if (recoveryDecision === "none") {
      return;
    }

    lastStreamRecoveryAtRef.current = now;

    if (recoveryDecision === "retry-error") {
      retryChatStream({ auto: true });
      return;
    }

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

        if (!serverChat?.isStreaming) {
          // If the client thinks the chat is in flight, or the server completed/updated
          // a turn while this tab was backgrounded/offline/idle (including before mount),
          // reconcile immediately so the user never has to reload the page to see latest results.
          if (isChatInFlight) {
            retryChatStream({ auto: true, strategy: "soft" });
          } else if (
            (previous !== null && previous.stamp !== serverStamp) ||
            (previous === null && hasPendingTurn)
          ) {
            await onReconcileSnapshot?.();
          }
          return;
        }

        // Attach when this device is not yet streaming or errored out.
        if (!isChatInFlight || status === "error") {
          retryChatStream({ auto: true, strategy: "soft" });
          return;
        }

        // Watchdog: if the server reports an active stream and this client believes
        // it is in flight, but the open SSE socket has delivered zero bytes for
        // >45s (half-open mobile/proxy socket), tear down the hung fetch & reconnect.
        const lastChunkAt = getLastChunkReceivedAt?.() ?? 0;
        if (
          lastChunkAt > 0 &&
          Date.now() - lastChunkAt > HUNG_STREAM_THRESHOLD_MS
        ) {
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

  useEffect(() => {
    if (isChatInFlight) {
      if (inFlightStartedAtRef.current === null) {
        inFlightStartedAtRef.current = Date.now();
      }
      return;
    }

    inFlightStartedAtRef.current = null;
  }, [isChatInFlight, chatId]);

  // Recover from transient connection drops when the tab regains visibility
  // or the network comes back. Visibility/focus events pass
  // isVisibilityRecovery so the policy also probes when the chat appears idle
  // (the browser may have silently killed the connection while backgrounded).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        maybeRecoverStreamOnVisibility();
      }
    };

    const onFocus = () => {
      maybeRecoverStreamOnVisibility();
    };

    const onOnline = () => {
      retryChatStream({
        auto: true,
        strategy: isChatInFlight ? "reconnect" : "soft",
      });
      maybeRecoverStreamOnVisibility();
    };

    document.addEventListener("visibilitychange", onVisible);
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
        maybeRecoverStreamOnVisibility();
      }
    }, RECOVERY_POLL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.clearInterval(recoveryPoll);
    };
  }, [
    maybeRecoverStream,
    maybeRecoverStreamOnVisibility,
    isChatInFlight,
    retryChatStream,
  ]);

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
