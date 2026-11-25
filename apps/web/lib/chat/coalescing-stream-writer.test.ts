import { describe, expect, test } from "bun:test";
import { createCoalescingStreamWriter } from "./coalescing-stream-writer";

type TestChunk =
  | { type: "text-delta"; id: string; delta: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "finish-step" };

describe("createCoalescingStreamWriter", () => {
  test("coalesces consecutive deltas while a write is in flight and preserves order", async () => {
    const written: TestChunk[] = [];
    let releaseFirstWrite: (() => void) | undefined;

    const writer = createCoalescingStreamWriter<TestChunk>({
      write: async (chunk) => {
        written.push(chunk);
        if (written.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstWrite = resolve;
          });
        }
      },
    });

    writer.write({ type: "reasoning-delta", id: "r1", delta: "Think" });
    writer.write({ type: "reasoning-delta", id: "r1", delta: "ing" });
    writer.write({ type: "reasoning-delta", id: "r1", delta: "..." });
    writer.write({ type: "text-delta", id: "t1", delta: "Hello" });
    writer.write({ type: "text-delta", id: "t1", delta: " world" });
    writer.write({ type: "finish-step" });

    // Wait a microtask so the first write starts
    await Promise.resolve();
    if (releaseFirstWrite) {
      releaseFirstWrite();
    }
    await writer.flush();

    expect(written).toEqual([
      { type: "reasoning-delta", id: "r1", delta: "Think" },
      { type: "reasoning-delta", id: "r1", delta: "ing..." },
      { type: "text-delta", id: "t1", delta: "Hello world" },
      { type: "finish-step" },
    ]);
  });

  test("continues coalescing text-deltas even when start-step and text-start are ahead in the queue", async () => {
    const written: Array<{ type: string; id?: string; delta?: string }> = [];
    let releaseStartStep: (() => void) | undefined;

    const writer = createCoalescingStreamWriter<{
      type: string;
      id?: string;
      delta?: string;
    }>({
      write: async (chunk) => {
        written.push(chunk);
        if (chunk.type === "start-step") {
          await new Promise<void>((resolve) => {
            releaseStartStep = resolve;
          });
        }
      },
    });

    writer.write({ type: "start-step" });
    writer.write({ type: "text-start", id: "t1" });
    for (let i = 0; i < 20; i += 1) {
      writer.write({ type: "text-delta", id: "t1", delta: `w${i} ` });
    }
    writer.write({ type: "text-end", id: "t1" });

    await Promise.resolve();
    releaseStartStep?.();
    await writer.flush();

    expect(written).toEqual([
      { type: "start-step" },
      { type: "text-start", id: "t1" },
      {
        type: "text-delta",
        id: "t1",
        delta: Array.from({ length: 20 }, (_, i) => `w${i} `).join(""),
      },
      { type: "text-end", id: "t1" },
    ]);
  });

  test("drains consecutive non-delta chunks produced across async generator microtasks before flush resolves", async () => {
    const written: Array<{ type: string; value?: number }> = [];
    const writer = createCoalescingStreamWriter<{
      type: string;
      value?: number;
    }>({
      write: async (chunk) => {
        // Resolve immediately so loop iterations complete between generator yields
        written.push(chunk);
        await Promise.resolve();
      },
    });

    async function* produceChunks() {
      yield { type: "finish-step", value: 1 };
      yield { type: "message-metadata", value: 2 };
      await Promise.resolve();
      yield { type: "finish-step", value: 3 };
      yield { type: "message-metadata", value: 4 };
    }

    for await (const chunk of produceChunks()) {
      writer.write(chunk);
    }
    await writer.flush();

    expect(written).toEqual([
      { type: "finish-step", value: 1 },
      { type: "message-metadata", value: 2 },
      { type: "finish-step", value: 3 },
      { type: "message-metadata", value: 4 },
    ]);
  });

  test("retries transient write errors so a single durable-stream hiccup never drops subsequent chunks", async () => {
    const written: Array<{ type: string; id?: string; delta?: string }> = [];
    let attempts = 0;

    const writer = createCoalescingStreamWriter<{
      type: string;
      id?: string;
      delta?: string;
    }>({
      write: async (chunk) => {
        attempts += 1;
        if (attempts <= 2) {
          throw new Error("Transient 503 durable stream write error");
        }
        written.push(chunk);
      },
    });

    writer.write({ type: "reasoning-delta", id: "r1", delta: "Planning..." });
    writer.write({ type: "finish-step" });
    await writer.flush();

    expect(attempts).toBe(4);
    expect(written).toEqual([
      { type: "reasoning-delta", id: "r1", delta: "Planning..." },
      { type: "finish-step" },
    ]);
  });

  test("does not retry AbortError writes", async () => {
    let attempts = 0;
    const writer = createCoalescingStreamWriter<{ type: string }>({
      write: async () => {
        attempts += 1;
        throw new DOMException("Aborted", "AbortError");
      },
    });

    writer.write({ type: "finish-step" });
    await expect(writer.flush()).rejects.toThrow("Aborted");
    expect(attempts).toBe(1);
  });
});
