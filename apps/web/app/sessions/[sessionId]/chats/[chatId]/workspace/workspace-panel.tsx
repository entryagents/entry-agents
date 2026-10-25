"use client";

import {
  FileCode,
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
import { useCallback, useEffect, useMemo, useState } from "react";
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

  const { session } = gitPanelProps;

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
  const [openToolTabs, setOpenToolTabs] = useState<string[]>(["review", "preview"]);
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
      } else {
        setActiveWorkspaceTab("review");
      }
    }
  }, [activeWorkspaceTab, changesCount, isDevServerReady, setActiveWorkspaceTab]);

  // Keep review open if changes occur
  useEffect(() => {
    if (changesCount > 0 && !openToolTabs.includes("review")) {
      setOpenToolTabs((prev) => ["review", ...prev]);
    }
  }, [changesCount, openToolTabs]);

  // Keep preview open if dev server is ready
  useEffect(() => {
    if (isDevServerReady && !openToolTabs.includes("preview")) {
      setOpenToolTabs((prev) => (prev.includes("preview") ? prev : [...prev, "preview"]));
    }
  }, [isDevServerReady, openToolTabs]);

  const closeToolTab = useCallback(
    (tabId: string) => {
      setOpenToolTabs((prev) => {
        const next = prev.filter((id) => id !== tabId);
        if (activeWorkspaceTab === tabId) {
          const fallback = next[0] ?? openFiles[0] ?? "review";
          setActiveWorkspaceTab(fallback);
        }
        return next;
      });
    },
    [activeWorkspaceTab, openFiles, setActiveWorkspaceTab],
  );

  const openToolTab = useCallback(
    (tabId: string) => {
      setOpenToolTabs((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
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
    return nonDirs.filter((f) => f.value.toLowerCase().includes(q)).slice(0, 40);
  }, [files, fileSearchQuery]);

  // Construct dynamic tab list
  const tabList: WorkspaceTabItem[] = useMemo(() => {
    const list: WorkspaceTabItem[] = [];

    if (openToolTabs.includes("review")) {
      list.push({
        id: "review",
        label: "Review",
        icon: GitCompare,
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
      list.push({
        id: filePath,
        label: fileName,
        icon: FileCode,
        closeable: true,
      });
    }

    return list;
  }, [
    openToolTabs,
    openFiles,
    changesCount,
    hasActionNeeded,
    isDevServerReady,
  ]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Workspace Header Dynamic Tab Bar (Matching OpenCode side-region) */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-2 py-1 gap-1">
        {/* Dynamic Tab Strip */}
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabList.map((tab) => {
            const isActive = activeWorkspaceTab === tab.id;
            const Icon = tab.icon;
            const isFile = openFiles.includes(tab.id);

            return (
              <div
                key={tab.id}
                onClick={() => setActiveWorkspaceTab(tab.id)}
                onAuxClick={(e) => {
                  if (e.button === 1 && tab.closeable) {
                    e.preventDefault();
                    if (isFile) closeWorkspaceFile(tab.id);
                    else closeToolTab(tab.id);
                  }
                }}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer shrink-0 select-none",
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
                  <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Review</span>
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
                !openToolTabs.includes("terminal")) && <DropdownMenuSeparator />}

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
                aria-label="Close workspace"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close workspace</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tab Panels with State Preservation (block/hidden keeps terminal & dev server iframes live) */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* OpenCode Review Tab */}
        <div
          className={cn(
            "h-full w-full overflow-hidden",
            activeWorkspaceTab === "review" ? "block" : "hidden",
          )}
        >
          <WorkspaceReviewTab
            {...gitPanelProps}
            onOpenFile={openFileTab}
          />
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

      {/* File Search / Quick Open Dialog */}
      <Dialog open={fileSearchOpen} onOpenChange={setFileSearchOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-3 border-b border-border">
            <DialogTitle className="text-sm font-medium flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span>Open File in Workspace</span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-3 border-b border-border bg-muted/20">
            <Input
              autoFocus
              value={fileSearchQuery}
              onChange={(e) => setFileSearchQuery(e.target.value)}
              placeholder="Search files by path (e.g. app/page.tsx)..."
              className="text-xs h-8"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-1 divide-y divide-border/40">
            {filteredFiles.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No matching files found.
              </div>
            ) : (
              filteredFiles.map((f) => {
                const fileName = f.value.split("/").pop() ?? f.value;
                const dir = f.value.includes("/")
                  ? f.value.slice(0, f.value.lastIndexOf("/"))
                  : null;

                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => {
                      openFileTab(f.value);
                      setFileSearchOpen(false);
                      setFileSearchQuery("");
                    }}
                    className="flex w-full items-center justify-between p-2 rounded text-left text-xs hover:bg-accent/60 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                      <span className="font-medium font-mono truncate text-foreground">
                        {fileName}
                      </span>
                      {dir && (
                        <span className="text-[11px] font-mono text-muted-foreground truncate hidden sm:inline">
                          ({dir})
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
