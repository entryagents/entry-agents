"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Sparkles,
  SquareDot,
  SquareMinus,
  SquarePlus,
  Trash2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DiffFile } from "@/app/api/sessions/[sessionId]/diff/route";
import type { WebAgentUIMessage } from "@/app/types";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SessionGitStatus } from "@/hooks/use-session-git-status";
import type { Session } from "@/lib/db/schema";
import { createBranch } from "@/lib/git/actions/branch";
import { discardChanges } from "@/lib/git/actions/discard";
import { commitChanges } from "@/lib/github/actions/commit";
import { cn } from "@/lib/utils";
import { useGitPanel } from "./git-panel-context";
import { useSessionChatWorkspaceContext } from "./session-chat-context";

interface DesktopCommitCockpitProps {
  session: Session;
  hasSandbox: boolean;
  hasRepo: boolean;
  gitStatus: SessionGitStatus | null;
  refreshGitStatus: () => Promise<SessionGitStatus | undefined>;
  diffFiles: DiffFile[] | null;
  refreshDiff: () => Promise<void>;
  onCommitted?: () => Promise<void> | void;
  onGitMessage?: (message: WebAgentUIMessage) => Promise<void> | void;
  isAgentWorking: boolean;
  baseBranch: string;
  connectionStatus: string | null;
  reconnectRequired: boolean;
  onOpenCreatePr?: () => void;
  hasExistingPr?: boolean;
  existingPrUrl?: string | null;
}

function DiffFileStatusBadge({ status }: { status: DiffFile["status"] }) {
  if (status === "added") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-green-500/30 bg-green-500/10 font-mono text-[9px] font-bold text-green-500">
        A
      </span>
    );
  }
  if (status === "deleted") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-red-500/30 bg-red-500/10 font-mono text-[9px] font-bold text-red-500">
        D
      </span>
    );
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-amber-500/30 bg-amber-500/10 font-mono text-[9px] font-bold text-amber-500">
      M
    </span>
  );
}

function isUncommittedFile(file: DiffFile): boolean {
  return file.stagingStatus === "unstaged" || file.stagingStatus === "partial";
}

