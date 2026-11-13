"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { Check, Copy, Maximize2, X } from "lucide-react";
import {
  Streamdown,
  extractTableDataFromElement,
  tableDataToMarkdown,
} from "streamdown";
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

function MarkdownTable({
  children,
  className,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"table"> & NodeProp) {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const handleCopy = async () => {
    const tableElement = tableRef.current;
    if (
      !tableElement ||
      typeof navigator === "undefined" ||
      !navigator.clipboard
    ) {
      return;
    }
    try {
      const tableData = extractTableDataFromElement(tableElement);
      const markdown = tableDataToMarkdown(tableData);
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard write may fail in restricted contexts
    }
  };

  const actionButtons = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Copy table as Markdown"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setIsFullscreen((prev) => !prev)}
        className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={isFullscreen ? "Exit fullscreen" : "View table fullscreen"}
      >
        {isFullscreen ? (
          <X className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );

  const tableEl = (
    <div className="w-full overflow-x-auto">
      <table
        ref={tableRef}
        className={cn(
          "w-full border-collapse text-left text-[13.5px] leading-snug",
          className,
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur-xs sm:p-6">
        <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
          <span className="text-xs font-medium text-muted-foreground">
            Table View
          </span>
          {actionButtons}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{tableEl}</div>
      </div>
    );
  }

  return (
    <div className="my-3 w-full">
      <div className="mb-1 flex items-center justify-end">{actionButtons}</div>
      {tableEl}
    </div>
  );
}

const cleanTableComponents: StreamdownComponents = {
  table: MarkdownTable,
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
 * fast token-level blurIn animation, and inline block caret without external
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
        animated={{ animation: "blurIn", duration: 60 }}
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
