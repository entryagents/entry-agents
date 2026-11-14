"use client";

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitBranch,
  GitCompare,
  GitPullRequest,
  Link2,
  PanelLeft,
  PanelRight,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useGitPanel } from "./git-panel-context";
import { useSessionLayout } from "@/app/sessions/[sessionId]/session-layout-context";

/**
 * Session header inspired by VS Code, Cursor, and Zed.
 * Provides clear information hierarchy, repository breadcrumbs, PR badges,
 * changes counters, and workspace controls across desktop and mobile.
 */
export function SessionHeader() {
  const { toggleSidebar } = useSidebar();
  const {
    gitPanelOpen,
    setGitPanelOpen,
    setActiveWorkspaceTab,
    hasActionNeeded,
    changesCount,
    hasCommittedChanges,
    openDiffToFile,
    setShareRequested,
    setChangeRepoRequested,
    headerActionsRef,
  } = useGitPanel();
  const { session } = useSessionLayout();

  // Build contextual tooltip
  const tooltipText = useMemo(() => {
    const parts: string[] = [];
    if (session.prNumber) {
      const statusLabel =
        session.prStatus === "merged"
          ? "Merged"
          : session.prStatus === "closed"
            ? "Closed"
            : "Open";
      parts.push(`PR #${session.prNumber} (${statusLabel})`);
    }
    if (changesCount > 0) {
      parts.push(
        `${changesCount} file${changesCount !== 1 ? "s" : ""} changed`,
      );
    }
    if (hasActionNeeded) {
      parts.push("Uncommitted changes");
    }
    return parts.length > 0 ? parts.join(" · ") : "Workspace";
  }, [session.prNumber, session.prStatus, changesCount, hasActionNeeded]);

  const openGitPanel = useCallback(() => {
    const defaultTab = session.prNumber
      ? "review"
      : hasActionNeeded || hasCommittedChanges || changesCount > 0
        ? "review"
        : "preview";

    setActiveWorkspaceTab(defaultTab);
    setGitPanelOpen(true);
  }, [
    session.prNumber,
    hasActionNeeded,
    hasCommittedChanges,
    changesCount,
    setGitPanelOpen,
    setActiveWorkspaceTab,
  ]);

  const handleGitPanelToggle = useCallback(() => {
    if (gitPanelOpen) {
      setGitPanelOpen(false);
      return;
    }

    openGitPanel();
  }, [gitPanelOpen, openGitPanel, setGitPanelOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isGitPanelShortcut =
        event.code === "KeyB" &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.altKey;

      if (!isGitPanelShortcut || event.repeat) {
        return;
      }

      event.preventDefault();
      handleGitPanelToggle();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGitPanelToggle]);

  return (
    <header className="border-b border-border bg-background px-3 py-1.5 select-none">
      <div className="flex items-center justify-between gap-2">
        {/* Left side: panel toggle + repo/branch + PR badge + session title */}
        <div className="flex min-w-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={toggleSidebar}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle left sidebar</TooltipContent>
          </Tooltip>

          <div className="flex min-w-0 items-center gap-1.5 text-xs sm:text-sm">
            {session.repoName && (
              <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
                <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-xs font-medium">
                  {session.cloneUrl ? (
                    /* oxlint-disable-next-line nextjs/no-html-link-for-pages */
                    <a
                      href={`https://github.com/${session.repoOwner}/${session.repoName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 truncate text-foreground hover:underline"
                    >
                      <span>{session.repoName}</span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                    </a>
                  ) : (
                    <span className="truncate text-foreground">
                      {session.repoName}
                    </span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setChangeRepoRequested(true)}
                        className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground cursor-pointer"
                        aria-label="Change connected repository"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Change connected repository
                    </TooltipContent>
                  </Tooltip>
                </div>

                {session.branch && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/20 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    <GitBranch className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[110px]">
                      {session.branch}
                    </span>
                  </span>
                )}

                {session.prNumber && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`https://github.com/${session.repoOwner}/${session.repoName}/pull/${session.prNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.2 text-[11px] font-mono font-medium transition-colors",
                          session.prStatus === "merged"
                            ? "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            : session.prStatus === "closed"
                              ? "border-muted bg-muted text-muted-foreground"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        <GitPullRequest className="h-2.5 w-2.5" />
                        <span>#{session.prNumber}</span>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Pull Request #{session.prNumber} (
                      {session.prStatus ?? "Open"})
                    </TooltipContent>
                  </Tooltip>
                )}

                <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              </div>
            )}

            <span className="truncate font-medium text-foreground sm:font-normal sm:text-muted-foreground max-w-[160px] sm:max-w-xs md:max-w-sm">
              {session.title}
            </span>

            {/* Share link icon */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShareRequested(true)}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground cursor-pointer"
                  aria-label="Share chat"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Share chat</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Right side: changes counter + portaled actions (Agent Hub) + ⌘K + workspace toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          {changesCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => openDiffToFile("")}
                  className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/40 hover:bg-muted px-2 py-0.5 text-xs font-mono font-medium text-foreground transition-colors cursor-pointer"
                >
                  <GitCompare className="h-3 w-3 text-muted-foreground" />
                  <span>{changesCount}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {changesCount} changed {changesCount === 1 ? "file" : "files"} ·
                View changes
              </TooltipContent>
            </Tooltip>
          )}

          <div ref={headerActionsRef} className="flex items-center gap-1.5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("entry:open-command-palette"),
                  );
                }}
                className="hidden h-7 items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 text-xs text-muted-foreground hover:text-foreground sm:inline-flex cursor-pointer"
                aria-label="Open command palette"
              >
                <Search className="h-3 w-3" />
                <kbd className="font-mono text-[10px] tracking-tight">⌘K</kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Command palette · ⌘K / Ctrl+K
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "relative h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer",
                  gitPanelOpen && "bg-accent text-accent-foreground",
                )}
                onClick={handleGitPanelToggle}
                aria-label={gitPanelOpen ? "Close workspace" : "Open workspace"}
              >
                <PanelRight className="h-4 w-4" />
                {!gitPanelOpen && hasActionNeeded && (
                  <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-500" />
                )}
                {!gitPanelOpen && !hasActionNeeded && hasCommittedChanges && (
                  <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-blue-500" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {gitPanelOpen ? "Close workspace" : "Open workspace"} (
              {tooltipText}) · ⌘⇧B / Ctrl+Shift+B
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
