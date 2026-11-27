import type { SessionWithUnread } from "@/hooks/use-sessions";

export type RecencyGroupLabel =
  | "Today"
  | "Yesterday"
  | "Previous 7 days"
  | "Older";

export interface RecencySessionGroup {
  label: RecencyGroupLabel;
  sessions: SessionWithUnread[];
}

function toTimestampMs(
  value: Date | string | number | null | undefined,
): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Compact, quiet relative timestamp for sidebar chat rows ("now", "5m", "3h", "2d", "Nov 14").
 */
export function formatCompactSessionAge(
  value: Date | string | number | null | undefined,
  nowMs: number = Date.now(),
): string {
  const ts = toTimestampMs(value);
  if (!ts) return "";

  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return "now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}

/**
 * Groups standalone chats into scannable recency sections (Today, Yesterday,
 * Previous 7 days, Older), omitting empty buckets.
 */
export function groupSessionsByRecency(
  sessions: readonly SessionWithUnread[],
  nowMs: number = Date.now(),
): RecencySessionGroup[] {
  if (sessions.length === 0) return [];

  const now = new Date(nowMs);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfLast7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<RecencyGroupLabel, SessionWithUnread[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };

  for (const session of sessions) {
    const ts = toTimestampMs(session.lastActivityAt ?? session.createdAt);
    if (ts >= startOfToday) {
      buckets.Today.push(session);
    } else if (ts >= startOfYesterday) {
      buckets.Yesterday.push(session);
    } else if (ts >= startOfLast7Days) {
      buckets["Previous 7 days"].push(session);
    } else {
      buckets.Older.push(session);
    }
  }

  const order: RecencyGroupLabel[] = [
    "Today",
    "Yesterday",
    "Previous 7 days",
    "Older",
  ];

  return order
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, sessions: buckets[label] }));
}
