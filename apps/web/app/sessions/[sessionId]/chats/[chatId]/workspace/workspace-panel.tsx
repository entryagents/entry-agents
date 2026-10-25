"use client";

import {
  Code2,
  FolderGit2,
  GitCompare,
  GitPullRequest,
  Globe,
  Maximize2,
  Minimize2,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import { useState } from "react";
import type { DevServerControls } from "../hooks/use-dev-server";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useGitPanel } from "../git-panel-context";
import { DiffTabView } from "../diff-tab-view";
import { GitPanel, type GitPanelProps } from "../git-panel";
import { WorkspacePreviewTab } from "./workspace-preview-tab";
import { WorkspaceCodeTab } from "./workspace-code-tab";
import { WorkspaceTerminalTab } from "./workspace-terminal-tab";

export type ActiveWorkspaceTab = "preview" | "diff" | "code" | "terminal" | "git";

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
  } = useGitPanel();

  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>(
    devServer.state.status === "ready"
      ? "preview"
      : changesCount > 0
        ? "diff"
        : "preview",
  );

  const isDevServerReady = devServer.state.status === "ready";

  const tabs: Array<{
    id: ActiveWorkspaceTab;
    label: string;
    icon: typeof Globe;
    badge?: number | string | null;
    badgeColor?: string;
  }> = [
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
      id: "code",
      label: "Code",
      icon: Code2,
    },
    {
      id: "terminal",
      label: "Terminal",
      icon: TerminalIcon,
    },
    {
      id: "git",
      label: "Git & PR",
      icon: session.prNumber ? GitPullRequest : FolderGit2,
      badge: session.prNumber ? `#${session.prNumber}` : null,
      badgeColor:
        session.prStatus === "merged"
          ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Workspace Header Tab Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-2 py-1 gap-1">
        {/* Tab Strip */}
        <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0",
                  isActive
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
        </div>

        {/* Right Header Actions: Expand/Collapse & Close */}
        <div className="flex items-center gap-1 shrink-0">
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
                  ? "Split view (50/50)"
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
            activeTab === "preview" ? "block" : "hidden",
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
            activeTab === "diff" ? "block" : "hidden",
          )}
        >
          <DiffTabView />
        </div>

        {/* Code / Files Tab */}
        <div
          className={cn(
            "h-full w-full overflow-hidden",
            activeTab === "code" ? "block" : "hidden",
          )}
        >
          <WorkspaceCodeTab
            sessionId={session.id}
            files={files}
            filesLoading={filesLoading}
            repoName={session.repoName}
            onRefreshFiles={refreshFiles}
          />
        </div>

        {/* Terminal Tab */}
        <div
          className={cn(
            "h-full w-full overflow-hidden",
            activeTab === "terminal" ? "block" : "hidden",
          )}
        >
          <WorkspaceTerminalTab
            sessionId={session.id}
            canRun={gitPanelProps.hasSandbox}
          />
        </div>

        {/* Git & PR Tab */}
        <div
          className={cn(
            "h-full w-full overflow-hidden",
            activeTab === "git" ? "block" : "hidden",
          )}
        >
          <GitPanel {...gitPanelProps} />
        </div>
      </div>
    </div>
  );
}
