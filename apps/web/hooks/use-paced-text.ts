"use client";

import { useEffect, useRef, useState } from "react";

export const TEXT_RENDER_PACE_MS = 16;
export const TEXT_RENDER_SNAP = /[\s.,!?;:)\]}\n]/;

/**
 * Computes the next character slice end index for smooth frame-paced streaming.
 * Adapts to both elapsed frame time (dtMs) and bursty network backlogs so
 * slow/jittery connections glide smoothly without stalling or falling behind.
 */
export function nextSliceEnd(
  target: string,
  currentLength: number,
  dtMs = 16.67,
): number {
  const backlog = target.length - currentLength;
  if (backlog <= 0) return target.length;

  // Scale step with frame delta (clamped 0.5x..4x) so dropped frames on slow
  // devices or backgrounded tabs catch up proportionally without jumping.
  const frameScale = Math.min(4, Math.max(0.5, dtMs / 16.67));

  // When a slow network delivers a large burst after a stall (> 120 chars),
  // accelerate catch-up so the UI doesn't lag seconds behind the stream.
  const baseStep =
    backlog > 120
      ? Math.min(240, Math.ceil(backlog / 4))
      : Math.min(64, Math.max(2, Math.ceil(backlog / 6)));

  const step = Math.max(2, Math.round(baseStep * frameScale));
  const end = Math.min(target.length, currentLength + step);
  const max = Math.min(target.length, end + 8);

  for (let i = end; i < max; i++) {
    if (TEXT_RENDER_SNAP.test(target[i] ?? "")) {
      return i + 1;
    }
  }

  return end;
}

/**
 * Paced text reveal hook inspired by OpenCode's paced-text-machine.
 * Uses a continuous requestAnimationFrame loop (without tearing down rAF on every frame)
 * and dt-scaled adaptive pacing so bursty/slow-internet streams animate smoothly.
 * Automatically flushes when streaming completes.
 */
export function usePacedText(text: string, isStreaming: boolean): string {
  const [shownText, setShownText] = useState(text);
  const targetRef = useRef(text);
  const shownLengthRef = useRef(text.length);
  const isStreamingRef = useRef(isStreaming);
  const loopActiveRef = useRef(false);

  targetRef.current = text;
  isStreamingRef.current = isStreaming;

  useEffect(() => {
    // When not streaming, immediately sync to final text
    if (!isStreaming) {
      loopActiveRef.current = false;
      shownLengthRef.current = text.length;
      setShownText(text);
      return;
    }

    // If target text shrank or was replaced (not an append), sync immediately
    if (
      text.length < shownLengthRef.current ||
      !text.startsWith(shownText.slice(0, shownLengthRef.current))
    ) {
      shownLengthRef.current = text.length;
      setShownText(text);
      return;
    }

    // Already caught up or loop already running for this append
    if (shownLengthRef.current >= text.length || loopActiveRef.current) {
      return;
    }

    loopActiveRef.current = true;
    let cancelled = false;
    let frameId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let lastTick =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const hasRaf =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function";

    const scheduleNext = () => {
      if (cancelled) return;
      if (hasRaf) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        timerId = setTimeout(tick, TEXT_RENDER_PACE_MS);
      }
    };

    const tick = () => {
      if (cancelled) return;

      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const dtMs = Math.max(4, now - lastTick);
      lastTick = now;

      const target = targetRef.current;
      const currentLen = shownLengthRef.current;

      if (!isStreamingRef.current || currentLen >= target.length) {
        loopActiveRef.current = false;
        if (currentLen !== target.length) {
          shownLengthRef.current = target.length;
          setShownText(target);
        }
        return;
      }

      const nextEnd = nextSliceEnd(target, currentLen, dtMs);
      shownLengthRef.current = nextEnd;
      setShownText(target.slice(0, nextEnd));

      if (nextEnd < target.length && isStreamingRef.current) {
        scheduleNext();
      } else {
        loopActiveRef.current = false;
      }
    };

    scheduleNext();

    return () => {
      cancelled = true;
      loopActiveRef.current = false;
      if (
        frameId !== undefined &&
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(frameId);
      }
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    };
    // Intentionally omit `shownText` so the rAF loop runs continuously without
    // tearing down and re-registering on every single frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, isStreaming]);

  return isStreaming ? shownText : text;
}
