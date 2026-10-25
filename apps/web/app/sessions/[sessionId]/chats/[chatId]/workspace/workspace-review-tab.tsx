"use client";

import {
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileCode,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PatchDiff } from "@pierre/diffs/react";
import type { DiffFile } from "@/lib/diff/compute-diff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { defaultDiffOptions, splitDiffOptions } from "@/lib/diffs-config";
import { commitChanges } from "@/lib/github/actions/commit";
import { discardChanges } from "@/lib/git/actions/discard";
import { openPullRequest, mergePr } from "@/lib/github/actions/pr";
import {
  getMergeReadiness,
  type MergeReadinessResponse,
} from "@/lib/github/queries/pr";
import { cn } from "@/lib/utils";
import type { GitPanelProps } from "../git-panel";

export type WorkspaceReviewTabProps = GitPanelProps & {
  onOpenFile?: (filePath: string) => void;
};

function StatusBadge({ status }: { status: DiffFile["status"] }) {
  switch (status) {
    case "added":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          A
        </span>
      );
    case "deleted":
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-rose-500/15 text-[10px] font-bold text-rose-600 dark:text-rose-400">
          D
        </span>
      );
    case "modified":
    default:
      return (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-amber-500/15 text-[10px] font-bold text-amber-600 dark:text-amber-400">
          M
        </span>
      );
  }
}

