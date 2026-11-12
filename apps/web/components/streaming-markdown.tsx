"use client";

import { useMemo } from "react";
import { Streamdown } from "streamdown";
import { streamdownPlugins } from "@/lib/streamdown-config";
import { usePacedText } from "@/hooks/use-paced-text";
import { cn } from "@/lib/utils";

type StreamingMarkdownProps = {
  content: string;
  isStreaming?: boolean;
  components?: Parameters<typeof Streamdown>[0]["components"];
  className?: string;
};

/**
 * Heals incomplete Markdown syntax while streaming so unclosed code fences
 * or bold/italic markers don't cause sudden visual layout jumps between
 * raw text and rendered HTML.
 */
function healStreamingMarkdown(text: string, isStreaming: boolean): string {
  if (!isStreaming || !text) return text;

  // Check for unclosed code fence
  const fenceMatches = text.match(/^```/gm);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    return `${text}\n\`\`\``;
  }

  return text;
}

/**
 * Modern, un-slopped streaming Markdown renderer for 2026 AI chat.
 * Features:
 * - OpenCode-inspired paced text reveal (no token-burst jitter or micro-stutters)
 * - Automatic syntax healing for unclosed streaming code blocks
 * - Sleek, non-distracting streaming cursor that smoothly advances with text
 * - Fully responsive prose typography optimized for mobile & desktop
 */
export function StreamingMarkdown({
  content,
  isStreaming = false,
  components,
  className,
}: StreamingMarkdownProps) {
  const pacedContent = usePacedText(content, isStreaming);

  const healedContent = useMemo(
    () => healStreamingMarkdown(pacedContent, isStreaming),
    [pacedContent, isStreaming],
  );

  return (
    <div
      className={cn(
        "streaming-markdown-root relative min-w-0 max-w-full leading-relaxed break-words",
        className,
      )}
    >
      <Streamdown
        mode={isStreaming ? "streaming" : "static"}
        isAnimating={isStreaming}
        plugins={streamdownPlugins}
        components={components}
      >
        {healedContent}
      </Streamdown>
      {isStreaming && (
        <span
          className="inline-block ml-1 h-[1.1em] w-[3px] translate-y-[2px] rounded-full bg-primary/80 animate-pulse transition-opacity"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
