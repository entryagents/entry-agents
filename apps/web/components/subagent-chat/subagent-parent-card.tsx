"use client";

import { ArrowDownRight, Bot, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { SubagentIcon } from "@/components/agent-hub/agent-status";
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
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 dark:border-blue-400/20 dark:bg-blue-950/20 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-500/10 px-4 py-3 bg-blue-500/10 dark:bg-blue-900/30">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white shadow-xs">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
            <span>Main Agent</span>
            <ArrowDownRight className="h-3 w-3 text-blue-500" />
            <span className="flex items-center gap-1 text-foreground font-medium">
              <SubagentIcon
                type={subagentType}
                className="h-3.5 w-3.5 text-neutral-500"
              />
              {subagentType.charAt(0).toUpperCase() + subagentType.slice(1)}{" "}
              Subagent
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
          <div className="mt-2.5 rounded-lg border border-border/50 bg-background/80 p-3 font-sans text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap dark:bg-neutral-900/60">
            {instructions}
          </div>
        )}
      </div>
    </div>
  );
}
