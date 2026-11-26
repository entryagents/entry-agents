"use client";

import type { DiffLineAnnotation, FileDiffOptions } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import {
  ArrowUp,
  AtSign,
  CheckCircle2,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Github,
  Laptop,
  Loader2,
  PenLine,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/app/providers";
import { FileTypeIcon } from "@/components/file-type-icons";
import {
  type DiffAnnotationMetadata,
  DiffCommentCard,
  DiffCommentComposer,
} from "@/components/review/diff-comment-card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getDiffOptions } from "@/lib/diffs-config";
import { discardChanges } from "@/lib/git/actions/discard";
import {
  generatePrContent,
  mergePr,
  openPullRequest,
} from "@/lib/github/actions/pr";
import {
  getMergeReadiness,
  type MergeReadinessResponse,
} from "@/lib/github/queries/pr";
import { extractPatchLines } from "@/lib/review/model";
import { cn } from "@/lib/utils";
import type { GitPanelProps } from "../git-panel";
import { useGitPanel } from "../git-panel-context";
import { useReview } from "../review-context";

export type WorkspaceReviewTabProps = GitPanelProps & {
  onOpenFile?: (filePath: string) => void;
  onMentionInChat?: (mention: string) => void;
};

export function WorkspaceReviewTab({
  session,
  hasRepo,
  hasExistingPr: _hasExistingPr,
  existingPrUrl,
  diffFiles,
  diffSummary: _diffSummary,
  diffRefreshing = false,
  refreshDiff,
  gitStatus,
  gitStatusLoading = false,
  refreshGitStatus,
  onCommitted: _onCommitted,
  onMerged,
  hasSandbox,
  onOpenFile,
  onMentionInChat,
  onCreateRepoClick,
}: WorkspaceReviewTabProps) {
  const { resolvedTheme } = useTheme();
  const { focusedDiffFile, focusedDiffRequestId } = useGitPanel();
  const {
    comments: reviewComments,
    draft: reviewDraft,
    openDraft,
    closeDraft,
    addComment,
    editComment,
    removeComment,
  } = useReview();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const [discardFileTarget, setDiscardFileTarget] = useState<string | null>(
    null,
  );
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const [createPrDialogOpen, setCreatePrDialogOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prDescription, setPrDescription] = useState("");
  const [isGeneratingPr, setIsGeneratingPr] = useState(false);
  const [isCreatingPr, setIsCreatingPr] = useState(false);

  const [isMerging, setIsMerging] = useState(false);
  const [readiness, setReadiness] = useState<MergeReadinessResponse | null>(
    null,
  );

  const uncommittedFiles = useMemo(() => diffFiles ?? [], [diffFiles]);
  const [revealedLargeDiffs, setRevealedLargeDiffs] = useState<Set<string>>(
    () => new Set(),
  );
  const didInitExpandRef = useRef(false);

  // Auto-expand only small change sets (<= 4 files and <= 40 KB total patch)
  // so opening a large diff never mounts dozens of Shiki/Shadow-DOM PatchDiff
  // instances simultaneously and crashes Chrome.
  useEffect(() => {
    if (didInitExpandRef.current || uncommittedFiles.length === 0) return;
    didInitExpandRef.current = true;
    const totalPatchChars = uncommittedFiles.reduce(
      (sum, f) => sum + (f.diff?.length ?? 0),
      0,
    );
    if (uncommittedFiles.length <= 4 && totalPatchChars <= 40_000) {
      setExpandedFiles(new Set(uncommittedFiles.map((f) => f.path)));
    } else {
      const firstSmall = uncommittedFiles.find(
        (f) => !f.binary && !f.generated && (f.diff?.length ?? 0) <= 25_000,
      );
      if (firstSmall) {
        setExpandedFiles(new Set([firstSmall.path]));
      }
    }
  }, [uncommittedFiles]);

  // Auto-expand and scroll to focusedDiffFile when openDiffToFile is triggered
  useEffect(() => {
    if (!focusedDiffFile) return;
    setExpandedFiles((prev) => {
      if (prev.has(focusedDiffFile)) return prev;
      return new Set([...prev, focusedDiffFile]);
    });

    const raf = window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const items = container.querySelectorAll<HTMLElement>(
        "[data-diff-file-path]",
      );
      for (const el of items) {
        if (el.dataset.diffFilePath === focusedDiffFile) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        }
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [focusedDiffFile, focusedDiffRequestId]);

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

  const branchName = gitStatus?.branch || session.branch || "main";

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
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Downloaded patch file");
  }, [uncommittedFiles, session.id]);

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
    <div className="rail-col">
      {/* Sable 1:1 Changes Bar */}
      <div className="ch-bar flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasRepo ? (
            <span className="rail-bar-title ch-branch truncate">
              <GitBranch size={14} strokeWidth={1.6} aria-hidden="true" />
              <span className="truncate">{branchName}</span>
              {gitStatus?.hasUnpushedCommits ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ch-ab num">
                      <ArrowUp size={10} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Unpushed commits
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </span>
          ) : (
            <span className="rail-bar-title ch-branch truncate">
              <Laptop size={14} strokeWidth={1.6} aria-hidden="true" />
              <span className="truncate">Edited in this session</span>
            </span>
          )}

          {uncommittedFiles.length > 0 && (
            <span className="rail-bar-meta ch-totals num">
              {totalAdds > 0 && (
                <span className="dv-add">
                  +{totalAdds.toLocaleString("en-US")}
                </span>
              )}
              {totalDels > 0 && (
                <span className="dv-del">
                  −{totalDels.toLocaleString("en-US")}
                </span>
              )}
              <span className="hidden sm:inline">
                in {uncommittedFiles.length}{" "}
                {uncommittedFiles.length === 1 ? "file" : "files"}
              </span>
            </span>
          )}
        </div>

        <span className="rail-bar-actions flex-wrap">
          {uncommittedFiles.length > 0 && (
            <div className="seg" role="group" aria-label="Diff view mode">
              <button
                type="button"
                className="seg-item"
                data-active={diffStyle === "unified" || undefined}
                onClick={() => setDiffStyle("unified")}
              >
                Unified
              </button>
              <button
                type="button"
                className="seg-item"
                data-active={diffStyle === "split" || undefined}
                onClick={() => setDiffStyle("split")}
              >
                Split
              </button>
            </div>
          )}

          {uncommittedFiles.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rail-btn"
                  onClick={toggleExpandCollapseAll}
                  aria-label={allExpanded ? "Collapse all" : "Expand all"}
                >
                  {allExpanded ? (
                    <ChevronsDownUp size={14} strokeWidth={1.6} aria-hidden />
                  ) : (
                    <ChevronsUpDown size={14} strokeWidth={1.6} aria-hidden />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {allExpanded ? "Collapse all" : "Expand all"}
              </TooltipContent>
            </Tooltip>
          )}

          {uncommittedFiles.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rail-btn"
                  onClick={handleDownloadPatch}
                  aria-label="Download patch"
                >
                  <Download size={14} strokeWidth={1.6} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Download as .patch</TooltipContent>
            </Tooltip>
          )}

          {!hasRepo && onCreateRepoClick && (
            <button
              type="button"
              className="sable-btn-sm"
              onClick={onCreateRepoClick}
            >
              <Github size={12.5} strokeWidth={1.7} aria-hidden="true" />
              <span className="hidden sm:inline">Connect GitHub</span>
            </button>
          )}

          {uncommittedFiles.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rail-btn hover:!text-[var(--red)]"
                  onClick={() => setConfirmDiscardAllOpen(true)}
                  aria-label="Discard all changes"
                >
                  <RotateCcw size={13.5} strokeWidth={1.6} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Discard all changes</TooltipContent>
            </Tooltip>
          )}

          {hasRepo && !session.prNumber && (
            <button
              type="button"
              className="sable-btn-sm"
              onClick={() => {
                setPrTitle(session.title || "Feature implementation");
                setCreatePrDialogOpen(true);
              }}
            >
              <GitPullRequest
                size={13}
                strokeWidth={1.7}
                className="text-emerald-500"
                aria-hidden="true"
              />
              <span>Create PR</span>
            </button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rail-btn"
                onClick={() => {
                  void refreshDiff();
                  void refreshGitStatus().catch(() => {});
                }}
                disabled={diffRefreshing || gitStatusLoading}
                aria-label="Refresh changes"
              >
                <RefreshCw
                  size={14}
                  strokeWidth={1.6}
                  className={cn(
                    (diffRefreshing || gitStatusLoading) && "animate-spin",
                  )}
                  aria-hidden="true"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh changes</TooltipContent>
          </Tooltip>
        </span>
      </div>

      {/* Main Diff Accordions Scroll Area */}
      <div ref={scrollContainerRef} className="rail-scroll scroll">
        {diffRefreshing && uncommittedFiles.length === 0 ? (
          <div className="rail-loading">
            <Loader2
              size={16}
              strokeWidth={1.6}
              className="animate-spin"
              aria-hidden="true"
            />
            <span>Loading changes…</span>
          </div>
        ) : uncommittedFiles.length === 0 ? (
          <div className="rail-empty">
            <CheckCircle2
              size={22}
              strokeWidth={1.4}
              className="text-emerald-500/80"
              aria-hidden="true"
            />
            <p className="rail-empty-title">
              {!hasSandbox
                ? "No changes yet"
                : hasRepo
                  ? "The working tree is clean."
                  : "No local changes"}
            </p>
            <p>
              {!hasSandbox
                ? "File edits and diffs will appear here once the agent modifies files in a sandbox."
                : hasRepo
                  ? "All files are synchronized with your active branch."
                  : "No modified or uncommitted files in this sandbox."}
            </p>
            {(hasSandbox && refreshDiff) || (!hasRepo && onCreateRepoClick) ? (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {hasSandbox && refreshDiff && (
                  <button
                    type="button"
                    className="sable-btn-sm"
                    onClick={() => void refreshDiff()}
                    disabled={diffRefreshing}
                  >
                    <RefreshCw size={12.5} strokeWidth={1.7} aria-hidden />
                    <span>Refresh changes</span>
                  </button>
                )}
                {!hasRepo && onCreateRepoClick && (
                  <button
                    type="button"
                    className="sable-btn-sm"
                    onClick={onCreateRepoClick}
                  >
                    <Github size={12.5} strokeWidth={1.7} aria-hidden />
                    <span>Connect GitHub</span>
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="ch-list">
            {uncommittedFiles.map((file) => {
              const isExpanded = expandedFiles.has(file.path);
              const patch = file.diff;
              const fileName = file.path.split("/").pop() ?? file.path;
              const dirPath = file.path.slice(0, -fileName.length);

              return (
                <li
                  key={file.path}
                  data-diff-file-path={file.path}
                  className="ch-item"
                  data-open={isExpanded || undefined}
                >
                  {/* Sable 1:1 File Row + Hover/Touch Action Group */}
                  <div className="ch-row-wrap rail-row-host">
                    <button
                      type="button"
                      className="ch-row"
                      aria-expanded={isExpanded}
                      onClick={() => toggleFile(file.path)}
                    >
                      <FileTypeIcon
                        path={file.path}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span className="ch-path">
                        {dirPath ? (
                          <span className="ch-dir" dir="rtl">
                            <bdi>{dirPath.replace(/\/$/, "")}</bdi>
                          </span>
                        ) : null}
                        <span className="ch-base">{fileName}</span>
                      </span>

                      <span className="ch-stat num rail-row-deco">
                        {file.additions > 0 && (
                          <span className="dv-add">+{file.additions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="dv-del">−{file.deletions}</span>
                        )}
                      </span>

                      <ChevronRight
                        size={12}
                        strokeWidth={1.8}
                        className="ch-caret"
                        aria-hidden="true"
                      />
                    </button>

                    <span className="rail-row-acts ch-acts">
                      {onMentionInChat ? (
                        <button
                          type="button"
                          className="rail-btn"
                          title="Mention in chat"
                          aria-label={`Mention ${fileName} in chat`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMentionInChat(`@${file.path} `);
                          }}
                        >
                          <AtSign
                            size={13.5}
                            strokeWidth={1.6}
                            aria-hidden="true"
                          />
                        </button>
                      ) : null}
                      {onOpenFile && file.status !== "deleted" ? (
                        <button
                          type="button"
                          className="rail-btn"
                          title="Open file"
                          aria-label={`Open ${fileName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFile(file.path);
                          }}
                        >
                          <FileText
                            size={13.5}
                            strokeWidth={1.6}
                            aria-hidden="true"
                          />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rail-btn hover:!text-[var(--red)]"
                        title="Discard changes to this file"
                        aria-label={`Discard changes to ${fileName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDiscardFileTarget(file.path);
                        }}
                      >
                        <RotateCcw
                          size={13.5}
                          strokeWidth={1.6}
                          aria-hidden="true"
                        />
                      </button>
                    </span>
                  </div>

                  {/* Diff Viewer Body */}
                  {isExpanded && (
                    <div className="ch-diff">
                      {file.binary ? (
                        <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                          Binary file &mdash; diff not displayed inline
                        </div>
                      ) : file.generated ? (
                        <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                          Generated file &mdash; diff hidden
                        </div>
                      ) : patch &&
                        patch.length > 60_000 &&
                        !revealedLargeDiffs.has(file.path) ? (
                        <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
                          <span className="font-mono tabular-nums">
                            Large diff ({Math.round(patch.length / 1024)} KB)
                          </span>
                          <button
                            type="button"
                            className="sable-btn-sm"
                            onClick={() =>
                              setRevealedLargeDiffs(
                                (prev) => new Set([...prev, file.path]),
                              )
                            }
                          >
                            Load diff
                          </button>
                        </div>
                      ) : patch ? (
                        <PatchDiff<DiffAnnotationMetadata>
                          key={`${file.path}-${diffStyle}-${resolvedTheme}`}
                          patch={patch}
                          options={
                            {
                              ...baseDiffOptions,
                              enableLineSelection: true,
                              enableGutterUtility: true,
                              onGutterUtilityClick: (range) => {
                                const extracted = extractPatchLines(
                                  patch,
                                  range,
                                );
                                openDraft({
                                  path: file.path,
                                  ...extracted,
                                });
                              },
                              onLineSelectionEnd: (range) => {
                                if (!range) return;
                                const extracted = extractPatchLines(
                                  patch,
                                  range,
                                );
                                openDraft({
                                  path: file.path,
                                  ...extracted,
                                });
                              },
                            } as FileDiffOptions<DiffAnnotationMetadata>
                          }
                          lineAnnotations={[
                            ...reviewComments
                              .filter((c) => c.path === file.path)
                              .map(
                                (
                                  c,
                                ): DiffLineAnnotation<DiffAnnotationMetadata> => ({
                                  side: c.side,
                                  lineNumber: c.lineNumber,
                                  metadata: { kind: "comment", comment: c },
                                }),
                              ),
                            ...(reviewDraft && reviewDraft.path === file.path
                              ? [
                                  {
                                    side: reviewDraft.side,
                                    lineNumber: reviewDraft.lineNumber,
                                    metadata: {
                                      kind: "draft" as const,
                                      draft: reviewDraft,
                                    },
                                  },
                                ]
                              : []),
                          ]}
                          renderAnnotation={(ann) => {
                            const meta = ann.metadata;
                            if (meta.kind === "draft") {
                              return (
                                <DiffCommentComposer
                                  draft={meta.draft}
                                  onSave={(text) =>
                                    addComment(meta.draft, text)
                                  }
                                  onCancel={closeDraft}
                                />
                              );
                            }
                            return (
                              <DiffCommentCard
                                comment={meta.comment}
                                onEdit={(text) =>
                                  editComment(meta.comment.id, text)
                                }
                                onRemove={() => removeComment(meta.comment.id)}
                              />
                            );
                          }}
                        />
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground font-mono">
                          No diff available for this file
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Bottom Action Bar: Only rendered when an active PR is present */}
      {hasRepo && session.prNumber && (
        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--well)] px-3 py-2 pb-[max(8px,env(safe-area-inset-bottom))] lg:pb-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--line-2)] bg-[var(--sheet)] px-3 py-1.5 text-xs">
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

            <div className="flex items-center gap-1.5 shrink-0">
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
              <span>Open pull request</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGeneratePrSummary}
                disabled={isGeneratingPr}
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground cursor-pointer"
              >
                {isGeneratingPr ? (
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
                ) : (
                  <PenLine className="h-3 w-3" strokeWidth={1.5} />
                )}
                <span>Auto-summarize</span>
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
              <label
                htmlFor="review-pr-title"
                className="text-xs font-medium text-foreground"
              >
                PR Title
              </label>
              <Input
                id="review-pr-title"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                placeholder="Brief summary of changes..."
                className="h-8 text-xs font-mono"
              />
            </div>
            {prDescription && (
              <div className="space-y-1">
                <span className="block text-xs font-medium text-foreground">
                  Description
                </span>
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
