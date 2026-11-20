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
  const [until, setUntil] = useState<UntilState | null>(() => {
    if (typeof window === "undefined" || !chatId) return null;
    try {
      const raw = localStorage.getItem(storageKey(chatId));
      return raw ? (JSON.parse(raw) as UntilState) : null;
    } catch {
      return null;
    }
  });
  const [ended, setEnded] = useState<UntilEndNotice | null>(null);

  const runningCheckRef = useRef(false);
  const wasInFlightRef = useRef(isChatInFlight);
  const endTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !chatId) return;
    try {
      if (until) {
        localStorage.setItem(storageKey(chatId), JSON.stringify(until));
      } else {
        localStorage.removeItem(storageKey(chatId));
      }
    } catch {
      // Ignore storage errors
    }
  }, [until, chatId]);

  const finishWithNotice = useCallback(
    (snapshot: UntilState, end: UntilEnd, text: string) => {
      setUntil(null);
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
      runningCheckRef.current = true;
      const checkingState: UntilState = {
        ...current,
        phase: "checking",
        since: Date.now(),
      };
      setUntil(checkingState);

      try {
        const res = await fetch(`/api/sessions/${sessionId}/terminal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: current.check }),
        });

        if (!res.ok) {
          setUntil({ ...current, phase: "paused" });
          toast.error("Failed to run /until check in sandbox");
          return;
        }

        const data = (await res.json()) as TerminalExecResponse;
        const combinedOutput = [data.stdout, data.stderr]
          .filter(Boolean)
          .join("\n");

        if (data.exitCode === 0) {
          finishWithNotice(checkingState, "passed", `Passed: ${current.check}`);
          return;
        }

        const failing = countFailures(combinedOutput);
        if (current.round >= current.rounds) {
          finishWithNotice(
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
        setUntil(nextState);

        const fixPrompt = formatUntilFixPrompt({
          check: current.check,
          round: current.round,
          rounds: current.rounds,
          exitCode: data.exitCode ?? 1,
          output: combinedOutput,
        });
        await onSendFixPrompt(fixPrompt);
      } catch {
        setUntil({ ...current, phase: "paused" });
      } finally {
        runningCheckRef.current = false;
      }
    },
    [sessionId, finishWithNotice, onSendFixPrompt],
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
    finishWithNotice(until, "stopped", `Stopped: ${until.check}`);
  }, [until, finishWithNotice]);

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
      setUntil(next);

      if (!isChatInFlight) {
        void runCheck(next);
      }
      return true;
    },
    [until, stopUntil, isChatInFlight, runCheck],
  );

  return {
    until,
    ended,
    stopUntil,
    checkNow,
    tryHandleUntilCommand,
  };
}
