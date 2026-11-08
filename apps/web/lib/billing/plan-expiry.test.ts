import { describe, test, expect } from "bun:test";
import {
  addOneCalendarMonth,
  consumedFromGrantPool,
  expiredGrantCentsOnPlanEnd,
  shouldAutoRevertToFree,
  subtractOneCalendarMonth,
} from "./plans";

const DAY = 24 * 60 * 60 * 1000;
const ANCHOR = new Date("2026-08-15T12:00:00Z");
const EXPIRES_AT = new Date("2026-09-15T12:00:00Z").getTime();

describe("addOneCalendarMonth / subtractOneCalendarMonth", () => {
  test("adds 1 UTC calendar month preserving time of day", () => {
    expect(addOneCalendarMonth("2026-01-15T12:34:56.789Z").toISOString()).toBe(
      "2026-02-15T12:34:56.789Z",
    );
    expect(addOneCalendarMonth("2026-12-10T00:00:00.000Z").toISOString()).toBe(
      "2027-01-10T00:00:00.000Z",
    );
  });

  test("clamps end-of-month dates to last day of next month (e.g. Jan 31 -> Feb 28)", () => {
    expect(addOneCalendarMonth("2026-01-31T08:00:00.000Z").toISOString()).toBe(
      "2026-02-28T08:00:00.000Z",
    );
    expect(addOneCalendarMonth("2028-01-31T08:00:00.000Z").toISOString()).toBe(
      "2028-02-29T08:00:00.000Z",
    );
  });

  test("subtracts 1 UTC calendar month clamping end-of-month", () => {
    expect(
      subtractOneCalendarMonth("2026-03-31T08:00:00.000Z").toISOString(),
    ).toBe("2026-02-28T08:00:00.000Z");
  });
});

describe("shouldAutoRevertToFree (1 calendar month expiry matching Bachs)", () => {
  test("paid plan whose last renewal is older than 1 calendar month -> revert", () => {
    expect(shouldAutoRevertToFree("plus", ANCHOR, EXPIRES_AT + 1)).toBe(true);
    expect(shouldAutoRevertToFree("goat", ANCHOR, EXPIRES_AT + 5 * DAY)).toBe(
      true,
    );
    expect(shouldAutoRevertToFree("max", ANCHOR, EXPIRES_AT + 1)).toBe(true);
  });

  test("healthy monthly subscriber (within 1 calendar month) -> keep", () => {
    expect(shouldAutoRevertToFree("plus", ANCHOR, EXPIRES_AT - DAY)).toBe(
      false,
    );
    expect(
      shouldAutoRevertToFree("max", ANCHOR, ANCHOR.getTime() + 2 * DAY),
    ).toBe(false);
  });

  test("exactly at the 1-calendar-month boundary -> NOT reverted (strictly greater)", () => {
    expect(shouldAutoRevertToFree("plus", ANCHOR, EXPIRES_AT)).toBe(false);
  });

  test("free plan never reverts", () => {
    expect(
      shouldAutoRevertToFree(
        "free",
        new Date(EXPIRES_AT - 90 * DAY),
        EXPIRES_AT,
      ),
    ).toBe(false);
    expect(
      shouldAutoRevertToFree(null, new Date(EXPIRES_AT - 90 * DAY), EXPIRES_AT),
    ).toBe(false);
  });

  test("null anchor -> no-op (never saw a renewal charge; can't interpret)", () => {
    expect(shouldAutoRevertToFree("plus", null, EXPIRES_AT)).toBe(false);
    expect(shouldAutoRevertToFree("goat", undefined, EXPIRES_AT)).toBe(false);
  });

  test("unparseable anchor -> no-op, never crash", () => {
    expect(shouldAutoRevertToFree("plus", "not-a-date", EXPIRES_AT)).toBe(
      false,
    );
  });
});

describe("grant pool: consumption + expiry math (credit dies with the plan)", () => {
  test("usage consumes the pool first, capped at the pool", () => {
    expect(consumedFromGrantPool(300, 5000)).toBe(300);
    expect(consumedFromGrantPool(5000, 300)).toBe(300);
    expect(consumedFromGrantPool(5000, 5000)).toBe(5000);
  });

  test("zero cost or empty pool -> nothing consumed", () => {
    expect(consumedFromGrantPool(0, 5000)).toBe(0);
    expect(consumedFromGrantPool(300, 0)).toBe(0);
    expect(consumedFromGrantPool(-5, 5000)).toBe(0);
  });

  test("on plan end: the unspent grant is removed", () => {
    expect(expiredGrantCentsOnPlanEnd(4200, 1000)).toBe(1000);
  });

  test("on plan end: never remove more than the balance (negative-balance defense)", () => {
    expect(expiredGrantCentsOnPlanEnd(50, 1000)).toBe(50);
    expect(expiredGrantCentsOnPlanEnd(0, 1000)).toBe(0);
    expect(expiredGrantCentsOnPlanEnd(-200, 1000)).toBe(0);
  });

  test("on plan end: pure top-up user (empty pool) keeps everything", () => {
    expect(expiredGrantCentsOnPlanEnd(4200, 0)).toBe(0);
  });
});
