"use client";

import "@pierre/words/styles.css";
import { type Components, Markdown } from "@pierre/words/react";
import { memo, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  createWordsComponents,
  wordsControls,
  wordsPlugins,
} from "@/lib/words-config";

type StreamingMarkdownProps = {
  content: string;
  isStreaming?: boolean;
  onOpenFile?: (filePath: string) => void;
  components?: Components;
  className?: string;
};

/**
 * Streaming Markdown renderer powered by `@pierre/words` (Wasm streaming
 * parser + `@pierre/highlights` dual-theme syntax highlighting + math).
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  isStreaming = false,
  onOpenFile,
  components,
  className,
}: StreamingMarkdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;
  const hasOnOpenFile = Boolean(onOpenFile);

  const mergedComponents = useMemo<Components>(() => {
    const base = createWordsComponents(hasOnOpenFile);
    return components ? { ...base, ...components } : base;
  }, [components, hasOnOpenFile]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (event: globalThis.MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>(
        "a[data-workspace-file]",
      );
      if (!anchor) return;
      const filePath = anchor.dataset.workspaceFile;
      if (!filePath) return;
      event.preventDefault();
      onOpenFileRef.current?.(filePath);
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "streaming-markdown-root relative min-w-0 max-w-full leading-relaxed break-words",
        className,
      )}
    >
      <Markdown
        mode={isStreaming ? "streaming" : "static"}
        isAnimating={isStreaming}
        animated={false}
        math
        plugins={wordsPlugins}
        controls={wordsControls}
        components={mergedComponents}
      >
        {content}
      </Markdown>
    </div>
  );
});
