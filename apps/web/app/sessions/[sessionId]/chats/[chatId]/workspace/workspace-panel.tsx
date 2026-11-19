"use client";

import {
  FileCode,
  GitBranch,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preload } from "swr";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { fetcher } from "@/lib/swr";
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

const WORKSPACE_SIDEBAR_STORAGE_KEY = "entry_agents_workspace_sidebar";

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
    openWorkspaceFile,
  } = useGitPanel();

  const isMobile = useIsMobile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarInitializedRef = useRef(false);

  useEffect(() => {
    if (sidebarInitializedRef.current) return;
    sidebarInitializedRef.current = true;
    if (isMobile) {
      setIsSidebarOpen(false);
      return;
    }
    try {
      const saved = localStorage.getItem(WORKSPACE_SIDEBAR_STORAGE_KEY);
      if (saved === "0") {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    } catch {
      setIsSidebarOpen(true);
    }
  }, [isMobile]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      if (!isMobile) {
        try {
          localStorage.setItem(WORKSPACE_SIDEBAR_STORAGE_KEY, next ? "1" : "0");
        } catch {
          // Ignore storage write errors
        }
      }
      return next;
    });
  }, [isMobile]);

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
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [visitedToolTabs, setVisitedToolTabs] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (
      activeWorkspaceTab === "review" ||
      activeWorkspaceTab === "preview" ||
      activeWorkspaceTab === "terminal"
    ) {
      setVisitedToolTabs((prev) => {
        if (prev.has(activeWorkspaceTab)) return prev;
        return new Set([...prev, activeWorkspaceTab]);
      });
    }
  }, [activeWorkspaceTab]);

  const handlePrefetchFile = useCallback(
    (filePath: string) => {
      if (!filePath || !session?.id) return;
      const params = new URLSearchParams({ path: filePath });
      void preload(
        `/api/sessions/${session.id}/files/content?${params.toString()}`,
        fetcher,
      );
    },
    [session?.id],
  );

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

  const diffTotals = useMemo(() => {
    const list = gitPanelProps.diffFiles ?? [];
    let additions = 0;
    let deletions = 0;
    for (const file of list) {
      additions += file.additions;
      deletions += file.deletions;
    }
    return { additions, deletions };
  }, [gitPanelProps.diffFiles]);

  const totalFileCount = useMemo(
    () => (files ? files.filter((f) => !f.isDirectory).length : 0),
    [files],
  );

  // Reset highlighted index when query changes
  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [fileSearchQuery, fileSearchOpen]);

  // Desktop Cmd/Ctrl+P Quick Open shortcut
  useEffect(() => {
    if (isMobile) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setFileSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile]);

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
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium"
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
          {/* File Explorer Toggle (Desktop & Mobile) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className={cn(
                  "h-7 w-7 rounded-md text-muted-foreground hover:text-foreground cursor-pointer shrink-0 mr-0.5",
                  isSidebarOpen && "bg-muted text-foreground",
                )}
                aria-label={
                  isSidebarOpen ? "Close file tree" : "Open file tree"
                }
              >
                {isSidebarOpen ? (
                  <PanelLeftClose className="h-3.5 w-3.5" strokeWidth={1.5} />
                ) : (
                  <PanelLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isSidebarOpen ? "Close file tree" : "Open file tree"}
            </TooltipContent>
          </Tooltip>

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
                  "group flex items-center gap-1.5 rounded-md font-medium transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer shrink-0 select-none",
                  isMobile
                    ? "px-2.5 py-1.5 text-xs min-h-[32px]"
                    : "px-2.5 py-1 text-xs",
                  isFile && "font-mono max-w-[180px]",
                  isActive
                    ? "bg-background text-foreground border border-border/80"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
                title={tab.id}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
                {tab.badge ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums leading-none",
                      tab.badgeColor ?? "bg-muted text-foreground",
                    )}
                  >
                    {tab.badge}
                  </span>
                ) : null}
                {tab.closeable ? (
                  <button
                    type="button"
                    aria-label={`Close ${tab.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFile) closeWorkspaceFile(tab.id);
                      else closeToolTab(tab.id);
                    }}
                    className="rounded p-0.5 text-muted-foreground opacity-50 hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ml-0.5 cursor-pointer"
                  >
                    <X className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                ) : null}
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
                <Search
                  className="h-3.5 w-3.5 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <span>Open file</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right Header Actions: Quick Open, Expand/Collapse & Close */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {!isMobile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden xl:inline-flex h-7 gap-1.5 rounded-md border border-border/70 bg-background/60 px-2 text-xs text-muted-foreground hover:bg-background hover:text-foreground cursor-pointer"
                  onClick={() => setFileSearchOpen(true)}
                  aria-label="Quick open file"
                >
                  <Search className="h-3 w-3" strokeWidth={1.5} />
                  <span>Open</span>
                  <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                    ⌘P
                  </kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Quick open file (⌘P)
              </TooltipContent>
            </Tooltip>
          )}

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

      {/* Body: Left Sidebar (Desktop) + Mobile Drawer + Tab Panels */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {isSidebarOpen && isMobile ? (
          <button
            type="button"
            aria-label="Close file tree"
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[1px]"
          />
        ) : null}
        {isSidebarOpen ? (
          <WorkspaceFileTree
            files={files}
            diffFiles={gitPanelProps.diffFiles ?? undefined}
            activeFilePath={
              openFiles.includes(activeWorkspaceTab)
                ? activeWorkspaceTab
                : undefined
            }
            onOpenFile={(fp) => {
              openWorkspaceFile(fp);
              if (isMobile) {
                setIsSidebarOpen(false);
              }
            }}
            onPrefetchFile={handlePrefetchFile}
            onCloseSidebar={() => {
              if (isMobile) {
                setIsSidebarOpen(false);
              } else {
                toggleSidebar();
              }
            }}
            className={
              isMobile
                ? "absolute inset-y-0 left-0 z-20 w-72 max-w-[85vw] border-r border-border"
                : undefined
            }
          />
        ) : null}

        {/* Tab Panels with State Preservation (block/hidden keeps terminal & dev server iframes live) */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          {/* OpenCode Review / Changes Tab */}
          <div
            className={cn(
              "h-full w-full overflow-hidden",
              activeWorkspaceTab === "review" ? "block" : "hidden",
            )}
          >
            <WorkspaceReviewTab
              {...gitPanelProps}
              onOpenFile={openWorkspaceFile}
            />
          </div>

          {/* Live Preview Tab (lazy-mounted on first visit) */}
          {visitedToolTabs.has("preview") ||
          activeWorkspaceTab === "preview" ? (
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
          ) : null}

          {/* Terminal Tab (lazy-mounted on first visit) */}
          {visitedToolTabs.has("terminal") ||
          activeWorkspaceTab === "terminal" ? (
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
          ) : null}

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

      {/* Desktop Workspace Status Bar */}
      <div className="hidden lg:flex h-7 shrink-0 items-center justify-between border-t border-border bg-muted/20 px-3 text-[11px] text-muted-foreground select-none">
        <div className="flex min-w-0 items-center gap-3">
          {hasRepo ? (
            <button
              type="button"
              onClick={() => openToolTab("review")}
              className="flex items-center gap-1.5 font-mono hover:text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer min-w-0"
              title="Open review tab"
            >
              <GitBranch className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              <span className="truncate max-w-[160px]">
                {session.branch ?? "main"}
              </span>
            </button>
          ) : (
            <span className="flex items-center gap-1.5 font-mono">
              <FileCode className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              <span>Workspace</span>
            </span>
          )}

          {changesCount > 0 ? (
            <button
              type="button"
              onClick={() => openToolTab("review")}
              className="flex items-center gap-1.5 font-mono tabular-nums hover:text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer"
              title="View uncommitted changes"
            >
              <span>
                {changesCount} {changesCount === 1 ? "change" : "changes"}
              </span>
              {diffTotals.additions > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{diffTotals.additions}
                </span>
              )}
              {diffTotals.deletions > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  -{diffTotals.deletions}
                </span>
              )}
            </button>
          ) : (
            <span className="tabular-nums text-muted-foreground/80">Clean</span>
          )}

          {openFiles.includes(activeWorkspaceTab) && (
            <span className="hidden xl:inline truncate max-w-[260px] font-mono text-foreground/80 border-l border-border pl-3">
              {activeWorkspaceTab}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setFileSearchOpen(true)}
            className="flex items-center gap-1 hover:text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer tabular-nums"
            title="Quick open file (⌘P)"
          >
            <Search className="h-3 w-3" strokeWidth={1.5} />
            <span>{totalFileCount} files</span>
          </button>

          <button
            type="button"
            onClick={() => openToolTab("terminal")}
            className={cn(
              "flex items-center gap-1 hover:text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
              activeWorkspaceTab === "terminal" &&
                "text-foreground font-medium",
            )}
            title="Open terminal"
          >
            <TerminalIcon className="h-3 w-3" strokeWidth={1.5} />
            <span>Terminal</span>
          </button>

          <button
            type="button"
            onClick={() => openToolTab("preview")}
            className={cn(
              "flex items-center gap-1.5 hover:text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer tabular-nums",
              isDevServerReady && "text-emerald-600 dark:text-emerald-400",
            )}
            title="Open preview"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isDevServerReady
                  ? "bg-emerald-500"
                  : gitPanelProps.hasSandbox
                    ? "bg-foreground/40"
                    : "bg-muted-foreground/30",
              )}
            />
            <span>
              {devServer.state.status === "ready"
                ? `:${devServer.state.info.port}`
                : gitPanelProps.hasSandbox
                  ? "Sandbox ready"
                  : "Offline"}
            </span>
          </button>
        </div>
      </div>

      {/* Open File Quick-Open Dialog */}
      <Dialog open={fileSearchOpen} onOpenChange={setFileSearchOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
          <DialogHeader className="p-3 border-b border-border flex-row items-center justify-between">
            <DialogTitle className="text-sm font-medium">Open file</DialogTitle>
            <span className="text-[11px] font-mono text-muted-foreground">
              ↑↓ navigate · Enter open
            </span>
          </DialogHeader>
          <div className="p-3 border-b border-border bg-muted/20">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
              <Input
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (filteredFiles.length === 0) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedSearchIndex((prev) =>
                      prev + 1 < filteredFiles.length ? prev + 1 : 0,
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedSearchIndex((prev) =>
                      prev - 1 >= 0 ? prev - 1 : filteredFiles.length - 1,
                    );
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const picked =
                      filteredFiles[selectedSearchIndex] ?? filteredFiles[0];
                    if (picked) {
                      openWorkspaceFile(picked.value);
                      setFileSearchOpen(false);
                    }
                  }
                }}
                placeholder="Search files by path..."
                className="pl-8 h-8 text-xs font-mono"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-border/40">
            {filteredFiles.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No matching files
              </div>
            ) : (
              filteredFiles.map((f, index) => (
                <button
                  key={f.value}
                  type="button"
                  onMouseEnter={() => {
                    setSelectedSearchIndex(index);
                    handlePrefetchFile(f.value);
                  }}
                  onFocus={() => {
                    setSelectedSearchIndex(index);
                    handlePrefetchFile(f.value);
                  }}
                  onClick={() => {
                    openWorkspaceFile(f.value);
                    setFileSearchOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-left rounded transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer group",
                    index === selectedSearchIndex
                      ? "bg-muted text-foreground"
                      : "hover:bg-muted/60",
                  )}
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
