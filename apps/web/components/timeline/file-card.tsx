"use client";

import "./files.css";
import { Check, Copy, ExternalLink } from "lucide-react";
import { memo, useState } from "react";
import { FileTypeIcon } from "@/components/file-type-icons";
import { Button } from "@/components/ui/button";

export interface SharedFileItem {
  path: string;
  name?: string;
  size?: number;
}

function fileBasename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function folderOf(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx > 0 ? norm.slice(0, idx) : "";
}

function formatBytes(bytes?: number): string | undefined {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return undefined;
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * File Handover Cards (`send_user_file`), ported 1:1 from Sable's `FileCard.tsx`.
 */
export const FileShare = memo(function FileShare({
  files,
  caption,
  failed = false,
  onOpenFile,
}: {
  files: SharedFileItem[];
  caption?: string;
  failed?: boolean;
  onOpenFile?: (filePath: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="fshare">
      {caption?.trim() && <p className="fshare-caption">{caption.trim()}</p>}
      <div
        className="fshare-list"
        role="list"
        aria-label={files.length === 1 ? "Shared file" : "Shared files"}
      >
        {files.map((f, i) => (
          <FileCard
            key={`${i}:${f.path}`}
            file={f}
            failed={failed}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </div>
  );
});

const FileCard = memo(function FileCard({
  file,
  failed,
  onOpenFile,
}: {
  file: SharedFileItem;
  failed: boolean;
  onOpenFile?: (filePath: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const name = file.name || fileBasename(file.path);
  const folder = folderOf(file.path);
  const sizeLabel = formatBytes(file.size);

  const handleCopyPath = () => {
    void navigator.clipboard.writeText(file.path).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div
      className="fcard"
      role="listitem"
      data-failed={failed || undefined}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) {
          onOpenFile?.(file.path);
        }
      }}
      onKeyDown={(e) => {
        if (
          (e.key === "Enter" || e.key === " ") &&
          !(e.target as HTMLElement).closest("button")
        ) {
          e.preventDefault();
          onOpenFile?.(file.path);
        }
      }}
    >
      <span className="fcard-tile" aria-hidden="true">
        <FileTypeIcon filename={name} className="h-5 w-5" />
      </span>

      <span className="fcard-text">
        <span className="fcard-name truncate" title={file.path}>
          {name}
        </span>
        <span className="fcard-meta truncate">
          {folder}
          {folder && sizeLabel ? " · " : ""}
          {sizeLabel}
        </span>
      </span>

      <div className="fcard-actions">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleCopyPath}
          aria-label="Copy path"
          title="Copy path"
        >
          {copied ? (
            <Check size={13} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Copy size={13} strokeWidth={1.7} aria-hidden="true" />
          )}
        </Button>
        {onOpenFile && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onOpenFile(file.path)}
            aria-label="Open file"
            title="Open file"
          >
            <ExternalLink size={13} strokeWidth={1.7} aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
});
