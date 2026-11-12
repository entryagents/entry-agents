"use client";

import { useEffect, useRef, useState } from "react";

export const TEXT_RENDER_PACE_MS = 20;
export const TEXT_RENDER_SNAP = /[\s.,!?;:)\]}\n]/;

export function nextSliceEnd(target: string, currentLength: number): number {
  const backlog = target.length - currentLength;
  if (backlog <= 0) return target.length;

  // Reveal a chunk of 3-32 chars per frame, accelerating smoothly if backlog grows
  const step = Math.min(64, Math.max(3, Math.ceil(backlog / 6)));
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
 * Smoothly streams text chunks so high-frequency LLM token deltas don't cause
 * frame stutter, layout shifts, or erratic scrolling during live streaming.
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

    const timer = setTimeout(() => {
      setShownText((current) => {
        const target = targetRef.current;
        if (!isStreamingRef.current || current.length >= target.length) {
          return target;
        }
        const nextEnd = nextSliceEnd(target, current.length);
        return target.slice(0, nextEnd);
      });
    }, TEXT_RENDER_PACE_MS);

    return () => clearTimeout(timer);
  }, [text, isStreaming, shownText]);

  return isStreaming ? shownText : text;
}
