"use client";

import { File as DiffsFile } from "@pierre/diffs/react";
import {
  ArrowLeft,
  AtSign,
  Check,
  Copy,
  Download,
  FileText,
  GitCompare,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  WrapText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import { useTheme } from "@/app/providers";
import {
  HtmlArtifactPreview,
  MarkdownArtifactPreview,
  SvgArtifactPreview,
  UrlArtifactPreview,
} from "@/components/workspace/artifact-preview";
import {
  computeFileMetrics,
  formatBytes,
} from "@/components/workspace/workspace-file-stats";
import { getFileOptions } from "@/lib/diffs-config";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { splitFileSegments, toChangeLetter } from "./sable-rail-helpers";

type WorkspaceFileTabProps = {
  sessionId: string;
  filePath: string;
  status?: string | null;
  onBack?: () => void;
  onClose?: () => void;
  onOpenDiff?: (filePath: string) => void;
  onMentionInChat?: (mention: string) => void;
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

export function WorkspaceFileTab({
  sessionId,
  filePath,
  status,
  onBack,
  onClose,
  onOpenDiff,
  onMentionInChat,
}: WorkspaceFileTabProps) {
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
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
  const [imageDims, setImageDims] = useState<[number, number] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
    setImageDims(null);
    setViewMode(getDefaultViewMode(filePath));
    setWrapLines(
      [...wrappedFileExtensions].some((ext) =>
        filePath.toLowerCase().endsWith(ext),
      ),
    );
    rootRef.current
      ?.querySelector<HTMLButtonElement>("[data-fp-back]")
      ?.focus({ preventScroll: true });
  }, [filePath]);

  const { segments, fileName } = useMemo(
    () => splitFileSegments(filePath),
    [filePath],
  );
  const statusLetter = useMemo(() => toChangeLetter(status), [status]);

  const { resolvedTheme } = useTheme();
  const fileOptions = useMemo(
    () => ({
      ...getFileOptions(resolvedTheme),
      wrap: wrapLines,
    }),
    [resolvedTheme, wrapLines],
  );

  const isTextEditable =
    data?.kind === "text" ||
    (data !== undefined &&
      !data.contentBase64 &&
      typeof data.content === "string");
  const isDirty = isEditing && draftContent !== (data?.content ?? "");

  const metrics = useMemo(() => {
    const content = isEditing ? draftContent : data?.content;
    if (typeof content !== "string") return null;
    return computeFileMetrics(content, isEditing ? content.length : data?.size);
  }, [data, draftContent, isEditing]);

  const formattedSize = useMemo(() => {
    if (metrics) return metrics.formattedSize;
    if (typeof data?.size === "number") return formatBytes(data.size);
    return null;
  }, [data?.size, metrics]);

  const binaryPreview = useMemo(() => {
    if (!data?.contentBase64) return null;
    const mime = data.mimeType || "application/octet-stream";
    return `data:${mime};base64,${data.contentBase64}`;
  }, [data]);

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(filePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 1800);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const handleCopyCode = async () => {
    const text = isEditing ? draftContent : data?.content;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
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
      event.stopPropagation();
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
    if (!requestUrl || !data?.content) return null;
    return `${requestUrl}&download=1`;
  }, [binaryPreview, data?.content, requestUrl]);

  const hasPreviewSupport = supportsPreview(filePath);
  const lineCount = useMemo(
    () => (isEditing ? draftContent.split("\n").length : 0),
    [draftContent, isEditing],
  );
  const handleBack = onBack ?? onClose;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !handleBack) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditing) return;
      if (e.key === "Escape" || (e.key === "ArrowLeft" && e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [handleBack, isEditing]);

  return (
    <div ref={rootRef} className="rail-col fp outline-none">
      {/* 1:1 Sable .fp-head: Back arrow + truncating breadcrumbs + status letter */}
      <div className="rail-bar rail-bar-field fp-head">
        {handleBack && (
          <button
            type="button"
            data-fp-back="true"
            className="rail-btn"
            onClick={handleBack}
            aria-label="Back to files"
            title="Back to files (Esc)"
          >
            <ArrowLeft size={14} strokeWidth={1.7} aria-hidden="true" />
          </button>
        )}
        <nav className="fp-crumbs" aria-label="File path">
          {segments.map((seg, i) => (
            <span
              key={`${seg}-${i}`}
              className={
                i === segments.length - 1
                  ? "fp-crumb fp-crumb-last"
                  : "fp-crumb"
              }
              title={filePath}
            >
              {seg}
            </span>
          ))}
        </nav>
        {isDirty ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            title="Unsaved changes"
          />
        ) : null}
        {statusLetter ? (
          <span
            className="st-letter"
            data-small=""
            data-status={statusLetter}
            title={`Changed (${statusLetter})`}
          >
            {statusLetter}
          </span>
        ) : null}
      </div>

      {/* 1:1 Sable .fp-actions bar (wraps cleanly on mobile) */}
      <div className="fp-actions">
        {isEditing ? (
          <>
            <button
              type="button"
              className="sable-btn-sm"
              onClick={handleCancelEdit}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="sable-btn-sm"
              onClick={() => void handleSave()}
              disabled={isSaving || !isDirty}
            >
              {isSaving ? (
                <Loader2
                  size={12}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Save size={12} strokeWidth={1.7} aria-hidden="true" />
              )}
              <span>Save</span>
            </button>
            <span className="flex-1" />
            {formattedSize ? (
              <span className="fp-size num">{formattedSize}</span>
            ) : null}
          </>
        ) : (
          <>
            {onMentionInChat && (
              <button
                type="button"
                className="sable-btn-sm"
                onClick={() => onMentionInChat(`@${filePath}`)}
              >
                <AtSign size={13} strokeWidth={1.7} aria-hidden="true" />
                <span>Mention in chat</span>
              </button>
            )}

            <button
              type="button"
              className="rail-btn"
              onClick={handleCopyPath}
              aria-label="Copy file path"
              title={copiedPath ? "Copied path" : "Copy path"}
            >
              {copiedPath ? (
                <Check
                  size={13.5}
                  strokeWidth={1.8}
                  className="text-emerald-500"
                  aria-hidden="true"
                />
              ) : (
                <Copy size={13.5} strokeWidth={1.6} aria-hidden="true" />
              )}
            </button>

            <span className="flex-1" />

            {hasPreviewSupport && data?.content ? (
              <div className="seg" role="group" aria-label="View mode">
                <button
                  type="button"
                  className="seg-item"
                  data-active={viewMode === "preview" || undefined}
                  onClick={() => setViewMode("preview")}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className="seg-item"
                  data-active={viewMode === "code" || undefined}
                  onClick={() => setViewMode("code")}
                >
                  Source
                </button>
              </div>
            ) : null}

            {isTextEditable ? (
              <button
                type="button"
                className="rail-btn"
                onClick={handleEnterEdit}
                aria-label="Edit file"
                title="Edit file"
              >
                <Pencil size={13} strokeWidth={1.6} aria-hidden="true" />
              </button>
            ) : null}

            {onOpenDiff && statusLetter ? (
              <button
                type="button"
                className="rail-btn"
                onClick={() => onOpenDiff(filePath)}
                aria-label="View diff"
                title="View diff"
              >
                <GitCompare size={13} strokeWidth={1.6} aria-hidden="true" />
              </button>
            ) : null}

            {!hasPreviewSupport || viewMode === "code" ? (
              <button
                type="button"
                className="rail-btn"
                data-active={wrapLines || undefined}
                onClick={() => setWrapLines((prev) => !prev)}
                aria-label={wrapLines ? "Disable line wrap" : "Wrap long lines"}
                title={wrapLines ? "Disable line wrap" : "Wrap long lines"}
              >
                <WrapText size={13} strokeWidth={1.6} aria-hidden="true" />
              </button>
            ) : null}

            {data?.content ? (
              <button
                type="button"
                className="rail-btn"
                onClick={handleCopyCode}
                aria-label="Copy file contents"
                title={copiedCode ? "Copied contents" : "Copy contents"}
              >
                {copiedCode ? (
                  <Check
                    size={13}
                    strokeWidth={1.8}
                    className="text-emerald-500"
                    aria-hidden="true"
                  />
                ) : (
                  <FileText size={13} strokeWidth={1.6} aria-hidden="true" />
                )}
              </button>
            ) : null}

            {downloadUrl ? (
              <a
                href={downloadUrl}
                download={fileName}
                className="rail-btn"
                aria-label={`Download ${fileName}`}
                title="Download"
              >
                <Download size={13} strokeWidth={1.6} aria-hidden="true" />
              </a>
            ) : null}

            <button
              type="button"
              className="rail-btn"
              onClick={() => void mutate()}
              disabled={isLoading || isValidating}
              aria-label="Refresh file"
              title="Refresh file"
            >
              <RefreshCw
                size={13}
                strokeWidth={1.6}
                className={cn((isLoading || isValidating) && "animate-spin")}
                aria-hidden="true"
              />
            </button>

            {formattedSize ? (
              <span className="fp-size num">{formattedSize}</span>
            ) : null}
          </>
        )}
      </div>

      {/* File Content Area */}
      <div className="rail-scroll fp-body">
        {isLoading && !data ? (
          <div className="rail-loading">
            <Loader2
              size={15}
              strokeWidth={1.6}
              className="animate-spin"
              aria-hidden="true"
            />
            <span>Opening…</span>
          </div>
        ) : error ? (
          <p className="rail-empty">
            {error.message || "Could not load this file."}
          </p>
        ) : data ? (
          isEditing ? (
            <div className="flex min-h-full w-full font-mono text-xs leading-5">
              <div
                aria-hidden="true"
                className="select-none border-r border-[var(--line)] bg-[var(--fill-1)] px-3 py-3 text-right tabular-nums text-[var(--text-4)]"
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
                className="min-h-full w-full flex-1 resize-none bg-transparent p-3 font-mono text-base sm:text-xs leading-5 text-[var(--text)] outline-none"
              />
            </div>
          ) : data.kind === "image" && binaryPreview ? (
            <figure className="fp-image">
              <div className="fp-image-frame">
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={binaryPreview}
                  alt={fileName}
                  onLoad={(e) =>
                    setImageDims([
                      e.currentTarget.naturalWidth,
                      e.currentTarget.naturalHeight,
                    ])
                  }
                />
              </div>
              {imageDims ? (
                <figcaption className="num">
                  {imageDims[0]} × {imageDims[1]}
                </figcaption>
              ) : null}
            </figure>
          ) : data.kind === "pdf" && binaryPreview ? (
            // oxlint-disable-next-line react/iframe-missing-sandbox
            <iframe
              title={fileName}
              src={binaryPreview}
              className="h-[calc(100vh-11rem)] w-full border-0"
            />
          ) : data.kind === "audio" && binaryPreview ? (
            <div className="flex justify-center p-6">
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
            <div className="rail-empty">
              <FileText size={24} strokeWidth={1.4} aria-hidden="true" />
              <p>A binary file has no inline preview.</p>
              <a
                href={binaryPreview}
                download={fileName}
                className="rail-link text-xs"
              >
                Download {fileName}
              </a>
            </div>
          ) : data.content && data.content.length > 0 ? (
            viewMode === "preview" && isMarkdown(filePath) ? (
              <div className="fp-md">
                <MarkdownArtifactPreview content={data.content} />
              </div>
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
            <p className="rail-empty">This file is empty.</p>
          )
        ) : null}
      </div>
    </div>
  );
}
