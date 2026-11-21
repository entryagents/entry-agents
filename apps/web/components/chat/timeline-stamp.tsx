"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { stampParts } from "./timeline-util";

/**
 * Quiet message timestamp (1:1 Sable `Stamp.tsx`).
 * Displays time-only for today, or date + time for earlier days.
 */
export const TimelineStamp = memo(function TimelineStamp({
  timestamp,
  prefix,
  className,
}: {
  timestamp: string | number | null | undefined;
  prefix?: string;
  className?: string;
}) {
  if (!timestamp) return null;
  const ts = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return null;

  const { day, time } = stampParts(ts);

  return (
    <time
      dateTime={new Date(ts).toISOString()}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground/65 select-none",
        className,
      )}
    >
      {prefix && <span>{prefix}</span>}
      {day && <span>{day}</span>}
      <span>{time}</span>
    </time>
  );
});