export function DesktopCommitCockpit({
  session,
  hasSandbox,
  hasRepo,
  gitStatus,
  refreshGitStatus,
  diffFiles,
  refreshDiff,
  onCommitted,
  onGitMessage,
  isAgentWorking,
  baseBranch,
  connectionStatus,
  reconnectRequired,
  onOpenCreatePr,
  hasExistingPr,
  existingPrUrl,
}: DesktopCommitCockpitProps) {
  const { openDiffToFile, diffScope, setDiffScope, focusedDiffFile } =
    useGitPanel();
  const { refreshFiles } = useSessionChatWorkspaceContext();

  const [commitTitle, setCommitTitle] = useState("");
  const [commitBody, setCommitBody] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  // Staged files set: by default, all available files are staged
  const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());

  // Branch creation
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [resolvedBranch, setResolvedBranch] = useState<string | null>(null);

  // Discarding
  const [discardingPath, setDiscardingPath] = useState<string | null>(null);

  const branchFromStatus =
    resolvedBranch ??
    (gitStatus?.branch && gitStatus.branch !== "HEAD"
      ? gitStatus.branch
      : null);
  const currentBranch = branchFromStatus ?? session.branch ?? baseBranch;
  const displayBranch = currentBranch === "HEAD" ? baseBranch : currentBranch;
  const isDetachedHead = gitStatus?.isDetachedHead ?? false;
  const needsNewBranch = displayBranch === baseBranch || isDetachedHead;

  // Filter files based on scope and search query
  const scopedFiles = useMemo(() => {
    if (!diffFiles) return [];
    const base =
      diffScope === "branch" ? diffFiles : diffFiles.filter(isUncommittedFile);
    if (!searchFilter.trim()) return base;
    const lower = searchFilter.toLowerCase();
    return base.filter((f) => f.path.toLowerCase().includes(lower));
  }, [diffFiles, diffScope, searchFilter]);

  // Keep staged files in sync with available files on first load
  useEffect(() => {
    if (diffFiles && diffFiles.length > 0) {
      setStagedFiles((prev) => {
        if (prev.size === 0) {
          return new Set(diffFiles.map((f) => f.path));
        }
        return prev;
      });
    }
  }, [diffFiles]);

  const allScopedStaged =
    scopedFiles.length > 0 && scopedFiles.every((f) => stagedFiles.has(f.path));
  const someScopedStaged =
    scopedFiles.some((f) => stagedFiles.has(f.path)) && !allScopedStaged;

  const toggleSelectAll = useCallback(() => {
    setStagedFiles((prev) => {
      const next = new Set(prev);
      if (allScopedStaged) {
        for (const file of scopedFiles) {
          next.delete(file.path);
        }
      } else {
        for (const file of scopedFiles) {
          next.add(file.path);
        }
      }
      return next;
    });
  }, [allScopedStaged, scopedFiles]);

  const toggleStageFile = useCallback((path: string) => {
    setStagedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleGenerateMessage = useCallback(async () => {
    if (isGeneratingMessage || !hasSandbox) return;
    setIsGeneratingMessage(true);
    setCommitError(null);

    try {
      const res = await fetch(
        `/api/sessions/${session.id}/generate-commit-message`,
        { method: "POST" },
      );
      if (!res.ok) {
        throw new Error("Failed to generate commit message");
      }
      const data = (await res.json()) as {
        message?: string;
        title?: string;
        body?: string;
      };

      if (data.title) {
        setCommitTitle(data.title);
        setCommitBody(data.body ?? "");
      } else if (data.message) {
        const lines = data.message.split("\n");
        setCommitTitle(lines[0] ?? "");
        setCommitBody(lines.slice(1).join("\n").trim());
      }
      toast.success("AI commit message drafted");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not generate commit message",
      );
    } finally {
      setIsGeneratingMessage(false);
    }
  }, [hasSandbox, isGeneratingMessage, session.id]);

  const handleCreateBranch = useCallback(async () => {
    if (!hasSandbox) return;
    setIsCreatingBranch(true);
    setCommitError(null);
    try {
      const result = await createBranch({
        sessionId: session.id,
        sessionTitle: session.title,
        baseBranch,
        branchName: displayBranch,
      });
      if (result.branchName !== "HEAD") {
        setResolvedBranch(result.branchName);
      }
      await refreshGitStatus();
      toast.success(`Created branch ${result.branchName}`);
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : "Failed to create branch",
      );
    } finally {
      setIsCreatingBranch(false);
    }
  }, [
    baseBranch,
    displayBranch,
    hasSandbox,
    refreshGitStatus,
    session.id,
    session.title,
  ]);

  const handleDiscardSingleFile = useCallback(
    async (file: DiffFile) => {
      if (isAgentWorking || !hasSandbox) return;
      setDiscardingPath(file.path);
      try {
        await discardChanges({
          sessionId: session.id,
          filePath: file.path,
          ...(file.oldPath ? { oldPath: file.oldPath } : {}),
        });
        await Promise.allSettled([
          refreshDiff(),
          refreshGitStatus(),
          refreshFiles(),
        ]);
        toast.success(`Discarded changes in ${file.path.split("/").pop()}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to discard file changes",
        );
      } finally {
        setDiscardingPath(null);
      }
    },
    [
      hasSandbox,
      isAgentWorking,
      refreshDiff,
      refreshFiles,
      refreshGitStatus,
      session.id,
    ],
  );

  const handleCommit = useCallback(async () => {
    if (
      !hasSandbox ||
      stagedFiles.size === 0 ||
      isCommitting ||
      isAgentWorking
    ) {
      return;
    }

    setIsCommitting(true);
    setCommitError(null);
    setCommitSuccess(null);

    const gitMessageId = crypto.randomUUID();
    const commitPartId = `${gitMessageId}:commit`;

    try {
      await onGitMessage?.({
        id: gitMessageId,
        role: "assistant",
        metadata: {},
        parts: [
          {
            type: "data-commit",
            id: commitPartId,
            data: { status: "pending" },
          },
        ],
      });

      const selectedPaths = Array.from(stagedFiles);
      const result = await commitChanges({
        sessionId: session.id,
        sessionTitle: session.title,
        baseBranch,
        branchName: displayBranch,
        commitTitle: commitTitle.trim() || undefined,
        commitBody: commitBody.trim() || undefined,
        filePaths: selectedPaths,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.branchName && result.branchName !== "HEAD") {
        setResolvedBranch(result.branchName);
      }

      setCommitSuccess(result.commitMessage ?? "Changes committed & pushed");
      setCommitTitle("");
      setCommitBody("");

      const commitUrl =
        result.commitSha && session.repoOwner && session.repoName
          ? `https://github.com/${session.repoOwner}/${session.repoName}/commit/${result.commitSha}`
          : undefined;

      await onGitMessage?.({
        id: gitMessageId,
        role: "assistant",
        metadata: {},
        parts: [
          {
            type: "data-commit",
            id: commitPartId,
            data: {
              status: "success",
              committed: result.committed,
              pushed: result.pushed,
              commitMessage: result.commitMessage,
              commitSha: result.commitSha,
              url: commitUrl,
            },
          },
        ],
      });

      await Promise.allSettled([
        refreshGitStatus(),
        refreshDiff(),
        refreshFiles(),
      ]);
      await onCommitted?.();
      toast.success("Committed and pushed successfully");

      setTimeout(() => setCommitSuccess(null), 4000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to commit changes";
      await onGitMessage?.({
        id: gitMessageId,
        role: "assistant",
        metadata: {},
        parts: [
          {
            type: "data-commit",
            id: commitPartId,
            data: {
              status: "error",
              error: errorMessage,
            },
          },
        ],
      });
      setCommitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsCommitting(false);
    }
  }, [
    baseBranch,
    commitBody,
    commitTitle,
    displayBranch,
    hasSandbox,
    isAgentWorking,
    isCommitting,
    onCommitted,
    onGitMessage,
    refreshDiff,
    refreshFiles,
    refreshGitStatus,
    session.id,
    session.repoName,
    session.repoOwner,
    session.title,
    stagedFiles,
  ]);

  // Keyboard shortcut: Cmd/Ctrl + Enter to commit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (
          !needsNewBranch &&
          stagedFiles.size > 0 &&
          !isCommitting &&
          !isAgentWorking
        ) {
          e.preventDefault();
          void handleCommit();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleCommit,
    isAgentWorking,
    isCommitting,
    needsNewBranch,
    stagedFiles.size,
  ]);

  // Summary counts
  const totalAdds = scopedFiles.reduce((acc, f) => acc + f.additions, 0);
  const totalDels = scopedFiles.reduce((acc, f) => acc + f.deletions, 0);

  return (
    <div className="flex h-full flex-col bg-background/95">
      {/* Cockpit Header Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/80 bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="max-w-[140px] truncate font-mono text-[11px]">
              {displayBranch}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] font-mono">
            {totalAdds > 0 && (
              <span className="font-semibold text-green-600 dark:text-green-400">
                +{totalAdds}
              </span>
            )}
            {totalDels > 0 && (
              <span className="font-semibold text-red-600 dark:text-red-400">
                -{totalDels}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              void Promise.allSettled([
                refreshDiff(),
                refreshGitStatus(),
                refreshFiles(),
              ]);
            }}
            title="Refresh changes"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          {hasExistingPr && existingPrUrl ? (
            <a
              href={existingPrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1 rounded border border-border bg-card px-2 text-xs font-medium text-foreground hover:bg-accent"
              title="Open Pull Request on GitHub"
            >
              <GitPullRequest className="h-3 w-3 text-purple-400" />
              <span>PR #{session.prNumber}</span>
              <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />
            </a>
          ) : onOpenCreatePr ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onOpenCreatePr}
              title="Create GitHub Pull Request"
            >
              <GitPullRequest className="mr-1 h-3 w-3" />
              <span>Create PR</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Scope Switcher & Search Filter */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/10 px-3 py-1.5">
        <div className="flex items-center gap-1 rounded bg-muted/40 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setDiffScope("uncommitted")}
            className={cn(
              "rounded px-2 py-0.5 font-medium transition-colors",
              diffScope === "uncommitted"
                ? "bg-secondary text-secondary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Uncommitted
          </button>
          <button
            type="button"
            onClick={() => setDiffScope("branch")}
            className={cn(
              "rounded px-2 py-0.5 font-medium transition-colors",
              diffScope === "branch"
                ? "bg-secondary text-secondary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Branch
          </button>
        </div>

        <div className="relative min-w-[130px] max-w-[180px]">
          <Input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter files..."
            className="h-6 px-2 text-[11px]"
          />
        </div>
      </div>

      {/* Staging Select-All Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3 py-1 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={allScopedStaged}
            ref={(el) => {
              if (el) el.indeterminate = someScopedStaged;
            }}
            onChange={toggleSelectAll}
            className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-card accent-primary"
          />
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Staged for commit ({stagedFiles.size}/{scopedFiles.length})
          </span>
        </label>
      </div>

      {/* Scrollable File Changes List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5 font-mono text-xs">
        {scopedFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <FileText className="mb-2 h-7 w-7 opacity-30" />
            <p className="text-xs">
              {diffScope === "uncommitted"
                ? "No uncommitted modifications"
                : "No files changed on this branch"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {scopedFiles.map((file) => {
              const isStaged = stagedFiles.has(file.path);
              const isFocused = focusedDiffFile === file.path;
              const fileName = file.path.split("/").pop() ?? file.path;
              const dirPath = file.path.slice(0, -fileName.length);

              return (
                <div
                  key={file.path}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                    isFocused
                      ? "bg-accent text-accent-foreground ring-1 ring-border"
                      : "hover:bg-muted/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isStaged}
                    onChange={() => toggleStageFile(file.path)}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-card accent-primary"
                    title={isStaged ? "Unstage file" : "Stage file"}
                  />

                  <DiffFileStatusBadge status={file.status} />

                  <button
                    type="button"
                    onClick={() => openDiffToFile(file.path)}
                    className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left select-none"
                  >
                    <span className="truncate font-medium text-foreground">
                      {fileName}
                    </span>
                    {dirPath && (
                      <span className="truncate text-[10px] text-muted-foreground/70">
                        {dirPath.replace(/\/$/, "")}
                      </span>
                    )}
                  </button>

                  <div className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
                    {file.additions > 0 && (
                      <span className="text-green-600 dark:text-green-400">
                        +{file.additions}
                      </span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-red-600 dark:text-red-400">
                        -{file.deletions}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDiscardSingleFile(file)}
                    disabled={isAgentWorking || discardingPath === file.path}
                    className="rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed"
                    title="Discard changes in this file"
                  >
                    {discardingPath === file.path ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Docked Desktop Commit Studio Composer */}
      <div className="shrink-0 border-t border-border/80 bg-card/60 p-3">
        {needsNewBranch ? (
          <div className="space-y-2">
            <div className="rounded border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {isDetachedHead
                ? "Detached HEAD state. Create a branch to commit your changes."
                : `Currently on base branch (${baseBranch}). Create a new branch first.`}
            </div>
            <Button
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={() => void handleCreateBranch()}
              disabled={isAgentWorking || isCreatingBranch || !hasSandbox}
            >
              {isCreatingBranch ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Creating branch...
                </>
              ) : (
                <>
                  <GitBranch className="mr-1.5 h-3.5 w-3.5" />
                  Create Branch & Continue
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Commit & Push
              </span>
              <button
                type="button"
                onClick={() => void handleGenerateMessage()}
                disabled={
                  isGeneratingMessage || !hasSandbox || stagedFiles.size === 0
                }
                className="flex items-center gap-1 text-[11px] font-medium text-purple-500 transition hover:text-purple-400 disabled:opacity-40"
                title="Auto-draft commit message using AI"
              >
                {isGeneratingMessage ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                <span>Generate with AI</span>
              </button>
            </div>

            <Input
              value={commitTitle}
              onChange={(e) => setCommitTitle(e.target.value)}
              placeholder="Commit subject (e.g. feat: add payment flow)"
              className="h-7 text-xs font-mono"
              disabled={isCommitting || isAgentWorking}
            />

            <Textarea
              value={commitBody}
              onChange={(e) => setCommitBody(e.target.value)}
              placeholder="Extended description (optional)..."
              rows={2}
              className="resize-none text-xs font-mono"
              disabled={isCommitting || isAgentWorking}
            />

            {commitSuccess && (
              <div className="flex items-center gap-1.5 rounded bg-green-500/10 p-2 text-xs text-green-600 dark:text-green-400">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{commitSuccess}</span>
              </div>
            )}

            {commitError && (
              <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                {commitError}
              </div>
            )}

            <Button
              size="sm"
              className="w-full text-xs font-semibold"
              onClick={() => void handleCommit()}
              disabled={
                isCommitting ||
                isAgentWorking ||
                !hasSandbox ||
                stagedFiles.size === 0
              }
            >
              {isCommitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Committing {stagedFiles.size} file(s)...
                </>
              ) : (
                <>
                  <GitCommit className="mr-1.5 h-3.5 w-3.5" />
                  <span>
                    Commit & Push ({stagedFiles.size} file
                    {stagedFiles.size !== 1 ? "s" : ""})
                  </span>
                  <span className="ml-1.5 font-mono text-[10px] text-primary-foreground/70">
                    ⌘Enter
                  </span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
