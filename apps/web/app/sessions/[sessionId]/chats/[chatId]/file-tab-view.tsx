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
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { useGitPanel } from "./git-panel-context";
import { useSessionChatMetadataContext } from "./session-chat-context";

type ViewMode = "preview" | "code";

const wrappedFileExtensions = new Set([".md", ".mdx", ".markdown", ".txt"]);
const markdownExtensions = new Set([".md", ".mdx", ".markdown"]);

function isMarkdown(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return [...markdownExtensions].some((ext) => lower.endsWith(ext));
}

function isHtml(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm");
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

export function FileTabView() {
  const { focusedFilePath, openDiffToFile, closeAgentFileTab } = useGitPanel();
  const { session } = useSessionChatMetadataContext();
  const { resolvedTheme } = useTheme();

  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    focusedFilePath ? getDefaultViewMode(focusedFilePath) : "code",
  );
  const [wrapLines, setWrapLines] = useState(() =>
    focusedFilePath
      ? [...wrappedFileExtensions].some((ext) =>
          focusedFilePath.toLowerCase().endsWith(ext),
        )
      : false,
  );

  const requestUrl = useMemo(() => {
    if (!focusedFilePath) return null;
    const params = new URLSearchParams({ path: focusedFilePath });
    return `/api/sessions/${session.id}/files/content?${params.toString()}`;
  }, [focusedFilePath, session.id]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<WorkspaceFileContentResponse>(requestUrl, fetcher, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const language = useMemo(
    () => (focusedFilePath ? getFileLanguage(focusedFilePath) : "Plain Text"),
    [focusedFilePath],
  );

  const metrics = useMemo(() => {
    if (!data?.content) return null;
    return computeFileMetrics(data.content, data.size);
  }, [data]);

  const handleCopy = useCallback(async () => {
    if (!data?.content) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      toast.success("File content copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy file content");
    }
  }, [data?.content]);

  const baseFileOptions = useMemo(
    () => ({
      ...getFileOptions(resolvedTheme),
      wrap: wrapLines,
    }),
    [resolvedTheme, wrapLines],
  );

  if (!focusedFilePath) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center border-b border-border px-4 py-2">
          <span className="text-sm font-medium text-muted-foreground font-mono">
            No file selected
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground/50">
          <FileText className="h-8 w-8" />
          <p className="text-sm">
            Select a file from the Files panel to view its contents
          </p>
        </div>
      </div>
    );
  }

  const fileName = focusedFilePath.split("/").pop() ?? focusedFilePath;
  const isRefreshing = isValidating && !isLoading;
  const errorMessage = error?.message ?? null;
  const binaryPreview = data?.contentBase64
    ? `data:${data.mimeType ?? "application/octet-stream"};base64,${data.contentBase64}`
    : null;
  const binaryKind =
    data?.kind ??
    (data?.mimeType?.startsWith("image/")
      ? "image"
      : data?.mimeType === "application/pdf"
        ? "pdf"
        : data?.mimeType?.startsWith("audio/")
          ? "audio"
          : data?.mimeType?.startsWith("video/")
            ? "video"
            : binaryPreview
              ? "binary"
              : undefined);
  const downloadUrl = requestUrl ? `${requestUrl}&download=1` : null;
  const hasPreviewSupport = supportsPreview(focusedFilePath);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Enhanced Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2 gap-2 flex-wrap">
        <div className="flex min-w-0 items-center gap-2">
          <FileTypeIcon path={fileName} className="h-4 w-4 shrink-0" />
          <span className="shrink-0 text-sm font-semibold font-mono">
            {fileName}
          </span>
          <span className="truncate text-xs text-muted-foreground hidden sm:inline">
            {focusedFilePath}
          </span>
          <span className="hidden sm:inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {language}
          </span>
          {metrics && (
            <span className="hidden md:inline-flex font-mono text-[11px] text-muted-foreground/80">
              · {metrics.lines} {metrics.lines === 1 ? "line" : "lines"} ·{" "}
              {metrics.formattedSize}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Preview vs Code segmented toggle */}
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

          {/* Line Wrap Toggle */}
          {(!hasPreviewSupport || viewMode === "code") && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 w-7 px-0 cursor-pointer",
                    wrapLines && "text-primary bg-primary/10",
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

          {/* Compare changes toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 px-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => openDiffToFile(focusedFilePath)}
                aria-label="Compare file changes"
              >
                <GitCompare className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Compare changes</TooltipContent>
          </Tooltip>

          {/* Copy content */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 px-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => void handleCopy()}
                disabled={!data?.content}
                aria-label="Copy file content"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {copied ? "Copied" : "Copy content"}
            </TooltipContent>
          </Tooltip>

          {downloadUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 px-0 cursor-pointer text-muted-foreground hover:text-foreground"
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
              <TooltipContent side="bottom">Download</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void mutate()}
                disabled={isLoading || isRefreshing}
                className="h-7 w-7 px-0 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
          </Tooltip>

          {/* Close tab */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 px-0 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => closeAgentFileTab(focusedFilePath)}
                aria-label="Close file tab"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close tab</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {errorMessage && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          </div>
        )}

        {!isLoading && !errorMessage && data && (
          <div className="h-full">
            {binaryKind === "image" && binaryPreview ? (
              <div className="flex min-h-full items-center justify-center p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)]">
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={binaryPreview}
                  alt={fileName}
                  className="max-h-[calc(100vh-12rem)] max-w-full rounded-md object-contain shadow-sm border border-border"
                />
              </div>
            ) : binaryKind === "pdf" && binaryPreview ? (
              // oxlint-disable-next-line react/iframe-missing-sandbox
              <iframe
                title={fileName}
                src={binaryPreview}
                className="h-[calc(100vh-9rem)] min-h-[32rem] w-full border-0"
              />
            ) : binaryKind === "audio" && binaryPreview ? (
              <div className="flex justify-center p-8">
                <audio controls src={binaryPreview} className="w-full max-w-xl">
                  <track kind="captions" />
                </audio>
              </div>
            ) : binaryKind === "video" && binaryPreview ? (
              <div className="flex justify-center p-6">
                <video
                  controls
                  src={binaryPreview}
                  className="max-h-[calc(100vh-12rem)] max-w-full rounded-md"
                >
                  <track kind="captions" />
                </video>
              </div>
            ) : binaryKind === "binary" && binaryPreview ? (
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
              viewMode === "preview" && isMarkdown(focusedFilePath) ? (
                <MarkdownArtifactPreview content={data.content} />
              ) : viewMode === "preview" && isHtml(focusedFilePath) ? (
                <HtmlArtifactPreview
                  htmlContent={data.content}
                  fileName={fileName}
                />
              ) : viewMode === "preview" && isSvg(focusedFilePath) ? (
                <SvgArtifactPreview
                  svgContent={data.content}
                  fileName={fileName}
                />
              ) : isUrlArtifact(focusedFilePath) ? (
                <UrlArtifactPreview jsonContent={data.content} />
              ) : (
                <DiffsFile
                  key={focusedFilePath}
                  file={{ name: focusedFilePath, contents: data.content }}
                  options={baseFileOptions}
                />
              )
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                This file is empty.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
