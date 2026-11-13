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
});
