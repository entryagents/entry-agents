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
      { type: "text-delta", id: "t1", delta: "Hello" },
      { type: "text-delta", id: "t1", delta: " world" },
      { type: "finish-step" },
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
});
