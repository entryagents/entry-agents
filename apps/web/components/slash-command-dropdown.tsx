"use client";

import { useEffect, useRef } from "react";
import { Blocks, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillSuggestion } from "@/app/api/sessions/[sessionId]/skills/route";

interface SlashCommandDropdownProps {
  suggestions: SkillSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: SkillSuggestion) => void;
  isLoading?: boolean;
}

const MAX_VISIBLE_ITEMS = 10;

export function SlashCommandDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  isLoading,
}: SlashCommandDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      const list = listRef.current;
      const item = selectedRef.current;
      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();

      if (itemRect.top < listRect.top) {
        item.scrollIntoView({ block: "start" });
      } else if (itemRect.bottom > listRect.bottom) {
        item.scrollIntoView({ block: "end" });
      }
    }
  }, [selectedIndex]);

  if (isLoading) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-md border bg-popover p-2 text-sm text-muted-foreground shadow-md">
        Loading commands...
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-md border bg-popover shadow-md">
      <div
        ref={listRef}
        className="max-h-[280px] overflow-y-auto py-1"
        style={{ maxHeight: `${MAX_VISIBLE_ITEMS * 36}px` }}
      >
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.name}
            ref={index === selectedIndex ? selectedRef : null}
            type="button"
            onClick={() => onSelect(suggestion)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
          >
            {suggestion.source === "plugin" ? (
              <Blocks className="h-4 w-4 shrink-0 text-primary/80" />
            ) : (
              <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">/{suggestion.name}</span>
                {suggestion.source === "plugin" && (
                  <span className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0 font-mono text-[10px] text-muted-foreground">
                    {suggestion.pluginName ?? "plugin"}
                  </span>
                )}
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {suggestion.description}
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="border-t bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
        <kbd className="rounded bg-muted px-1">Tab</kbd> or{" "}
        <kbd className="rounded bg-muted px-1">Enter</kbd> to select,{" "}
        <kbd className="rounded bg-muted px-1">Esc</kbd> to dismiss
      </div>
    </div>
  );
}
