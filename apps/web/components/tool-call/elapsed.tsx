"use client";

import { useEffect, useRef, useState } from "react";
import { shortDuration } from "@/components/chat/timeline-util";

/**
 * Live seconds for a running tool call, ported 1:1 from Sable's `Tool.tsx`.
 * Hidden for the first two seconds: most calls are done by then.
 */
export function Elapsed({ active }: { active: boolean }) {
  const startRef = useRef<number | null>(null);
  const [ms, setMs] = useState(0);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setMs(0);
      return;
    }
    if (startRef.current === null) {
      startRef.current = Date.now();
    }
    const id = window.setInterval(() => {
      if (startRef.current !== null) {
        setMs(Date.now() - startRef.current);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active || ms < 2000) return null;
  return (
    <span className="shrink-0 text-[11.5px] leading-none tabular-nums text-muted-foreground/80">
      {shortDuration(ms)}
    </span>
  );
}
