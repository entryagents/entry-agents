/**
 * Serializes all stream-opening operations (`sendMessage`, `regenerate`,
 * `resumeStream`) on a single `Chat` instance so two `AbstractChat.makeRequest`
 * coroutines can NEVER run concurrently.
 *
 * Why this is structurally necessary:
 * `@ai-sdk/react`'s `AbstractChat.makeRequest()` has no re-entrancy lock and
 * unconditionally runs `setStatus("ready")`, `onFinish()`, and
 * `this.activeResponse = undefined` in its `finally` block. If a second
 * `resumeStream()` starts before the first `makeRequest()` exits `finally`,
 * both coroutines hold separate `activeResponse.state.message` clones and
 * ping-pong `replaceMessage()` on every chunk — and when the first exits, its
 * `finally` clobbers the second stream's status and `activeResponse`.
 */
export class SingleFlightStreamController {
  private activePromise: Promise<void> | null = null;
  private activeKind: "send" | "resume" | null = null;
  private generation = 0;
  private suppressedFinishGenerations = new Set<number>();

  isActive(): boolean {
    return this.activePromise !== null;
  }

  getActiveKind(): "send" | "resume" | null {
    return this.activeKind;
  }

  getGeneration(): number {
    return this.generation;
  }

  /**
   * Returns true if the given generation was intentionally aborted to start a
   * replacement stream (e.g., reconnect), so `onFinish` can ignore its cleanup.
   */
  isSuppressedGeneration(gen: number): boolean {
    return this.suppressedFinishGenerations.has(gen);
  }

  /**
   * Marks the current active generation as suppressed (intentionally torn down)
   * and waits for it to settle before returning, bounded by `settleTimeoutMs`.
   */
  async abortAndWaitForSettle(
    abortFn: () => Promise<void> | void,
    settleTimeoutMs = 1_500,
  ): Promise<void> {
    const prevGen = this.generation;
    const prevPromise = this.activePromise;
    if (prevPromise) {
      this.suppressedFinishGenerations.add(prevGen);
    }

    try {
      await abortFn();
    } catch {
      // Ignore abort errors on already-dead streams
    }

    if (prevPromise) {
      await Promise.race([
        prevPromise.catch(() => {}),
        new Promise<void>((resolve) => {
          setTimeout(resolve, settleTimeoutMs);
        }),
      ]);
    }
  }

  /**
   * Runs a stream operation exclusively.
   * - If `forceReplace` is false and an operation is already active, returns
   *   `false` immediately without starting a duplicate stream.
   * - If `forceReplace` is true, aborts the previous operation and waits for
   *   its `finally` block to finish BEFORE starting the new operation.
   */
  async runExclusive<T>(opts: {
    kind: "send" | "resume";
    forceReplace?: boolean;
    abortPrevious?: () => Promise<void> | void;
    execute: (generation: number) => Promise<T>;
  }): Promise<{ ran: true; value: T } | { ran: false }> {
    if (this.activePromise && !opts.forceReplace) {
      return { ran: false };
    }

    if (this.activePromise && opts.forceReplace) {
      await this.abortAndWaitForSettle(opts.abortPrevious ?? (() => {}));
    }

    const myGen = ++this.generation;
    this.activeKind = opts.kind;

    let result!: T;
    let thrownError: unknown = null;
    let didThrow = false;

    const promise = (async () => {
      try {
        result = await opts.execute(myGen);
      } catch (err) {
        thrownError = err;
        didThrow = true;
      } finally {
        if (this.generation === myGen) {
          this.activePromise = null;
          this.activeKind = null;
        }
        // Retain suppression marker briefly so trailing microtask onFinish sees it,
        // then prune to avoid unbounded growth.
        if (this.suppressedFinishGenerations.size > 16) {
          this.suppressedFinishGenerations.clear();
        }
      }
    })();

    this.activePromise = promise;
    await promise;

    if (didThrow) {
      throw thrownError;
    }
    return { ran: true, value: result };
  }
}
