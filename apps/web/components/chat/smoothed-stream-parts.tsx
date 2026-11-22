"use client";

import { StreamingMarkdown } from "@/components/streaming-markdown";
import { ThinkingBlock } from "@/components/thinking-block";

interface SmoothedAssistantMarkdownProps {
  /** Latest accumulated text for the part (full arrival so far). */
  content: string;
  /** True while the part is still streaming. */
  active: boolean;
  /** Stable part identity: `${messageId}:${renderKey}`. */
  streamKey: string;
  /** Passed through to StreamingMarkdown unchanged. */
  isStreaming: boolean;
  onOpenFile?: (filePath: string) => void;
}

/**
 * Renders streaming assistant markdown directly without extra rAF/useEffect
 * double-render buffering lag so tokens appear on the frame they arrive.
 */
export function SmoothedAssistantMarkdown({
  content,
  isStreaming,
  onOpenFile,
}: SmoothedAssistantMarkdownProps) {
  return (
    <StreamingMarkdown
      content={content}
      isStreaming={isStreaming}
      onOpenFile={onOpenFile}
    />
  );
}

interface SmoothedThinkingBlockProps {
  /** Latest accumulated reasoning text (full arrival so far). */
  text: string;
  /** True while the part(s) are still streaming. */
  active: boolean;
  /** Stable part identity: `${messageId}:${renderKey}`. */
  streamKey: string;
  /** Passed through to ThinkingBlock unchanged. */
  isStreaming?: boolean;
  partCount?: number;
}

/**
 * Renders ThinkingBlock directly without rAF buffering lag.
 */
export function SmoothedThinkingBlock({
  text,
  isStreaming,
  partCount,
}: SmoothedThinkingBlockProps) {
  return (
    <ThinkingBlock
      text={text}
      isStreaming={isStreaming}
      partCount={partCount}
    />
  );
}
