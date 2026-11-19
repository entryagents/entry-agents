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
  Pencil,
  RefreshCw,
  Save,
  WrapText,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import { useTheme } from "@/app/providers";
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

function CodeLoadingSkeleton() {
  const widths = [
    "w-2/5",
    "w-3/4",
    "w-1/2",
    "w-4/5",
    "w-1/3",
    "w-3/5",
    "w-2/3",
    "w-1/2",
    "w-4/5",
    "w-2/5",
  ];
  return (
    <div className="space-y-2.5 p-4" aria-label="Loading file">
      {widths.map((w, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <div className="h-3 w-6 shrink-0 rounded bg-muted/40" />
          <div className={cn("h-3 rounded bg-muted/50", w)} />
        </div>
      ))}
    </div>
  );
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
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const requestUrl = useMemo(() => {
    if (!filePath) return null;
    const params = new URLSearchParams({ path: filePath });
    return `/api/sessions/${sessionId}/files/content?${params.toString()}`;
  }, [filePath, sessionId]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<WorkspaceFileContentResponse>(requestUrl, fetcher, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      keepPreviousData: true,
    });

  useEffect(() => {
    setIsEditing(false);
  }, [filePath]);

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
  const isTextEditable =
    data?.kind === "text" ||
    (data !== undefined &&
      !data.contentBase64 &&
      typeof data.content === "string");
  const isDirty = isEditing && draftContent !== (data?.content ?? "");

  const metrics = useMemo(() => {
    const content = isEditing ? draftContent : data?.content;
    if (!content) return null;
    return computeFileMetrics(content, isEditing ? content.length : data?.size);
  }, [data, draftContent, isEditing]);

  const binaryPreview = useMemo(() => {
    if (!data?.contentBase64) return null;
    const mime = data.mimeType || "application/octet-stream";
    return `data:${mime};base64,${data.contentBase64}`;
  }, [data]);

  const handleCopy = async () => {
    const text = isEditing ? draftContent : data?.content;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const handleEnterEdit = useCallback(() => {
    if (!isTextEditable || !data) return;
    setDraftContent(data.content);
    setViewMode("code");
    setIsEditing(true);
    setTimeout(() => editorRef.current?.focus(), 20);
  }, [data, isTextEditable]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setDraftContent(data?.content ?? "");
  }, [data?.content]);

  const handleSave = useCallback(async () => {
    if (!isEditing || isSaving || !requestUrl) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content: draftContent }),
      });
      const body = (await response.json().catch(() => null)) as
        | (WorkspaceFileContentResponse & { error?: string })
        | null;
      if (!response.ok || !body) {
        throw new Error(body?.error ?? "Failed to save file");
      }
      await mutate(body, { revalidate: false });
      setIsEditing(false);
      toast.success(`Saved ${fileName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save file");
    } finally {
      setIsSaving(false);
    }
  }, [
    draftContent,
    fileName,
    filePath,
    isEditing,
    isSaving,
    mutate,
    requestUrl,
    sessionId,
  ]);

  const handleEditorKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void handleSave();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCancelEdit();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = `${draftContent.slice(0, start)}  ${draftContent.slice(end)}`;
      setDraftContent(next);
      requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  };

  const downloadUrl = useMemo(() => {
    if (binaryPreview) return binaryPreview;
    if (!data?.content) return null;
    const blob = new Blob([data.content], { type: "text/plain;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [binaryPreview, data]);

  const hasPreviewSupport = supportsPreview(filePath);
  const lineCount = useMemo(
    () => (isEditing ? draftContent.split("\n").length : 0),
    [draftContent, isEditing],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* File Action Bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1.5">
        {/* Left: File Icon + Path Breadcrumbs + Language & Metrics */}
        <div className="flex min-w-0 items-center gap-2">
          <FileTypeIcon path={fileName} className="h-4 w-4 shrink-0" />

          <div className="flex min-w-0 items-center gap-1 overflow-hidden font-mono text-xs">
            {dirParts.length > 0 ? (
              <span className="hidden md:inline truncate text-muted-foreground">
                {dirParts.join("/")}/
              </span>
            ) : null}
            <span className="truncate font-medium text-foreground">
              {fileName}
            </span>
            {isDirty ? (
              <span
                className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                title="Unsaved changes"
              />
            ) : null}
          </div>

          <span className="hidden sm:inline-flex shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {language}
          </span>

          {metrics ? (
            <span className="hidden lg:inline-flex shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/80">
              {metrics.lines} {metrics.lines === 1 ? "line" : "lines"} ·{" "}
              {metrics.formattedSize}
            </span>
          ) : null}
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={isSaving || !isDirty}
                className="h-7 gap-1 px-2.5 text-xs cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" strokeWidth={1.5} />
                )}
                <span>Save</span>
              </Button>
            </>
          ) : (
            <>
              {hasPreviewSupport && data?.content ? (
                <div className="mr-1 flex items-center rounded-md border border-border bg-muted/40 p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode("preview")}
                    className={cn(
                      "h-6 gap-1 px-2 text-xs cursor-pointer",
                      viewMode === "preview" &&
                        "bg-background text-foreground font-medium",
                    )}
                  >
                    <Eye className="h-3 w-3" strokeWidth={1.5} />
                    <span>Preview</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode("code")}
                    className={cn(
                      "h-6 gap-1 px-2 text-xs cursor-pointer",
                      viewMode === "code" &&
                        "bg-background text-foreground font-medium",
                    )}
                  >
                    <Code2 className="h-3 w-3" strokeWidth={1.5} />
                    <span>Code</span>
                  </Button>
                </div>
              ) : null}

              {isTextEditable ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={handleEnterEdit}
                      aria-label="Edit file"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Edit file</TooltipContent>
                </Tooltip>
              ) : null}

              {onOpenDiff ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => onOpenDiff(filePath)}
                      aria-label="View diff"
                    >
                      <GitCompare className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">View diff</TooltipContent>
                </Tooltip>
              ) : null}

              {!hasPreviewSupport || viewMode === "code" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
                        wrapLines
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setWrapLines((prev) => !prev)}
                      aria-label={
                        wrapLines ? "Disable line wrap" : "Wrap long lines"
                      }
                    >
                      <WrapText className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {wrapLines ? "Disable line wrap" : "Wrap long lines"}
                  </TooltipContent>
                </Tooltip>
              ) : null}

              {data?.content ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={handleCopy}
                      aria-label="Copy file contents"
                    >
                      {copied ? (
                        <Check
                          className="h-3.5 w-3.5 text-emerald-500"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {copied ? "Copied" : "Copy"}
                  </TooltipContent>
                </Tooltip>
              ) : null}

              {downloadUrl ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="hidden sm:inline-flex h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <a
                        href={downloadUrl}
                        download={fileName}
                        aria-label={`Download ${fileName}`}
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Download</TooltipContent>
                </Tooltip>
              ) : null}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => void mutate()}
                    disabled={isLoading || isValidating}
                    aria-label="Refresh file"
                  >
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5",
                        (isLoading || isValidating) && "animate-spin",
                      )}
                      strokeWidth={1.5}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Refresh</TooltipContent>
              </Tooltip>

              {onClose ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-0.5 h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={onClose}
                      aria-label="Close tab"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close</TooltipContent>
                </Tooltip>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* File Content Area */}
      <div className="flex-1 min-h-0 overflow-auto bg-background">
        {isLoading && !data ? (
          <CodeLoadingSkeleton />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-sm font-medium text-destructive">
              Failed to load file
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {error.message ||
                "An unexpected error occurred while loading this file."}
            </p>
          </div>
        ) : data ? (
          <div className="h-full">
            {isEditing ? (
              <div className="flex min-h-full w-full bg-background font-mono text-xs leading-5">
                <div
                  aria-hidden="true"
                  className="select-none border-r border-border/60 bg-muted/20 px-3 py-3 text-right tabular-nums text-muted-foreground/60"
                >
                  {Array.from({ length: lineCount }, (_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={editorRef}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  className="min-h-full w-full flex-1 resize-none bg-transparent p-3 font-mono text-base sm:text-xs leading-5 text-foreground outline-none"
                />
              </div>
            ) : data.kind === "image" && binaryPreview ? (
              <div className="flex min-h-full items-center justify-center p-8 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)]">
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={binaryPreview}
                  alt={fileName}
                  className="max-h-[calc(100vh-14rem)] max-w-full rounded-md object-contain border border-border"
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
                <FileText
                  className="h-8 w-8 text-muted-foreground opacity-50"
                  strokeWidth={1.5}
                />
                <p className="text-sm text-muted-foreground">
                  Binary file cannot be displayed inline
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
                <DiffsFile
                  key={`${filePath}-${data.size}`}
                  file={{ name: filePath, contents: data.content }}
                  options={fileOptions}
                />
              )
            ) : (
              <div className="p-12 text-center text-xs text-muted-foreground">
                This file is empty
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