export function WorkspaceReviewTab({
  session,
  hasRepo,
  hasExistingPr,
  existingPrUrl,
  diffFiles,
  diffSummary,
  diffRefreshing = false,
  refreshDiff,
  gitStatus,
  gitStatusLoading = false,
  refreshGitStatus,
  onCommitted,
  onMerged,
  hasSandbox,
  onOpenFile,
  onCreateRepoClick,
}: WorkspaceReviewTabProps) {
  // Diff View Mode: unified or split (matching OpenCode segmented control)
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");

  // Track expanded files in accordion
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Direct commit input state (no AI write commit gimmicks)
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Discard state
  const [discardFileTarget, setDiscardFileTarget] = useState<string | null>(null);
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // PR & Merge state
  const [readiness, setReadiness] = useState<MergeReadinessResponse | null>(null);
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [createPrDialogOpen, setCreatePrDialogOpen] = useState(false);
  const [prTitle, setPrTitle] = useState(session.title ?? "");

  const uncommittedFiles = useMemo(
    () =>
      diffFiles?.filter(
        (f) =>
          f.status === "added" ||
          f.status === "modified" ||
          f.status === "deleted" ||
          f.status === "renamed",
      ) ?? [],
    [diffFiles],
  );

  // Default expand all files when files are loaded
  useEffect(() => {
    if (uncommittedFiles.length > 0 && expandedFiles.size === 0) {
      setExpandedFiles(new Set(uncommittedFiles.map((f) => f.path)));
    }
  }, [uncommittedFiles, expandedFiles.size]);

  // Fetch merge readiness when PR exists
  useEffect(() => {
    if (session.prNumber && hasRepo) {
      getMergeReadiness({ sessionId: session.id })
        .then((res) => setReadiness(res))
        .catch(() => {});
    }
  }, [session.prNumber, session.id, hasRepo]);

  const totalAdds = diffSummary?.totalAdditions ?? 0;
  const totalDels = diffSummary?.totalDeletions ?? 0;
  const branchName =
    gitStatus?.branch ?? session.branch ?? "main";

  const allExpanded =
    uncommittedFiles.length > 0 &&
    expandedFiles.size === uncommittedFiles.length;

  const toggleExpandCollapseAll = useCallback(() => {
    if (allExpanded) {
      setExpandedFiles(new Set());
    } else {
      setExpandedFiles(new Set(uncommittedFiles.map((f) => f.path)));
    }
  }, [allExpanded, uncommittedFiles]);

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Handle single file discard
  const handleDiscardSingleFile = useCallback(
    async (filePath: string) => {
      setIsDiscarding(true);
      try {
        await discardChanges({
          sessionId: session.id,
          filePath,
        });
        toast.success(`Discarded changes in ${filePath.split("/").pop()}`);
        setDiscardFileTarget(null);
        void refreshDiff();
        void refreshGitStatus().catch(() => {});
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to discard file changes",
        );
      } finally {
        setIsDiscarding(false);
      }
    },
    [session.id, refreshDiff, refreshGitStatus],
  );

  // Handle discard all changes
  const handleDiscardAll = useCallback(async () => {
    setIsDiscarding(true);
    try {
      await discardChanges({
        sessionId: session.id,
      });
      toast.success("Discarded all uncommitted changes");
      setConfirmDiscardAllOpen(false);
      void refreshDiff();
      void refreshGitStatus().catch(() => {});
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to discard changes",
      );
    } finally {
      setIsDiscarding(false);
    }
  }, [session.id, refreshDiff, refreshGitStatus]);

  // Handle direct commit
  const handleCommit = useCallback(async () => {
    const trimmed = commitMessage.trim();
    if (!trimmed) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      const result = await commitChanges({
        sessionId: session.id,
        sessionTitle: session.title,
        baseBranch: session.branch ?? "main",
        branchName,
        commitTitle: trimmed,
      });

      if (!result.committed) {
        setCommitError(result.error ?? "Failed to commit changes");
        return;
      }

      setCommitMessage("");
      toast.success(
        result.pushed
          ? "Changes committed and pushed to remote"
          : "Changes committed locally",
      );
      onCommitted?.();
      void refreshDiff();
      void refreshGitStatus().catch(() => {});
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsCommitting(false);
    }
  }, [
    commitMessage,
    session.id,
    session.title,
    session.branch,
    branchName,
    onCommitted,
    refreshDiff,
    refreshGitStatus,
  ]);

  // Handle create PR
  const handleCreatePr = useCallback(async () => {
    if (!session.cloneUrl || !prTitle.trim()) return;

    setIsCreatingPr(true);
    try {
      const res = await openPullRequest({
        sessionId: session.id,
        repoUrl: session.cloneUrl,
        branchName,
        title: prTitle.trim(),
        baseBranch: "main",
      });

      if (!res.success) {
        toast.error(res.error ?? "Failed to create pull request");
        return;
      }

      toast.success(`Created Pull Request #${res.prNumber}`);
      setCreatePrDialogOpen(false);
      void refreshGitStatus().catch(() => {});
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create pull request",
      );
    } finally {
      setIsCreatingPr(false);
    }
  }, [session.cloneUrl, session.id, branchName, prTitle, refreshGitStatus]);

  // Handle Merge PR
  const handleMergePr = useCallback(async () => {
    if (!session.prNumber) return;

    setIsMerging(true);
    try {
      const res = await mergePr({
        sessionId: session.id,
        mergeMethod: "squash",
      });

      if (!res.merged) {
        toast.error("Merge failed");
        return;
      }

      toast.success("Pull request merged successfully!");
      onMerged?.(res);
      void refreshGitStatus().catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to merge PR");
    } finally {
      setIsMerging(false);
    }
  }, [session.prNumber, session.id, onMerged, refreshGitStatus]);

  const baseDiffOptions =
    diffStyle === "split" ? splitDiffOptions : defaultDiffOptions;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top Review Toolbar (Matching OpenCode session-review.tsx header) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1.5 text-xs">
        {/* Left: Branch Pill + Files count + Diff Stats */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border/80 bg-background px-2 py-0.5 text-xs font-mono font-medium shadow-2xs">
            <GitBranch className="h-3 w-3 text-muted-foreground" />
            <span className="truncate max-w-[120px]">{branchName}</span>
          </div>

          <span className="font-mono text-xs text-muted-foreground">
            {uncommittedFiles.length} file{uncommittedFiles.length !== 1 ? "s" : ""}
          </span>

          {(totalAdds > 0 || totalDels > 0) && (
            <div className="flex items-center gap-1 font-mono text-xs font-semibold">
              <span className="text-emerald-500">+{totalAdds}</span>
              <span className="text-rose-500">-{totalDels}</span>
            </div>
          )}
        </div>

        {/* Right: Unified/Split Segmented Control + Expand/Collapse + Discard All + Refresh */}
        <div className="flex items-center gap-1.5">
          {/* OpenCode Segmented Control: Unified | Split */}
          <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setDiffStyle("unified")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-colors cursor-pointer",
                diffStyle === "unified"
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Unified
            </button>
            <button
              type="button"
              onClick={() => setDiffStyle("split")}
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-colors cursor-pointer",
                diffStyle === "split"
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Split
            </button>
          </div>

          {uncommittedFiles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpandCollapseAll}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}

          {uncommittedFiles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDiscardAllOpen(true)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
            >
              Discard all
            </Button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  void refreshDiff();
                  void refreshGitStatus().catch(() => {});
                }}
                disabled={diffRefreshing || gitStatusLoading}
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    (diffRefreshing || gitStatusLoading) && "animate-spin",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh diff</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main Diff Accordions Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {diffRefreshing && uncommittedFiles.length === 0 ? (
          <div className="flex h-full items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : uncommittedFiles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/80" />
            <p className="text-sm font-medium text-foreground">
              Working tree is clean
            </p>
            <p className="text-xs max-w-xs text-muted-foreground">
              No uncommitted changes in this branch. Any edits made by the agent
              will appear here for review.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {uncommittedFiles.map((file) => {
              const isExpanded = expandedFiles.has(file.path);
              const fileName = file.path.split("/").pop() ?? file.path;
              const dirPath = file.path.includes("/")
                ? file.path.slice(0, file.path.lastIndexOf("/"))
                : null;
              const patch = file.localDiff || file.diff;

              return (
                <div key={file.path} className="group/diff-file">
                  {/* Sticky Accordion Header (OpenCode style) */}
                  <div
                    onClick={() => toggleFile(file.path)}
                    className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5 transition-colors hover:bg-muted/80 cursor-pointer"
                  >
                    {/* Left: Expand chevron + Status Badge + File Path */}
                    <div className="flex min-w-0 items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                          isExpanded && "rotate-90",
                        )}
                      />
                      <StatusBadge status={file.status} />
                      <div className="flex min-w-0 items-center gap-1 text-xs font-mono truncate">
                        {dirPath && (
                          <span className="text-muted-foreground truncate hidden sm:inline">
                            {dirPath}/
                          </span>
                        )}
                        <span className="font-semibold text-foreground truncate">
                          {fileName}
                        </span>
                      </div>
                    </div>

                    {/* Right: Line Changes + Open in Tab + Discard File */}
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1 font-mono text-xs">
                        {file.additions > 0 && (
                          <span className="text-emerald-500 font-medium">
                            +{file.additions}
                          </span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-rose-500 font-medium">
                            -{file.deletions}
                          </span>
                        )}
                      </div>

                      {onOpenFile && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                              onClick={() => onOpenFile(file.path)}
                            >
                              <FileCode className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Open in file tab
                          </TooltipContent>
                        </Tooltip>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
                            onClick={() => setDiscardFileTarget(file.path)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Discard changes in this file
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Accordion Content with Pierre Diff */}
                  {isExpanded && (
                    <div className="overflow-x-auto bg-background">
                      {file.binary ? (
                        <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                          Binary file &mdash; diff not displayed inline
                        </div>
                      ) : file.generated ? (
                        <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                          Generated file &mdash; diff hidden
                        </div>
                      ) : patch ? (
                        <PatchDiff
                          key={`${file.path}-${diffStyle}`}
                          patch={patch}
                          options={baseDiffOptions}
                        />
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                          No diff available for this file
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Native Commit & PR Bar (OpenCode style, no cheesy AI write commit gimmicks) */}
      <div className="shrink-0 border-t border-border bg-muted/20 p-2.5 space-y-2">
        {/* Active PR status badge if exists */}
        {session.prNumber && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <GitPullRequest
                className={cn(
                  "h-4 w-4 shrink-0",
                  session.prStatus === "merged"
                    ? "text-purple-500"
                    : session.prStatus === "closed"
                      ? "text-rose-500"
                      : "text-emerald-500",
                )}
              />
              <span className="font-medium text-foreground truncate">
                PR #{session.prNumber}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.2 text-[10px] font-semibold capitalize",
                  session.prStatus === "merged"
                    ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                )}
              >
                {session.prStatus ?? "open"}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {existingPrUrl && (
                <a
                  href={existingPrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {readiness?.canMerge && session.prStatus !== "merged" && (
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
                  onClick={handleMergePr}
                  disabled={isMerging}
                >
                  {isMerging ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <GitMerge className="h-3 w-3" />
                  )}
                  Merge
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Commit Input & Action Row */}
        <div className="flex items-center gap-2">
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleCommit();
              }
            }}
            placeholder="Commit message..."
            disabled={isCommitting || uncommittedFiles.length === 0}
            className="h-8 text-xs font-mono bg-background focus-visible:ring-1"
          />

          <Button
            size="sm"
            onClick={handleCommit}
            disabled={
              !commitMessage.trim() ||
              isCommitting ||
              uncommittedFiles.length === 0
            }
            className="h-8 px-3 text-xs gap-1.5 shrink-0 cursor-pointer"
          >
            {isCommitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitCommit className="h-3.5 w-3.5" />
            )}
            <span>Commit{hasRepo ? " & Push" : ""}</span>
          </Button>

          {!session.prNumber && hasRepo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreatePrDialogOpen(true)}
              className="h-8 px-2.5 text-xs gap-1.5 shrink-0 cursor-pointer"
            >
              <GitPullRequest className="h-3.5 w-3.5 text-emerald-500" />
              <span>Create PR</span>
            </Button>
          )}
        </div>

        {commitError && (
          <p className="text-[11px] text-destructive">{commitError}</p>
        )}
      </div>

      {/* Confirmation Dialog: Discard Single File */}
      <Dialog
        open={discardFileTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDiscardFileTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              This will permanently discard all uncommitted changes in{" "}
              <span className="font-mono font-medium text-foreground">
                {discardFileTarget}
              </span>
              . This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={isDiscarding}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDiscarding}
              onClick={() => {
                if (discardFileTarget) {
                  void handleDiscardSingleFile(discardFileTarget);
                }
              }}
            >
              {isDiscarding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Discard changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Discard All */}
      <Dialog
        open={confirmDiscardAllOpen}
        onOpenChange={setConfirmDiscardAllOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard all uncommitted changes?</DialogTitle>
            <DialogDescription>
              This will permanently discard all uncommitted changes across all{" "}
              {uncommittedFiles.length} file{uncommittedFiles.length !== 1 ? "s" : ""}.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={isDiscarding}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDiscarding}
              onClick={() => void handleDiscardAll()}
            >
              {isDiscarding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Discard all changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Create Pull Request */}
      <Dialog
        open={createPrDialogOpen}
        onOpenChange={setCreatePrDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Pull Request</DialogTitle>
            <DialogDescription>
              Open a pull request from branch{" "}
              <span className="font-mono font-semibold text-foreground">
                {branchName}
              </span>{" "}
              into main.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-foreground block mb-1">
              Title
            </label>
            <Input
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder="Pull request title..."
              className="text-xs"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={isCreatingPr}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={isCreatingPr || !prTitle.trim()}
              onClick={() => void handleCreatePr()}
            >
              {isCreatingPr ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitPullRequest className="h-3.5 w-3.5" />
              )}
              Create PR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
