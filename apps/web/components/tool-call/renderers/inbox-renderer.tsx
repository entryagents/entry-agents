"use client";

import { useState } from "react";
import type { WebAgentUIToolPart } from "@/app/types";
import type { ToolRenderState } from "@/app/lib/render-tool";
import { ChevronDown, ChevronUp, Inbox } from "lucide-react";

interface InboxRendererProps {
  part: WebAgentUIToolPart;
  state: ToolRenderState;
}

export function InboxRenderer({ part, state: _state }: InboxRendererProps) {
  const [expanded, setExpanded] = useState(false);
  const input = (part.input ?? {}) as { action?: "check" | "list" };
  const output = (part.output ?? {}) as {
    success?: boolean;
    unreadCount?: number;
    totalCount?: number;
    newlyReadCount?: number;
    messages?: Array<{
      id: string;
      sequence: number;
      label: string;
      isNew: boolean;
      content: string;
      createdAt: string;
    }>;
  };

  const messages = output.messages ?? [];
  const unread = output.unreadCount ?? messages.filter((m) => m.isNew).length;
  const newlyRead = output.newlyReadCount ?? 0;
  const action = input.action ?? "check";
  const isRunning =
    part.state === "input-available" || part.state === "input-streaming";

  const parts = [
    action === "list" ? "Listed" : "Read",
    `${messages.length} message${messages.length !== 1 ? "s" : ""}`,
    unread > 0 ? `${unread} unread` : null,
    newlyRead > 0 ? `${newlyRead} marked read` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-1 py-0.5 text-left text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      onClick={() => messages.length > 0 && setExpanded(!expanded)}
    >
      <Inbox
        className={`h-3.5 w-3.5 shrink-0 ${isRunning ? "animate-pulse text-blue-400/70" : "opacity-50"}`}
      />
      <span>{isRunning ? "Checking inbox…" : parts.join(" · ")}</span>
      {messages.length > 0 &&
        (expanded ? (
          <ChevronUp className="h-3 w-3 shrink-0 opacity-40" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
        ))}
    </button>
  );
}
