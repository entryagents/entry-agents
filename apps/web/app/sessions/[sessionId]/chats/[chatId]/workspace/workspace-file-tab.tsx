"use client";

import { File as DiffsFile } from "@pierre/diffs/react";
import {
  Check,
  CodeXml,
  Copy,
  Download,
  Eye,
  FileCode,
  FileText,
  GitCompare,
  ListOrdered,
  Loader2,
  RefreshCw,
  WrapText,
  X,
} from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import useSWR from "swr";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { getFileOptions } from "@/lib/diffs-config";
import { useTheme } from "@/app/providers";
import { streamdownPlugins } from "@/lib/streamdown-config";
import { fetcherNoStore } from "@/lib/swr";
import { cn } from "@/lib/utils";

type WorkspaceFileTabProps = {
  sessionId: string;
  filePath: string;
  onClose?: () => void;
  onOpenDiff?: (filePath: string) => void;
};

type ViewMode = "preview" | "raw";

type HeadingItem = {
  id: string;
  level: number;
  text: string;
};

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const WRAPPED_EXTENSIONS = new Set([".md", ".mdx", ".markdown", ".txt"]);

function isMarkdown(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  if (lastDot === -1) return false;
  return MARKDOWN_EXTENSIONS.has(lower.slice(lastDot));
}

function shouldDefaultWrap(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return [...WRAPPED_EXTENSIONS].some((ext) => lower.endsWith(ext));
}

function stripFrontmatter(content: string): string {
  const match = content.match(
    /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/,
  );
  return match ? content.slice(match[0].length) : content;
}

