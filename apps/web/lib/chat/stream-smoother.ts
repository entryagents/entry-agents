/**
 * Client-side render smoothing for bursty chat streams.
 *
 * Chat text arrives from the durable workflow stream in bursts (each batch is
 * a durable event append at a ~100-300ms cadence), so even on fast networks
 * the rendered text visibly jumps. The smoother buffers incoming
 * text/reasoning deltas and reveals them at a steady, requestAnimationFrame
 * driven cadence:
 *
 * - reveal speed = max(baseCharsPerSec, bufferedChars / catchUpHorizonSec) so
 *   large buffers catch up fast while small bursts still type out gently;
 * - if the oldest buffered character has been waiting longer than
 *   `maxBufferAgeMs`, the whole buffer is dumped at once so the display never
 *   falls behind by more than ~2s of arrival time;
 * - `flush(messageId)` instantly reveals everything buffered for a message
 *   (used on finish/abort/error) and stops the drain loop -- no timers are
 *   ever left running once buffers are empty.
 *
 * The smoother is framework-free (pure string appends) so it can be unit
 * tested with an injected clock and frame scheduler.
 */

export type StreamSmootherPartKind = "text" | "reasoning";

export interface StreamSmootherPart {
  /** Owning message id. */
  messageId: string;
  /** Message-scoped stable part id (e.g. `${messageId}:text:0`). */
  partId: string;
  /** Informational; smoothing behaves identically for text and reasoning. */
  kind?: StreamSmootherPartKind;
  /** Newly arrived characters to append to this part's target text. */
  delta: string;
}

export interface StreamSmootherOptions {
  /** Minimum reveal speed in characters per second. Default 400. */
  baseCharsPerSec?: number;
  /**
   * Target drain horizon for large buffers in seconds: a buffer of N chars is
   * revealed at N/1.5 chars per second. Default 1.5.
   */
  catchUpHorizonSec?: number;
  /**
   * Buffer age (ms) beyond which the entire buffer is revealed at once.
   * Default 2000.
   */
  maxBufferAgeMs?: number;
  /**
   * Upper bound for the per-tick elapsed-time step (ms). Prevents a single
   * tick (e.g. after a background-tab pause) from revealing faster than the
   * computed cadence. Default 100.
   */
  maxFrameStepMs?: number;
  /** Clock injection for tests. Defaults to performance.now()/Date.now(). */
  now?: () => number;
  /** Frame scheduler injection for tests. Defaults to requestAnimationFrame. */
  requestFrame?: (callback: () => void) => unknown;
  /** Frame cancellation injection for tests. Defaults to cancelAnimationFrame. */
  cancelFrame?: (handle: unknown) => void;
}

export interface StreamSmoother {
  /**
   * Buffer an incoming text/reasoning delta for a message+part. Empty deltas
   * are ignored. Starts the rAF drain loop on the first buffered character.
   */
  push(part: StreamSmootherPart): void;
  /**
   * Instantly reveal everything buffered for the given message and stop the
   * drain loop when nothing is left pending. Idempotent.
   */
  flush(messageId: string): void;
  /** Same as `flush` but across all messages. */
  flushAll(): void;
  /**
   * Replace the revealed baseline for a message+part (no buffering). Used
   * when the target text was replaced/truncated (e.g. regeneration): the new
   * text is adopted instantly and subsequent deltas are smoothed from there.
   */
  reset(messageId: string, partId: string, baseline: string): void;
  /** Characters revealed so far for a message+part ("" when unknown). */
  getDisplayed(messageId: string, partId: string): string;
  /** Whether the smoother tracks any state for this message+part. */
  hasKey(messageId: string, partId: string): boolean;
  /** Characters buffered but not yet revealed for a message+part. */
  getPendingChars(messageId: string, partId: string): number;
  /** Whether any message still has unrevealed buffered characters. */
  hasPendingBuffer(): boolean;
  /** Whether the drain loop currently has a frame scheduled. */
  isRunning(): boolean;
  /** Subscribe to change notifications (fired whenever displayed text changes). */
  subscribe(listener: () => void): () => void;
  /**
   * Stop the drain loop and drop subscribers. Buffered state is kept so the
   * object stays usable (and StrictMode remounts converge); dispose is
   * idempotent.
   */
  dispose(): void;
}

interface PendingChunk {
  text: string;
  arrivedAt: number;
}

interface KeyState {
  messageId: string;
  partId: string;
  revealed: string;
  queue: PendingChunk[];
  /** Fractional character carry-over between drain ticks. */
  acc: number;
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function defaultRequestFrame(callback: () => void): unknown {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(() => callback());
  }
  // Fallback for non-browser environments; the loop self-stops once drained.
  return setTimeout(callback, 16);
}

function defaultCancelFrame(handle: unknown): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle as number);
    return;
  }
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

/**
 * Create a stream smoother that converts bursty delta arrivals into a steady
 * character reveal cadence. See the module doc comment for the rate rules.
 */
