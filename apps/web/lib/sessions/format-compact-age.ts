/**
 * Format a compact relative age label for sidebar chat rows ("5m", "2h", "4d"),
 * matching compact coding-agent sidebar conventions.
 */
export function formatCompactAge(
  timestamp: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!timestamp) return "";
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "";

  const diffSeconds = Math.max(0, Math.floor((now.getTime() - ms) / 1000));
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
