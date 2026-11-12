"use client";

import { File as DiffsFile } from "@pierre/diffs/react";
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileText,
  GitCompare,
  Loader2,
  RefreshCw,
  WrapText,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import { FileTypeIcon } from "@/components/file-type-icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HtmlArtifactPreview,
  MarkdownArtifactPreview,
  SvgArtifactPreview,
  UrlArtifactPreview,
} from "@/components/workspace/artifact-preview";
import {
  computeFileMetrics,
  getFileLanguage,
} from "@/components/workspace/workspace-file-stats";
import { getFileOptions } from "@/lib/diffs-config";
import { useTheme } from "@/app/providers";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

type WorkspaceFileTabProps = {
  sessionId: string;
  filePath: string;
  onClose?: () => void;
  onOpenDiff?: (filePath: string) => void;
};

type ViewMode = "preview" | "code";

const wrappedFileExtensions = new Set([".md", ".mdx", ".markdown", ".txt"]);
const markdownExtensions = new Set([".md", ".mdx", ".markdown"]);

function isMarkdown(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return [...markdownExtensions].some((ext) => lower.endsWith(ext));
}

function isHtml(filePath: string): boolean {
  return (
    filePath.toLowerCase().endsWith(".html") ||
    filePath.toLowerCase().endsWith(".htm")
  );
}

function isSvg(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".svg");
}

function isUrlArtifact(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".url.json");
}

function supportsPreview(filePath: string): boolean {
  return (
    isMarkdown(filePath) ||
    isHtml(filePath) ||
    isSvg(filePath) ||
    isUrlArtifact(filePath)
  );
}

function getDefaultViewMode(filePath: string): ViewMode {
  // Markdown documents and HTML/SVG artifacts default to rich preview
  if (
    isMarkdown(filePath) ||
    isHtml(filePath) ||
    isSvg(filePath) ||
    isUrlArtifact(filePath)
  ) {
    return "preview";
  }
  return "code";
}

export function WorkspaceFileTab({
  sessionId,
  filePath,
  onClose,
  onOpenDiff,
}: WorkspaceFileTabProps) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    getDefaultViewMode(filePath),
  );
  const [wrapLines, setWrapLines] = useState(() =>
    [...wrappedFileExtensions].some((ext) =>
      filePath.toLowerCase().endsWith(ext),
    ),
  );

  const requestUrl = useMemo(() => {
    if (!filePath) return null;
    const params = new URLSearchParams({ path: filePath });
    return `/api/sessions/${sessionId}/files/content?${params.toString()}`;
  }, [filePath, sessionId]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<WorkspaceFileContentResponse>(requestUrl, fetcher, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const fileName = filePath.split("/").pop() ?? filePath;
  const pathParts = filePath.split("/");
  const dirParts = pathParts.slice(0, -1);

  const { resolvedTheme } = useTheme();
  const fileOptions = useMemo(
    () => ({
      ...getFileOptions(resolvedTheme),
      wrap: wrapLines,
    }),
    [resolvedTheme, wrapLines],
  );

  const language = useMemo(() => getFileLanguage(filePath), [filePath]);

  const metrics = useMemo(() => {
    if (!data?.content) return null;
    return computeFileMetrics(data.content, data.size);
  }, [data]);

  const binaryPreview = useMemo(() => {
    if (!data?.contentBase64) return null;
    const mime = data.mimeType || "application/octet-stream";
    return `data:${mime};base64,${data.contentBase64}`;
  }, [data]);

  const handleCopy = async () => {
    if (!data?.content) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure (e.g. unfocused window or permissions denied)
    }
  };

  const downloadUrl = useMemo(() => {
    if (binaryPreview) return binaryPreview;
    if (!data?.content) return null;
    const blob = new Blob([data.content], { type: "text/plain;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [binaryPreview, data]);

  const hasPreviewSupport = supportsPreview(filePath);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Enhanced Desktop File Action Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5 gap-2 flex-wrap">
        {/* Left: File Icon + Path Breadcrumbs + Language Badge */}
        <div className="flex min-w-0 items-center gap-2">
          <FileTypeIcon path={fileName} className="h-4 w-4 shrink-0" />

          {/* Breadcrumb path */}
          <div className="flex items-center gap-1 font-mono text-xs overflow-hidden">
            {dirParts.map((part, index) => (
              <span
                key={`${part}-${index}`}
                className="flex items-center gap-1 text-muted-foreground"
              >
                <span>{part}</span>
                <span>/</span>
              </span>
            ))}
            <span className="font-semibold text-foreground truncate">
              {fileName}
            </span>
          </div>

          {/* Language / File Type Badge */}
          <span className="hidden sm:inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {language}
          </span>

          {/* Metrics (lines & size) */}
          {metrics && (
            <span className="hidden md:inline-flex font-mono text-[11px] text-muted-foreground/80">
              · {metrics.lines} {metrics.lines === 1 ? "line" : "lines"} ·{" "}
              {metrics.formattedSize}
            </span>
          )}
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Preview vs Code Segmented Switch (For Markdown, HTML, SVG, URL artifacts) */}
          {hasPreviewSupport && data?.content && (
            <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 mr-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("preview")}
                className={cn(
                  "h-6 px-2 text-xs gap-1 cursor-pointer",
                  viewMode === "preview" &&
                    "bg-background text-foreground shadow-2xs font-medium",
                )}
              >
                <Eye className="h-3 w-3" />
                <span>Preview</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("code")}
                className={cn(
                  "h-6 px-2 text-xs gap-1 cursor-pointer",
                  viewMode === "code" &&
                    "bg-background text-foreground shadow-2xs font-medium",
                )}
              >
                <Code2 className="h-3 w-3" />
                <span>Code</span>
              </Button>
            </div>
          )}

          {/* Diff Action */}
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

          {/* Line Wrap Toggle (When in code mode) */}
          {(!hasPreviewSupport || viewMode === "code") && (
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

          {/* Copy Button */}
          {data?.content && (
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

          {/* Download Button */}
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

          {/* Refresh Button */}
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

          {/* Close Tab Button */}
          {onClose && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground ml-1 cursor-pointer"
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

      {/* File Content Area */}
      <div className="flex-1 min-h-0 overflow-auto bg-background">
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
          <div className="h-full">
            {/* Binary Media: Image */}
            {data.kind === "image" && binaryPreview ? (
              <div className="flex min-h-full items-center justify-center p-8 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)]">
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
            ) : data.content && data.content.length > 0 ? (
              /* Rich Document / Artifact Previews */
              viewMode === "preview" && isMarkdown(filePath) ? (
                <MarkdownArtifactPreview content={data.content} />
              ) : viewMode === "preview" && isHtml(filePath) ? (
                <HtmlArtifactPreview
                  htmlContent={data.content}
                  fileName={fileName}
                />
              ) : viewMode === "preview" && isSvg(filePath) ? (
                <SvgArtifactPreview
                  svgContent={data.content}
                  fileName={fileName}
                />
              ) : isUrlArtifact(filePath) ? (
                <UrlArtifactPreview jsonContent={data.content} />
              ) : (
                /* Standard Source Code Highlighting with Pierre Diffs */
                <DiffsFile
                  key={filePath}
                  file={{ name: filePath, contents: data.content }}
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
