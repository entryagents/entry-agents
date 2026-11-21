import { describe, expect, test } from "bun:test";
import {
  cycleQuickIndex,
  firstQuickIndex,
  recentOrder,
  recordVisit,
} from "./quick-switch";

describe("quick-switch", () => {
  test("recentOrder prioritizes MRU visits then falls back to updatedAt desc", () => {
    const sessions = [
      { id: "a", updatedAt: 100 },
      { id: "b", updatedAt: 300 },
      { id: "c", updatedAt: 200 },
      { id: "d", updatedAt: 400, archived: true },
    ];
    const ordered = recentOrder(sessions, ["a", "c"]);
    expect(ordered.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  test("recordVisit moves session to front without duplicates", () => {
    expect(recordVisit(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  test("firstQuickIndex and cycleQuickIndex step forward and backward cleanly", () => {
    const ids = ["a", "b", "c"];
    expect(firstQuickIndex(ids, "a", 1)).toBe(1);
    expect(firstQuickIndex(ids, "a", -1)).toBe(2);
    expect(cycleQuickIndex(2, 3, 1)).toBe(0);
    expect(cycleQuickIndex(0, 3, -1)).toBe(2);
  });
});
