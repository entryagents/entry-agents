import { describe, expect, test } from "bun:test";
import {
  createReadLedger,
  getReadEvidence,
  isRangeCovered,
  mergeRanges,
  recordReadEvidence,
  subtractRanges,
} from "./read-ledger";

describe("read-ledger", () => {
  test("mergeRanges merges overlapping and adjacent intervals", () => {
    expect(mergeRanges([[1, 50]], [51, 100])).toEqual([[1, 100]]);
    expect(mergeRanges([[1, 50]], [25, 75])).toEqual([[1, 75]]);
    expect(mergeRanges([[1, 50]], [100, 150])).toEqual([
      [1, 50],
      [100, 150],
    ]);
  });

  test("subtractRanges returns only unseen line intervals", () => {
    expect(subtractRanges([1, 100], [[1, 100]])).toEqual([]);
    expect(subtractRanges([1, 100], [[1, 50]])).toEqual([[51, 100]]);
    expect(
      subtractRanges(
        [1, 100],
        [
          [1, 20],
          [40, 60],
        ],
      ),
    ).toEqual([
      [21, 39],
      [61, 100],
    ]);
  });

  test("isRangeCovered detects full coverage", () => {
    expect(isRangeCovered([10, 40], [[1, 100]])).toBe(true);
    expect(isRangeCovered([10, 120], [[1, 100]])).toBe(false);
  });

  test("recordReadEvidence merges ranges for same hash and resets on hash change", () => {
    const ledger = createReadLedger();
    recordReadEvidence(ledger, "src/app.ts", "hash-1", [1, 50], 200, 1);
    recordReadEvidence(ledger, "./src/app.ts", "hash-1", [51, 100], 200, 2);

    const ev = getReadEvidence(ledger, "src/app.ts");
    expect(ev?.ranges).toEqual([[1, 100]]);
    expect(ev?.contentHash).toBe("hash-1");

    // File changed on disk -> resets ranges
    recordReadEvidence(ledger, "src/app.ts", "hash-2", [1, 20], 210, 3);
    const updated = getReadEvidence(ledger, "src/app.ts");
    expect(updated?.ranges).toEqual([[1, 20]]);
    expect(updated?.contentHash).toBe("hash-2");
  });
});
