"use client";

import { File as DiffsFile } from "@pierre/diffs/react";
import {
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  FolderTree,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { defaultFileOptions } from "@/lib/diffs-config";
import { fetcherNoStore } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { FileTree } from "../file-tree";

type WorkspaceCodeTabProps = {
  sessionId: string;
  files: FileSuggestion[] | null;
  filesLoading?: boolean;
  repoName?: string | null;
  onRefreshFiles?: () => void;
  initialFilePath?: string | null;
};

const wrappedFileExtensions = new Set([".md", ".mdx", ".markdown", ".txt"]);

function shouldWrapFileContent(filePath: string) {
  const normalizedPath = filePath.toLowerCase();
  return [...wrappedFileExtensions].some((ext) =>
    normalizedPath.endsWith(ext),
  );
}

export function WorkspaceCodeTab({
  sessionId,
  files,
  filesLoading = false,
  repoName,
  onRefreshFiles,
  initialFilePath = null,
}: WorkspaceCodeTabProps) {
  const router = useRouter();
  const fileList = useMemo(() => files ?? [], [files]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    initialFilePath || (fileList.length > 0 && !fileList[0].isDirectory ? fileList[0].value : null),
  );
  const [showFileTree, setShowFileTree] = useState(true);
  const [copied, setCopied] = useState(false);

  const requestUrl = useMemo(() => {
    if (!selectedFilePath) return null;
    const params = new URLSearchParams({ path: selectedFilePath });
    return `/api/sessions/${sessionId}/files/content?${params.toString()}`;
  }, [selectedFilePath, sessionId]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<WorkspaceFileContentResponse>(requestUrl, fetcherNoStore, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const fileName = selectedFilePath?.split("/").pop() ?? selectedFilePath ?? "";
  const isRefreshing = isValidating && !isLoading;
  const downloadUrl = requestUrl ? `${requestUrl}&download=1` : null;

  const handleCopyContent = useCallback(() => {
    if (data?.content) {
      void navigator.clipboard.writeText(data.content);
      setCopied(true);
      toast.success("File content copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data?.content]);

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

  const fileOptions = selectedFilePath && shouldWrapFileContent(selectedFilePath)
    ? { ...defaultFileOptions, overflow: "wrap" as const }
    : defaultFileOptions;

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* File Tree Left Column */}
      <div
        className={cn(
          "flex flex-col border-r border-border bg-muted/20 transition-all duration-200 shrink-0",
          showFileTree ? "w-64" : "w-0 overflow-hidden border-r-0",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-foreground">
            <FolderTree className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Files ({fileList.length})</span>
          </div>
          {onRefreshFiles && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => onRefreshFiles()}
                  disabled={filesLoading}
                >
                  <RefreshCw
                    className={cn("h-3 w-3", filesLoading && "animate-spin")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh Files</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filesLoading && fileList.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <FileTree
              files={fileList}
              repoName={repoName}
              onFileClick={(fp) => setSelectedFilePath(fp)}
            />
          )}
        </div>
      </div>

      {/* Code / Content Right Column */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        {/* Code Bar Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowFileTree((prev) => !prev)}
                >
                  {showFileTree ? (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showFileTree ? "Hide file tree" : "Show file tree"}
              </TooltipContent>
            </Tooltip>

            {selectedFilePath ? (
              <div className="flex items-center gap-1.5 min-w-0 truncate text-xs font-mono">
                <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  {fileName}
                </span>
                <span className="text-muted-foreground truncate hidden sm:inline">
                  {selectedFilePath}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No file selected</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {data?.content && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={handleCopyContent}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy Content</TooltipContent>
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
                  disabled={isLoading || isRefreshing}
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5",
                      isRefreshing && "animate-spin",
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh File</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/codespace/${sessionId}`)}
                  className="h-7 gap-1 px-2 text-xs font-medium ml-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="hidden sm:inline">VS Code</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in full VS Code Codespace</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 overflow-auto bg-background">
          {!selectedFilePath ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              <p className="text-xs">Select a file from the explorer to view contents</p>
            </div>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-xs text-red-500">
              {error.message || "Failed to load file contents"}
            </div>
          ) : data ? (
            <div>
              {binaryKind === "image" && binaryPreview ? (
                <div className="flex min-h-full items-center justify-center p-6">
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={binaryPreview}
                    alt={fileName}
                    className="max-h-[calc(100vh-14rem)] max-w-full rounded-md object-contain shadow-sm"
                  />
                </div>
              ) : binaryKind === "pdf" && binaryPreview ? (
                // oxlint-disable-next-line react/iframe-missing-sandbox
                <iframe
                  title={fileName}
                  src={binaryPreview}
                  className="h-[calc(100vh-10rem)] w-full border-0"
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
                    className="max-h-[calc(100vh-14rem)] max-w-full rounded-md"
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
                    className="text-xs font-medium text-primary underline underline-offset-4"
                  >
                    Download {fileName}
                  </a>
                </div>
              ) : data.content.length > 0 ? (
                <DiffsFile
                  key={selectedFilePath}
                  file={{ name: selectedFilePath, contents: data.content }}
                  options={fileOptions}
                />
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  This file is empty.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
