"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type UserMessageFoldProps = {
  text: string;
  maxLines?: number;
  maxChars?: number;
  className?: string;
};

const DEFAULT_MAX_LINES = 10;
const DEFAULT_MAX_CHARS = 450;

/**
 * Collapsible wrapper for user messages inspired by OpenCode's UserMessageFold.
 * Automatically folds long multi-line or large-character user prompts so the chat
 * timeline stays clean and scannable without endless scrolling.
 */
export function UserMessageFold({
  text,
  maxLines = DEFAULT_MAX_LINES,
  maxChars = DEFAULT_MAX_CHARS,
  className,
}: UserMessageFoldProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();

  const trimmed = text.trim();
  const lineCount = trimmed.split("\n").length;
  const isLong = lineCount > maxLines || trimmed.length > maxChars;

  if (!isLong) {
    return (
      <p className={cn("whitespace-pre-wrap break-words text-sm", className)}>
        {text}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5 max-w-full">
      <div
        id={contentId}
        className={cn(
          "relative w-full overflow-hidden transition-[max-height] duration-200 ease-out",
          !isExpanded && "max-h-[9.5rem]",
        )}
      >
        <p className={cn("whitespace-pre-wrap break-words text-sm", className)}>
          {text}
        </p>
        {!isExpanded && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-secondary via-secondary/70 to-transparent"
            aria-hidden="true"
          />
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded((prev) => !prev);
        }}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="group/toggle inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground bg-background/50 hover:bg-background/80 hover:text-foreground active:scale-[0.97] transition-colors"
      >
        <span>
          {isExpanded ? "Show less" : `Read more (${lineCount} lines)`}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isExpanded && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}
