"use client";

import type { WebAgentUIToolPart } from "@/app/types";
import { ToolLayout } from "../tool-layout";
import type { ToolRenderState } from "@/app/lib/render-tool";

interface InboxRendererProps {
  part: WebAgentUIToolPart;
  state: ToolRenderState;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}

/**
 * LobeHub-style crisp Inbox vector icon for the `inbox` steering tool.
 */
function LobeInboxIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

export function InboxRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: InboxRendererProps) {
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
  const newCount =
    output.newlyReadCount ?? messages.filter((m) => m.isNew).length;
  const summary =
    input.action === "list"
      ? "List steering inbox"
      : "Check user steering inbox";
  const meta =
    part.state === "output-available"
      ? newCount > 0
        ? `${newCount} new · ${messages.length} total`
        : `${messages.length} total`
      : undefined;

  return (
    <ToolLayout
      name="Inbox"
      icon={<LobeInboxIcon className="h-3.5 w-3.5 text-primary" />}
      summary={summary}
      meta={meta}
      state={state}
      onApprove={onApprove}
      onDeny={onDeny}
    >
      {part.state === "output-available" && messages.length > 0 && (
        <div className="space-y-1.5 text-xs">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded border p-2 ${
                msg.isNew
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/50 bg-muted/20 opacity-80"
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span
                  className={`font-medium ${
                    msg.isNew ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  #{msg.sequence} · {msg.isNew ? "NEW / UNREAD" : "OLD / READ"}
                </span>
                <span className="text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-foreground">
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </ToolLayout>
  );
}
