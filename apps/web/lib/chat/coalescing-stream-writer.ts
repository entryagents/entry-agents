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

  async function runDrain(): Promise<void> {
    try {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next !== undefined) {
          await writer.write(next);
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
