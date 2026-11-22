"use client";

import { Brain, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SableCollapse } from "./sable-chat/collapse";
import { UserMessageFold } from "./user-message-fold";

interface ThinkingBlockProps {
  text: string;
  isStreaming?: boolean;
  partCount?: number;
}

/**
 * Mounted 1:1 from Sable `src/features/timeline/Thinking.tsx` + `Collapse.tsx`:
 * - Exact `.sable-think` > `.sable-row-btn` > `.sable-tool-icon` + `.sable-tool-title`
 *   + inline duration + hover-reveal `.sable-row-caret` (no pill hover background).
 * - Smooth `SableCollapse` reveal into `.sable-think-body` hairline.
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
      <span className="sable-tool-icon">
        <Brain className="h-3.5 w-3.5" />
      </span>
      <span
        className={
          isStreaming ? "sable-tool-title shimmer" : "sable-tool-title"
        }
      >
        {label}
      </span>
      {timeLabel ? (
        <span className="sable-tool-sub tabular-nums">{timeLabel}</span>
      ) : null}
      {canOpen ? (
        <ChevronRight className="sable-row-caret h-2.5 w-2.5" />
      ) : null}
    </>
  );

  return (
    <div className="sable-think" data-open={open || undefined}>
      {canOpen ? (
        <button
          type="button"
          className="sable-row-btn"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          {head}
        </button>
      ) : (
        <div className="sable-row-btn" data-static="">
          {head}
        </div>
      )}
      {canOpen ? (
        <SableCollapse open={open}>
          <div className="sable-think-body">
            <UserMessageFold
              text={text}
              className="text-[12.5px] leading-[1.6] text-muted-foreground"
            />
          </div>
        </SableCollapse>
      ) : null}
    </div>
  );
}
