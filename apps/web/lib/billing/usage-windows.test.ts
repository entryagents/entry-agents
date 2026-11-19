import { describe, expect, test } from "bun:test";

import {
  findExceededUsageWindow,
  normalizePlanId,
  PLAN_CATALOG,
  type UsageWindowTotals,
} from "@/lib/billing/plans";

const ZERO_TOTALS: UsageWindowTotals = {
  last5HoursCents: 0,
  last7DaysCents: 0,
  last30DaysCents: 0,
};

describe("findExceededUsageWindow", () => {
  const windows = PLAN_CATALOG.entry.usageWindows!;

  test("returns null when all windows are under their limits", () => {
    expect(
      findExceededUsageWindow(
        {
          last5HoursCents: windows.fiveHourLimitCents - 1,
          last7DaysCents: windows.weeklyLimitCents - 1,
          last30DaysCents: windows.monthlyLimitCents - 1,
        },
        windows,
      ),
    ).toBeNull();
  });

  test("flags the 5-hour window at exactly its limit", () => {
    expect(
      findExceededUsageWindow(
        {
          ...ZERO_TOTALS,
          last5HoursCents: windows.fiveHourLimitCents,
        },
        windows,
      ),
    ).toBe("fiveHour");
  });

  test("5-hour wins over weekly/monthly when several are full (nearest reset first)", () => {
    expect(
      findExceededUsageWindow(
        {
          last5HoursCents: windows.fiveHourLimitCents,
          last7DaysCents: windows.weeklyLimitCents,
          last30DaysCents: windows.monthlyLimitCents,
        },
        windows,
      ),
    ).toBe("fiveHour");
  });

  test("flags weekly only when 5-hour is not full", () => {
    expect(
      findExceededUsageWindow(
        {
          ...ZERO_TOTALS,
          last5HoursCents: windows.fiveHourLimitCents - 1,
          last7DaysCents: windows.weeklyLimitCents,
        },
        windows,
      ),
    ).toBe("weekly");
  });

  test("flags monthly only when 5-hour and weekly are not full", () => {
    expect(
      findExceededUsageWindow(
        {
          ...ZERO_TOTALS,
          last7DaysCents: windows.weeklyLimitCents - 1,
          last30DaysCents: windows.monthlyLimitCents,
        },
        windows,
      ),
    ).toBe("monthly");
  });

  test("Builder windows are $6 / $14 / $28 of the $28 grant", () => {
    expect(windows.fiveHourLimitCents).toBe(600);
    expect(windows.weeklyLimitCents).toBe(1400);
    expect(windows.monthlyLimitCents).toBe(2800);
  });

  test("the $10 windowed plan is named Builder with id entry (and normalizes legacy goat)", () => {
    expect(PLAN_CATALOG.entry.name).toBe("Builder");
    expect(PLAN_CATALOG.entry.priceUsdCents).toBe(1000);
    expect(normalizePlanId("goat")).toBe("entry");
  });

  test("Plus ($3) and Builder ($10) plans have usage windows", () => {
    expect(PLAN_CATALOG.plus.usageWindows).toEqual({
      fiveHourLimitCents: 150,
      weeklyLimitCents: 350,
      monthlyLimitCents: 600,
    });
    expect(PLAN_CATALOG.entry.usageWindows).toBeDefined();
    expect(PLAN_CATALOG.free.usageWindows).toBeUndefined();
  });
});
