"use client";

import {
  Check,
  ChevronDown,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitCompare,
  GitMerge,
  GitPullRequest,
  Loader2,
  PenLine,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { GitPanelProps } from "../git-panel";
import { useGitPanel } from "../git-panel-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckRunsList } from "@/components/merge-check-runs";
import { commitChanges } from "@/lib/github/actions/commit";
import { discardChanges } from "@/lib/git/actions/discard";
import {
  generatePrContent,
  openPullRequest,
  mergePr,
} from "@/lib/github/actions/pr";
import {
  getMergeReadiness,
  type MergeReadinessResponse,
} from "@/lib/github/queries/pr";
import type { MergeMethod } from "@/lib/github/pulls";
import { FileTypeIcon } from "@/components/file-type-icons";
import { cn } from "@/lib/utils";

export function WorkspaceGitTab(props: GitPanelProps) {
  const {
    session,
    hasRepo,
    hasExistingPr,
    existingPrUrl,
    diffFiles,
    diffSummary,
    refreshDiff,
    gitStatus: _gitStatus,
    gitStatusLoading,
    refreshGitStatus,
    onCommitted,
    isAgentWorking,
    hasSandbox: _hasSandbox,
    onMerged,
    onFixChecks,
    onCreateRepoClick,
  } = props;

  const { openFileTab, openDiffToFile } = useGitPanel();

  // Commit state
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Discard state
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);
  const [isDiscardingAll, setIsDiscardingAll] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // PR state
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [isGeneratingPr, setIsGeneratingPr] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  // Merge state
  const [readiness, setReadiness] = useState<MergeReadinessResponse | null>(
    null,
  );
  const [isSubmittingMerge, setIsSubmittingMerge] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash");
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

  const uncommittedFiles =
    diffFiles?.filter(
      (f) =>
        f.status === "added" ||
        f.status === "modified" ||
        f.status === "deleted",
    ) ?? [];

  const totalAdds = diffSummary?.totalAdditions ?? 0;
  const totalDels = diffSummary?.totalDeletions ?? 0;
  const baseBranch = "main";
  const displayBranch = session.branch || "main";

  // Poll PR merge readiness if PR exists
  useEffect(() => {
    if (!hasExistingPr || !session.prNumber) return;

    let cancelled = false;
    const fetchReadiness = async () => {
      try {
        const res = await getMergeReadiness({ sessionId: session.id });
        if (!cancelled && res) {
          setReadiness(res);
        }
      } catch {
        // Best-effort polling; next tick retries automatically.
      }
    };

    void fetchReadiness();
    const interval = setInterval(fetchReadiness, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasExistingPr, session.id, session.prNumber]);

  // AI commit message generator
  const handleGenerateMessage = async () => {
    setIsGeneratingMessage(true);
    setCommitError(null);
    try {
      const res = await fetch(
        `/api/sessions/${session.id}/generate-commit-message`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      if (data.message) {
        setCommitMessage(data.message);
      } else if (data.error) {
        setCommitError(data.error);
      }
    } catch {
      setCommitError("Failed to generate commit message.");
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  // Perform commit
  const handleCommit = async () => {
    if (!commitMessage.trim() || isCommitting || isAgentWorking) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      const trimmed = commitMessage.trim();
      const lines = trimmed.split("\n");
      const commitTitle = lines[0] ?? "";
      const commitBody = lines.slice(1).join("\n").trim();

      const result = await commitChanges({
        sessionId: session.id,
        sessionTitle: session.title,
        baseBranch,
        branchName: displayBranch,
        ...(commitTitle ? { commitTitle, commitBody } : {}),
      });

      if (result.error) {
        setCommitError(result.error);
      } else {
        setCommitMessage("");
        await refreshGitStatus();
        await refreshDiff();
        if (onCommitted) await onCommitted();
      }
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : "Error committing changes.",
      );
    } finally {
      setIsCommitting(false);
    }
  };

  // Perform single file discard
  const handleDiscardSingle = async (filePath: string) => {
    setIsDiscarding(true);
    try {
      const res = await discardChanges({ sessionId: session.id, filePath });
      if (res.discarded) {
        setDiscardTarget(null);
        await refreshGitStatus();
        await refreshDiff();
      }
    } catch {
      // Discard dialog stays open for retry on failure.
    } finally {
      setIsDiscarding(false);
    }
  };

  // Perform discard all
  const handleDiscardAll = async () => {
    setIsDiscarding(true);
    try {
      const res = await discardChanges({ sessionId: session.id });
      if (res.discarded) {
        setIsDiscardingAll(false);
        await refreshGitStatus();
        await refreshDiff();
      }
    } catch {
      // Discard confirmation dialog remains visible on error.
    } finally {
      setIsDiscarding(false);
    }
  };

  // AI PR Content Generator
  const handleGeneratePr = async () => {
    setIsGeneratingPr(true);
    setPrError(null);
    try {
      const content = await generatePrContent({
        sessionId: session.id,
        sessionTitle: session.title,
        baseBranch,
        branchName: displayBranch,
      });
      if (content.title) setPrTitle(content.title);
      if (content.body) setPrBody(content.body);
    } catch {
      setPrError("Failed to generate PR content.");
    } finally {
      setIsGeneratingPr(false);
    }
  };

  // Create PR
  const handleCreatePr = async () => {
    if (!prTitle.trim() || isCreatingPr) return;
    setIsCreatingPr(true);
    setPrError(null);
    try {
      const res = await openPullRequest({
        sessionId: session.id,
        repoUrl: session.cloneUrl ?? "",
        branchName: displayBranch,
        title: prTitle.trim(),
        body: prBody.trim(),
        baseBranch,
      });
      if (res.success) {
        await refreshGitStatus();
      } else {
        setPrError(res.error ?? "Failed to create pull request.");
      }
    } catch (err) {
      setPrError(err instanceof Error ? err.message : "Error creating PR.");
    } finally {
      setIsCreatingPr(false);
    }
  };

  // Handle Merge PR
  const handleMergePr = async (force = false) => {
    if (!session.prNumber || isSubmittingMerge) return;
    setIsSubmittingMerge(true);
    setMergeError(null);
    try {
      const res = await mergePr({
        sessionId: session.id,
        mergeMethod,
        deleteBranch: true,
        expectedHeadSha: readiness?.pr?.headSha ?? undefined,
        ...(force ? { force: true } : {}),
      });
      if (res.merged) {
        await onMerged(res);
      } else {
        setMergeError("Failed to merge pull request.");
      }
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Error merging PR.");
    } finally {
      setIsSubmittingMerge(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshingStatus(true);
    try {
      await Promise.all([refreshGitStatus(), refreshDiff()]);
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-background p-3 space-y-4">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 font-mono font-medium text-foreground">
            <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="truncate">{displayBranch}</span>
          </div>

          {session.repoName && (
            <span className="text-muted-foreground truncate hidden sm:inline">
              ({session.repoOwner ? `${session.repoOwner}/` : ""}
              {session.repoName})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasExistingPr && existingPrUrl ? (
            <a
              href={existingPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors"
            >
              <GitPullRequest className="h-3 w-3" />
              <span>#{session.prNumber}</span>
              <ExternalLink className="h-2.5 w-2.5 ml-0.5 opacity-70" />
            </a>
          ) : !hasRepo ? (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={onCreateRepoClick}
            >
              Connect Repo
            </Button>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={handleManualRefresh}
                disabled={isRefreshingStatus || gitStatusLoading}
              >
                <RefreshCw
                  className={cn(
                    "h-3 w-3",
                    (isRefreshingStatus || gitStatusLoading) && "animate-spin",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh Git Status</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 2. Source Control & Commit Box */}
      <div className="rounded-lg border border-border bg-card p-3 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Commit to {displayBranch}</span>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={handleGenerateMessage}
                disabled={isGeneratingMessage || uncommittedFiles.length === 0}
              >
                {isGeneratingMessage ? (
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                ) : (
                  <PenLine className="h-3 w-3" strokeWidth={1.5} />
                )}
                <span>Draft message</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Draft conventional commit message from diff
            </TooltipContent>
          </Tooltip>
        </div>

        <Textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void handleCommit();
            }
          }}
          placeholder={
            uncommittedFiles.length === 0
              ? "Working tree clean. No changes to commit."
              : "Commit message (Ctrl+Enter to commit)..."
          }
          disabled={uncommittedFiles.length === 0 || isCommitting}
          className="min-h-[64px] resize-none text-xs font-mono"
        />

        {commitError && (
          <p className="text-[11px] text-destructive leading-tight">
            {commitError}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {uncommittedFiles.length} file
            {uncommittedFiles.length !== 1 ? "s" : ""} to commit
          </span>

          <Button
            size="sm"
            onClick={handleCommit}
            disabled={
              !commitMessage.trim() ||
              uncommittedFiles.length === 0 ||
              isCommitting ||
              isAgentWorking
            }
            className="h-7 text-xs font-medium px-3 gap-1.5"
          >
            {isCommitting ? (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
            ) : (
              <Check className="h-3 w-3" strokeWidth={1.5} />
            )}
            <span>Commit</span>
          </Button>
        </div>
      </div>

      {/* 3. Changes Section (Working Tree) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Changes</span>
            <span className="rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px] tabular-nums">
              {uncommittedFiles.length}
            </span>
            {(totalAdds > 0 || totalDels > 0) && (
              <span className="font-mono text-[10px] tabular-nums">
                {totalAdds > 0 && (
                  <span className="text-emerald-500">+{totalAdds} </span>
                )}
                {totalDels > 0 && (
                  <span className="text-rose-500">-{totalDels}</span>
                )}
              </span>
            )}
          </div>

          {uncommittedFiles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDiscardingAll(true)}
              className="h-5 text-[10px] text-muted-foreground hover:text-destructive px-1.5"
            >
              Discard all
            </Button>
          )}
        </div>

        {uncommittedFiles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            No uncommitted changes. Working tree is clean.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border/60 overflow-hidden">
            {uncommittedFiles.map((file) => {
              const name = file.path.split("/").pop() ?? file.path;
              const dir = file.path.slice(0, -name.length);

              return (
                <div
                  key={file.path}
                  className="group flex items-center justify-between px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => openFileTab(file.path)}
                    className="flex flex-1 items-center gap-2 min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:underline"
                  >
                    <FileTypeIcon
                      path={file.path}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <div className="flex items-baseline gap-1 min-w-0 font-mono">
                      <span className="font-medium text-foreground truncate">
                        {name}
                      </span>
                      {dir && (
                        <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                          {dir}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 font-mono text-[10px] tabular-nums">
                      {file.additions > 0 && (
                        <span className="text-emerald-500">
                          +{file.additions}
                        </span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-rose-500">-{file.deletions}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDiffToFile(file.path);
                            }}
                          >
                            <GitCompare className="h-3 w-3" strokeWidth={1.5} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">View diff</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDiscardTarget(file.path);
                            }}
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          Discard changes
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Pull Request Center */}
      {hasExistingPr ? (
        <div className="space-y-3 rounded-lg border border-border/80 bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <GitPullRequest
                className="h-3.5 w-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="tabular-nums">
                Pull request #{session.prNumber}
              </span>
            </div>

            {existingPrUrl && (
              <a
                href={existingPrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <span>GitHub</span>
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={1.5} />
              </a>
            )}
          </div>

          {/* CI Checks */}
          {readiness?.checkRuns && readiness.checkRuns.length > 0 && (
            <div className="rounded-md border border-border/80 bg-background/50 p-2 space-y-2">
              <CheckRunsList
                checkRuns={readiness.checkRuns}
                onFixChecks={onFixChecks}
              />
            </div>
          )}

          {mergeError && (
            <p className="text-[11px] text-destructive leading-tight">
              {mergeError}
            </p>
          )}

          {/* Merge Button */}
          {session.prStatus !== "merged" && session.prStatus !== "closed" && (
            <div className="flex items-center gap-2 pt-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={isSubmittingMerge || !readiness?.canMerge}
                    className="h-7 text-xs flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmittingMerge ? (
                      <Loader2
                        className="h-3 w-3 animate-spin"
                        strokeWidth={1.5}
                      />
                    ) : (
                      <GitMerge className="h-3 w-3" strokeWidth={1.5} />
                    )}
                    <span>Merge PR ({mergeMethod})</span>
                    <ChevronDown
                      className="h-3 w-3 opacity-60"
                      strokeWidth={1.5}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setMergeMethod("squash")}>
                    Squash and merge
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMergeMethod("merge")}>
                    Create a merge commit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMergeMethod("rebase")}>
                    Rebase and merge
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMergePr(false)}
                disabled={isSubmittingMerge || !readiness?.canMerge}
                className="h-7 text-xs"
              >
                Confirm
              </Button>
            </div>
          )}
        </div>
      ) : hasRepo ? (
        <div className="rounded-lg border border-border bg-card p-3 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <div className="flex items-center gap-1.5">
              <GitPullRequest
                className="h-3.5 w-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span>Create pull request</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleGeneratePr}
              disabled={isGeneratingPr || isCreatingPr}
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              {isGeneratingPr ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <PenLine className="h-3 w-3" strokeWidth={1.5} />
              )}
              <span>Draft PR details</span>
            </Button>
          </div>

          <Input
            placeholder="PR Title"
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            disabled={isCreatingPr}
            className="h-7 text-xs"
          />

          <Textarea
            placeholder="PR Description (optional)..."
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
            disabled={isCreatingPr}
            className="min-h-[60px] resize-none text-xs"
          />

          {prError && (
            <p className="text-[11px] text-destructive leading-tight">
              {prError}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              onClick={handleCreatePr}
              disabled={
                !prTitle.trim() || isCreatingPr || uncommittedFiles.length > 0
              }
              className="h-7 text-xs px-3 gap-1.5"
            >
              {isCreatingPr ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <GitPullRequest className="h-3 w-3" />
              )}
              <span>Open Pull Request</span>
            </Button>
          </div>
        </div>
      ) : null}

      {/* Discard Single File Dialog */}
      <Dialog
        open={discardTarget !== null}
        onOpenChange={(open) => !open && setDiscardTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes</DialogTitle>
            <DialogDescription>
              Are you sure you want to discard changes in{" "}
              <code className="font-mono text-foreground">{discardTarget}</code>
              ? This cannot be undone.
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
              onClick={() =>
                discardTarget && handleDiscardSingle(discardTarget)
              }
            >
              {isDiscarding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard All Dialog */}
      <Dialog open={isDiscardingAll} onOpenChange={setIsDiscardingAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard all changes</DialogTitle>
            <DialogDescription>
              Are you sure you want to discard all uncommitted changes across{" "}
              {uncommittedFiles.length} file
              {uncommittedFiles.length !== 1 ? "s" : ""}? All modifications will
              be permanently lost.
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
              onClick={handleDiscardAll}
            >
              {isDiscarding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Discard All Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
