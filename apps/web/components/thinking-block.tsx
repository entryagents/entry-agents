"use client";

import { Brain, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UserMessageFold } from "./user-message-fold";

interface ThinkingBlockProps {
  text: string;
  isStreaming?: boolean;
  partCount?: number;
}

/**
 * 1:1 port of Sable's `src/features/timeline/Thinking.tsx`.
 * One quiet 25px row with Brain icon, `Thinking`/`Thought`, elapsed duration,
 * and hover-reveal rotating caret. Expanding reveals `.sable-think-body` directly
 * on a left hairline without double-wrapping inside `.sable-tool-details`.
 */
export function ThinkingBlock({
  text,
  isStreaming = false,
}: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      if (startTimeRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    intervalRef.current = setInterval(() => {
      setElapsed(
        Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000),
      );
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isStreaming]);

  const canOpen = text.trim().length > 0;
  const label = isStreaming ? "Thinking" : "Thought";
  const timeLabel =
    elapsed >= 2
      ? elapsed >= 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`
      : null;

  const head = (
    <>
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70">
        <Brain className="h-3.5 w-3.5" />
      </span>
      <span
        className={cn(
          "shrink-0 text-[12.5px] font-medium text-muted-foreground",
          isStreaming && "shimmer text-foreground",
        )}
      >
        {label}
      </span>
      {timeLabel ? (
        <span className="shrink-0 text-[11.5px] text-muted-foreground/70 tabular-nums">
          {timeLabel}
        </span>
      ) : null}
      <span className="ml-auto" />
      {canOpen ? (
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/60 opacity-0 transition-[transform,opacity] duration-150 group-hover/think:opacity-100 group-focus-visible/think:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      ) : null}
    </>
  );

  return (
    <div className="min-w-0">
      {canOpen ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="group/think -mx-1.5 flex min-h-[25px] w-[calc(100%+12px)] cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition-colors duration-100 hover:bg-muted/40"
        >
          {head}
        </button>
      ) : (
        <div className="-mx-1.5 flex min-h-[25px] w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-0.5">
          {head}
        </div>
      )}
      {canOpen && open ? (
        <div className="sable-think-body">
          <UserMessageFold
            text={text}
            className="text-[12.5px] leading-[1.6] text-muted-foreground"
          />
        </div>
      ) : null}
    </div>
  );
}
