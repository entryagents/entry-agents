"use client";

import { ChevronRight, FileText } from "lucide-react";
import { memo, useState } from "react";
import { toRelativePath } from "@entry-agents/shared";
import { useOptionalGitPanel } from "@/app/sessions/[sessionId]/chats/[chatId]/git-panel-context";
import { SableCollapse } from "@/components/sable-chat/collapse";
import { DEFAULT_WORKING_DIRECTORY } from "@/lib/sandbox/config";
import { cn } from "@/lib/utils";
import type { TurnChangedFile, TurnFileChanges } from "./sable-turn-grouping";

function splitFilePath(relativePath: string): { dir: string; name: string } {
  const normalized = relativePath.replace(/^\/+/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) {
    return { dir: "", name: normalized };
  }
  return {
    dir: normalized.slice(0, lastSlash),
    name: normalized.slice(lastSlash + 1),
  };
}

export interface ConversationFileSummaryPanelProps {
  changes: TurnFileChanges;
  files: readonly TurnChangedFile[];
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
}

/**
 * Rendered at the bottom of an assistant turn (below the Copy / Fork action bar),
 * collapsed by default so it stays out of the way of the final reply.
 * Expanding reveals every changed file with per-file +/- counts and Review / Open actions.
 */
export const ConversationFileSummaryPanel = memo(
  function ConversationFileSummaryPanel({
    changes,
    files,
    cwd = DEFAULT_WORKING_DIRECTORY,
    onOpenFile,
  }: ConversationFileSummaryPanelProps) {
    const gitPanel = useOptionalGitPanel();
    const [open, setOpen] = useState(false);

    if (changes.files <= 0 || files.length === 0) {
      return null;
    }

    const filesChangedLabel =
      changes.files === 1 ? "1 file changed" : `${changes.files} files changed`;

    const handleReviewFile = (relativePath: string) => {
      if (!gitPanel) return;
      gitPanel.openDiffToFile(relativePath);
    };

    const handleOpenFile = (relativePath: string) => {
      if (onOpenFile) {
        onOpenFile(relativePath);
        return;
      }
      gitPanel?.openWorkspaceFile(relativePath);
    };

    const canReview = Boolean(gitPanel);
    const canOpen = Boolean(onOpenFile || gitPanel);

    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-none">
        <div className="flex h-10 items-center justify-between gap-3 px-2 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/50">
          <button
            type="button"
            aria-expanded={open}
            aria-label={
              open ? "Collapse changed files" : "Expand changed files"
            }
            onClick={() => setOpen((prev) => !prev)}
            className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 text-left text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              size={14}
              strokeWidth={1.5}
              aria-hidden="true"
              className={cn(
                "shrink-0 text-muted-foreground/70 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                open && "rotate-90",
              )}
            />
            <span className="min-w-0 truncate font-medium">
              {filesChangedLabel}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-[12.5px]">
              {changes.add > 0 ? (
                <span className="sable-t-add">+{changes.add}</span>
              ) : null}
              {changes.del > 0 ? (
                <span className="sable-t-del">-{changes.del}</span>
              ) : null}
            </span>
          </button>
        </div>

        <SableCollapse open={open}>
          <div className="max-h-72 overflow-y-auto border-t border-border">
            <div className="grid w-full">
              {files.map((file) => {
                const relativePath = toRelativePath(file.path, cwd);
                const { dir, name } = splitFilePath(relativePath);
                return (
                  <div
                    key={file.path}
                    className={cn(
                      "flex w-full items-center gap-2 overflow-hidden bg-background/50 px-3 py-2 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      canReview && "hover:bg-muted/40",
                    )}
                  >
                    <button
                      type="button"
                      disabled={!canReview}
                      title={relativePath}
                      onClick={() => handleReviewFile(relativePath)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        canReview ? "cursor-pointer" : "cursor-default",
                      )}
                    >
                      <FileText
                        size={14}
                        strokeWidth={1.5}
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground/75"
                      />
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {name}
                        </span>
                        {dir ? (
                          <span className="hidden truncate text-xs text-muted-foreground/70 sm:inline">
                            {dir}
                          </span>
                        ) : null}
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-xs">
                        {file.added > 0 ? (
                          <span className="sable-t-add">+{file.added}</span>
                        ) : null}
                        {file.removed > 0 ? (
                          <span className="sable-t-del">-{file.removed}</span>
                        ) : null}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!canReview}
                        onClick={() => handleReviewFile(relativePath)}
                        className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Review
                      </button>
                      {canOpen ? (
                        <button
                          type="button"
                          onClick={() => handleOpenFile(relativePath)}
                          className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted"
                        >
                          Open
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SableCollapse>
      </div>
    );
  },
);
