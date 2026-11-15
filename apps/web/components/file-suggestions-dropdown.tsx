"use client";

import { useEffect, useRef } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFileIcon, FolderIcon } from "@/components/file-type-icons";
import { SubagentIcon } from "@/components/agent-hub/agent-status";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";

interface FileSuggestionsDropdownProps {
  suggestions: FileSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: FileSuggestion) => void;
  isLoading?: boolean;
}

const MAX_VISIBLE_ITEMS = 10;

export function FileSuggestionsDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  isLoading,
}: FileSuggestionsDropdownProps) {
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

  if (isLoading && suggestions.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-30 mb-2 rounded-xl border border-border bg-popover p-3 text-xs text-muted-foreground shadow-lg">
        Loading teammates &amp; files...
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
          Tag specialist teammate or reference repository file
        </span>
        <span className="hidden font-mono text-[10px] sm:inline">
          @team · @role · @path
        </span>
      </div>
      <div
        ref={listRef}
        className="max-h-[300px] overflow-y-auto py-1"
        style={{ maxHeight: `${MAX_VISIBLE_ITEMS * 36}px` }}
      >
        <div className="space-y-px">
          {suggestions.map((suggestion, index) => {
            const isAgentOrTeam =
              suggestion.kind === "agent" || suggestion.kind === "team";

            if (isAgentOrTeam) {
              return (
                <button
                  key={`agent-${suggestion.value}`}
                  ref={index === selectedIndex ? selectedRef : null}
                  type="button"
                  onClick={() => onSelect(suggestion)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                    index === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/70",
                  )}
                >
                  {suggestion.kind === "team" ? (
                    <Users
                      className="h-4 w-4 shrink-0 text-amber-500"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <SubagentIcon
                      type={suggestion.value}
                      className="h-4 w-4 shrink-0 text-amber-500"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
                        @{suggestion.value}
                      </span>
                      <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 font-mono text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        {suggestion.kind === "team"
                          ? "Multi-agent team"
                          : "Specialist"}
                      </span>
                    </div>
                    {suggestion.description && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {suggestion.description}
                      </span>
                    )}
                  </div>
                </button>
              );
            }

            const fullPath = suggestion.display;
            const normalizedPath = suggestion.isDirectory
              ? fullPath.replace(/\/$/, "")
              : fullPath;
            const fileName = normalizedPath.split("/").pop() ?? normalizedPath;
            const dirPath = normalizedPath.slice(
              0,
              normalizedPath.length - fileName.length,
            );

            return (
              <button
                key={suggestion.value}
                ref={index === selectedIndex ? selectedRef : null}
                type="button"
                onClick={() => onSelect(suggestion)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                  index === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/70",
                )}
              >
                {suggestion.isDirectory ? (
                  <FolderIcon className="h-4 w-4 shrink-0" />
                ) : (
                  getFileIcon(fileName, { className: "h-4 w-4 shrink-0" })
                )}
                <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
                  <span className="shrink-0 text-xs font-medium text-foreground font-mono">
                    {fileName}
                  </span>
                  {dirPath && (
                    <span
                      className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted-foreground"
                      dir="rtl"
                    >
                      <bdi>{dirPath.replace(/\/$/, "")}</bdi>
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-border/60 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-[10px]">
          Tab
        </kbd>{" "}
        or{" "}
        <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-[10px]">
          Enter
        </kbd>{" "}
        to tag,{" "}
        <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-[10px]">
          Esc
        </kbd>{" "}
        to dismiss
      </div>
    </div>
  );
}
