"use client";

import { FileText, FolderSearch } from "lucide-react";
import { useState } from "react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

type GlobFile = {
  path: string;
};

function getGlobFiles(output: unknown): GlobFile[] {
  if (typeof output !== "object" || output === null) return [];
  if (!("files" in output) || !Array.isArray(output.files)) return [];
  return output.files.filter(
    (file): file is GlobFile =>
      typeof file === "object" &&
      file !== null &&
      "path" in file &&
      typeof file.path === "string",
  );
}

/** Show at most the last 2 path segments */
function truncatePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

function SableFileList({ files }: { files: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, 12);
  return (
    <div className="sable-files">
      <ul>
        {shown.map((f) => {
          const cut = f.lastIndexOf("/");
          return (
            <li key={f} title={f}>
              <FileText className="h-3.5 w-3.5" />
              <span className="truncate">
                {cut >= 0 && (
                  <span className="sable-files-dir">{f.slice(0, cut + 1)}</span>
                )}
                {f.slice(cut + 1)}
              </span>
            </li>
          );
        })}
      </ul>
      {files.length > 12 && !all && (
        <button
          type="button"
          className="sable-link-btn"
          onClick={() => setAll(true)}
        >
          Show all {files.length}
        </button>
      )}
    </div>
  );
}

export function GlobRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-glob">) {
  const input = part.input;
  const pattern = input?.pattern ?? "...";
  const path = input?.path;

  const output = part.state === "output-available" ? part.output : undefined;
  const files = getGlobFiles(output);

  const summary = path ? `in ${truncatePath(path)}` : "";

  const expandedContent =
    output !== undefined ? (
      <div className="sable-detail-stack">
        <div className="sable-detail-fields">
          {pattern !== "..." && (
            <div className="sable-detail-field">
              <span className="sable-detail-label">Pattern</span>
              <span className="sable-detail-value sable-detail-mono">
                {pattern}
              </span>
            </div>
          )}
          {path && path !== "." && (
            <div className="sable-detail-field">
              <span className="sable-detail-label">In</span>
              <span className="sable-detail-value">{path}</span>
            </div>
          )}
        </div>
        {files.length > 0 ? (
          <SableFileList files={files.map((f) => f.path)} />
        ) : (
          <div className="sable-detail-quiet">No files</div>
        )}
      </div>
    ) : undefined;

  return (
    <ToolLayout
      name="Glob"
      icon={<FolderSearch className="h-3.5 w-3.5" />}
      summary={
        <>
          <span className="font-mono">&apos;{pattern}&apos;</span>
          {summary && (
            <span className="ml-1.5 text-muted-foreground">{summary}</span>
          )}
        </>
      }
      meta={
        output !== undefined
          ? files.length > 0
            ? `${files.length} ${files.length === 1 ? "file" : "files"}`
            : "No files"
          : undefined
      }
      state={state}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
