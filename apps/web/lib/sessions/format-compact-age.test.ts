import { describe, expect, test } from "bun:test";
import { formatCompactAge } from "./format-compact-age";

describe("formatCompactAge", () => {
  const nowDate = new Date("2026-11-27T12:00:00Z");
  const now = nowDate.getTime();

  test("returns empty string for null, undefined, or invalid dates", () => {
    expect(formatCompactAge(null, nowDate)).toBe("");
    expect(formatCompactAge(undefined, nowDate)).toBe("");
    expect(formatCompactAge("not-a-date", nowDate)).toBe("");
  });

  test("returns now for sub-minute and future timestamps", () => {
    expect(formatCompactAge(new Date(now - 20_000), nowDate)).toBe("now");
    expect(formatCompactAge(new Date(now + 60_000), nowDate)).toBe("now");
  });

  test("formats minutes, hours, days, and years compactly", () => {
    expect(formatCompactAge(new Date(now - 5 * 60_000), nowDate)).toBe("5m");
    expect(formatCompactAge(new Date(now - 2 * 3_600_000), nowDate)).toBe("2h");
    expect(formatCompactAge(new Date(now - 4 * 86_400_000), nowDate)).toBe(
      "4d",
    );
    expect(formatCompactAge(new Date(now - 400 * 86_400_000), nowDate)).toBe(
      "1y",
    );
  });

  test("accepts ISO string dates", () => {
    expect(formatCompactAge("2026-11-27T11:45:00Z", nowDate)).toBe("15m");
  });
});
