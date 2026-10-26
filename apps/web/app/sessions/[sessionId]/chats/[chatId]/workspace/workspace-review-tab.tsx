"use client";

import {
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileCode,
  FolderGit2,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Github,
  Laptop,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
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
import { getDiffOptions } from "@/lib/diffs-config";
import { useTheme } from "@/app/providers";
import { discardChanges } from "@/lib/git/actions/discard";
import {
  openPullRequest,
  mergePr,
  generatePrContent,
} from "@/lib/github/actions/pr";
import {
  getMergeReadiness,
  type MergeReadinessResponse,
} from "@/lib/github/queries/pr";
import { cn } from "@/lib/utils";
import type { GitPanelProps } from "../git-panel";
import { FileTypeIcon } from "@/components/file-type-icons";

export type WorkspaceReviewTabProps = GitPanelProps & {
  onOpenFile?: (filePath: string) => void;
};

function FileStatusIndicator({ status }: { status: DiffFile["status"] }) {
  switch (status) {
    case "added":
      return (
        <span
          title="Added file"
          className="flex h-4 px-1.5 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
        >
          +
        </span>
      );
    case "deleted":
      return (
        <span
          title="Deleted file"
          className="flex h-4 px-1.5 shrink-0 items-center justify-center rounded bg-rose-500/15 text-[10px] font-semibold text-rose-600 dark:text-rose-400"
        >
          -
        </span>
      );
    case "modified":
    default:
      return (
        <span
          title="Modified file"
          className="flex h-4 px-1.5 shrink-0 items-center justify-center rounded bg-amber-500/15 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
        >
          ~
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
  const { resolvedTheme } = useTheme();

  // Diff View Mode: unified or split
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");

  // Track expanded files in accordion
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Discard state
  const [discardFileTarget, setDiscardFileTarget] = useState<string | null>(
    null,
  );
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // Create PR dialog state
  const [createPrDialogOpen, setCreatePrDialogOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [isGeneratingPr, setIsGeneratingPr] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);

  // Merge PR state
  const [isMerging, setIsMerging] = useState(false);
  const [readiness, setReadiness] = useState<MergeReadinessResponse | null>(
    null,
  );

  // Filter uncommitted changes
  const uncommittedFiles = useMemo(() => {
    if (!diffFiles) return [];
    return diffFiles.filter(
      (f) =>
        f.stagingStatus === "unstaged" ||
        f.stagingStatus === "partial" ||
        !f.stagingStatus,
    );
  }, [diffFiles]);

  // Expand all by default on first load of uncommitted files
  useEffect(() => {
    if (uncommittedFiles.length > 0 && expandedFiles.size === 0) {
      setExpandedFiles(new Set(uncommittedFiles.map((f) => f.path)));
    }
  }, [uncommittedFiles, expandedFiles.size]);

  // Check PR merge readiness when PR exists
  useEffect(() => {
    if (!session.prNumber) return;
    let cancelled = false;

    void getMergeReadiness({ sessionId: session.id })
      .then((res) => {
        if (!cancelled) setReadiness(res);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [session.prNumber, session.id]);

  // Toggle single file accordion
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

  // Expand / collapse all files
  const allExpanded =
    uncommittedFiles.length > 0 &&
    uncommittedFiles.every((f) => expandedFiles.has(f.path));

  const toggleExpandCollapseAll = useCallback(() => {
    if (allExpanded) {
      setExpandedFiles(new Set());
    } else {
      setExpandedFiles(new Set(uncommittedFiles.map((f) => f.path)));
    }
  }, [allExpanded, uncommittedFiles]);

  const branchName = session.branch ?? "main";

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

  // Download patch file for non-GitHub or local workflows
  const handleDownloadPatch = useCallback(() => {
    const fullPatch = uncommittedFiles
      .map((f) => {
        if (!f.diff) return "";
        return `diff --git a/${f.path} b/${f.path}\n${f.diff}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!fullPatch) {
      toast.info("No patch diffs available to download");
      return;
    }

    const blob = new Blob([fullPatch], { type: "text/x-diff;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `changes-${session.id.slice(0, 8)}.patch`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Downloaded patch file");
  }, [uncommittedFiles, session.id]);

  // AI-powered PR generator
  const handleGeneratePrSummary = useCallback(async () => {
    setIsGeneratingPr(true);
    try {
      const res = await generatePrContent({
        sessionId: session.id,
        sessionTitle: session.title,
        baseBranch: session.branch ?? "main",
        branchName,
      });
      if (res.title) setPrTitle(res.title);
      if (res.body) setPrDescription(res.body);
      toast.success("Generated PR summary from conversation");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to generate PR summary with AI",
      );
    } finally {
      setIsGeneratingPr(false);
    }
  }, [session.id, session.title, session.branch, branchName]);

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

  // High contrast diff options dynamically resolved to active theme
  const baseDiffOptions = useMemo(
    () => getDiffOptions(resolvedTheme, diffStyle === "split"),
    [resolvedTheme, diffStyle],
  );

  const totalAdds = uncommittedFiles.reduce(
    (sum, f) => sum + (f.additions ?? 0),
    0,
  );
  const totalDels = uncommittedFiles.reduce(
    (sum, f) => sum + (f.deletions ?? 0),
    0,
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top Review/Changes Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1.5 text-xs">
        {/* Left: Branch / Local Workspace Pill + Files count + Diff Stats */}
        <div className="flex min-w-0 items-center gap-2">
          {hasRepo ? (
            <div className="flex items-center gap-1 rounded-md border border-border/80 bg-background px-2 py-0.5 text-xs font-mono font-medium shadow-2xs">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[140px]">{branchName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md border border-border/80 bg-background px-2 py-0.5 text-xs font-medium shadow-2xs">
              <Laptop className="h-3 w-3 text-muted-foreground" />
              <span>Local Workspace</span>
            </div>
          )}

          <span className="font-mono text-xs text-muted-foreground">
            {uncommittedFiles.length} file
            {uncommittedFiles.length !== 1 ? "s" : ""}
          </span>

          {(totalAdds > 0 || totalDels > 0) && (
            <div className="flex items-center gap-1 font-mono text-xs font-semibold">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{totalAdds}
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                -{totalDels}
              </span>
            </div>
          )}
        </div>

        {/* Right: Segmented Control + Actions */}
        <div className="flex items-center gap-1.5">
          {/* Segmented Control: Unified | Split */}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadPatch}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Patch</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Download as .patch diff
              </TooltipContent>
            </Tooltip>
          )}

          {!hasRepo && onCreateRepoClick && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCreateRepoClick}
              className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Github className="h-3 w-3" />
              <span>Connect GitHub</span>
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

          {hasRepo && !session.prNumber && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPrTitle(session.title || "Feature implementation");
                setCreatePrDialogOpen(true);
              }}
              className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <GitPullRequest className="h-3.5 w-3.5 text-emerald-500" />
              <span>Create PR</span>
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
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    (diffRefreshing || gitStatusLoading) && "motion-safe:animate-spin",
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
              {hasRepo ? "Working tree clean" : "No local changes"}
            </p>
            <p className="text-xs text-muted-foreground max-w-[260px]">
              {hasRepo
                ? "All files are synchronized with your active branch."
                : "No modified or uncommitted files in this sandbox."}
            </p>
            {!hasRepo && onCreateRepoClick && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateRepoClick}
                className="mt-3 gap-1.5 text-xs cursor-pointer"
              >
                <Github className="h-3.5 w-3.5" />
                <span>Connect GitHub Repository</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {uncommittedFiles.map((file) => {
              const isExpanded = expandedFiles.has(file.path);
              const patch = file.diff;
              const fileName = file.path.split("/").pop() ?? file.path;
              const dirPath = file.path.slice(0, -fileName.length);

              return (
                <div key={file.path} className="group/diff-file">
                  {/* Accordion File Header */}
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/30 hover:bg-muted/50 transition-colors select-none text-xs">
                    <button
                      type="button"
                      onClick={() => toggleFile(file.path)}
                      className="flex flex-1 items-center gap-2 min-w-0 text-left cursor-pointer"
                    >
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                          isExpanded && "rotate-90",
                        )}
                      />
                      <FileStatusIndicator status={file.status} />
                      <FileTypeIcon
                        path={file.path}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span className="font-mono text-xs truncate">
                        {dirPath && (
                          <span className="text-muted-foreground">
                            {dirPath}
                          </span>
                        )}
                        <span className="text-foreground font-semibold">
                          {fileName}
                        </span>
                      </span>
                    </button>

                    {/* Right: File line stats + file actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {(file.additions > 0 || file.deletions > 0) && (
                        <div className="flex items-center gap-1 font-mono text-[11px]">
                          {file.additions > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{file.additions}
                            </span>
                          )}
                          {file.deletions > 0 && (
                            <span className="text-rose-600 dark:text-rose-400">
                              -{file.deletions}
                            </span>
                          )}
                        </div>
                      )}

                      {onOpenFile && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenFile(file.path);
                              }}
                              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              <FileCode className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            Open file in editor tab
                          </TooltipContent>
                        </Tooltip>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDiscardFileTarget(file.path);
                            }}
                            className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          Discard changes to this file
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Accordion File Body (Diff Viewer) */}
                  {isExpanded && (
                    <div className="overflow-x-auto bg-background border-t border-border/50">
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
                          key={`${file.path}-${diffStyle}-${resolvedTheme}`}
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

      {/* Bottom Action Bar: Only rendered when an active PR is present */}
      {hasRepo && session.prNumber && (
        <div className="shrink-0 border-t border-border bg-muted/20 p-2.5">
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
        </div>
      )}

      {/* Confirmation Dialog: Discard Single File */}
      <Dialog
        open={Boolean(discardFileTarget)}
        onOpenChange={(open) => {
          if (!open) setDiscardFileTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discard File Changes?</DialogTitle>
            <DialogDescription>
              Are you sure you want to discard all changes in{" "}
              <code className="text-foreground font-mono font-semibold">
                {discardFileTarget}
              </code>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
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
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Discard All Changes */}
      <Dialog
        open={confirmDiscardAllOpen}
        onOpenChange={setConfirmDiscardAllOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discard All Uncommitted Changes?</DialogTitle>
            <DialogDescription>
              This will revert all modified, added, and deleted files in your
              sandbox. All uncommitted work will be permanently lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
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
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Discard All Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create PR Dialog with AI Generator */}
      <Dialog open={createPrDialogOpen} onOpenChange={setCreatePrDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Open Pull Request</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGeneratePrSummary}
                disabled={isGeneratingPr}
                className="h-7 px-2 text-xs gap-1.5 text-primary hover:bg-primary/10 cursor-pointer"
              >
                {isGeneratingPr ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 text-purple-500" />
                )}
                <span>Auto-Summarize</span>
              </Button>
            </DialogTitle>
            <DialogDescription>
              Create a GitHub pull request from{" "}
              <code className="text-foreground font-mono">{branchName}</code>{" "}
              into <code className="text-foreground font-mono">main</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                PR Title
              </label>
              <Input
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                placeholder="Brief summary of changes..."
                className="h-8 text-xs font-mono"
              />
            </div>
            {prDescription && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Description
                </label>
                <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs font-mono whitespace-pre-wrap">
                  {prDescription}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={isCreatingPr}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={!prTitle.trim() || isCreatingPr}
              onClick={() => void handleCreatePr()}
              className="gap-1.5"
            >
              {isCreatingPr ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitPullRequest className="h-3.5 w-3.5 text-emerald-500" />
              )}
              Create Pull Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
