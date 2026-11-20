"use client";

import {
  ArrowLeft,
  FolderTree,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState } from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { WorkspaceFileTree } from "@/components/workspace/workspace-file-tree";
import type { DiffFile } from "@/lib/diff/compute-diff";
import { WorkspaceFileTab } from "./workspace-file-tab";

interface WorkspaceFilesTabProps {
  sessionId: string;
  files: FileSuggestion[] | null | undefined;
  filesLoading: boolean;
  refreshFiles?: () => void;
  diffFiles?: DiffFile[];
  onOpenDiff?: (filePath: string) => void;
  onOpenQuickOpen?: () => void;
}

export function WorkspaceFilesTab({
  sessionId,
  files,
  filesLoading,
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
            <button
              type="button"
              className="rail-btn"
              onClick={onOpenQuickOpen}
              title="Quick open file (⌘P)"
            >
              <Search size={12} strokeWidth={1.6} aria-hidden="true" />
            </button>
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
        <div className="flex items-center gap-1">
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
            <p>No workspace files found yet.</p>
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
