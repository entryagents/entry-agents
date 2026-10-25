"use client";

import {
  Code2,
  FileCode,
  FolderGit2,
  GitCompare,
  GitPullRequest,
  Globe,
  Maximize2,
  Minimize2,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DevServerControls } from "../hooks/use-dev-server";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GitPanelProps } from "../git-panel";
import { useGitPanel } from "../git-panel-context";
import { DiffTabView } from "../diff-tab-view";
import { WorkspacePreviewTab } from "./workspace-preview-tab";
import { WorkspaceTerminalTab } from "./workspace-terminal-tab";
import { WorkspaceFileTab } from "./workspace-file-tab";
import { WorkspaceGitTab } from "./workspace-git-tab";

export type WorkspacePanelProps = GitPanelProps & {
  devServer: DevServerControls;
  files: FileSuggestion[] | null;
  filesLoading?: boolean;
  refreshFiles?: () => void;
  isWorkspaceExpanded?: boolean;
  onToggleWorkspaceExpand?: () => void;
};

export function WorkspacePanel(props: WorkspacePanelProps) {
  const {
    devServer,
    files,
    filesLoading,
    refreshFiles,
    isWorkspaceExpanded = false,
    onToggleWorkspaceExpand,
    ...gitPanelProps
  } = props;

  const { session } = gitPanelProps;

  const {
    setGitPanelOpen,
    changesCount,
    hasActionNeeded,
    openFiles,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    closeWorkspaceFile,
    openDiffToFile,
  } = useGitPanel();

  const isDevServerReady = devServer.state.status === "ready";

  // If activeWorkspaceTab is not set, initialize to preview or diff
  useEffect(() => {
    if (!activeWorkspaceTab) {
      setActiveWorkspaceTab(isDevServerReady ? "preview" : changesCount > 0 ? "diff" : "preview");
    }
  }, [activeWorkspaceTab, changesCount, isDevServerReady, setActiveWorkspaceTab]);

  const standardTabs = [
    {
      id: "preview",
      label: "Preview",
      icon: Globe,
      badge: isDevServerReady ? "Live" : null,
      badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "diff",
      label: "Changes",
      icon: GitCompare,
      badge: changesCount > 0 ? `+${changesCount}` : null,
      badgeColor: hasActionNeeded
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
        : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    },
    {
      id: "git",
      label: "Git",
      icon: session.prNumber ? GitPullRequest : FolderGit2,
      badge: session.prNumber ? `#${session.prNumber}` : null,
      badgeColor:
        session.prStatus === "merged"
          ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "terminal",
      label: "Terminal",
      icon: TerminalIcon,
    },
  ];

  const isStandardTab =
    activeWorkspaceTab === "preview" ||
    activeWorkspaceTab === "diff" ||
    activeWorkspaceTab === "git" ||
    activeWorkspaceTab === "terminal";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Workspace Header Tab Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-2 py-1 gap-1">
        {/* Tab Strip: Standard Tool Tabs + Dynamic Open File Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {standardTabs.map((tab) => {
            const isActive = activeWorkspaceTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveWorkspaceTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer shrink-0",
                  isActive
                    ? "bg-background text-foreground shadow-xs font-semibold border border-border/80"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.2 text-[10px] font-semibold leading-tight",
                      tab.badgeColor ?? "bg-muted text-foreground",
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Divider between standard tabs and open file tabs */}
          {openFiles.length > 0 && (
            <div className="h-4 w-[1px] bg-border mx-1 shrink-0" />
          )}

          {/* Dynamic Open File Tabs */}
          {openFiles.map((filePath) => {
            const isActive = activeWorkspaceTab === filePath;
            const fileName = filePath.split("/").pop() ?? filePath;

            return (
              <div
                key={filePath}
                onClick={() => setActiveWorkspaceTab(filePath)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeWorkspaceFile(filePath);
                  }
                }}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono transition-colors cursor-pointer shrink-0 max-w-[180px]",
                  isActive
                    ? "bg-background text-foreground shadow-xs font-medium border border-border/80"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                title={filePath}
              >
                <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{fileName}</span>
                <button
                  type="button"
                  aria-label={`Close ${fileName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWorkspaceFile(filePath);
                  }}
                  className="rounded p-0.5 text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Right Header Actions: Expand/Collapse & Close */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {onToggleWorkspaceExpand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onToggleWorkspaceExpand}
                  aria-label={
                    isWorkspaceExpanded
                      ? "Restore split screen"
                      : "Expand workspace full width"
                  }
                >
                  {isWorkspaceExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isWorkspaceExpanded
                  ? "Restore split screen"
                  : "Expand workspace full width"}
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setGitPanelOpen(false)}
                aria-label="Close workspace"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close workspace</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tab Panels with State Preservation */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Preview Tab (Kept mounted via CSS display to preserve iframe runtime state) */}
        <div
          className={cn(
            "h-full w-full",
            activeWorkspaceTab === "preview" ? "block" : "hidden",
          )}
        >
          <WorkspacePreviewTab
            devServer={devServer}
            sessionId={session.id}
            previewDeploymentTargetUrl={gitPanelProps.prDeploymentUrl}
            isDeploymentStale={gitPanelProps.isDeploymentStale}
            isDeploymentFailed={gitPanelProps.isDeploymentFailed}
            canRun={gitPanelProps.hasSandbox}
          />
        </div>

        {/* Changes / Diff Tab */}
        <div
          className={cn(
            "h-full w-full overflow-hidden",
            activeWorkspaceTab === "diff" ? "block" : "hidden",
          )}
        >
          <DiffTabView />
        </div>

        {/* Git & PR Tab */}
        <div
          className={cn(
            "h-full w-full overflow-hidden",
            activeWorkspaceTab === "git" ? "block" : "hidden",
          )}
        >
          <WorkspaceGitTab {...gitPanelProps} />
        </div>

        {/* Terminal Tab */}
        <div
          className={cn(
            "h-full w-full overflow-hidden",
            activeWorkspaceTab === "terminal" ? "block" : "hidden",
          )}
        >
          <WorkspaceTerminalTab
            sessionId={session.id}
            canRun={gitPanelProps.hasSandbox}
          />
        </div>

        {/* Dynamic File Viewer Tab */}
        {!isStandardTab && activeWorkspaceTab && (
          <div className="h-full w-full overflow-hidden">
            <WorkspaceFileTab
              sessionId={session.id}
              filePath={activeWorkspaceTab}
              onClose={() => closeWorkspaceFile(activeWorkspaceTab)}
              onOpenDiff={openDiffToFile}
            />
          </div>
        )}
      </div>
    </div>
  );
}
