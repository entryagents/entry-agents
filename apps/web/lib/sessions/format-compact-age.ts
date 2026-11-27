const NAIVE_SQL_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

/**
 * Parses Date, ISO-8601, or naive Postgres `timestamp without time zone`
 * strings (`"2026-11-27 12:00:00.123456"`) strictly as UTC so browsers in
 * non-UTC timezones (e.g. UTC+1) never shift recent timestamps by ±1h.
 */
export function parseUtcTimestamp(
  timestamp: string | Date | null | undefined,
): Date | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) {
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }

  const trimmed = timestamp.trim();
  if (!trimmed) return null;

  const normalized = NAIVE_SQL_TIMESTAMP_RE.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a compact relative age label for sidebar chat rows ("5m", "2h", "4d"),
 * matching compact coding-agent sidebar conventions.
 */
export function formatCompactAge(
  timestamp: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseUtcTimestamp(timestamp);
  if (!date) return "";

  const diffSeconds = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / 1000),
  );
  if (diffSeconds < 60) return "now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 365) return `${diffDays}d`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y`;
}
