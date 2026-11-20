"use client";

import {
  ArrowLeft,
  FolderTree,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { WorkspaceFileTree } from "@/components/workspace/workspace-file-tree";
import type { DiffFile } from "@/lib/diff/compute-diff";

const WorkspaceFileTab = dynamic(
  () => import("./workspace-file-tab").then((m) => m.WorkspaceFileTab),
  {
    ssr: false,
    loading: () => (
      <div className="rail-empty">
        <Loader2
          size={18}
          strokeWidth={1.5}
          className="animate-spin"
          aria-hidden="true"
        />
        <p>Loading file…</p>
      </div>
    ),
  },
);

interface WorkspaceFilesTabProps {
  sessionId: string;
  files: FileSuggestion[] | null | undefined;
  filesLoading: boolean;
  hasSandbox?: boolean;
  refreshFiles?: () => void;
  diffFiles?: DiffFile[];
  onOpenDiff?: (filePath: string) => void;
  onOpenQuickOpen?: () => void;
}

export function WorkspaceFilesTab({
  sessionId,
  files,
  filesLoading,
  hasSandbox = true,
  refreshFiles,
  diffFiles = [],
  onOpenDiff,
  onOpenQuickOpen,
}: WorkspaceFilesTabProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (selectedFile) {
    return (
      <div className="rail-col">
        <div className="rail-bar">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-left hover:text-[var(--ink)] transition-colors cursor-pointer min-w-0"
            onClick={() => setSelectedFile(null)}
          >
            <ArrowLeft size={13} strokeWidth={1.7} aria-hidden="true" />
            <span className="truncate font-mono text-[11.5px]">
              {selectedFile}
            </span>
          </button>
          {onOpenQuickOpen && (
            <div className="rail-bar-actions">
              <button
                type="button"
                className="rail-btn"
                onClick={onOpenQuickOpen}
                title="Quick open file (⌘P)"
              >
                <Search size={12} strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <WorkspaceFileTab
            sessionId={sessionId}
            filePath={selectedFile}
            onClose={() => setSelectedFile(null)}
            onOpenDiff={onOpenDiff}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rail-col">
      <div className="rail-bar">
        <span>
          {files
            ? `${files.filter((f) => !f.isDirectory).length} files`
            : "Files"}
        </span>
        <div className="rail-bar-actions">
          {onOpenQuickOpen && (
            <button
              type="button"
              className="rail-btn"
              onClick={onOpenQuickOpen}
              title="Quick open file (⌘P)"
            >
              <Search size={12} strokeWidth={1.6} aria-hidden="true" />
              <span>Find</span>
            </button>
          )}
          {refreshFiles && (
            <button
              type="button"
              className="rail-btn"
              onClick={refreshFiles}
              disabled={filesLoading}
              title="Refresh file tree"
              aria-label="Refresh file tree"
            >
              {filesLoading ? (
                <Loader2
                  size={12}
                  strokeWidth={1.6}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw size={12} strokeWidth={1.6} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {filesLoading && (!files || files.length === 0) ? (
          <div className="rail-empty">
            <Loader2
              size={20}
              strokeWidth={1.4}
              className="animate-spin"
              aria-hidden="true"
            />
            <p>Loading workspace files…</p>
          </div>
        ) : !files || files.length === 0 ? (
          <div className="rail-empty">
            <FolderTree size={22} strokeWidth={1.3} aria-hidden="true" />
            <p className="rail-empty-title">
              {hasSandbox
                ? "No workspace files yet"
                : "Workspace not active yet"}
            </p>
            <p>
              {hasSandbox
                ? "Files created or cloned into this session will appear here."
                : "Files appear here once the workspace sandbox finishes starting."}
            </p>
            {refreshFiles && hasSandbox && (
              <button
                type="button"
                className="rail-btn mt-1 border border-[var(--line-2)] px-2.5"
                onClick={refreshFiles}
                disabled={filesLoading}
              >
                <RefreshCw size={12} strokeWidth={1.6} aria-hidden="true" />
                <span>Refresh</span>
              </button>
            )}
          </div>
        ) : (
          <WorkspaceFileTree
            files={files}
            diffFiles={diffFiles}
            activeFilePath={selectedFile}
            onOpenFile={(path) => setSelectedFile(path)}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
