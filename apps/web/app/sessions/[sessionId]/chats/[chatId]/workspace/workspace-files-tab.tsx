"use client";

import { Folder, Loader2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { FileTypeIcon } from "@/components/file-type-icons";
import { WorkspaceFileTree } from "@/components/workspace/workspace-file-tree";
import type { DiffFile } from "@/lib/diff/compute-diff";
import { cn } from "@/lib/utils";
import { useGitPanel } from "../git-panel-context";

const WorkspaceFileTab = dynamic(
  () => import("./workspace-file-tab").then((m) => m.WorkspaceFileTab),
  {
    ssr: false,
    loading: () => (
      <div className="rail-loading">
        <Loader2
          size={16}
          strokeWidth={1.6}
          className="animate-spin"
          aria-hidden="true"
        />
        <span>Opening…</span>
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
  onMentionInChat?: (mention: string) => void;
}

export function WorkspaceFilesTab({
  sessionId,
  files,
  filesLoading,
  hasSandbox = true,
  refreshFiles,
  diffFiles = [],
  onOpenDiff,
  onMentionInChat,
}: WorkspaceFilesTabProps) {
  const {
    openFiles,
    setOpenFiles,
    focusedWorkspaceFile,
    focusedWorkspaceFileRequestId,
    clearFocusedWorkspaceFile,
  } = useGitPanel();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const openFileInTab = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) =>
        prev.includes(filePath) ? prev : [...prev, filePath],
      );
      setSelectedFile(filePath);
    },
    [setOpenFiles],
  );

  const closeFileTab = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        const next = prev.filter((p) => p !== filePath);
        setSelectedFile((current) => {
          if (current !== filePath) return current;
          const idx = prev.indexOf(filePath);
          return next[idx - 1] ?? next[0] ?? null;
        });
        return next;
      });
      if (focusedWorkspaceFile === filePath) {
        clearFocusedWorkspaceFile();
      }
    },
    [clearFocusedWorkspaceFile, focusedWorkspaceFile, setOpenFiles],
  );

  // Sync external file-open requests (from Review rows, Chat, Cmd+P) into an independent tab.
  useEffect(() => {
    if (!focusedWorkspaceFile) return;
    openFileInTab(focusedWorkspaceFile);
  }, [focusedWorkspaceFile, focusedWorkspaceFileRequestId, openFileInTab]);

  const diffStatusByPath = useMemo(() => {
    const map = new Map<string, DiffFile["status"]>();
    for (const df of diffFiles) {
      map.set(df.path, df.status);
    }
    return map;
  }, [diffFiles]);

  const handleBackToTree = useCallback(() => {
    setSelectedFile(null);
    clearFocusedWorkspaceFile();
  }, [clearFocusedWorkspaceFile]);

  return (
    <div className="rail-col fl">
      {openFiles.length > 0 && (
        <div
          className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--line)] bg-[var(--sheet)] px-2 [scrollbar-width:none]"
          role="tablist"
          aria-label="Open workspace files"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedFile === null}
            onClick={handleBackToTree}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150 cursor-pointer",
              selectedFile === null
                ? "bg-[var(--fill-2)] text-[var(--text)]"
                : "text-[var(--text-3)] hover:bg-[var(--fill-1)] hover:text-[var(--text)]",
            )}
          >
            <Folder size={13} strokeWidth={1.6} aria-hidden="true" />
            <span>Files</span>
          </button>

          {openFiles.map((filePath) => {
            const fileName = filePath.split("/").pop() ?? filePath;
            const isActive = selectedFile === filePath;
            return (
              <div
                key={filePath}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "group inline-flex h-7 shrink-0 items-center rounded-md text-xs font-medium transition-colors duration-150",
                  isActive
                    ? "bg-[var(--fill-2)] text-[var(--text)]"
                    : "text-[var(--text-3)] hover:bg-[var(--fill-1)] hover:text-[var(--text)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedFile(filePath)}
                  title={filePath}
                  className="inline-flex h-full items-center gap-1.5 pl-2 pr-1 cursor-pointer"
                >
                  <FileTypeIcon
                    path={fileName}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="max-w-[132px] truncate">{fileName}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFileTab(filePath);
                  }}
                  aria-label={`Close ${fileName}`}
                  title={`Close ${fileName}`}
                  className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded text-[var(--text-3)] transition-colors duration-150 hover:bg-[var(--fill-3)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X size={11} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selectedFile ? (
        <div className="rail-col min-h-0 flex-1">
          <WorkspaceFileTab
            key={selectedFile}
            sessionId={sessionId}
            filePath={selectedFile}
            status={diffStatusByPath.get(selectedFile)}
            onBack={handleBackToTree}
            onOpenDiff={onOpenDiff}
            onMentionInChat={onMentionInChat}
          />
        </div>
      ) : (
        <div className="rail-col min-h-0 flex-1">
          <WorkspaceFileTree
            files={files ?? []}
            filesLoading={filesLoading}
            hasSandbox={hasSandbox}
            diffFiles={diffFiles}
            activeFilePath={selectedFile}
            onOpenFile={openFileInTab}
            onRefresh={refreshFiles}
            onMentionInChat={onMentionInChat}
            className="h-full"
          />
        </div>
      )}
    </div>
  );
}