function extractHeadings(content: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = content.split(/\r?\n/);
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].trim();
      const cleanText = rawText
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[`*_~]/g, "")
        .trim();
      const slug = cleanText
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 50);
      const id = slug || `h-${headings.length}`;
      headings.push({ id, level, text: cleanText });
    }
  }

  return headings;
}

function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (
    React.isValidElement(node) &&
    node.props &&
    (node.props as { children?: React.ReactNode }).children
  ) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function toSlug(children: React.ReactNode): string {
  const text = getNodeText(children);
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

export function WorkspaceFileTab({
  sessionId,
  filePath,
  onClose,
  onOpenDiff,
}: WorkspaceFileTabProps) {
  const isMd = useMemo(() => isMarkdown(filePath), [filePath]);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    isMd ? "preview" : "raw",
  );
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(() => shouldDefaultWrap(filePath));
  const [outlineOpen, setOutlineOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const requestUrl = useMemo(() => {
    if (!filePath) return null;
    const params = new URLSearchParams({ path: filePath });
    return `/api/sessions/${sessionId}/files/content?${params.toString()}`;
  }, [filePath, sessionId]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<WorkspaceFileContentResponse>(requestUrl, fetcherNoStore, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const fileName = filePath.split("/").pop() ?? filePath;
  const dirPath = filePath.slice(0, -fileName.length);

  const { resolvedTheme } = useTheme();
  const fileOptions = useMemo(
    () => ({
      ...getFileOptions(resolvedTheme),
      wrap: wrapLines,
    }),
    [resolvedTheme, wrapLines],
  );

  const binaryPreview = useMemo(() => {
    if (!data?.contentBase64) return null;
    const mime = data.mimeType || "application/octet-stream";
    return `data:${mime};base64,${data.contentBase64}`;
  }, [data]);

  const rawContent = data?.content ?? "";
  const cleanedMarkdown = useMemo(
    () => (isMd ? stripFrontmatter(rawContent) : rawContent),
    [isMd, rawContent],
  );

  const headings = useMemo(
    () => (isMd ? extractHeadings(cleanedMarkdown) : []),
    [isMd, cleanedMarkdown],
  );

  const handleCopy = async () => {
    if (!rawContent) return;
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const downloadUrl = useMemo(() => {
    if (binaryPreview) return binaryPreview;
    if (!rawContent) return null;
    const blob = new Blob([rawContent], { type: "text/plain;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [binaryPreview, rawContent]);

  const scrollToHeading = useCallback((id: string) => {
    setOutlineOpen(false);
    if (!containerRef.current) return;
    const target = containerRef.current.querySelector(`#${CSS.escape(id)}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const streamdownComponents = useMemo(
    () => ({
      h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h1">) => {
        const id = toSlug(children);
        return (
          <h1
            id={id}
            className="scroll-mt-6 text-2xl font-semibold tracking-tight text-foreground pb-2 mb-4 border-b border-border/40 mt-3 first:mt-0"
            {...props}
          >
            {children}
          </h1>
        );
      },
      h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2">) => {
        const id = toSlug(children);
        return (
          <h2
            id={id}
            className="scroll-mt-6 text-xl font-semibold tracking-tight text-foreground mt-8 mb-3 pb-1 border-b border-border/25"
            {...props}
          >
            {children}
          </h2>
        );
      },
      h3: ({ children, ...props }: React.ComponentPropsWithoutRef<"h3">) => {
        const id = toSlug(children);
        return (
          <h3
            id={id}
            className="scroll-mt-6 text-lg font-semibold tracking-tight text-foreground mt-6 mb-2"
            {...props}
          >
            {children}
          </h3>
        );
      },
      h4: ({ children, ...props }: React.ComponentPropsWithoutRef<"h4">) => {
        const id = toSlug(children);
        return (
          <h4
            id={id}
            className="scroll-mt-6 text-base font-semibold text-foreground mt-4 mb-2"
            {...props}
          >
            {children}
          </h4>
        );
      },
      p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p">) => (
        <p
          className="text-[14.5px] leading-relaxed text-foreground/90 my-3.5"
          {...props}
        >
          {children}
        </p>
      ),
      ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul">) => (
        <ul
          className="list-disc pl-6 space-y-1.5 my-3 text-[14.5px] leading-relaxed text-foreground/90"
          {...props}
        >
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol">) => (
        <ol
          className="list-decimal pl-6 space-y-1.5 my-3 text-[14.5px] leading-relaxed text-foreground/90"
          {...props}
        >
          {children}
        </ol>
      ),
      blockquote: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"blockquote">) => (
        <blockquote
          className="border-l-2 border-primary/70 bg-muted/30 pl-4 py-2.5 my-4 rounded-r text-muted-foreground italic text-sm"
          {...props}
        >
          {children}
        </blockquote>
      ),
      table: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"table">) => (
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table
            className="w-full border-collapse text-left text-sm"
            {...props}
          >
            {children}
          </table>
        </div>
      ),
      th: ({ children, ...props }: React.ComponentPropsWithoutRef<"th">) => (
        <th
          className="border-b border-border bg-muted/50 px-3.5 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td">) => (
        <td
          className="border-b border-border/50 px-3.5 py-2 text-sm text-foreground/90"
          {...props}
        >
          {children}
        </td>
      ),
      hr: (props: React.ComponentPropsWithoutRef<"hr">) => (
        <hr className="border-0 border-t border-border/60 my-6" {...props} />
      ),
    }),
    [],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Sub-Header / Document Action Bar (Height 42px matching top notch 3-column UI) */}
      <div className="flex h-[42px] shrink-0 items-center justify-between border-b border-border bg-muted/20 px-3 gap-2">
        {/* Left: File breadcrumb & format badge */}
        <div className="flex min-w-0 items-center gap-2">
          {isMd ? (
            <FileText className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
          )}

          <div className="flex items-center gap-1 font-mono text-xs min-w-0">
            {dirPath && (
              <span className="text-muted-foreground truncate hidden md:inline">
                {dirPath}
              </span>
            )}
            <span className="font-semibold text-foreground truncate">
              {fileName}
            </span>
          </div>

          {isMd && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono uppercase px-1.5 py-0 text-primary border-primary/30 hidden sm:inline-flex"
            >
              Markdown
            </Badge>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* View Mode Switcher (Preview vs Raw for Markdown files) */}
          {isMd && (
            <div className="flex items-center rounded-md border border-border bg-muted/60 p-0.5 mr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={viewMode === "preview"}
                onClick={() => setViewMode("preview")}
                className={cn(
                  "h-6 px-2 text-xs gap-1.5 cursor-pointer",
                  viewMode === "preview"
                    ? "bg-background text-foreground shadow-2xs font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Rendered Markdown view"
              >
                <Eye className="h-3 w-3" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={viewMode === "raw"}
                onClick={() => setViewMode("raw")}
                className={cn(
                  "h-6 px-2 text-xs gap-1.5 cursor-pointer",
                  viewMode === "raw"
                    ? "bg-background text-foreground shadow-2xs font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Raw source code view"
              >
                <CodeXml className="h-3 w-3" />
                <span className="hidden sm:inline">Raw</span>
              </Button>
            </div>
          )}

          {/* Table of Contents / Outline Button */}
          {isMd && headings.length > 0 && viewMode === "preview" && (
            <Popover open={outlineOpen} onOpenChange={setOutlineOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer",
                        outlineOpen && "bg-muted text-foreground",
                      )}
                      aria-label="Table of Contents"
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Document Outline</TooltipContent>
              </Tooltip>

              <PopoverContent align="end" className="w-72 p-2 shadow-lg">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b border-border/60 mb-1">
                  Table of Contents
                </div>
                <ScrollArea className="max-h-80">
                  <div className="space-y-0.5 py-1">
                    {headings.map((h, i) => (
                      <button
                        key={`${h.id}-${i}`}
                        type="button"
                        onClick={() => scrollToHeading(h.id)}
                        className={cn(
                          "w-full text-left rounded px-2 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:bg-muted/80 transition-colors truncate block cursor-pointer",
                          h.level === 1 && "font-semibold text-foreground",
                          h.level === 2 && "pl-4 text-foreground/90",
                          h.level >= 3 && "pl-6 text-muted-foreground",
                        )}
                      >
                        {h.text}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}

          {/* Diff comparison button */}
          {onOpenDiff && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => onOpenDiff(filePath)}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">View File Diff</TooltipContent>
            </Tooltip>
          )}

          {/* Line wrap toggle (for Raw view) */}
          {(viewMode === "raw" || !isMd) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 transition-colors cursor-pointer",
                    wrapLines
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setWrapLines((prev) => !prev)}
                >
                  <WrapText className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {wrapLines ? "Disable line wrap" : "Wrap long lines"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Copy button */}
          {rawContent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {copied ? "Copied!" : "Copy File Contents"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Download button */}
          {downloadUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <a
                    href={downloadUrl}
                    download={fileName}
                    aria-label={`Download ${fileName}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Download File</TooltipContent>
            </Tooltip>
          )}

          {/* Refresh button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => void mutate()}
                disabled={isLoading || isValidating}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    (isLoading || isValidating) && "animate-spin",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh File</TooltipContent>
          </Tooltip>

          {/* Close tab */}
          {onClose && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground ml-0.5 cursor-pointer"
                  onClick={onClose}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close Tab</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Document / File Content Area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto bg-background"
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-destructive">
            <p className="text-sm font-semibold">Failed to load file</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {error.message ||
                "An unexpected error occurred while loading this file."}
            </p>
          </div>
        ) : data ? (
          <div>
            {data.kind === "image" && binaryPreview ? (
              <div className="flex min-h-full items-center justify-center p-8">
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={binaryPreview}
                  alt={fileName}
                  className="max-h-[calc(100vh-14rem)] max-w-full rounded-md object-contain shadow-sm border border-border"
                />
              </div>
            ) : data.kind === "pdf" && binaryPreview ? (
              // oxlint-disable-next-line react/iframe-missing-sandbox
              <iframe
                title={fileName}
                src={binaryPreview}
                className="h-[calc(100vh-10rem)] w-full border-0"
              />
            ) : data.kind === "audio" && binaryPreview ? (
              <div className="flex justify-center p-8">
                <audio controls src={binaryPreview} className="w-full max-w-xl">
                  <track kind="captions" />
                </audio>
              </div>
            ) : data.kind === "video" && binaryPreview ? (
              <div className="flex justify-center p-6">
                <video
                  controls
                  src={binaryPreview}
                  className="max-h-[calc(100vh-14rem)] max-w-full rounded-md"
                >
                  <track kind="captions" />
                </video>
              </div>
            ) : data.kind === "binary" && binaryPreview ? (
              <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">
                  Binary file cannot be displayed inline.
                </p>
                <a
                  href={binaryPreview}
                  download={fileName}
                  className="text-xs font-medium text-primary underline underline-offset-4"
                >
                  Download {fileName}
                </a>
              </div>
            ) : rawContent.length > 0 ? (
              isMd && viewMode === "preview" ? (
                /* High-Craft Markdown Rendered Document matching top-notch 3-column UI */
                <article className="max-w-4xl mx-auto px-6 py-8 sm:px-10">
                  <Streamdown
                    mode="static"
                    isAnimating={false}
                    components={streamdownComponents}
                    plugins={streamdownPlugins}
                  >
                    {cleanedMarkdown}
                  </Streamdown>
                </article>
              ) : (
                /* Raw Code / Diff View */
                <DiffsFile
                  key={filePath}
                  file={{ name: filePath, contents: rawContent }}
                  options={fileOptions}
                />
              )
            ) : (
              <div className="p-12 text-center text-xs text-muted-foreground">
                This file is empty.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
