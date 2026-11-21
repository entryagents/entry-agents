import { describe, expect, test } from "bun:test";
import {
  countIn,
  findHits,
  ordinal,
  startFindCursor,
  stepFindCursor,
  totalOf,
} from "./conversation-find";

describe("conversation-find", () => {
  test("countIn counts case-insensitive non-overlapping occurrences", () => {
    expect(countIn("Foo foo FOO", "foo")).toBe(3);
    expect(countIn("aaaa", "aa")).toBe(2);
    expect(countIn("hello", "")).toBe(0);
  });

  test("findHits, startFindCursor, stepFindCursor, and ordinal wrap cleanly", () => {
    const hits = findHits(
      [
        { id: "m1", text: "alpha beta alpha" },
        { id: "m2", text: "gamma" },
        { id: "m3", text: "alpha" },
      ],
      "alpha",
    );
    expect(hits).toEqual([
      { itemId: "m1", count: 2 },
      { itemId: "m3", count: 1 },
    ]);
    expect(totalOf(hits)).toBe(3);

    const start = startFindCursor(hits);
    expect(start).toEqual({ hit: 1, nth: 0 });
    expect(ordinal(hits, start)).toBe(3);

    const wrappedNext = stepFindCursor(hits, start, 1);
    expect(wrappedNext).toEqual({ hit: 0, nth: 0 });
    expect(ordinal(hits, wrappedNext)).toBe(1);

    const secondInFirst = stepFindCursor(hits, wrappedNext, 1);
    expect(secondInFirst).toEqual({ hit: 0, nth: 1 });
    expect(ordinal(hits, secondInFirst)).toBe(2);

    const back = stepFindCursor(hits, wrappedNext, -1);
    expect(back).toEqual({ hit: 1, nth: 0 });
  });
});
