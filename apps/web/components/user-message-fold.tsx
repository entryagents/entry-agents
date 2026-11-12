"use client";

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
 * Scrollable wrapper for user messages.
 * Automatically wraps long prompts inside a contained, scrollable box
 * so users can scroll to read the full text directly inside the message
 * bubble without "Show more" accordion buttons blowing up the page height.
 */
export function UserMessageFold({
  text,
  maxLines = DEFAULT_MAX_LINES,
  maxChars = DEFAULT_MAX_CHARS,
  className,
}: UserMessageFoldProps) {
  const trimmed = text.trim();
  const lineCount = trimmed.split("\n").length;
  const isLong = lineCount > maxLines || trimmed.length > maxChars;

  if (!isLong) {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed select-text",
          className,
        )}
      >
        {text}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "max-h-72 overflow-y-auto overscroll-contain pr-1 select-text [scrollbar-width:thin]",
        "whitespace-pre-wrap break-words text-sm leading-relaxed",
        className,
      )}
    >
      {text}
    </div>
  );
}
