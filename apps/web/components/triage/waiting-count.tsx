"use client";

import "./triage.css";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTriage } from "./triage-context";

/**
 * Quiet top-bar count of pending approvals & questions across sessions,
 * ported 1:1 from Sable's `WaitingCount.tsx`. Opens the Triage Deck (`Ctrl+I`).
 */
export function WaitingCount() {
  const { prompts, setOpen } = useTriage();
  const n = prompts.length;
  if (n === 0) return null;

  const label =
    n === 1 ? "1 request waiting on you" : `${n} requests waiting on you`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="tri-waiting"
          onClick={() => setOpen(true)}
          aria-label={label}
        >
          <span className="tri-waiting-dot" aria-hidden="true" />
          <span>{n} waiting</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Answer what waits (Ctrl+I)</TooltipContent>
    </Tooltip>
  );
}
