import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { FREE_DAILY_MESSAGE_LIMIT, isFreeDailyLimitExceeded } =
  await import("./free-daily-limit");

describe("isFreeDailyLimitExceeded", () => {
  test("allows up to 5 messages per day", () => {
    expect(FREE_DAILY_MESSAGE_LIMIT).toBe(5);
    expect(isFreeDailyLimitExceeded(0)).toBe(false);
    expect(isFreeDailyLimitExceeded(1)).toBe(false);
    expect(isFreeDailyLimitExceeded(5)).toBe(false);
  });

  test("blocks on the 6th message in 24 hours", () => {
    expect(isFreeDailyLimitExceeded(6)).toBe(true);
    expect(isFreeDailyLimitExceeded(12)).toBe(true);
  });
});
