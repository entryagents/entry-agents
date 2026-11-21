/**
 * MRU ordering & index stepping for Ctrl+Tab QuickSwitch.
 * 1:1 port of Sable's `src/features/session/quick.ts`.
 */

export interface QuickSessionLike {
  id: string;
  updatedAt: number;
  archived?: boolean;
}

/**
 * Returns sessions in Ctrl+Tab MRU order: recently visited in this tab first,
 * followed by remaining sessions ordered by `updatedAt` descending.
 */
export function recentOrder<T extends QuickSessionLike>(
  sessions: readonly T[],
  visits: readonly string[],
  limit = 9,
): T[] {
  const live = sessions.filter((s) => !s.archived);
  const byId = new Map(live.map((s) => [s.id, s]));
  const out: T[] = [];
  const seen = new Set<string>();

  for (const id of visits) {
    const s = byId.get(id);
    if (s && !seen.has(id)) {
      seen.add(id);
      out.push(s);
    }
  }

  for (const s of [...live].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }

  return out.slice(0, limit);
}

/** Moves `id` to the front of the MRU visit history. */
export function recordVisit(
  visits: readonly string[],
  id: string,
  keep = 30,
): string[] {
  if (!id) return [...visits];
  return [id, ...visits.filter((v) => v !== id)].slice(0, keep);
}

/** Starting selection index for the first Ctrl+Tab press. */
export function firstQuickIndex(
  ids: readonly string[],
  activeId: string | null,
  dir: 1 | -1,
): number {
  if (ids.length === 0) return -1;
  const at = activeId ? ids.indexOf(activeId) : -1;
  if (at < 0) return dir === 1 ? 0 : ids.length - 1;
  return (at + dir + ids.length) % ids.length;
}

export function cycleQuickIndex(
  index: number,
  len: number,
  dir: 1 | -1,
): number {
  return len > 0 ? (index + dir + len) % len : -1;
}