export function createStreamSmoother(
  opts: StreamSmootherOptions = {},
): StreamSmoother {
  const baseCharsPerSec = opts.baseCharsPerSec ?? 400;
  const catchUpHorizonSec = opts.catchUpHorizonSec ?? 1.5;
  const maxBufferAgeMs = opts.maxBufferAgeMs ?? 2000;
  const maxFrameStepMs = opts.maxFrameStepMs ?? 100;
  const now = opts.now ?? defaultNow;
  const requestFrame = opts.requestFrame ?? defaultRequestFrame;
  const cancelFrame = opts.cancelFrame ?? defaultCancelFrame;

  const states = new Map<string, KeyState>();
  const listeners = new Set<() => void>();

  let frameHandle: unknown = null;
  let running = false;
  let lastTickAt = 0;

  function keyOf(messageId: string, partId: string): string {
    return `${messageId}:${partId}`;
  }

  function ensureState(part: {
    messageId: string;
    partId: string;
  }): KeyState {
    const key = keyOf(part.messageId, part.partId);
    let state = states.get(key);
    if (!state) {
      state = {
        messageId: part.messageId,
        partId: part.partId,
        revealed: "",
        queue: [],
        acc: 0,
      };
      states.set(key, state);
    }
    return state;
  }

  function pendingChars(state: KeyState): number {
    let total = 0;
    for (const chunk of state.queue) {
      total += chunk.text.length;
    }
    return total;
  }

  function revealChars(state: KeyState, count: number): void {
    let remaining = count;
    while (remaining > 0 && state.queue.length > 0) {
      const head = state.queue[0];
      if (!head) break;
      if (head.text.length <= remaining) {
        state.revealed += head.text;
        remaining -= head.text.length;
        state.queue.shift();
      } else {
        state.revealed += head.text.slice(0, remaining);
        head.text = head.text.slice(remaining);
        remaining = 0;
      }
    }
  }

  function revealAll(state: KeyState): void {
    for (const chunk of state.queue) {
      state.revealed += chunk.text;
    }
    state.queue.length = 0;
    state.acc = 0;
  }

  function notify(): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function anyPending(): boolean {
    for (const state of states.values()) {
      if (state.queue.length > 0) return true;
    }
    return false;
  }

  function stopLoop(): void {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    running = false;
  }

  function ensureLoop(): void {
    if (running) return;
    running = true;
    lastTickAt = now();
    frameHandle = requestFrame(tick);
  }

  function tick(): void {
    frameHandle = null;
    const t = now();
    const dtMs = Math.min(Math.max(t - lastTickAt, 0), maxFrameStepMs);
    lastTickAt = t;
    const dtSec = dtMs / 1000;

    let changed = false;

    for (const state of states.values()) {
      const pending = pendingChars(state);
      if (pending <= 0) {
        state.acc = 0;
        continue;
      }

      const head = state.queue[0];
      const oldestAgeMs = head ? t - head.arrivedAt : 0;

      if (oldestAgeMs >= maxBufferAgeMs) {
        // Hard guarantee: the display never falls behind by more than
        // ~maxBufferAgeMs of arrival time.
        revealAll(state);
        changed = true;
        continue;
      }

      const rate = Math.max(baseCharsPerSec, pending / catchUpHorizonSec);
      state.acc += rate * dtSec;
      let revealCount = Math.floor(state.acc);
      if (revealCount <= 0) continue;
      state.acc -= revealCount;
      if (revealCount >= pending) {
        revealAll(state);
      } else {
        revealChars(state, revealCount);
      }
      changed = true;
    }

    if (changed) {
      notify();
    }

    if (anyPending()) {
      frameHandle = requestFrame(tick);
    } else {
      running = false;
    }
  }

  function flushStates(predicate: (state: KeyState) => boolean): boolean {
    let changed = false;
    for (const state of states.values()) {
      if (!predicate(state)) continue;
      if (state.queue.length > 0) {
        revealAll(state);
        changed = true;
      }
    }
    if (!anyPending()) {
      stopLoop();
    }
    if (changed) {
      notify();
    }
    return changed;
  }

  return {
    push(part: StreamSmootherPart): void {
      if (!part.delta) return;
      const state = ensureState(part);
      state.queue.push({ text: part.delta, arrivedAt: now() });
      ensureLoop();
    },

    flush(messageId: string): void {
      flushStates((state) => state.messageId === messageId);
    },

    flushAll(): void {
      flushStates(() => true);
    },

    reset(messageId: string, partId: string, baseline: string): void {
      const state = ensureState({ messageId, partId });
      state.revealed = baseline;
      state.queue.length = 0;
      state.acc = 0;
      if (!anyPending()) {
        stopLoop();
      }
      notify();
    },

    getDisplayed(messageId: string, partId: string): string {
      return states.get(keyOf(messageId, partId))?.revealed ?? "";
    },

    hasKey(messageId: string, partId: string): boolean {
      return states.has(keyOf(messageId, partId));
    },

    getPendingChars(messageId: string, partId: string): number {
      const state = states.get(keyOf(messageId, partId));
      return state ? pendingChars(state) : 0;
    },

    hasPendingBuffer(): boolean {
      return anyPending();
    },

    isRunning(): boolean {
      return running;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      stopLoop();
      listeners.clear();
    },
  };
}
