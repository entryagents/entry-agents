"use client";

import { useEffect, useRef, useState } from "react";

export const TEXT_RENDER_PACE_MS = 20;
export const TEXT_RENDER_SNAP = /[\s.,!?;:)\]}\n]/;

export function nextSliceEnd(target: string, currentLength: number): number {
  const backlog = target.length - currentLength;
  if (backlog <= 0) return target.length;

  // Reveal a chunk of 2-64 chars per screen refresh frame (60Hz / 120Hz / 144Hz)
  // Scaled so high-frequency LLM token streams glide smoothly without visual backlog delay
  const step = Math.min(64, Math.max(2, Math.ceil(backlog / 6)));
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
 * Smoothly streams text chunks locked to the user's screen refresh rate (60Hz, 120Hz ProMotion, 144Hz)
 * via requestAnimationFrame, avoiding token-burst jitter, layout shifts, or stuttering.
 * Automatically flushes when streaming completes.
 */
export function usePacedText(text: string, isStreaming: boolean): string {
  const [shownText, setShownText] = useState(text);
  const targetRef = useRef(text);
  const isStreamingRef = useRef(isStreaming);
  targetRef.current = text;
  isStreamingRef.current = isStreaming;

  useEffect(() => {
    // When not streaming, immediately sync to final text
    if (!isStreaming) {
      setShownText(text);
      return;
    }

    // If target text shrank or completely changed, sync immediately
    if (!text.startsWith(shownText)) {
      setShownText(text);
      return;
    }

    // If already fully caught up, nothing to schedule
    if (shownText.length >= text.length) {
      return;
    }

    let frameId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const advanceStep = () => {
      setShownText((current) => {
        const target = targetRef.current;
        if (!isStreamingRef.current || current.length >= target.length) {
          return target;
        }
        const nextEnd = nextSliceEnd(target, current.length);
        return target.slice(0, nextEnd);
      });
    };

    // Use requestAnimationFrame when running in the browser so frame pacing is locked
    // to the user's display refresh rate (e.g. 60Hz = 16.6ms, 120Hz = 8.3ms, 144Hz = 6.9ms).
    // Fall back to setTimeout for SSR or unit tests where window is undefined.
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      frameId = window.requestAnimationFrame(advanceStep);
    } else {
      timerId = setTimeout(advanceStep, TEXT_RENDER_PACE_MS);
    }

    return () => {
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
  }, [text, isStreaming, shownText]);

  return isStreaming ? shownText : text;
}
