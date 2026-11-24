"use client";

import { Hourglass } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import "@/components/tool-call/agent-row.css";
import { SableTiles } from "./sable-tiles";
import { shortDuration, useTick } from "./timeline-util";

export type TimelineTailStatus = "working" | "awaiting";

/**
 * Live working footer underneath the transcript (1:1 Sable `Tail.tsx`).
 * Only shown when no running assistant turn is already rendering its own LiveLine.
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
        className="sable-work-head my-1 select-none"
      >
        <div className="sable-work-line sable-work-live" data-static="">
          <span className="sable-work-ind sable-work-wait-icon">
            <Hourglass size={13} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <span className="sable-work-label sable-work-waiting">
            Waiting for you
          </span>
        </div>
      </div>
    );
  }

  const elapsed = startedAtMs && now > startedAtMs ? now - startedAtMs : 0;

  return (
    <div
      role="status"
      aria-live="off"
      data-status="working"
      data-quiet={quiet ? "" : undefined}
      className={cn("sable-work-head my-1 select-none")}
    >
      <div className="sable-work-line sable-work-live" data-static="">
        <span className="sable-work-ind">
          <SableTiles size={12} />
        </span>
        <span className="sable-work-label sable-work-live-title shimmer truncate">
          {activity?.trim() || "Working"}
        </span>
        {elapsed >= 1000 && (
          <span className="sable-work-time tabular-nums">
            {shortDuration(elapsed)}
          </span>
        )}
      </div>
    </div>
  );
});
