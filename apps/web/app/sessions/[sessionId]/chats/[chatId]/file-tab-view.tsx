"use client";

import { File as DiffsFile } from "@pierre/diffs/react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import useSWR from "swr";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import { useGitPanel } from "./git-panel-context";
import { useSessionChatMetadataContext } from "./session-chat-context";
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

const wrappedFileExtensions = new Set([".md", ".mdx", ".markdown", ".txt"]);

function shouldWrapFileContent(filePath: string) {
  const normalizedPath = filePath.toLowerCase();
  return [...wrappedFileExtensions].some((extension) =>
    normalizedPath.endsWith(extension),
  );
}

export function FileTabView() {
  const { focusedFilePath } = useGitPanel();
  const { session } = useSessionChatMetadataContext();

  const requestUrl = useMemo(() => {
    if (!focusedFilePath) return null;
    const params = new URLSearchParams({ path: focusedFilePath });
    return `/api/sessions/${session.id}/files/content?${params.toString()}`;
  }, [focusedFilePath, session.id]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<WorkspaceFileContentResponse>(requestUrl, fetcherNoStore, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

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
  const hasContent = data != null && data.content.length > 0;
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
  const { resolvedTheme } = useTheme();
  const baseFileOptions = getFileOptions(resolvedTheme);
  const fileOptions = shouldWrapFileContent(focusedFilePath)
    ? { ...baseFileOptions, overflow: "wrap" as const }
    : baseFileOptions;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-sm font-medium font-mono">
            {fileName}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {focusedFilePath}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {downloadUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 px-0"
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
                className="h-7 w-7 px-0"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh</TooltipContent>
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
          <div>
            {binaryKind === "image" && binaryPreview ? (
              <div className="flex min-h-full items-center justify-center p-6">
                {/* oxlint-disable-next-line nextjs/no-img-element -- sandbox-served binary preview; next/image cannot optimize session-scoped URLs */}
                <img
                  src={binaryPreview}
                  alt={fileName}
                  className="max-h-[calc(100vh-12rem)] max-w-full rounded-md object-contain shadow-sm"
                />
              </div>
            ) : binaryKind === "pdf" && binaryPreview ? (
              // oxlint-disable-next-line react/iframe-missing-sandbox -- user-requested PDF preview of their own workspace file; a sandbox attribute would break PDF rendering
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
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  This binary file cannot be displayed inline.
                </p>
                <a
                  href={binaryPreview}
                  download={fileName}
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  Download {fileName}
                </a>
              </div>
            ) : hasContent ? (
              <DiffsFile
                key={focusedFilePath}
                file={{ name: focusedFilePath, contents: data.content }}
                options={fileOptions}
              />
            ) : (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                This file is empty.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
