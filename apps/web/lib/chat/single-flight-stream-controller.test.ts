import { describe, expect, test } from "bun:test";
import { SingleFlightStreamController } from "./single-flight-stream-controller";

describe("SingleFlightStreamController", () => {
  test("never allows concurrent streams across 100 mount-race simulations (useChat + useStreamRecovery + reactive timer)", async () => {
    for (let trial = 0; trial < 100; trial += 1) {
      const controller = new SingleFlightStreamController();
      let concurrent = 0;
      let maxConcurrent = 0;
      let executedCount = 0;

      const makeResumeAttempt = () =>
        controller.runExclusive({
          kind: "resume",
          forceReplace: false,
          execute: async () => {
            concurrent += 1;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            executedCount += 1;
            await new Promise((resolve) => setTimeout(resolve, 2));
            concurrent -= 1;
          },
        });

      // Simulate mount resume, immediate useStreamRecovery soft probe, and
      // reactive timer firing at the exact same tick
      const outcomes = await Promise.all([
        makeResumeAttempt(),
        makeResumeAttempt(),
        makeResumeAttempt(),
      ]);

      expect(maxConcurrent).toBe(1);
      expect(executedCount).toBe(1);
      expect(outcomes.filter((o) => o.ran)).toHaveLength(1);
      expect(controller.isActive()).toBe(false);
    }
  });

  test("forceReplace always waits for previous makeRequest finally block before starting replacement across 100 trials", async () => {
    for (let trial = 0; trial < 100; trial += 1) {
      const controller = new SingleFlightStreamController();
      const events: string[] = [];
      let activeAbort: (() => void) | null = null;
      const chatState: { status: "ready" | "streaming" } = { status: "ready" };

      const firstPromise = controller.runExclusive({
        kind: "resume",
        forceReplace: false,
        execute: async (gen) => {
          chatState.status = "streaming";
          events.push(`start:${gen}`);
          try {
            await new Promise<void>((resolve) => {
              activeAbort = resolve;
            });
          } finally {
            // Simulate AbstractChat.makeRequest's unconditional finally block
            await new Promise((resolve) => setTimeout(resolve, 1));
            const suppressed = controller.isSuppressedGeneration(gen);
            if (!suppressed) {
              chatState.status = "ready";
            }
            events.push(`finally:${gen}:suppressed=${suppressed}`);
          }
        },
      });

      // Ensure stream 1 is active
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(controller.isActive()).toBe(true);

      const secondPromise = controller.runExclusive({
        kind: "resume",
        forceReplace: true,
        abortPrevious: () => {
          activeAbort?.();
        },
        execute: async (gen) => {
          chatState.status = "streaming";
          events.push(`start:${gen}`);
          await new Promise((resolve) => setTimeout(resolve, 1));
          events.push(`done:${gen}`);
        },
      });

      await Promise.all([firstPromise, secondPromise]);

      // Invariant: stream 1's finally MUST complete strictly BEFORE stream 2 starts,
      // and stream 1's finish MUST be suppressed so status never regresses.
      expect(events).toEqual([
        "start:1",
        "finally:1:suppressed=true",
        "start:2",
        "done:2",
      ]);
      expect(chatState.status).toBe("streaming");
      expect(controller.isActive()).toBe(false);
    }
  });
});
