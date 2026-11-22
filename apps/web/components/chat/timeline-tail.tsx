"use client";

import { Hourglass, Loader2 } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import "@/components/tool-call/agent-row.css";
import { shortDuration, useTick } from "./timeline-util";

export type TimelineTailStatus = "working" | "awaiting";

/**
 * Live working footer underneath the transcript (1:1 Sable `Tail.tsx`).
 * - Shows `"Waiting for you"` with an hourglass when a tool approval or
 *   question awaits user input (monochrome, no orange/amber).
 * - Shows a calm working label with Sable's `.shimmer` + live ticking
 *   `shortDuration` while the agent is running, stepping back quietly while
 *   prose is streaming.
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
        className="my-2 flex items-center gap-2 py-0.5 text-[13px] text-foreground select-none"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          <Hourglass className="h-3.5 w-3.5" strokeWidth={1.6} />
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
        <Loader2
          className="h-3.5 w-3.5 animate-spin text-muted-foreground/80"
          strokeWidth={1.6}
        />
      </span>
      <span className="shimmer min-w-0 truncate leading-none">
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
