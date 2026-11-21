"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TerminalExecResponse } from "@/app/api/sessions/[sessionId]/terminal/route";
import {
  countFailures,
  formatUntilFixPrompt,
  parseUntilCommand,
} from "@/lib/until/parse";
import type { UntilEnd, UntilEndNotice, UntilState } from "@/lib/until/types";

const HOLD_GREEN_MS = 1900;
const HOLD_END_MS = 1300;
const storageKey = (chatId: string) => `entry:until:${chatId}`;

export type ChatScopedUntilEntry = {
  chatId: string;
  state: UntilState | null;
};

export function readStoredUntilState(chatId: string): UntilState | null {
  if (typeof window === "undefined" || !chatId) return null;
  try {
    const raw = localStorage.getItem(storageKey(chatId));
    return raw ? (JSON.parse(raw) as UntilState) : null;
  } catch {
    return null;
  }
}

export function writeStoredUntilState(entry: ChatScopedUntilEntry): void {
  if (typeof window === "undefined" || !entry.chatId) return;
  try {
    if (entry.state) {
      localStorage.setItem(
        storageKey(entry.chatId),
        JSON.stringify(entry.state),
      );
    } else {
      localStorage.removeItem(storageKey(entry.chatId));
    }
  } catch {
    // Ignore storage errors
  }
}

export function resolveUntilForChat(
  entry: ChatScopedUntilEntry,
  chatId: string,
): UntilState | null {
  return entry.chatId === chatId ? entry.state : null;
}

export function useUntilLoop({
  sessionId,
  chatId,
  isChatInFlight,
  onSendFixPrompt,
}: {
  sessionId: string;
  chatId: string;
  isChatInFlight: boolean;
  onSendFixPrompt: (prompt: string) => Promise<void>;
}) {
  const [untilEntry, setUntilEntry] = useState<ChatScopedUntilEntry>(() => ({
    chatId,
    state: readStoredUntilState(chatId),
  }));
  const [ended, setEnded] = useState<UntilEndNotice | null>(null);

  const until = resolveUntilForChat(untilEntry, chatId);

  const activeChatIdRef = useRef(chatId);
  activeChatIdRef.current = chatId;
  const isChatInFlightRef = useRef(isChatInFlight);
  isChatInFlightRef.current = isChatInFlight;

  const runningCheckRef = useRef(false);
  const wasInFlightRef = useRef(isChatInFlight);
  const endTimerRef = useRef<number | null>(null);

  // Reload /until state whenever chatId changes so switching chats without
  // unmounting never leaks one chat's loop or localStorage entry into another.
  useEffect(() => {
    setUntilEntry((prev) =>
      prev.chatId === chatId
        ? prev
        : { chatId, state: readStoredUntilState(chatId) },
    );
    setEnded(null);
    runningCheckRef.current = false;
    wasInFlightRef.current = isChatInFlightRef.current;
    if (endTimerRef.current) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }, [chatId]);

  useEffect(() => {
    writeStoredUntilState(untilEntry);
  }, [untilEntry]);

  useEffect(() => {
    return () => {
      if (endTimerRef.current) {
        window.clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }
    };
  }, []);

  const finishWithNotice = useCallback(
    (
      targetChatId: string,
      snapshot: UntilState,
      end: UntilEnd,
      text: string,
    ) => {
      setUntilEntry({ chatId: targetChatId, state: null });
      if (activeChatIdRef.current !== targetChatId) return;
      setEnded({ state: snapshot, end, text });
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      endTimerRef.current = window.setTimeout(
        () => setEnded(null),
        end === "passed" ? HOLD_GREEN_MS : HOLD_END_MS,
      );
    },
    [],
  );

  const runCheck = useCallback(
    async (current: UntilState) => {
      if (runningCheckRef.current) return;
      const runChatId = chatId;
      runningCheckRef.current = true;
      const checkingState: UntilState = {
        ...current,
        phase: "checking",
        since: Date.now(),
      };
      setUntilEntry({ chatId: runChatId, state: checkingState });

      try {
        const res = await fetch(`/api/sessions/${sessionId}/terminal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: current.check }),
        });

        if (activeChatIdRef.current !== runChatId) return;

        if (!res.ok) {
          setUntilEntry({
            chatId: runChatId,
            state: { ...current, phase: "paused" },
          });
          toast.error("Failed to run /until check in sandbox");
          return;
        }

        const data = (await res.json()) as TerminalExecResponse;
        if (activeChatIdRef.current !== runChatId) return;

        const combinedOutput = [data.stdout, data.stderr]
          .filter(Boolean)
          .join("\n");

        if (data.exitCode === 0) {
          finishWithNotice(
            runChatId,
            checkingState,
            "passed",
            `Passed: ${current.check}`,
          );
          return;
        }

        const failing = countFailures(combinedOutput);
        if (current.round >= current.rounds) {
          finishWithNotice(
            runChatId,
            { ...checkingState, failing },
            "capped",
            `Stopped after ${current.rounds} rounds`,
          );
          return;
        }

        const nextState: UntilState = {
          check: current.check,
          round: current.round + 1,
          rounds: current.rounds,
          phase: "armed",
          failing,
        };
        setUntilEntry({ chatId: runChatId, state: nextState });

        const fixPrompt = formatUntilFixPrompt({
          check: current.check,
          round: current.round,
          rounds: current.rounds,
          exitCode: data.exitCode ?? 1,
          output: combinedOutput,
        });
        await onSendFixPrompt(fixPrompt);
      } catch {
        if (activeChatIdRef.current === runChatId) {
          setUntilEntry({
            chatId: runChatId,
            state: { ...current, phase: "paused" },
          });
        }
      } finally {
        if (activeChatIdRef.current === runChatId) {
          runningCheckRef.current = false;
        }
      }
    },
    [chatId, sessionId, finishWithNotice, onSendFixPrompt],
  );

  // When an active turn finishes while armed, run the verification check.
  useEffect(() => {
    const wasInFlight = wasInFlightRef.current;
    wasInFlightRef.current = isChatInFlight;

    if (wasInFlight && !isChatInFlight && until?.phase === "armed") {
      void runCheck(until);
    }
  }, [isChatInFlight, until, runCheck]);

  const stopUntil = useCallback(() => {
    if (!until) return;
    finishWithNotice(chatId, until, "stopped", `Stopped: ${until.check}`);
  }, [chatId, until, finishWithNotice]);

  const checkNow = useCallback(() => {
    if (!until || isChatInFlight) return;
    void runCheck(until);
  }, [until, isChatInFlight, runCheck]);

  /**
   * Returns `true` if `text` was an `/until` command and handled locally.
   */
  const tryHandleUntilCommand = useCallback(
    (text: string): boolean => {
      const parsed = parseUntilCommand(text);
      if (!parsed) return false;

      if (parsed.kind === "empty") {
        toast.info("Add a check after /until, like /until pnpm test");
        return true;
      }

      if (parsed.kind === "off") {
        if (until) {
          stopUntil();
        } else {
          toast.info("No /until check is active");
        }
        return true;
      }

      const next: UntilState = {
        check: parsed.check,
        round: 1,
        rounds: parsed.rounds,
        phase: "armed",
      };
      setEnded(null);
      setUntilEntry({ chatId, state: next });

      if (!isChatInFlight) {
        void runCheck(next);
      }
      return true;
    },
    [chatId, until, stopUntil, isChatInFlight, runCheck],
  );

  return {
    until,
    ended,
    stopUntil,
    checkNow,
    tryHandleUntilCommand,
  };
}
