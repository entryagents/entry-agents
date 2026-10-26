"use client";

import {
  FileCode,
  FileText,
  FolderGit2,
  GitCompare,
  GitPullRequest,
  Globe,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DevServerControls } from "../hooks/use-dev-server";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { GitPanelProps } from "../git-panel";
import { FileTypeIcon } from "@/components/file-type-icons";
import { useGitPanel } from "../git-panel-context";
import { WorkspaceReviewTab } from "./workspace-review-tab";
import { WorkspacePreviewTab } from "./workspace-preview-tab";
import { WorkspaceTerminalTab } from "./workspace-terminal-tab";
import { WorkspaceFileTab } from "./workspace-file-tab";

export type WorkspacePanelProps = GitPanelProps & {
  devServer: DevServerControls;
  files: FileSuggestion[] | null;
  filesLoading?: boolean;
  refreshFiles?: () => void;
  isWorkspaceExpanded?: boolean;
  onToggleWorkspaceExpand?: () => void;
};

type WorkspaceTabItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | null;
  badgeColor?: string | null;
  closeable?: boolean;
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

  const { session, hasRepo } = gitPanelProps;

  const {
    setGitPanelOpen,
    changesCount,
    hasActionNeeded,
    openFiles,
    setOpenFiles,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    closeWorkspaceFile,
    openDiffToFile,
    openFileTab,
  } = useGitPanel();

  // Dynamic tool tabs: which core tabs are open
  const [openToolTabs, setOpenToolTabs] = useState<string[]>(() => {
    if (hasRepo) {
      return ["review", "preview"];
    }
    return changesCount > 0 ? ["review", "preview"] : ["preview", "terminal"];
  });

  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState("");

  const isDevServerReady = devServer.state.status === "ready";

  // Ensure default active tab is valid
  useEffect(() => {
    if (!activeWorkspaceTab) {
      if (changesCount > 0) {
        setActiveWorkspaceTab("review");
      } else if (isDevServerReady) {
        setActiveWorkspaceTab("preview");
      } else if (!hasRepo) {
        setActiveWorkspaceTab("preview");
      } else {
        setActiveWorkspaceTab("review");
      }
    }
  }, [
    activeWorkspaceTab,
    changesCount,
    isDevServerReady,
    hasRepo,
    setActiveWorkspaceTab,
  ]);

  // Keep review/changes open if changes occur
  useEffect(() => {
    if (changesCount > 0 && !openToolTabs.includes("review")) {
      setOpenToolTabs((prev) => ["review", ...prev]);
    }
  }, [changesCount, openToolTabs]);

  // Keep preview open if dev server is ready
  useEffect(() => {
    if (isDevServerReady && !openToolTabs.includes("preview")) {
      setOpenToolTabs((prev) =>
        prev.includes("preview") ? prev : [...prev, "preview"],
      );
    }
  }, [isDevServerReady, openToolTabs]);

  const closeToolTab = useCallback(
    (tabId: string) => {
      setOpenToolTabs((prev) => {
        const next = prev.filter((id) => id !== tabId);
        if (activeWorkspaceTab === tabId) {
          const fallback =
            next[0] ?? openFiles[0] ?? (hasRepo ? "review" : "preview");
          setActiveWorkspaceTab(fallback);
        }
        return next;
      });
    },
    [activeWorkspaceTab, openFiles, hasRepo, setActiveWorkspaceTab],
  );

  const openToolTab = useCallback(
    (tabId: string) => {
      setOpenToolTabs((prev) =>
        prev.includes(tabId) ? prev : [...prev, tabId],
      );
      setActiveWorkspaceTab(tabId);
    },
    [setActiveWorkspaceTab],
  );

  // Filtered files for file picker dialog
  const filteredFiles = useMemo(() => {
    if (!files) return [];
    const nonDirs = files.filter((f) => !f.isDirectory);
    if (!fileSearchQuery.trim()) return nonDirs.slice(0, 40);
    const q = fileSearchQuery.toLowerCase();
    return nonDirs
      .filter((f) => f.value.toLowerCase().includes(q))
      .slice(0, 40);
  }, [files, fileSearchQuery]);

  // Construct dynamic tab list
  const tabList: WorkspaceTabItem[] = useMemo(() => {
    const list: WorkspaceTabItem[] = [];

    if (openToolTabs.includes("review")) {
      list.push({
        id: "review",
        label: hasRepo ? "Review" : "Changes",
        icon: hasRepo ? GitCompare : FileCode,
        badge: changesCount > 0 ? `+${changesCount}` : null,
        badgeColor: hasActionNeeded
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
          : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
        closeable: openToolTabs.length > 1 || openFiles.length > 0,
      });
    }

    if (openToolTabs.includes("preview")) {
      list.push({
        id: "preview",
        label: "Preview",
        icon: Globe,
        badge: isDevServerReady ? "Live" : null,
        badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        closeable: openToolTabs.length > 1 || openFiles.length > 0,
      });
    }

    if (openToolTabs.includes("terminal")) {
      list.push({
        id: "terminal",
        label: "Terminal",
        icon: TerminalIcon,
        closeable: true,
      });
    }

    // Dynamic Open File Tabs
    for (const filePath of openFiles) {
      const fileName = filePath.split("/").pop() ?? filePath;
      const isMd =
        filePath.endsWith(".md") ||
        filePath.endsWith(".mdx") ||
        filePath.endsWith(".markdown");

      list.push({
        id: filePath,
        label: fileName,
        icon: isMd ? FileText : FileCode,
        closeable: true,
      });
    }

    return list;
  }, [
    openToolTabs,
    openFiles,
    hasRepo,
    changesCount,
    hasActionNeeded,
    isDevServerReady,
  ]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Workspace Header Dynamic Tab Bar (Height 46px matching top notch 3-column UI) */}
      <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-border bg-muted/30 px-2.5 gap-1.5 select-none">
        {/* Dynamic Tab Strip */}
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-1">
          {tabList.map((tab) => {
            const isActive = activeWorkspaceTab === tab.id;
            const Icon = tab.icon;
            const isFile = openFiles.includes(tab.id);

            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveWorkspaceTab(tab.id)}
                onAuxClick={(e) => {
                  if (e.button === 1 && tab.closeable) {
                    e.preventDefault();
                    if (isFile) closeWorkspaceFile(tab.id);
                    else closeToolTab(tab.id);
                  }
                }}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all cursor-pointer shrink-0 select-none h-7.5",
                  isFile && "font-mono max-w-[200px]",
                  isActive
                    ? "bg-background text-foreground shadow-2xs font-medium border border-border/80"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                title={tab.id}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive && "text-primary",
                  )}
                />
                <span className="truncate">{tab.label}</span>
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
                {tab.closeable && (
                  <button
                    type="button"
                    aria-label={`Close ${tab.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFile) closeWorkspaceFile(tab.id);
                      else closeToolTab(tab.id);
                    }}
                    className={cn(
                      "rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-all ml-0.5 cursor-pointer",
                      isActive
                        ? "opacity-60 hover:opacity-100"
                        : "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add Tab Menu */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    aria-label="Add tab"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add tab</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="start" className="w-52 text-xs">
              {!openToolTabs.includes("review") && (
                <DropdownMenuItem
                  onClick={() => openToolTab("review")}
                  className="cursor-pointer gap-2"
                >
                  {hasRepo ? (
                    <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{hasRepo ? "Review" : "Changes"}</span>
                </DropdownMenuItem>
              )}
              {!openToolTabs.includes("preview") && (
                <DropdownMenuItem
                  onClick={() => openToolTab("preview")}
                  className="cursor-pointer gap-2"
                >
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Preview</span>
                </DropdownMenuItem>
              )}
              {!openToolTabs.includes("terminal") && (
                <DropdownMenuItem
                  onClick={() => openToolTab("terminal")}
                  className="cursor-pointer gap-2"
                >
                  <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Terminal</span>
                </DropdownMenuItem>
              )}

              {(!openToolTabs.includes("review") ||
                !openToolTabs.includes("preview") ||
                !openToolTabs.includes("terminal")) && (
                <DropdownMenuSeparator />
              )}

              <DropdownMenuItem
                onClick={() => setFileSearchOpen(true)}
                className="cursor-pointer gap-2"
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Open File...</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right Header Actions: Expand/Collapse & Close */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {onToggleWorkspaceExpand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
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
                className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setGitPanelOpen(false)}
                aria-label="Hide workspace panel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Hide workspace panel</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tab Panels with State Preservation */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {tabList.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40 border border-border/60 mb-3 shadow-2xs">
              <FileText className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              No open tabs
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mb-4 leading-relaxed">
              Documents, markdown plans, live previews, and terminal tabs appear
              in this panel.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 cursor-pointer"
                onClick={() => setFileSearchOpen(true)}
              >
                <Search className="h-3.5 w-3.5" />
                Open File
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 cursor-pointer"
                onClick={() => openToolTab("preview")}
              >
                <Globe className="h-3.5 w-3.5" />
                Open Preview
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Review / Changes Tab */}
            <div
              className={cn(
                "h-full w-full overflow-hidden",
                activeWorkspaceTab === "review" ? "block" : "hidden",
              )}
            >
              <WorkspaceReviewTab {...gitPanelProps} onOpenFile={openFileTab} />
            </div>

            {/* Live Preview Tab */}
            <div
              className={cn(
                "h-full w-full overflow-hidden",
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

            {/* Dynamic File Viewer Tabs */}
            {openFiles.map((filePath) => (
              <div
                key={filePath}
                className={cn(
                  "h-full w-full overflow-hidden",
                  activeWorkspaceTab === filePath ? "block" : "hidden",
                )}
              >
                <WorkspaceFileTab
                  sessionId={session.id}
                  filePath={filePath}
                  onClose={() => closeWorkspaceFile(filePath)}
                  onOpenDiff={openDiffToFile}
                />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Open File Quick-Open Dialog */}
      <Dialog open={fileSearchOpen} onOpenChange={setFileSearchOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
          <DialogHeader className="p-3 border-b border-border">
            <DialogTitle className="text-sm font-medium">
              Open File in Workspace
            </DialogTitle>
          </DialogHeader>
          <div className="p-3 border-b border-border bg-muted/20">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                placeholder="Search files by path..."
                className="pl-8 h-8 text-xs font-mono"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-border/40">
            {filteredFiles.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No matching files found
              </div>
            ) : (
              filteredFiles.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => {
                    openFileTab(f.value);
                    setFileSearchOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-left rounded hover:bg-muted/60 transition-colors cursor-pointer group"
                >
                  <FileTypeIcon
                    path={f.value}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="font-mono truncate flex-1 text-foreground">
                    {f.value}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
