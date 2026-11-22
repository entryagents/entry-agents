"use client";

import { File as DiffsFile } from "@pierre/diffs/react";
import { ArrowLeft, AtSign, Check, Copy, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { WorkspaceFileContentResponse } from "@/app/api/sessions/[sessionId]/files/content/route";
import { useTheme } from "@/app/providers";
import { MarkdownArtifactPreview } from "@/components/workspace/artifact-preview";
import { formatBytes } from "@/components/workspace/workspace-file-stats";
import { getFileOptions } from "@/lib/diffs-config";
import { fetcher } from "@/lib/swr";
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

type MdView = "rendered" | "source";

const MARKDOWN_RE = /\.(md|mdx|markdown)$/i;
const SVG_RE = /\.svg$/i;

/**
 * 1:1 port of Sable's `src/features/rail/FilePreview.tsx`.
 * Read-only preview inside the Files tab: back arrow + breadcrumbs + status letter,
 * action row (`Mention in chat`, `Copy path`, Markdown `Preview | Source`, file size),
 * and clean body (code, rendered markdown, or image/SVG frame).
 */
export function WorkspaceFileTab({
  sessionId,
  filePath,
  status,
  onBack,
  onClose,
  onMentionInChat,
}: WorkspaceFileTabProps) {
  const { resolvedTheme } = useTheme();
  const handleBack = onBack ?? onClose;
  const rootRef = useRef<HTMLDivElement>(null);

  const [mdView, setMdView] = useState<MdView>("rendered");
  const [copiedPath, setCopiedPath] = useState(false);
  const [imageDims, setImageDims] = useState<[number, number] | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const isMarkdown = MARKDOWN_RE.test(filePath);
  const isSvg = SVG_RE.test(filePath);
  const { segments, fileName } = useMemo(
    () => splitFileSegments(filePath),
    [filePath],
  );
  const statusLetter = toChangeLetter(status);

  useEffect(() => {
    setMdView("rendered");
    setImageDims(null);
    setImageFailed(false);
    setCopiedPath(false);
  }, [filePath]);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [filePath]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ path: filePath });
    return `/api/sessions/${sessionId}/files/content?${params.toString()}`;
  }, [sessionId, filePath]);

  const { data, error, isLoading } = useSWR<WorkspaceFileContentResponse>(
    queryUrl,
    fetcher,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const fileOptions = useMemo(
    () => ({
      ...getFileOptions(resolvedTheme),
      disableFileHeader: true,
    }),
    [resolvedTheme],
  );

  const isBinary = Boolean(data?.kind && data.kind !== "text");

  const binaryPreview = useMemo(() => {
    if (!data?.contentBase64 || !data.mimeType) return null;
    return `data:${data.mimeType};base64,${data.contentBase64}`;
  }, [data]);

  const svgDataUrl = useMemo(() => {
    if (!isSvg || !data?.content) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.content)}`;
  }, [isSvg, data?.content]);

  const handleCopyPath = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(filePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1500);
  };

  const formattedSize =
    typeof data?.size === "number" ? formatBytes(data.size) : null;

  const isImage = data?.kind === "image" || (isSvg && Boolean(svgDataUrl));
  const imageSrc = data?.kind === "image" ? binaryPreview : svgDataUrl;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !handleBack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "ArrowLeft" && e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        handleBack();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [handleBack]);

  return (
    <div ref={rootRef} tabIndex={-1} className="rail-col fp outline-none">
      <div className="rail-bar rail-bar-field fp-head">
        {handleBack && (
          <button
            type="button"
            data-fp-back="true"
            className="rail-btn"
            onClick={handleBack}
            aria-label="Back to files"
            title="Back to files"
          >
            <ArrowLeft size={14} strokeWidth={1.7} aria-hidden="true" />
          </button>
        )}
        <nav className="fp-crumbs" aria-label="Path">
          {segments.map((seg, i) => (
            <span
              key={`${seg}-${i}`}
              className={
                i === segments.length - 1
                  ? "fp-crumb fp-crumb-last"
                  : "fp-crumb"
              }
            >
              {seg}
            </span>
          ))}
        </nav>
        {statusLetter ? (
          <span className="st-letter" data-small="" data-status={statusLetter}>
            {statusLetter}
          </span>
        ) : null}
      </div>

      <div className="fp-actions">
        {onMentionInChat && (
          <button
            type="button"
            className="sable-btn-sm"
            onClick={() => onMentionInChat(`@${filePath} `)}
          >
            <AtSign size={14} strokeWidth={1.6} aria-hidden="true" />
            <span>Mention in chat</span>
          </button>
        )}

        <button
          type="button"
          className="rail-btn"
          onClick={handleCopyPath}
          aria-label="Copy path"
          title={copiedPath ? "Copied" : "Copy path"}
        >
          {copiedPath ? (
            <Check size={14} strokeWidth={1.7} aria-hidden="true" />
          ) : (
            <Copy size={14} strokeWidth={1.6} aria-hidden="true" />
          )}
        </button>

        <span className="flex-1" />

        {data && !isBinary && isMarkdown && (
          <div className="seg" role="group" aria-label="View mode">
            <button
              type="button"
              className="seg-item"
              data-active={mdView === "rendered" || undefined}
              onClick={() => setMdView("rendered")}
            >
              Preview
            </button>
            <button
              type="button"
              className="seg-item"
              data-active={mdView === "source" || undefined}
              onClick={() => setMdView("source")}
            >
              Source
            </button>
          </div>
        )}

        {formattedSize ? (
          <span className="fp-size num">{formattedSize}</span>
        ) : null}
      </div>

      <div className="rail-scroll fp-body">
        {error ? (
          <p className="rail-empty">
            {error.message || "Could not load this file."}
          </p>
        ) : isLoading || !data ? (
          <div className="rail-loading">
            <Loader2
              size={14}
              strokeWidth={1.6}
              className="animate-spin"
              aria-hidden="true"
            />
            <span>Opening</span>
          </div>
        ) : isImage && imageSrc ? (
          imageFailed ? (
            <p className="rail-empty">This image cannot be shown here.</p>
          ) : (
            <figure className="fp-image">
              <div className="fp-image-frame">
                {/* oxlint-disable-next-line nextjs/no-img-element -- sandbox-served file preview */}
                <img
                  src={imageSrc}
                  alt={fileName}
                  onError={() => setImageFailed(true)}
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
          )
        ) : isBinary ? (
          <p className="rail-empty">A binary file has no preview.</p>
        ) : !data.content ? (
          <p className="rail-empty">This file is empty.</p>
        ) : isMarkdown && mdView === "rendered" ? (
          <div className="fp-md">
            <MarkdownArtifactPreview content={data.content} />
          </div>
        ) : (
          <div className="fp-code">
            <DiffsFile
              key={`${filePath}-${data.size}`}
              file={{ name: filePath, contents: data.content }}
              options={fileOptions}
            />
          </div>
        )}
      </div>
    </div>
  );
}
