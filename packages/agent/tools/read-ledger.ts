import { normalizeGatePath } from "./read-state";

/**
 * Sightline-style range-aware read evidence ledger.
 *
 * Tracks which line ranges of a file the model has already seen for a given
 * full-file contentHash. Unlike transcript-rebuilt state, the ledger lives on
 * the session/context so compaction never destroys evidence, and range tracking
 * lets repeated reads of unchanged regions return a compact 10-line hybrid
 * anchor instead of re-sending thousands of tokens.
 */
export interface ReadEvidence {
  path: string;
  contentHash: string;
  ranges: Array<[number, number]>;
  totalLines: number;
  seenAtStep: number;
}

export type ReadLedger = Map<string, ReadEvidence>;

export function createReadLedger(): ReadLedger {
  return new Map();
}

export function ensureReadLedger(context: {
  readLedger?: unknown;
}): ReadLedger {
  let ledger: ReadLedger | undefined =
    context.readLedger instanceof Map
      ? (context.readLedger as ReadLedger)
      : undefined;
  if (!ledger) {
    ledger = createReadLedger();
    context.readLedger = ledger;
  }
  return ledger;
}

/**
 * Merge a new inclusive `[start, end]` line range into a sorted list of
 * non-overlapping inclusive ranges.
 */
export function mergeRanges(
  existing: Array<[number, number]>,
  next: [number, number],
): Array<[number, number]> {
  const [nStart, nEnd] = next[0] <= next[1] ? next : [next[1], next[0]];
  const all: Array<[number, number]> = [...existing, [nStart, nEnd]];
  all.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of all) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1] + 1) {
      merged.push([start, end]);
    } else if (end > last[1]) {
      last[1] = end;
    }
  }
  return merged;
}

/**
 * Return the sub-ranges of `requested` that are NOT covered by `covered`.
 */
export function subtractRanges(
  requested: [number, number],
  covered: Array<[number, number]>,
): Array<[number, number]> {
  const [reqStart, reqEnd] =
    requested[0] <= requested[1] ? requested : [requested[1], requested[0]];
  if (covered.length === 0) {
    return [[reqStart, reqEnd]];
  }

  const missing: Array<[number, number]> = [];
  let cursor = reqStart;

  for (const [cStart, cEnd] of covered) {
    if (cEnd < cursor) {
      continue;
    }
    if (cStart > reqEnd) {
      break;
    }
    if (cStart > cursor) {
      missing.push([cursor, Math.min(cStart - 1, reqEnd)]);
    }
    cursor = Math.max(cursor, cEnd + 1);
    if (cursor > reqEnd) {
      break;
    }
  }

  if (cursor <= reqEnd) {
    missing.push([cursor, reqEnd]);
  }
  return missing;
}

export function isRangeCovered(
  requested: [number, number],
  covered: Array<[number, number]>,
): boolean {
  return subtractRanges(requested, covered).length === 0;
}

export function getReadEvidence(
  ledger: ReadLedger,
  displayPath: string,
): ReadEvidence | undefined {
  return ledger.get(displayPath) ?? ledger.get(normalizeGatePath(displayPath));
}

export function recordReadEvidence(
  ledger: ReadLedger,
  displayPath: string,
  contentHash: string,
  range: [number, number],
  totalLines: number,
  step = 0,
): ReadEvidence {
  const normalized = normalizeGatePath(displayPath);
  const existing = ledger.get(displayPath) ?? ledger.get(normalized);

  const ranges =
    existing && existing.contentHash === contentHash
      ? mergeRanges(existing.ranges, range)
      : [
          range[0] <= range[1]
            ? range
            : ([range[1], range[0]] as [number, number]),
        ];

  const evidence: ReadEvidence = {
    path: displayPath,
    contentHash,
    ranges,
    totalLines,
    seenAtStep: step,
  };

  ledger.set(displayPath, evidence);
  ledger.set(normalized, evidence);
  return evidence;
}
