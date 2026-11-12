"use client";

import { useEffect, useRef, useState } from "react";

export const TEXT_RENDER_PACE_MS = 24;
export const TEXT_RENDER_IMMEDIATE = 32;
export const TEXT_RENDER_SNAP = /[\s.,!?;:)\]\n]/;

export function nextSliceEnd(target: string, currentLength: number): number {
  // Reveal a chunk of 8-32 chars per frame, proportional to backlog
  const backlog = target.length - currentLength;
  const step = Math.min(64, Math.max(12, Math.ceil(backlog / 6)));
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
    if (!isStreaming) {
      setShownText(text);
      return;
    }

    // If target text shrank or reset, sync immediately
    if (!text.startsWith(shownText)) {
      setShownText(text);
      return;
    }

    // If text is already synced or backlog is tiny, show immediately
    if (text.length - shownText.length <= TEXT_RENDER_IMMEDIATE) {
      setShownText(text);
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const currentTarget = targetRef.current;
      const isLive = isStreamingRef.current;

      if (!isLive) {
        setShownText(currentTarget);
        return;
      }

      setShownText((current) => {
        if (currentTarget.length - current.length <= TEXT_RENDER_IMMEDIATE) {
          return currentTarget;
        }

        const nextEnd = nextSliceEnd(currentTarget, current.length);
        const nextShown = currentTarget.slice(0, nextEnd);

        if (nextShown.length < currentTarget.length) {
          timerId = setTimeout(tick, TEXT_RENDER_PACE_MS);
        }

        return nextShown;
      });
    };

    timerId = setTimeout(tick, TEXT_RENDER_PACE_MS);

    return () => {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    };
  }, [text, isStreaming, shownText]);

  return isStreaming ? shownText : text;
}
