import { describe, expect, test } from "bun:test";
import { normalizeToolCallSignature, TurnLoopGuard } from "./loop-guard";

describe("TurnLoopGuard", () => {
  test("warns on 3rd identical call and breaks on 4th within the sliding window", () => {
    const guard = new TurnLoopGuard();
    const sig = normalizeToolCallSignature("bash", { command: "pnpm test" });

    expect(guard.recordStep([{ toolName: "bash", signature: sig }])).toEqual({
      action: "continue",
    });
    expect(guard.recordStep([{ toolName: "bash", signature: sig }])).toEqual({
      action: "continue",
    });
    expect(
      guard.recordStep([{ toolName: "bash", signature: sig }]).action,
    ).toBe("warn");
    expect(
      guard.recordStep([{ toolName: "bash", signature: sig }]).action,
    ).toBe("break");
  });

  test("decays old calls across a multi-hour run so periodic pnpm test never falsely breaks", () => {
    const guard = new TurnLoopGuard();
    const testSig = normalizeToolCallSignature("bash", {
      command: "pnpm test",
    });

    // Simulate 100 steps where `pnpm test` runs every 10 steps interspersed with edits
    for (let i = 0; i < 100; i++) {
      const tc =
        i % 10 === 0
          ? { toolName: "bash", signature: testSig }
          : {
              toolName: "edit",
              signature: normalizeToolCallSignature("edit", {
                filePath: `src/file-${i}.ts`,
              }),
            };
      const decision = guard.recordStep([tc]);
      expect(decision.action).toBe("continue");
    }
  });
});
