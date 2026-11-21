"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Blocks,
  Bot,
  BrushCleaning,
  Settings2,
  Terminal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillSuggestion } from "@/app/api/sessions/[sessionId]/skills/route";

interface SlashCommandDropdownProps {
  suggestions: SkillSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: SkillSuggestion) => void;
  isLoading?: boolean;
}

const MAX_VISIBLE_ITEMS = 9;

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
      <div className="absolute bottom-full left-0 right-0 z-30 mb-2 rounded-xl border border-border bg-popover p-3 text-xs text-muted-foreground shadow-lg">
        Loading skills & subagents...
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">
          Invoke skill, subagent, or /team
        </span>
        <Link
          href="/settings/skills"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings2 className="size-3" strokeWidth={1.5} />
          Manage skills
        </Link>
      </div>
      <div
        ref={listRef}
        className="max-h-[300px] overflow-y-auto py-1"
        style={{ maxHeight: `${MAX_VISIBLE_ITEMS * 40}px` }}
      >
        {suggestions.map((suggestion, index) => {
          const isTeam = suggestion.source === "team";
          const isTeamOrchestrator =
            isTeam &&
            (suggestion.name === "team" || suggestion.name === "team-plan");
          const isPlugin = suggestion.source === "plugin";
          const isCommand = suggestion.source === "command";
          return (
            <button
              key={suggestion.name}
              ref={index === selectedIndex ? selectedRef : null}
              type="button"
              onClick={() => onSelect(suggestion)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/70",
              )}
            >
              {isCommand ? (
                <BrushCleaning
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
              ) : isPlugin ? (
                <Blocks
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
              ) : isTeamOrchestrator ? (
                <Users
                  className="size-4 shrink-0 text-primary"
                  strokeWidth={1.5}
                />
              ) : isTeam ? (
                <Bot
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
              ) : (
                <Terminal
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs font-semibold">
                    /{suggestion.name}
                  </span>
                  {isCommand ? (
                    <span className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0 font-mono text-[10px] font-medium text-muted-foreground">
                      Command
                    </span>
                  ) : isPlugin ? (
                    <span className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0 font-mono text-[10px] text-muted-foreground">
                      {suggestion.pluginName ?? "Plugin"}
                    </span>
                  ) : isTeamOrchestrator ? (
                    <span className="shrink-0 rounded border border-primary/25 bg-primary/10 px-1.5 py-0 font-mono text-[10px] font-medium text-primary">
                      Team mode
                    </span>
                  ) : isTeam ? (
                    <span className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0 font-mono text-[10px] font-medium text-muted-foreground">
                      Subagent
                    </span>
                  ) : (
                    <span className="shrink-0 rounded border border-border/70 bg-muted/60 px-1.5 py-0 font-mono text-[10px] font-medium text-muted-foreground">
                      Skill
                    </span>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {suggestion.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <div>
          <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-[10px]">
            Tab
          </kbd>{" "}
          or{" "}
          <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-[10px]">
            Enter
          </kbd>{" "}
          to invoke,{" "}
          <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-[10px]">
            Esc
          </kbd>{" "}
          to dismiss
        </div>
        <span className="hidden sm:inline font-mono text-[10px]">
          {suggestions.length} available
        </span>
      </div>
    </div>
  );
}
