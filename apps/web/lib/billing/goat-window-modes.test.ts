import { describe, expect, test } from "bun:test";
import {
  computeFixedWindowBoundaries,
  computeRollingResetTimestamp,
  computeRollingWindowBoundaries,
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
    expect(boundaries.resetsAt30d).toBe("2026-11-20T00:00:00.000Z");
  });

  test("computeFixedWindowBoundaries resets all windows cleanly on new subscription renewal", () => {
    const renewalMs = new Date("2026-11-01T00:00:00.000Z").getTime();

    // At exact moment of renewal:
    const atRenewal = computeFixedWindowBoundaries(renewalMs, renewalMs);
    expect(atRenewal.cycleStart5hMs).toBe(renewalMs);
    expect(atRenewal.cycleStart7dMs).toBe(renewalMs);
    expect(atRenewal.cycleStart30dMs).toBe(renewalMs);
    expect(atRenewal.resetsAt5h).toBe("2026-11-01T05:00:00.000Z");
    expect(atRenewal.resetsAt7d).toBe("2026-11-08T00:00:00.000Z");
    expect(atRenewal.resetsAt30d).toBe("2026-12-01T00:00:00.000Z");

    // 15 minutes after renewal:
    const shortlyAfter = computeFixedWindowBoundaries(
      renewalMs,
      renewalMs + 15 * 60 * 1000,
    );
    expect(shortlyAfter.cycleStart5hMs).toBe(renewalMs);
    expect(shortlyAfter.cycleStart7dMs).toBe(renewalMs);
    expect(shortlyAfter.cycleStart30dMs).toBe(renewalMs);

    // Negative delta / clock drift: clamped to anchorMs (never before anchor)
    const clockDrift = computeFixedWindowBoundaries(
      renewalMs,
      renewalMs - 1000,
    );
    expect(clockDrift.cycleStart5hMs).toBe(renewalMs);
    expect(clockDrift.cycleStart7dMs).toBe(renewalMs);
    expect(clockDrift.cycleStart30dMs).toBe(renewalMs);
  });

  test("computeRollingWindowBoundaries clamps lookback to subscription cycle anchor on new renewal", () => {
    // Exactly at renewal: all windows clamp to anchorMs, giving 100% capacity
    const renewalMs = new Date("2026-10-25T10:00:00.000Z").getTime();
    const boundariesAtRenewal = computeRollingWindowBoundaries(
      renewalMs,
      renewalMs,
    );
    expect(boundariesAtRenewal.cutoff5hMs).toBe(renewalMs);
    expect(boundariesAtRenewal.cutoff7dMs).toBe(renewalMs);
    expect(boundariesAtRenewal.cutoff30dMs).toBe(renewalMs);
    expect(boundariesAtRenewal.resetsAt30d).toBe("2026-11-25T10:00:00.000Z");

    // 2 hours after renewal: 5h and 7d cannot look back past renewal
    const twoHoursLater = renewalMs + 2 * 60 * 60 * 1000;
    const boundaries2h = computeRollingWindowBoundaries(
      renewalMs,
      twoHoursLater,
    );
    expect(boundaries2h.cutoff5hMs).toBe(renewalMs);
    expect(boundaries2h.cutoff7dMs).toBe(renewalMs);

    // 10 hours after renewal: 5h slides freely, 7d still clamped to renewal
    const tenHoursLater = renewalMs + 10 * 60 * 60 * 1000;
    const boundaries10h = computeRollingWindowBoundaries(
      renewalMs,
      tenHoursLater,
    );
    expect(boundaries10h.cutoff5hMs).toBe(tenHoursLater - 5 * 60 * 60 * 1000);
    expect(boundaries10h.cutoff7dMs).toBe(renewalMs);

    // 10 days after renewal: both 5h and 7d slide freely
    const tenDaysLater = renewalMs + 10 * 24 * 60 * 60 * 1000;
    const boundaries10d = computeRollingWindowBoundaries(
      renewalMs,
      tenDaysLater,
    );
    expect(boundaries10d.cutoff5hMs).toBe(tenDaysLater - 5 * 60 * 60 * 1000);
    expect(boundaries10d.cutoff7dMs).toBe(
      tenDaysLater - 7 * 24 * 60 * 60 * 1000,
    );
    expect(boundaries10d.cutoff30dMs).toBe(renewalMs);
  });

  test("computeRollingResetTimestamp accurately finds unblock time when limits are exceeded", () => {
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    const t0 = new Date("2026-10-25T10:00:00.000Z").getTime();
    const t1 = new Date("2026-10-25T11:00:00.000Z").getTime();
    const t2 = new Date("2026-10-25T12:00:00.000Z").getTime();

    // 0 spend -> null
    expect(computeRollingResetTimestamp([], 0, 1000, FIVE_HOURS_MS)).toBeNull();

    // Under limit (400c of 1000c) -> oldest tx + 5h (start of continuous refill)
    const activeTxs = [{ createdAt: t0, amountCents: -400 }];
    expect(
      computeRollingResetTimestamp(activeTxs, 400, 1000, FIVE_HOURS_MS),
    ).toBe("2026-10-25T15:00:00.000Z");

    // Over limit: 1200c spent (tx0=100c, tx1=200c, tx2=900c).
    // Aging out tx0 leaves 1100c (still >= 1000c).
    // Aging out tx1 leaves 900c (< 1000c limit).
    // Exact unblock time is t1 + 5h (11:00 + 5h = 16:00).
    const blockedTxs = [
      { createdAt: t0, amountCents: -100 },
      { createdAt: t1, amountCents: -200 },
      { createdAt: t2, amountCents: -900 },
    ];
    expect(
      computeRollingResetTimestamp(blockedTxs, 1200, 1000, FIVE_HOURS_MS),
    ).toBe("2026-10-25T16:00:00.000Z");
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
