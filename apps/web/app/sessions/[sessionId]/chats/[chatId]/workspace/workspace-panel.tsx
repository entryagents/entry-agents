"use client";

import "./rail.css";
import { Maximize2, Minimize2, PanelRightClose, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import type { WebAgentUIMessage } from "@/app/types";
import { getLatestTodos } from "@/components/pinned-todo-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ModelOption } from "@/lib/model-options";
import { cn } from "@/lib/utils";
import type { GitPanelProps } from "../git-panel";
import { useGitPanel } from "../git-panel-context";
import type { DevServerControls } from "../hooks/use-dev-server";
import {
  isBuiltinRailTab,
  RAIL_TABS,
  railTabAt,
  type RailTabId,
} from "./rail-tabs";
import { useLiveAgentCount, WorkspaceAgentsTab } from "./workspace-agents-tab";
import { WorkspaceContextTab } from "./workspace-context-tab";
import { WorkspaceFileTab } from "./workspace-file-tab";
import { WorkspaceFilesTab } from "./workspace-files-tab";
import { WorkspacePreviewTab } from "./workspace-preview-tab";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";
import { WorkspaceReviewTab } from "./workspace-review-tab";
import { WorkspaceTasksTab } from "./workspace-tasks-tab";
import { WorkspaceTerminalTab } from "./workspace-terminal-tab";

export type WorkspacePanelProps = GitPanelProps & {
  devServer: DevServerControls;
  files: FileSuggestion[] | null;
  filesLoading?: boolean;
  refreshFiles?: () => void;
  isWorkspaceExpanded?: boolean;
  onToggleWorkspaceExpand?: () => void;
  messages?: WebAgentUIMessage[];
  modelId?: string | null;
  modelOptions?: ModelOption[];
  isParentStreaming?: boolean;
  teamRoleModels?: Record<string, string>;
  onUpdateRoleModel?: (role: string, modelId: string | null) => void;
  isFreeTierLocked?: boolean;
  freePlanModelId?: string | null;
  freeTierAllowedModelIds?: string[];
  onSelectSubagent?: (toolCallId: string) => void;
  onStopRun?: () => void;
};

function fileBasename(filePath: string): string {
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

export function WorkspacePanel({
  devServer,
  files,
  filesLoading = false,
  refreshFiles,
  isWorkspaceExpanded = false,
  onToggleWorkspaceExpand,
  messages = [],
  modelId = "",
  modelOptions = [],
  isParentStreaming = false,
  teamRoleModels = {},
  onUpdateRoleModel,
  isFreeTierLocked = false,
  freePlanModelId = "",
  freeTierAllowedModelIds = [],
  onSelectSubagent,
  onStopRun,
  ...gitPanelProps
}: WorkspacePanelProps) {
  const {
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    openFiles,
    openWorkspaceFile,
    closeWorkspaceFile,
    setGitPanelOpen,
  } = useGitPanel();

  const resolvedModelId = modelId ?? "";
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const prevTabRef = useRef<RailTabId>("review");

  const activeBuiltinTab: RailTabId = isBuiltinRailTab(activeWorkspaceTab)
    ? activeWorkspaceTab
    : "files";
  const isViewingOpenFile =
    !isBuiltinRailTab(activeWorkspaceTab) &&
    openFiles.includes(activeWorkspaceTab);

  // Track which panes have been visited so we mount lazily and keep alive.
  const [mountedPanes, setMountedPanes] = useState<Set<RailTabId>>(
    () => new Set([activeBuiltinTab]),
  );

  useEffect(() => {
    setMountedPanes((prev) => {
      if (prev.has(activeBuiltinTab)) return prev;
      return new Set([...prev, activeBuiltinTab]);
    });
  }, [activeBuiltinTab]);

  const pickBuiltinTab = useCallback(
    (next: RailTabId) => {
      const prevIdx = RAIL_TABS.findIndex((t) => t.id === prevTabRef.current);
      const nextIdx = RAIL_TABS.findIndex((t) => t.id === next);
      if (prevIdx !== -1 && nextIdx !== -1 && prevIdx !== nextIdx) {
        setDir(nextIdx > prevIdx ? "fwd" : "back");
      }
      prevTabRef.current = next;
      setActiveWorkspaceTab(next);
    },
    [setActiveWorkspaceTab],
  );

  // Global Alt+1..7 and Cmd/Ctrl+P shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const n = Number(e.key);
        if (n >= 1 && n <= RAIL_TABS.length) {
          const target = railTabAt(n);
          if (target) {
            e.preventDefault();
            pickBuiltinTab(target);
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickBuiltinTab]);

  const liveAgents = useLiveAgentCount(messages);
  const todos = useMemo(() => getLatestTodos(messages), [messages]);
  const openTodos = useMemo(
    () => todos.filter((t) => t.status !== "completed").length,
    [todos],
  );
  const diffFiles = useMemo(
    () => gitPanelProps.diffFiles ?? [],
    [gitPanelProps.diffFiles],
  );

  const counts = useMemo<Partial<Record<RailTabId, number>>>(
    () => ({
      review: diffFiles.length || undefined,
      tasks: openTodos || undefined,
      agents: liveAgents || undefined,
    }),
    [diffFiles.length, openTodos, liveAgents],
  );

  const isPreviewLive =
    devServer.state.status === "ready" ||
    Boolean(
      gitPanelProps.prDeploymentUrl || gitPanelProps.buildingDeploymentUrl,
    );

  const previewTargetUrl =
    gitPanelProps.prDeploymentUrl ??
    gitPanelProps.buildingDeploymentUrl ??
    null;

  const filteredFiles = useMemo(() => {
    if (!files) return [];
    const nonDirs = files.filter((f) => !f.isDirectory);
    if (!quickQuery.trim()) return nonDirs.slice(0, 60);
    const q = quickQuery.toLowerCase();
    return nonDirs
      .filter((f) => f.value.toLowerCase().includes(q))
      .slice(0, 60);
  }, [files, quickQuery]);

  const activeIdx = RAIL_TABS.findIndex((t) => t.id === activeBuiltinTab);

  return (
    <div className="sable-rail">
      <div className="rail-head">
        <WorkspaceRailTabs
          tab={activeBuiltinTab}
          counts={counts}
          isPreviewLive={isPreviewLive}
          onPick={pickBuiltinTab}
        />
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rail-btn"
                onClick={() => setQuickOpen(true)}
                aria-label="Quick open file"
              >
                <Search size={14} strokeWidth={1.6} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Quick open file (⌘P)</TooltipContent>
          </Tooltip>

          {onToggleWorkspaceExpand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rail-btn"
                  onClick={onToggleWorkspaceExpand}
                  aria-label={
                    isWorkspaceExpanded ? "Restore panel width" : "Expand panel"
                  }
                >
                  {isWorkspaceExpanded ? (
                    <Minimize2 size={14} strokeWidth={1.6} aria-hidden="true" />
                  ) : (
                    <Maximize2 size={14} strokeWidth={1.6} aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isWorkspaceExpanded ? "Restore width" : "Expand panel"}
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rail-btn"
                onClick={() => setGitPanelOpen(false)}
                aria-label="Hide workspace panel"
              >
                <PanelRightClose
                  size={14}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Hide panel</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {openFiles.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5">
          {openFiles.map((filePath) => {
            const isSelected = activeWorkspaceTab === filePath;
            return (
              <div
                key={filePath}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-mono transition-colors shrink-0",
                  isSelected
                    ? "bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line-2)]"
                    : "text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--surface-2)]/60 border border-transparent",
                )}
              >
                <button
                  type="button"
                  className="truncate max-w-[140px] cursor-pointer"
                  onClick={() => setActiveWorkspaceTab(filePath)}
                  title={filePath}
                >
                  {fileBasename(filePath)}
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
                  onClick={() => closeWorkspaceFile(filePath)}
                  aria-label={`Close ${fileBasename(filePath)}`}
                >
                  <X size={11} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rail-body">
        {isViewingOpenFile ? (
          <div className="rail-pane" data-on="">
            <WorkspaceFileTab
              sessionId={gitPanelProps.session.id}
              filePath={activeWorkspaceTab}
              onClose={() => closeWorkspaceFile(activeWorkspaceTab)}
              onOpenDiff={() => {
                pickBuiltinTab("review");
              }}
            />
          </div>
        ) : (
          RAIL_TABS.map((def, idx) => {
            const isActive = def.id === activeBuiltinTab;
            const isBefore = idx < activeIdx;
            const shouldRender = mountedPanes.has(def.id) || isActive;

            return (
              <div
                key={def.id}
                className="rail-pane"
                data-on={isActive ? "" : undefined}
                data-dir={dir}
                data-side={isBefore ? "before" : undefined}
                inert={!isActive}
              >
                {shouldRender && (
                  <>
                    {def.id === "review" && (
                      <WorkspaceReviewTab
                        {...gitPanelProps}
                        onOpenFile={openWorkspaceFile}
                      />
                    )}
                    {def.id === "files" && (
                      <WorkspaceFilesTab
                        sessionId={gitPanelProps.session.id}
                        files={files}
                        filesLoading={filesLoading}
                        refreshFiles={refreshFiles}
                        diffFiles={diffFiles}
                        onOpenDiff={() => pickBuiltinTab("review")}
                        onOpenQuickOpen={() => setQuickOpen(true)}
                      />
                    )}
                    {def.id === "preview" && (
                      <WorkspacePreviewTab
                        devServer={devServer}
                        sessionId={gitPanelProps.session.id}
                        previewDeploymentTargetUrl={previewTargetUrl}
                        isDeploymentStale={gitPanelProps.isDeploymentStale}
                        isDeploymentFailed={gitPanelProps.isDeploymentFailed}
                        canRun={gitPanelProps.hasSandbox}
                      />
                    )}
                    {def.id === "terminal" && (
                      <WorkspaceTerminalTab
                        sessionId={gitPanelProps.session.id}
                        canRun={gitPanelProps.hasSandbox}
                      />
                    )}
                    {def.id === "tasks" && (
                      <WorkspaceTasksTab messages={messages} />
                    )}
                    {def.id === "context" && (
                      <WorkspaceContextTab
                        messages={messages}
                        modelId={resolvedModelId}
                        modelOptions={modelOptions}
                      />
                    )}
                    {def.id === "agents" && (
                      <WorkspaceAgentsTab
                        messages={messages}
                        isParentStreaming={isParentStreaming}
                        defaultModelId={resolvedModelId}
                        teamRoleModels={teamRoleModels}
                        onUpdateRoleModel={onUpdateRoleModel ?? (() => {})}
                        modelOptions={modelOptions}
                        isFreeTierLocked={isFreeTierLocked}
                        freePlanModelId={freePlanModelId ?? ""}
                        freeTierAllowedModelIds={freeTierAllowedModelIds}
                        onSelectSubagent={onSelectSubagent ?? (() => {})}
                        onStopRun={onStopRun ?? (() => {})}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-3 pb-2 border-b border-border">
            <DialogTitle className="text-sm font-medium">
              Open workspace file
            </DialogTitle>
          </DialogHeader>
          <div className="p-3 border-b border-border">
            <Input
              autoFocus
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Search files by path..."
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {filteredFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No matching files
              </div>
            ) : (
              filteredFiles.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono text-foreground hover:bg-muted transition-colors truncate cursor-pointer"
                  onClick={() => {
                    openWorkspaceFile(f.value);
                    setQuickOpen(false);
                    setQuickQuery("");
                  }}
                >
                  {f.value}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
