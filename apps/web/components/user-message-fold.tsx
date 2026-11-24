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
function renderWithSlashPill(text: string) {
  const m = /^(\/[a-zA-Z0-9_-]+)(\s+[\s\S]*)?$/.exec(text);
  if (!m?.[1]) return text;
  return (
    <>
      <span className="mr-1.5 inline-flex items-center rounded-md border border-border/80 bg-background/80 px-1.5 py-0.5 font-mono text-xs font-medium text-foreground">
        {m[1]}
      </span>
      {m[2]?.trimStart() ?? ""}
    </>
  );
}

export function UserMessageFold({
  text,
  maxLines = DEFAULT_MAX_LINES,
  maxChars = DEFAULT_MAX_CHARS,
  className,
}: UserMessageFoldProps) {
  const trimmed = text.trim();
  const lineCount = trimmed.split("\n").length;
  const isLong = lineCount > maxLines || trimmed.length > maxChars;
  const content = renderWithSlashPill(text);

  if (!isLong) {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 text-sm leading-relaxed select-text",
          className,
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "max-h-72 overflow-y-auto overscroll-contain pr-1 select-text [scrollbar-width:thin]",
        "whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 text-sm leading-relaxed",
        className,
      )}
    >
      {content}
    </div>
  );
}
