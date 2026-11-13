"use client";

import { Streamdown } from "streamdown";
import {
  chatStreamdownControls,
  streamdownPlugins,
} from "@/lib/streamdown-config";
import { cn } from "@/lib/utils";

type StreamingMarkdownProps = {
  content: string;
  isStreaming?: boolean;
  components?: Parameters<typeof Streamdown>[0]["components"];
  className?: string;
};

/**
 * Streaming Markdown renderer powered directly by Streamdown.
 * Uses Streamdown's built-in block memoization, remend syntax healing,
 * token-level blurIn animation, and inline block caret without external
 * pacing wrappers that reset on step transitions.
 */
export function StreamingMarkdown({
  content,
  isStreaming = false,
  components,
  className,
}: StreamingMarkdownProps) {
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
        animated={{ animation: "blurIn", duration: 150 }}
        caret={isStreaming ? "block" : undefined}
        plugins={streamdownPlugins}
        components={components}
        controls={chatStreamdownControls}
      >
        {content}
      </Streamdown>
    </div>
  );
}
