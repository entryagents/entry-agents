import { describe, expect, test } from "bun:test";
import { createStreamSmoother } from "./stream-smoother";

/**
 * Deterministic test harness: injects a virtual clock and a manual frame
 * queue so drain ticks can be pumped exactly, one frame per `advanceMs` call
 * (frames scheduled during a tick belong to the next frame, like real rAF).
 */
function createHarness() {
  let t = 0;
  let frames: Array<{ cb: () => void }> = [];
  let scheduled = 0;

  const smoother = createStreamSmoother({
    now: () => t,
    requestFrame: (cb) => {
      const handle = { cb };
      frames.push(handle);
      scheduled += 1;
      return handle;
    },
    cancelFrame: (handle) => {
      frames = frames.filter((entry) => entry !== handle);
    },
  });

  return {
    smoother,
    advanceMs(ms: number) {
      t += ms;
      const queued = frames;
      frames = [];
      for (const entry of queued) {
        entry.cb();
      }
    },
    pendingFrames: () => frames.length,
    scheduledCount: () => scheduled,
  };
}

describe("createStreamSmoother", () => {
  test("reveals small buffers at the base rate (~400 chars/s)", () => {
    const h = createHarness();
    const target = "a".repeat(100);

    h.smoother.push({ messageId: "m1", partId: "p1", delta: target });
    expect(h.smoother.isRunning()).toBe(true);

    // 100ms at 400 chars/s => 40 chars revealed per frame.
    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1").length).toBe(40);
    expect(h.smoother.getPendingChars("m1", "p1")).toBe(60);

    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1").length).toBe(80);

    // Remaining 20 chars drain completely (reveal never overshoots the target).
    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1")).toBe(target);
    expect(h.smoother.getPendingChars("m1", "p1")).toBe(0);
    expect(h.smoother.hasPendingBuffer()).toBe(false);
    // Loop self-stops once nothing is pending: no timers left running.
    expect(h.smoother.isRunning()).toBe(false);
    expect(h.pendingFrames()).toBe(0);
  });

  test("catch-up rate scales with buffer size (buffered / 1.5s)", () => {
    const h = createHarness();
    const target = "b".repeat(3000);

    h.smoother.push({ messageId: "m1", partId: "p1", delta: target });

    // rate = max(400, 3000/1.5 = 2000) chars/s => 200 chars in the first 100ms.
    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1").length).toBe(200);

    // Pending 2800 => rate ~1866.7 chars/s => 186 chars in the next 100ms.
    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1").length).toBe(386);
  });

  test("per-tick reveal is clamped by maxFrameStepMs (no giant dumps)", () => {
    const h = createHarness();
    h.smoother.push({
      messageId: "m1",
      partId: "p1",
      delta: "c".repeat(100000),
    });

    // Even though 1000ms of wall time passed, one tick reveals at most
    // rate * 100ms = 66666/1.5 * 0.1 ~ 6666 chars.
    h.advanceMs(1000);
    expect(h.smoother.getDisplayed("m1", "p1").length).toBe(6666);
  });

  test("dumps the entire buffer at once once its age exceeds ~2s", () => {
    const h = createHarness();
    const target = "d".repeat(100);

    h.smoother.push({ messageId: "m1", partId: "p1", delta: target });

    // Just under the age limit: still paced.
    h.advanceMs(1900);
    expect(h.smoother.getDisplayed("m1", "p1").length).toBe(40);

    // Oldest pending character is now > 2s old: the rest dumps instantly.
    h.advanceMs(200);
    expect(h.smoother.getDisplayed("m1", "p1")).toBe(target);
    expect(h.smoother.isRunning()).toBe(false);
    expect(h.pendingFrames()).toBe(0);
  });

  test("flush(messageId) instantly reveals everything and stops the loop", () => {
    const h = createHarness();
    h.smoother.push({ messageId: "m1", partId: "p1", delta: "x".repeat(200) });

    h.advanceMs(100); // mid-drain: 40 revealed, next frame scheduled
    expect(h.smoother.getDisplayed("m1", "p1").length).toBe(40);

    h.smoother.flush("m1");
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("x".repeat(200));
    expect(h.smoother.getPendingChars("m1", "p1")).toBe(0);
    expect(h.smoother.isRunning()).toBe(false);
    // The scheduled frame was cancelled: no timers left running.
    expect(h.pendingFrames()).toBe(0);

    // Idempotent: flushing again changes nothing and pumping does nothing.
    h.smoother.flush("m1");
    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("x".repeat(200));
  });

  test("flush only affects the requested message", () => {
    const h = createHarness();
    h.smoother.push({ messageId: "m1", partId: "p1", delta: "one" });
    h.smoother.push({ messageId: "m2", partId: "p1", delta: "two" });

    h.smoother.flush("m1");
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("one");
    expect(h.smoother.getDisplayed("m2", "p1")).toBe("");
    expect(h.smoother.getPendingChars("m2", "p1")).toBe(3);

    // m2 still has pending buffer, so the loop keeps running.
    expect(h.smoother.isRunning()).toBe(true);

    h.smoother.flushAll();
    expect(h.smoother.getDisplayed("m2", "p1")).toBe("two");
    expect(h.smoother.isRunning()).toBe(false);
    expect(h.pendingFrames()).toBe(0);
  });

  test("parts within the same message are isolated", () => {
    const h = createHarness();
    h.smoother.push({ messageId: "m1", partId: "text:0", delta: "answer" });
    h.smoother.push({
      messageId: "m1",
      partId: "reasoning-group:reasoning:0",
      delta: "thinking",
      kind: "reasoning",
    });

    h.advanceMs(100);
    // 6 chars at 400 chars/s drain fully; "thinking" (8 chars) also drains.
    expect(h.smoother.getDisplayed("m1", "text:0")).toBe("answer");
    expect(h.smoother.getDisplayed("m1", "reasoning-group:reasoning:0")).toBe(
      "thinking",
    );
  });

  test("no text is ever lost across many bursts (final equals full arrival)", () => {
    const h = createHarness();
    const chunks = Array.from({ length: 10 }, (_, i) => `word-${i} `.repeat(4));

    let expected = "";
    chunks.forEach((chunk, i) => {
      h.advanceMs(120 + i * 17); // bursty arrival cadence
      h.smoother.push({ messageId: "m1", partId: "p1", delta: chunk });
      expected += chunk;
    });

    // Drain everything through the paced path (no flush): the 2s age guard
    // guarantees the loop cannot stall behind slow reveal rates.
    for (let i = 0; i < 200 && h.smoother.hasPendingBuffer(); i++) {
      h.advanceMs(50);
    }

    expect(h.smoother.hasPendingBuffer()).toBe(false);
    expect(h.smoother.getDisplayed("m1", "p1")).toBe(expected);
  });

  test("push after flush resumes draining from the revealed baseline", () => {
    const h = createHarness();
    h.smoother.push({ messageId: "m1", partId: "p1", delta: "Hello" });
    h.smoother.flush("m1");
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("Hello");

    h.smoother.push({ messageId: "m1", partId: "p1", delta: " world" });
    expect(h.smoother.isRunning()).toBe(true);
    h.advanceMs(250);
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("Hello world");
    expect(h.smoother.isRunning()).toBe(false);
  });

  test("reset adopts a new baseline instantly and smooths later deltas", () => {
    const h = createHarness();
    h.smoother.push({ messageId: "m1", partId: "p1", delta: "abc" });
    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("abc");

    // Regeneration-style replacement: adopted immediately, no buffering.
    h.smoother.reset("m1", "p1", "XY");
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("XY");
    expect(h.smoother.getPendingChars("m1", "p1")).toBe(0);

    h.smoother.push({ messageId: "m1", partId: "p1", delta: "Z" });
    h.advanceMs(100);
    expect(h.smoother.getDisplayed("m1", "p1")).toBe("XYZ");
  });

  test("empty deltas are ignored and never start the loop", () => {
    const h = createHarness();
    h.smoother.push({ messageId: "m1", partId: "p1", delta: "" });
    expect(h.smoother.isRunning()).toBe(false);
    expect(h.smoother.hasKey("m1", "p1")).toBe(false);
    expect(h.pendingFrames()).toBe(0);
    expect(h.scheduledCount()).toBe(0);
  });

  test("subscribers are notified on changes and can unsubscribe", () => {
    const h = createHarness();
    let changes = 0;
    const unsubscribe = h.smoother.subscribe(() => {
      changes += 1;
    });

    h.smoother.push({ messageId: "m1", partId: "p1", delta: "hello world" });
    h.advanceMs(100); // reveal tick -> change
    const afterFirstTick = changes;
    expect(afterFirstTick).toBeGreaterThan(0);

    h.advanceMs(16); // buffer drained? 11 chars drain in the first tick
    if (!h.smoother.hasPendingBuffer()) {
      expect(changes).toBe(afterFirstTick); // no spurious notifications
    }

    unsubscribe();
    h.smoother.push({ messageId: "m1", partId: "p1", delta: " more" });
    const before = changes;
    h.advanceMs(100);
    expect(changes).toBe(before);
  });

  test("dispose stops the loop and is idempotent", () => {
    const h = createHarness();
    h.smoother.push({ messageId: "m1", partId: "p1", delta: "z".repeat(500) });
    expect(h.smoother.isRunning()).toBe(true);

    h.smoother.dispose();
    expect(h.smoother.isRunning()).toBe(false);
    expect(h.pendingFrames()).toBe(0);

    h.smoother.dispose();
    expect(h.pendingFrames()).toBe(0);
  });
});
