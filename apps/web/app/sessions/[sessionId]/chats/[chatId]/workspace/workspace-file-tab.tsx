"use client";

import { File as DiffsFile } from "@pierre/diffs/react";
import {
  Check,
  Copy,
  Download,
  FileCode,
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
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getFileOptions } from "@/lib/diffs-config";
import { useTheme } from "@/app/providers";
import { fetcherNoStore } from "@/lib/swr";
import { cn } from "@/lib/utils";

type WorkspaceFileTabProps = {
  sessionId: string;
  filePath: string;
  onClose?: () => void;
  onOpenDiff?: (filePath: string) => void;
};

const wrappedFileExtensions = new Set([".md", ".mdx", ".markdown", ".txt"]);

function shouldDefaultWrap(filePath: string) {
  const lower = filePath.toLowerCase();
  return [...wrappedFileExtensions].some((ext) => lower.endsWith(ext));
}

export function WorkspaceFileTab({
  sessionId,
  filePath,
  onClose,
  onOpenDiff,
}: WorkspaceFileTabProps) {
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(() => shouldDefaultWrap(filePath));

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

  const handleCopy = async () => {
    if (!data?.content) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const downloadUrl = useMemo(() => {
    if (binaryPreview) return binaryPreview;
    if (!data?.content) return null;
    const blob = new Blob([data.content], { type: "text/plain;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [binaryPreview, data]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* File Action Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5 gap-2">
        {/* Left: Path Breadcrumbs */}
        <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
          <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {dirPath && (
            <span className="text-muted-foreground truncate hidden sm:inline">
              {dirPath}
            </span>
          )}
          <span className="font-semibold text-foreground truncate">
            {fileName}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {onOpenDiff && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => onOpenDiff(filePath)}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">View File Diff</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 transition-colors",
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

          {data?.content && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
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

          {downloadUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
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

          {onClose && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground ml-1"
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
            ) : data.content && data.content.length > 0 ? (
              <DiffsFile
                key={filePath}
                file={{ name: filePath, contents: data.content }}
                options={fileOptions}
              />
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
