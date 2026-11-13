/**
 * Coalesces consecutive `text-delta` and `reasoning-delta` chunks with the same
 * `id` while an underlying `writer.write()` is in flight, preventing per-token
 * durable-stream roundtrips from throttling text and thinking streaming speed.
 */
export function createCoalescingStreamWriter<
  T extends { type: string },
>(writer: { write: (chunk: T) => Promise<void> }) {
  let pendingDelta: (T & { id?: string; delta: string }) | null = null;
  const queue: T[] = [];
  let draining: Promise<void> | null = null;
  let lastError: unknown = null;

  async function runDrain() {
    while (pendingDelta !== null || queue.length > 0) {
      if (pendingDelta !== null) {
        const chunk = pendingDelta;
        pendingDelta = null;
        await writer.write(chunk);
        continue;
      }

      const next = queue.shift();
      if (next !== undefined) {
        await writer.write(next);
      }
    }
  }

  function ensureDraining(): Promise<void> {
    if (!draining) {
      draining = runDrain()
        .catch((error: unknown) => {
          lastError = error;
          throw error;
        })
        .finally(() => {
          draining = null;
        });
    }
    return draining;
  }

  function write(chunk: T): void {
    if (lastError !== null) {
      return;
    }

    const candidate = chunk as T & { id?: unknown; delta?: unknown };
    const isCoalesceable =
      (chunk.type === "text-delta" || chunk.type === "reasoning-delta") &&
      typeof candidate.delta === "string" &&
      (candidate.id === undefined || typeof candidate.id === "string");

    if (isCoalesceable) {
      if (
        queue.length === 0 &&
        pendingDelta !== null &&
        pendingDelta.type === chunk.type &&
        pendingDelta.id === candidate.id
      ) {
        pendingDelta.delta += candidate.delta as string;
        return;
      }

      if (queue.length === 0 && pendingDelta === null) {
        pendingDelta = { ...(chunk as T & { id?: string; delta: string }) };
        void ensureDraining().catch(() => {});
        return;
      }
    }

    if (pendingDelta !== null) {
      queue.push(pendingDelta);
      pendingDelta = null;
    }
    queue.push(chunk);
    void ensureDraining().catch(() => {});
  }

  async function flush(): Promise<void> {
    if (lastError !== null) {
      throw lastError;
    }
    if (pendingDelta !== null || queue.length > 0 || draining !== null) {
      await ensureDraining();
    }
    if (lastError !== null) {
      throw lastError;
    }
  }

  return { write, flush };
}
