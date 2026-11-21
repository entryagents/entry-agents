"use client";

import { Hourglass, Sparkles } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { shortDuration, useTick } from "./timeline-util";

export type TimelineTailStatus = "working" | "awaiting";

/**
 * Live working footer underneath the transcript (1:1 Sable `Tail.tsx`).
 * - Shows `"Waiting for you"` with an hourglass when a tool approval or
 *   question awaits user input.
 * - Shows a calm working label + live ticking `shortDuration` while the agent
 *   is running, stepping back quietly while prose is streaming.
 */
export const TimelineTail = memo(function TimelineTail({
  status,
  activity,
  startedAtMs,
  quiet = false,
}: {
  status: TimelineTailStatus;
  activity?: string | null;
  startedAtMs?: number | null;
  quiet?: boolean;
}) {
  const working = status === "working";
  const now = useTick(working);

  if (status === "awaiting") {
    return (
      <div
        role="status"
        data-status="awaiting"
        className="my-2 flex items-center gap-2 py-0.5 text-[13px] text-amber-600/90 select-none dark:text-amber-400/90"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <Hourglass className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium leading-none">Waiting for you</span>
      </div>
    );
  }

  const elapsed = startedAtMs && now > startedAtMs ? now - startedAtMs : 0;

  return (
    <div
      role="status"
      aria-live="off"
      data-status="working"
      data-quiet={quiet || undefined}
      className={cn(
        "my-2 flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground select-none transition-opacity duration-200",
        quiet && "opacity-45",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted-foreground/80" />
      </span>
      <span className="min-w-0 truncate leading-none animate-pulse">
        {activity?.trim() || "Working"}
      </span>
      {elapsed >= 1000 && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/65">
          {shortDuration(elapsed)}
        </span>
      )}
    </div>
  );
});
