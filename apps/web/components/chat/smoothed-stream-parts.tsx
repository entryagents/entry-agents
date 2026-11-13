"use client";

import { StreamingMarkdown } from "@/components/streaming-markdown";
import { ThinkingBlock } from "@/components/thinking-block";
import { useSmoothedText } from "@/lib/chat/use-smoothed-text";

type StreamdownComponents = Parameters<
  typeof StreamingMarkdown
>[0]["components"];

interface SmoothedAssistantMarkdownProps {
  /** Latest accumulated text for the part (full arrival so far). */
  content: string;
  /** True while the part is still streaming (drives reveal pacing). */
  active: boolean;
  /** Stable part identity: `${messageId}:${renderKey}`. */
  streamKey: string;
  /** Passed through to StreamingMarkdown unchanged. */
  isStreaming: boolean;
  components?: StreamdownComponents;
}

/**
 * Assistant markdown text with burst-arrival smoothing: incoming text is
 * revealed at a steady rAF-driven cadence instead of in 100-300ms jumps.
 * Completion, aborts and errors flush instantly; reduced-motion users get
 * instant reveal; no text is ever lost.
 */
export function SmoothedAssistantMarkdown({
  content,
  active,
  streamKey,
  isStreaming,
  components,
}: SmoothedAssistantMarkdownProps) {
  const text = useSmoothedText(content, active, streamKey);
  return (
    <StreamingMarkdown
      content={text}
      isStreaming={isStreaming}
      components={components}
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
 * ThinkingBlock with the same burst-arrival smoothing as assistant text.
 */
export function SmoothedThinkingBlock({
  text,
  active,
  streamKey,
  isStreaming,
  partCount,
}: SmoothedThinkingBlockProps) {
  const smoothed = useSmoothedText(text, active, streamKey);
  return (
    <ThinkingBlock
      text={smoothed}
      isStreaming={isStreaming}
      partCount={partCount}
    />
  );
}
