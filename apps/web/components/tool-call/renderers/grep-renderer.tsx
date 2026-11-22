"use client";

import { FileText, Search } from "lucide-react";
import { useState } from "react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

type GrepMatch = {
  file: string;
  line: number;
  content?: string;
};

function getGrepMatches(output: unknown): GrepMatch[] {
  if (typeof output !== "object" || output === null) return [];
  if (!("matches" in output) || !Array.isArray(output.matches)) return [];
  return output.matches.filter(
    (match): match is GrepMatch =>
      typeof match === "object" &&
      match !== null &&
      "file" in match &&
      typeof match.file === "string" &&
      "line" in match &&
      typeof match.line === "number" &&
      (!("content" in match) || typeof match.content === "string"),
  );
}

/** Show at most the last 2 path segments */
function truncatePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

/** Deduplicate file paths from matches */
function getUniqueFiles(matches: GrepMatch[]): string[] {
  const seen = new Set<string>();
  for (const m of matches) {
    seen.add(m.file);
  }
  return Array.from(seen);
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

export function GrepRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-grep">) {
  const input = part.input;
  const pattern = input?.pattern ?? "...";
  const path = input?.path;

  const output = part.state === "output-available" ? part.output : undefined;
  const matches = getGrepMatches(output);
  const uniqueFiles = getUniqueFiles(matches);

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
        {uniqueFiles.length > 0 ? (
          <SableFileList files={uniqueFiles} />
        ) : (
          <div className="sable-detail-quiet">No matches</div>
        )}
      </div>
    ) : undefined;

  return (
    <ToolLayout
      name="Grep"
      icon={<Search className="h-3.5 w-3.5" />}
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
          ? matches.length > 0
            ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
            : "No matches"
          : undefined
      }
      state={state}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
