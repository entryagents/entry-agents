"use client";

import { Brain } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ToolRenderState } from "@entry-agents/shared/lib/tool-state";
import { UserMessageFold } from "./user-message-fold";
import { ToolLayout } from "./tool-call/tool-layout";

interface ThinkingBlockProps {
  text: string;
  isStreaming?: boolean;
  partCount?: number;
}

const COMPLETED_STATE: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

const STREAMING_STATE: ToolRenderState = {
  running: true,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

export function ThinkingBlock({
  text,
  isStreaming = false,
}: ThinkingBlockProps) {
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
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
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

  const hasContent = text.trim().length > 0;
  // One quiet line with its time; nothing opens by itself, so the trail never jumps.
  const name = isStreaming ? "Thinking" : "Thought";

  const summary =
    !isStreaming && elapsed > 0
      ? elapsed >= 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`
      : "";

  const expandedContent = hasContent ? (
    <div className="sable-think-body">
      <UserMessageFold
        text={text}
        className="text-[12.5px] leading-[1.6] text-muted-foreground"
      />
    </div>
  ) : undefined;

  return (
    <ToolLayout
      name={name}
      icon={<Brain className="h-3.5 w-3.5" />}
      summary={summary}
      state={isStreaming ? STREAMING_STATE : COMPLETED_STATE}
      defaultExpanded={false}
      autoExpanded={false}
      expandedContent={expandedContent}
    />
  );
}
