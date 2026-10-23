import { describe, expect, test } from "bun:test";
import {
  computeFixedWindowBoundaries,
  findExceededUsageWindow,
  getPlanDefinition,
  normalizeGoatWindowMode,
} from "./plans";

describe("GOAT plan usage window modes (rolling vs fixed)", () => {
  const nowMs = new Date("2026-10-23T12:00:00.000Z").getTime();
  const anchorMs = new Date("2026-10-20T00:00:00.000Z").getTime();

  test("normalizeGoatWindowMode defaults to rolling and recognizes fixed", () => {
    expect(normalizeGoatWindowMode(undefined)).toBe("rolling");
    expect(normalizeGoatWindowMode(null)).toBe("rolling");
    expect(normalizeGoatWindowMode("rolling")).toBe("rolling");
    expect(normalizeGoatWindowMode("fixed")).toBe("fixed");
    expect(normalizeGoatWindowMode("other")).toBe("rolling");
  });

  test("GOAT plan definition configures 5h, 7d, and 30d usage windows", () => {
    const plan = getPlanDefinition("goat");
    expect(plan.usageWindows).toEqual({
      fiveHourLimitCents: 1_000,
      weeklyLimitCents: 2_500,
      monthlyLimitCents: 5_000,
    });
  });

  test("computeFixedWindowBoundaries calculates cycle boundaries anchored to billingCycleAnchor", () => {
    const boundaries = computeFixedWindowBoundaries(anchorMs, nowMs);
    // 2026-10-20T00:00Z to 2026-10-23T12:00Z is 84 hours = 16 * 5h (80h) + 4h
    expect(new Date(boundaries.cycleStart5hMs).toISOString()).toBe(
      "2026-10-23T08:00:00.000Z",
    );
    expect(boundaries.resetsAt5h).toBe("2026-10-23T13:00:00.000Z");

    expect(new Date(boundaries.cycleStart7dMs).toISOString()).toBe(
      "2026-10-20T00:00:00.000Z",
    );
    expect(boundaries.resetsAt7d).toBe("2026-10-27T00:00:00.000Z");
  });

  test("findExceededUsageWindow enforces limits identically across rolling and fixed totals", () => {
    const windows = getPlanDefinition("goat").usageWindows!;
    expect(
      findExceededUsageWindow(
        {
          last5HoursCents: 999,
          last7DaysCents: 2_500,
          last30DaysCents: 3_000,
          mode: "fixed",
        },
        windows,
      ),
    ).toBe("weekly");
  });
});
