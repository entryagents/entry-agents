/**
 * Pure search & cursor model for in-conversation Find (Cmd/Ctrl+F).
 * 1:1 port of Sable's `src/features/session/find.ts`.
 */

export interface FindSource {
  id: string;
  text: string;
}

export interface FindHit {
  itemId: string;
  /** Number of non-overlapping occurrences in this message. */
  count: number;
}

export interface FindCursor {
  /** Index into `hits`. */
  hit: number;
  /** Occurrence index within `hits[hit]`. */
  nth: number;
}

export interface FindMarks {
  ids: string[];
  current?: string;
}

/** Case-insensitive non-overlapping occurrence count. */
export function countIn(hay: string, needle: string): number {
  const n = needle.toLowerCase();
  if (!n) return 0;
  const h = hay.toLowerCase();
  let count = 0;
  for (let i = h.indexOf(n); i >= 0; i = h.indexOf(n, i + n.length)) {
    count++;
  }
  return count;
}

/** Messages matching `query` in conversation order with occurrence counts. */
export function findHits(
  sources: readonly FindSource[],
  query: string,
): FindHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: FindHit[] = [];
  for (const s of sources) {
    const count = countIn(s.text, q);
    if (count > 0) hits.push({ itemId: s.id, count });
  }
  return hits;
}

export function totalOf(hits: readonly FindHit[]): number {
  return hits.reduce((sum, h) => sum + h.count, 0);
}

/** 1-based ordinal of `cursor` among all occurrences, or 0 if none. */
export function ordinal(
  hits: readonly FindHit[],
  c: FindCursor | null,
): number {
  if (!c || !hits[c.hit]) return 0;
  let n = 0;
  for (let i = 0; i < c.hit; i++) {
    n += hits[i].count;
  }
  return n + Math.min(c.nth, hits[c.hit].count - 1) + 1;
}

/** Steps one occurrence forward (+1) or backward (-1), wrapping around ends. */
export function stepFindCursor(
  hits: readonly FindHit[],
  c: FindCursor | null,
  dir: 1 | -1,
): FindCursor | null {
  if (hits.length === 0) return null;
  if (!c || !hits[c.hit]) {
    return dir === 1
      ? { hit: 0, nth: 0 }
      : { hit: hits.length - 1, nth: hits[hits.length - 1].count - 1 };
  }
  const nth = c.nth + dir;
  if (nth >= 0 && nth < hits[c.hit].count) {
    return { hit: c.hit, nth };
  }
  const hit = (c.hit + dir + hits.length) % hits.length;
  return { hit, nth: dir === 1 ? 0 : hits[hit].count - 1 };
}

/** Starts at the latest match, or stays on `prevItem` if it still matches. */
export function startFindCursor(
  hits: readonly FindHit[],
  prevItem?: string,
): FindCursor | null {
  if (hits.length === 0) return null;
  const same = prevItem ? hits.findIndex((h) => h.itemId === prevItem) : -1;
  if (same >= 0) return { hit: same, nth: 0 };
  const last = hits.length - 1;
  return { hit: last, nth: hits[last].count - 1 };
}
