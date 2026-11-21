"use client";

import { FolderTree, Loader2, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { WorkspaceFileTree } from "@/components/workspace/workspace-file-tree";
import type { DiffFile } from "@/lib/diff/compute-diff";
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
  onOpenQuickOpen,
  onMentionInChat,
}: WorkspaceFilesTabProps) {
  const {
    focusedWorkspaceFile,
    focusedWorkspaceFileRequestId,
    clearFocusedWorkspaceFile,
  } = useGitPanel();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Sync external file-open requests (from Review rows, Chat, Cmd+P) into Sable's slide-over preview.
  useEffect(() => {
    if (!focusedWorkspaceFile) return;
    setSelectedFile(focusedWorkspaceFile);
  }, [focusedWorkspaceFile, focusedWorkspaceFileRequestId]);

  const diffStatusByPath = useMemo(() => {
    const map = new Map<string, DiffFile["status"]>();
    for (const df of diffFiles) {
      map.set(df.path, df.status);
    }
    return map;
  }, [diffFiles]);

  const handleBack = () => {
    setSelectedFile(null);
    clearFocusedWorkspaceFile();
  };

  return (
    <div className="rail-col fl">
      <AnimatePresence initial={false}>
        {selectedFile ? (
          <motion.div
            key={selectedFile}
            className="rail-col fl-layer fl-preview"
            initial={{ opacity: 0, x: 22 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 22 }}
            transition={{ type: "spring", stiffness: 460, damping: 38 }}
          >
            <WorkspaceFileTab
              sessionId={sessionId}
              filePath={selectedFile}
              status={diffStatusByPath.get(selectedFile)}
              onBack={handleBack}
              onOpenDiff={onOpenDiff}
              onMentionInChat={onMentionInChat}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className="rail-col fl-layer fl-main"
        data-away={selectedFile ? "" : undefined}
        inert={Boolean(selectedFile)}
      >
        {filesLoading && (!files || files.length === 0) ? (
          <div className="rail-loading">
            <Loader2
              size={16}
              strokeWidth={1.6}
              className="animate-spin"
              aria-hidden="true"
            />
            <span>Reading workspace files…</span>
          </div>
        ) : !files || files.length === 0 ? (
          <div className="rail-empty">
            <FolderTree size={22} strokeWidth={1.3} aria-hidden="true" />
            <p className="rail-empty-title">
              {hasSandbox
                ? "This folder is empty."
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
                className="sable-btn-sm mt-1"
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
            filesLoading={filesLoading}
            diffFiles={diffFiles}
            activeFilePath={selectedFile}
            onOpenFile={(path) => setSelectedFile(path)}
            onRefresh={refreshFiles}
            onOpenQuickOpen={onOpenQuickOpen}
            onMentionInChat={onMentionInChat}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
