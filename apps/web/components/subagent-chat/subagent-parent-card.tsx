"use client";

import { ArrowDownRight, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { SubagentIcon } from "@/components/agent-hub/agent-status";
import { StreamingMarkdown } from "@/components/streaming-markdown";
import { Button } from "@/components/ui/button";

export function SubagentParentCard({
  task,
  instructions,
  subagentType,
  modelId,
}: {
  task: string;
  instructions: string;
  subagentType: string;
  modelId: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 bg-muted/20">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-foreground border border-border/50">
            <Bot className="h-3 w-3" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span>Main agent</span>
            <ArrowDownRight className="h-3 w-3 text-muted-foreground" />
            <span className="flex items-center gap-1 text-muted-foreground font-normal">
              <SubagentIcon
                type={subagentType}
                className="h-3.5 w-3.5 text-muted-foreground"
              />
              {subagentType.charAt(0).toUpperCase() + subagentType.slice(1)}{" "}
              subagent
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {modelId && (
            <span className="font-mono text-[11px] text-muted-foreground hidden sm:inline">
              {modelId}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label={
              isExpanded ? "Collapse instructions" : "Expand instructions"
            }
          >
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Task Summary */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{task}</h2>

        {/* Full Instructions */}
        {isExpanded && instructions && (
          <div className="mt-2.5 rounded-lg border border-border/50 bg-muted/20 p-3 font-sans text-xs leading-relaxed text-foreground">
            <StreamingMarkdown content={instructions} isStreaming={false} />
          </div>
        )}
      </div>
    </div>
  );
}
