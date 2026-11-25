/**
 * Coalesces consecutive `text-delta` and `reasoning-delta` chunks with the same
 * `id` directly onto the queue tail while an underlying `writer.write()` is in
 * flight. Unlike a `queue.length === 0`-gated buffer, tail coalescing continues
 * merging deltas even when non-delta control chunks (`start-step`, `text-start`,
 * `message-metadata`) are queued ahead, preventing per-token durable-stream
 * HTTP round-trips from throttling streaming throughput.
 */
export function createCoalescingStreamWriter<
  T extends { type: string },
>(writer: { write: (chunk: T) => Promise<void> }) {
  type CoalesceableChunk = T & { id?: string; delta: string };
  const queue: T[] = [];
  let draining: Promise<void> | null = null;
  let lastError: unknown = null;

  function isCoalesceableChunk(chunk: T): chunk is CoalesceableChunk {
    const candidate = chunk as T & { id?: unknown; delta?: unknown };
    return (
      (chunk.type === "text-delta" || chunk.type === "reasoning-delta") &&
      typeof candidate.delta === "string" &&
      (candidate.id === undefined || typeof candidate.id === "string")
    );
  }

  const MAX_WRITE_ATTEMPTS = 3;
  const RETRY_DELAYS_MS = [150, 400];

  function isNonRetryableWriteError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const name = (error as { name?: unknown }).name;
    return name === "AbortError" || name === "ResponseAborted";
  }

  async function writeWithRetry(chunk: T): Promise<void> {
    let attempt = 0;
    while (true) {
      try {
        await writer.write(chunk);
        return;
      } catch (error: unknown) {
        attempt += 1;
        if (isNonRetryableWriteError(error) || attempt >= MAX_WRITE_ATTEMPTS) {
          throw error;
        }
        const delayMs =
          RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)] ??
          400;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async function runDrain(): Promise<void> {
    try {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next !== undefined) {
          await writeWithRetry(next);
        }
      }
    } catch (error: unknown) {
      lastError = error;
      throw error;
    } finally {
      draining = null;
    }
  }

  function ensureDraining(): Promise<void> {
    if (!draining) {
      draining = runDrain();
    }
    return draining;
  }

  function write(chunk: T): void {
    if (lastError !== null) {
      return;
    }

    if (isCoalesceableChunk(chunk)) {
      const tail = queue[queue.length - 1];
      if (
        tail !== undefined &&
        isCoalesceableChunk(tail) &&
        tail.type === chunk.type &&
        tail.id === chunk.id
      ) {
        tail.delta += chunk.delta;
        return;
      }
      queue.push({ ...chunk });
      void ensureDraining().catch(() => {});
      return;
    }

    queue.push(chunk);
    void ensureDraining().catch(() => {});
  }

  async function flush(): Promise<void> {
    if (lastError !== null) {
      throw lastError;
    }
    while (queue.length > 0 || draining !== null) {
      await ensureDraining();
    }
    if (lastError !== null) {
      throw lastError;
    }
  }

  async function waitForIdle(): Promise<void> {
    while (draining !== null) {
      await draining.catch(() => {});
    }
  }

  return { write, flush, waitForIdle };
}
