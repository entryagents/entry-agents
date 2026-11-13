"use client";

import { useMemo, type ComponentPropsWithoutRef } from "react";
import { Streamdown } from "streamdown";
import {
  chatRehypePlugins,
  chatStreamdownControls,
  streamdownPlugins,
} from "@/lib/streamdown-config";
import { cn } from "@/lib/utils";

type StreamdownComponents = NonNullable<
  Parameters<typeof Streamdown>[0]["components"]
>;

type NodeProp = { node?: unknown };

const cleanTableComponents: StreamdownComponents = {
  table: ({
    children,
    className,
    node: _node,
    ...props
  }: ComponentPropsWithoutRef<"table"> & NodeProp) => (
    <div className="my-3 w-full overflow-x-auto">
      <table
        className={cn(
          "w-full border-collapse text-left text-[13.5px] leading-snug",
          className,
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({
    children,
    className,
    node: _node,
    ...props
  }: ComponentPropsWithoutRef<"thead"> & NodeProp) => (
    <thead
      className={cn("border-b border-border bg-muted/40", className)}
      {...props}
    >
      {children}
    </thead>
  ),
  th: ({
    children,
    className,
    node: _node,
    ...props
  }: ComponentPropsWithoutRef<"th"> & NodeProp) => (
    <th
      className={cn(
        "px-2.5 py-2 font-medium text-foreground whitespace-nowrap",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({
    children,
    className,
    node: _node,
    ...props
  }: ComponentPropsWithoutRef<"td"> & NodeProp) => (
    <td
      className={cn(
        "border-b border-border/60 px-2.5 py-2 align-top text-foreground/90 break-words",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  ),
};

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
  const mergedComponents = useMemo<StreamdownComponents>(
    () => ({
      ...cleanTableComponents,
      ...components,
    }),
    [components],
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
        animated={{ animation: "blurIn", duration: 150 }}
        caret={isStreaming ? "block" : undefined}
        plugins={streamdownPlugins}
        rehypePlugins={chatRehypePlugins}
        components={mergedComponents}
        controls={chatStreamdownControls}
      >
        {content}
      </Streamdown>
    </div>
  );
}
