"use client";

interface SidebarDiffMeterProps {
  readonly added: number | null;
  readonly removed: number | null;
}

/**
 * Compact proportional line-change indicator for project sessions.
 * Keeps diff counts quiet and aligned on the secondary metadata line
 * so chat titles always preserve full horizontal width.
 */
export function SidebarDiffMeter({ added, removed }: SidebarDiffMeterProps) {
  const safeAdded = Math.max(0, added ?? 0);
  const safeRemoved = Math.max(0, removed ?? 0);
  const total = safeAdded + safeRemoved;
  if (total === 0) return null;

  const addedPct = Math.round((safeAdded / total) * 100);
  const removedPct = 100 - addedPct;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] leading-none tabular-nums"
      aria-label={`${safeAdded} additions, ${safeRemoved} deletions`}
    >
      <span
        aria-hidden="true"
        className="flex h-[3px] w-4 overflow-hidden rounded-full bg-foreground/10"
      >
        {addedPct > 0 ? (
          <span
            className="h-full bg-emerald-500/80"
            style={{ width: `${addedPct}%` }}
          />
        ) : null}
        {removedPct > 0 ? (
          <span
            className="h-full bg-rose-500/80"
            style={{ width: `${removedPct}%` }}
          />
        ) : null}
      </span>
      <span className="inline-flex items-center gap-1">
        {safeAdded > 0 ? (
          <span className="text-emerald-600/90 dark:text-emerald-400/90">
            +{safeAdded}
          </span>
        ) : null}
        {safeRemoved > 0 ? (
          <span className="text-rose-600/90 dark:text-rose-400/90">
            -{safeRemoved}
          </span>
        ) : null}
      </span>
    </span>
  );
}
