import { describe, expect, test } from "bun:test";
import {
  detectModelSwitches,
  shortDuration,
  stampParts,
  stepSpringFollow,
} from "./timeline-util";

describe("timeline-util", () => {
  test("shortDuration formats seconds, minutes, and hours cleanly", () => {
    expect(shortDuration(400)).toBe("1s");
    expect(shortDuration(8400)).toBe("8s");
    expect(shortDuration(60_000)).toBe("1m");
    expect(shortDuration(72_000)).toBe("1m 12s");
    expect(shortDuration(3_900_000)).toBe("1h 5m");
  });

  test("stampParts omits day for today and includes day for earlier dates", () => {
    const now = new Date(2026, 10, 21, 15, 30).getTime();
    const todayTs = new Date(2026, 10, 21, 9, 5).getTime();
    const earlierTs = new Date(2026, 10, 10, 9, 5).getTime();
    const prevYearTs = new Date(2025, 10, 10, 9, 5).getTime();

    expect(stampParts(todayTs, now).day).toBe("");
    expect(stampParts(todayTs, now).time.length).toBeGreaterThan(0);

    expect(stampParts(earlierTs, now).day).toContain("Nov");
    expect(stampParts(earlierTs, now).day).not.toContain("2026");

    expect(stampParts(prevYearTs, now).day).toContain("2025");
  });

  test("detectModelSwitches marks consecutive model changes and flags only the latest", () => {
    const switches = detectModelSwitches([
      { id: "u1", role: "user", metadata: undefined },
      { id: "a1", role: "assistant", metadata: { modelId: "claude-sonnet" } },
      { id: "u2", role: "user", metadata: undefined },
      { id: "a2", role: "assistant", metadata: { modelId: "claude-sonnet" } },
      { id: "u3", role: "user", metadata: undefined },
      { id: "a3", role: "assistant", metadata: { modelId: "gpt-5" } },
      { id: "u4", role: "user", metadata: undefined },
      { id: "a4", role: "assistant", metadata: { modelId: "claude-opus" } },
    ]);

    expect(switches.size).toBe(2);
    expect(switches.get("a3")).toEqual({
      fromModelId: "claude-sonnet",
      toModelId: "gpt-5",
      isLatest: false,
    });
    expect(switches.get("a4")).toEqual({
      fromModelId: "gpt-5",
      toModelId: "claude-opus",
      isLatest: true,
    });
  });

  test("stepSpringFollow converges smoothly toward target without overshooting", () => {
    let state = { pos: 0, v: 0 };
    const target = 200;
    let settled = false;

    for (let i = 0; i < 60; i++) {
      const next = stepSpringFollow(state, target, 1 / 60);
      expect(next.pos).toBeGreaterThanOrEqual(state.pos);
      expect(next.pos).toBeLessThanOrEqual(target);
      state = { pos: next.pos, v: next.v };
      if (next.settled) {
        settled = true;
        break;
      }
    }

    expect(settled).toBe(true);
    expect(state.pos).toBe(target);
  });
});
