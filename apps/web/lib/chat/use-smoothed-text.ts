"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createStreamSmoother, type StreamSmoother } from "./stream-smoother";

/**
 * Render-layer stream smoothing.
 *
 * The chat runtime (`useChat` + shared chat instances) accumulates
 * text/reasoning deltas into message state in bursts (each batch is a durable
 * event append at a ~100-300ms cadence), which makes the rendered text visibly
 * jump. Interception inside the transport pipeline would be invasive and risk
 * persistence/reconciliation invariants, so smoothing is applied here at the
 * render layer instead: the hook receives the latest accumulated text and
 * animates the displayed value toward it using `createStreamSmoother` with the
 * same rate rules (reveal speed = max(~400 chars/s, buffered/1.5s), whole
 * buffer dumped once it is older than ~2s).
 *
 * Guarantees:
 * - No text is ever lost: the final displayed value always equals the full
 *   arrival (finish/abort/error set `active=false`, which returns the raw
 *   text and flushes the internal buffer immediately).
 * - Reduced-motion users (`prefers-reduced-motion: reduce`) get instant
 *   reveal; nothing is ever animated for them.
 * - The per-hook smoother stops its rAF loop as soon as nothing is pending,
 *   so no timers are left running after flush.
 */

const SMOOTHED_PART_ID = "live";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribePrefersReducedMotion(onChange: () => void): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function getPrefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function useStreamSmootherInstance(): StreamSmoother {
  const smootherRef = useRef<StreamSmoother | null>(null);
  if (!smootherRef.current) {
    smootherRef.current = createStreamSmoother({
      baseCharsPerSec: 4500,
      catchUpHorizonSec: 0.18,
      maxBufferAgeMs: 350,
      maxFrameStepMs: 250,
    });
  }
  const smoother = smootherRef.current;

  useEffect(() => {
    // Stop the drain loop on unmount. Buffered state is intentionally kept
    // (dispose is idempotent) so StrictMode remounts converge via the
    // self-heal path below; the instance is garbage collected with the hook.
    return () => smoother.dispose();
  }, [smoother]);

  return smoother;
}

/**
 * Smoothly reveal a streaming text/reasoning string.
 *
 * @param text The latest accumulated target text (full arrival so far).
 * @param active Whether the underlying part is still streaming. When false
 *   the target text is returned as-is (instant reveal, buffer flushed).
 * @param streamKey Stable identity of the rendered part
 *   (`${messageId}:${renderKey}`) so re-used component instances can reset.
 * @returns The text to display.
 */
export function useSmoothedText(
  text: string,
  active: boolean,
  streamKey: string,
): string {
  const smoother = useStreamSmootherInstance();
  const prefersReducedMotion = useSyncExternalStore(
    subscribePrefersReducedMotion,
    getPrefersReducedMotion,
    () => false,
  );
  const smoothing = active && !prefersReducedMotion;

  // Tracks how much of `text` has already been handed to the smoother for the
  // current key. `null` means "not synced yet" so the first sync adopts the
  // existing text as an instant baseline instead of re-typing it.
  const seenRef = useRef<{ key: string; text: string | null }>({
    key: streamKey,
    text: null,
  });

  useEffect(() => {
    const seen = seenRef.current;
    if (seen.key !== streamKey) {
      // Component instance re-used for a different part: release the old
      // part's buffered tail and start fresh.
      smoother.flush(seen.key);
      seen.key = streamKey;
      seen.text = null;
    }

    if (!smoothing) {
      // Finished, aborted or errored: reveal everything instantly and stop
      // the drain loop. The hook also returns `text` directly below.
      smoother.flush(streamKey);
      seen.text = text;
      return;
    }

    if (seen.text === null) {
      // First sync for this key: adopt the current target as the revealed
      // baseline so pre-existing content (e.g. resumed streams) is shown
      // immediately and only new deltas are smoothed.
      smoother.reset(streamKey, SMOOTHED_PART_ID, text);
      seen.text = text;
      return;
    }

    if (text === seen.text) {
      // Self-heal: a pending buffer without a scheduled frame (e.g. after a
      // StrictMode remount disposed the loop) would otherwise stall until the
      // next delta arrives.
      if (
        smoother.getPendingChars(streamKey, SMOOTHED_PART_ID) > 0 &&
        !smoother.isRunning()
      ) {
        smoother.flush(streamKey);
      }
      return;
    }

    if (text.length > seen.text.length && text.startsWith(seen.text)) {
      smoother.push({
        messageId: streamKey,
        partId: SMOOTHED_PART_ID,
        delta: text.slice(seen.text.length),
      });
      seen.text = text;
      return;
    }

    // Target replaced or truncated (e.g. regeneration): adopt instantly so
    // stale characters can never linger.
    smoother.reset(streamKey, SMOOTHED_PART_ID, text);
    seen.text = text;
  }, [smoothing, text, streamKey, smoother]);

  const displayed = useSyncExternalStore(
    smoother.subscribe,
    useCallback(
      () => smoother.getDisplayed(streamKey, SMOOTHED_PART_ID),
      [smoother, streamKey],
    ),
    // Server snapshot: streaming content is never smoothed on the server.
    () => text,
  );

  if (!smoothing || !smoother.hasKey(streamKey, SMOOTHED_PART_ID)) {
    return text;
  }
  return displayed;
}
