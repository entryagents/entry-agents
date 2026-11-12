"use client";

import {
  FileCode,
  GitCompare,
  Globe,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { FileTypeIcon } from "@/components/file-type-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WorkspaceFileTree } from "@/components/workspace/workspace-file-tree";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { GitPanelProps } from "../git-panel";
import { useGitPanel } from "../git-panel-context";
import type { DevServerControls } from "../hooks/use-dev-server";
import { WorkspaceFileTab } from "./workspace-file-tab";
import { WorkspacePreviewTab } from "./workspace-preview-tab";
import { WorkspaceReviewTab } from "./workspace-review-tab";
import { WorkspaceTerminalTab } from "./workspace-terminal-tab";

export type WorkspacePanelProps = GitPanelProps & {
  devServer: DevServerControls;
  files: FileSuggestion[] | null;
  filesLoading?: boolean;
  refreshFiles?: () => void;
  isWorkspaceExpanded?: boolean;
  onToggleWorkspaceExpand?: () => void;
  messages?: unknown;
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
    filesLoading: _filesLoading,
    refreshFiles: _refreshFiles,
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
    setOpenFiles: _setOpenFiles,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    closeWorkspaceFile,
    openDiffToFile,
    openFileTab,
  } = useGitPanel();

  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Dynamic tool tabs: which core tabs are open
  // If no repo is connected, default to preview + terminal rather than assuming git PR review
  const [openToolTabs, setOpenToolTabs] = useState<string[]>(() => {
    const initial = hasRepo
      ? ["review", "preview"]
      : changesCount > 0
        ? ["review", "preview"]
        : ["preview", "terminal"];
    return initial;
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

    // Dynamic Open File Tabs with FileTypeIcon
    for (const filePath of openFiles) {
      const fileName = filePath.split("/").pop() ?? filePath;
      list.push({
        id: filePath,
        label: fileName,
        icon: function DynamicFileIcon({ className }: { className?: string }) {
          return <FileTypeIcon path={fileName} className={className} />;
        },
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
      {/* Mobile grab handle bar */}
      <div className="flex items-center justify-center pt-2 pb-0.5 lg:hidden">
        <div className="h-1.5 w-12 rounded-full bg-muted-foreground/25" />
      </div>

      {/* Workspace Header Dynamic Tab Bar (Matching OpenCode side-region) */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-2 py-1 gap-1">
        {/* Dynamic Tab Strip */}
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Desktop File Explorer Toggle */}
          {!isMobile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  className={cn(
                    "h-6 w-6 rounded-md text-muted-foreground hover:text-foreground cursor-pointer shrink-0 mr-0.5",
                    isSidebarOpen && "bg-muted text-foreground font-semibold",
                  )}
                  aria-label={
                    isSidebarOpen
                      ? "Collapse file explorer sidebar"
                      : "Expand file explorer sidebar"
                  }
                >
                  {isSidebarOpen ? (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeft className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isSidebarOpen ? "Collapse file tree" : "Open file tree"}
              </TooltipContent>
            </Tooltip>
          )}

          {tabList.map((tab) => {
            const isActive = activeWorkspaceTab === tab.id;
            const Icon = tab.icon;
            const isFile = openFiles.includes(tab.id);

            return (
              <div
                key={tab.id}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => setActiveWorkspaceTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveWorkspaceTab(tab.id);
                  }
                }}
                onAuxClick={(e) => {
                  if (e.button === 1 && tab.closeable) {
                    e.preventDefault();
                    if (isFile) closeWorkspaceFile(tab.id);
                    else closeToolTab(tab.id);
                  }
                }}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md font-medium transition-colors cursor-pointer shrink-0 select-none",
                  isMobile
                    ? "px-3 py-1.5 text-xs min-h-[34px]"
                    : "px-2.5 py-1 text-xs",
                  isFile && "font-mono max-w-[190px]",
                  isActive
                    ? "bg-background text-foreground shadow-2xs font-semibold border border-border/80"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                title={tab.id}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
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
                    className="rounded p-0.5 text-muted-foreground opacity-40 hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity ml-0.5 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* OpenCode-style `+` Add Tab Menu */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                    aria-label="Add tab"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">Add tab</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="start" className="w-48 text-xs">
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
          {!isMobile && onToggleWorkspaceExpand && (
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
                className="h-8 w-8 lg:h-7 lg:w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setGitPanelOpen(false)}
                aria-label="Close workspace"
              >
                <X className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close workspace</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Body: Left Sidebar (Desktop Only) + Tab Panels */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!isMobile && isSidebarOpen && (
          <WorkspaceFileTree
            files={files}
            diffFiles={gitPanelProps.diffFiles ?? undefined}
            activeFilePath={
              openFiles.includes(activeWorkspaceTab)
                ? activeWorkspaceTab
                : undefined
            }
            onOpenFile={openFileTab}
            onCloseSidebar={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Tab Panels with State Preservation (block/hidden keeps terminal & dev server iframes live) */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          {/* OpenCode Review / Changes Tab */}
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
        </div>
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
