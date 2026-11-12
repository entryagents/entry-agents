import { describe, expect, test } from "bun:test";
import {
  nextSliceEnd,
  TEXT_RENDER_IMMEDIATE,
  TEXT_RENDER_PACE_MS,
  TEXT_RENDER_SNAP,
} from "./use-paced-text";

describe("use-paced-text", () => {
  test("constants are configured for 2026 UI/UX smooth pacing", () => {
    expect(TEXT_RENDER_PACE_MS).toBe(24);
    expect(TEXT_RENDER_IMMEDIATE).toBe(32);
    expect(TEXT_RENDER_SNAP.test(" ")).toBe(true);
    expect(TEXT_RENDER_SNAP.test(".")).toBe(true);
    expect(TEXT_RENDER_SNAP.test("\n")).toBe(true);
  });

  test("nextSliceEnd snaps to punctuation or space boundary within lookahead window", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    // From start (0), step is ~12-14 chars ("The quick bro") -> should snap to space after 'brown' or 'quick'
    const end = nextSliceEnd(text, 0);
    expect(end).toBeGreaterThan(10);
    expect(end).toBeLessThanOrEqual(text.length);
    // Boundary character should be a space or punctuation
    expect(TEXT_RENDER_SNAP.test(text[end - 1] ?? "")).toBe(true);
  });

  test("nextSliceEnd does not exceed target length", () => {
    const text = "Short text.";
    const end = nextSliceEnd(text, 5);
    expect(end).toBe(text.length);
  });
});
