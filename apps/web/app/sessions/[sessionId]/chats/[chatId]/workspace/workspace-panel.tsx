"use client";

import "./rail.css";
import { Loader2, PanelRight, X } from "lucide-react";
import dynamic from "next/dynamic";
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
import {
  deriveAgentHubRoster,
  isLiveStatus,
} from "@/lib/agent-hub/derive-roster";
import type { ModelOption } from "@/lib/model-options";
import type { GitPanelProps } from "../git-panel";
import { useGitPanel } from "../git-panel-context";
import type { DevServerControls } from "../hooks/use-dev-server";
import {
  isBuiltinRailTab,
  RAIL_TABS,
  railTabAt,
  type RailTabId,
} from "./rail-tabs";
import { WorkspaceContextTab } from "./workspace-context-tab";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";
import { WorkspaceTasksTab } from "./workspace-tasks-tab";

function RailPaneLoading() {
  return (
    <div className="rail-empty">
      <Loader2
        size={18}
        strokeWidth={1.5}
        className="animate-spin"
        aria-hidden="true"
      />
      <p>Loading panel…</p>
    </div>
  );
}

const WorkspaceReviewTab = dynamic(
  () => import("./workspace-review-tab").then((m) => m.WorkspaceReviewTab),
  { ssr: false, loading: RailPaneLoading },
);
const WorkspaceFilesTab = dynamic(
  () => import("./workspace-files-tab").then((m) => m.WorkspaceFilesTab),
  { ssr: false, loading: RailPaneLoading },
);
const WorkspacePreviewTab = dynamic(
  () => import("./workspace-preview-tab").then((m) => m.WorkspacePreviewTab),
  { ssr: false, loading: RailPaneLoading },
);
const WorkspaceTerminalTab = dynamic(
  () => import("./workspace-terminal-tab").then((m) => m.WorkspaceTerminalTab),
  { ssr: false, loading: RailPaneLoading },
);
const WorkspaceAgentsTab = dynamic(
  () => import("./workspace-agents-tab").then((m) => m.WorkspaceAgentsTab),
  { ssr: false, loading: RailPaneLoading },
);

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
  contextLimit?: number | null;
  isParentStreaming?: boolean;
  teamRoleModels?: Record<string, string>;
  onUpdateRoleModel?: (role: string, modelId: string | null) => void;
  isFreeTierLocked?: boolean;
  freePlanModelId?: string | null;
  freeTierAllowedModelIds?: string[];
  onSelectSubagent?: (
    toolCallId: string,
    title?: string,
    subagentType?: string,
  ) => void;
  onStopRun?: () => void;
  onCompactConversation?: () => void;
  isCompacting?: boolean;
  onMentionInChat?: (mention: string) => void;
};

export function WorkspacePanel({
  devServer,
  files,
  filesLoading = false,
  refreshFiles,
  messages = [],
  modelId = "",
  modelOptions = [],
  contextLimit = null,
  isParentStreaming = false,
  teamRoleModels = {},
  onUpdateRoleModel,
  isFreeTierLocked = false,
  freePlanModelId = "",
  freeTierAllowedModelIds = [],
  onSelectSubagent,
  onStopRun,
  onCompactConversation,
  isCompacting = false,
  onMentionInChat,
  ...gitPanelProps
}: WorkspacePanelProps) {
  const {
    setGitPanelOpen,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    openWorkspaceFile,
  } = useGitPanel();

  const resolvedModelId = modelId ?? "";
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const prevTabRef = useRef<RailTabId>("review");

  const normalizedTab =
    activeWorkspaceTab === "diff" || activeWorkspaceTab === "git"
      ? "review"
      : activeWorkspaceTab;

  const activeBuiltinTab: RailTabId = isBuiltinRailTab(normalizedTab)
    ? normalizedTab
    : "files";

  // Track which panes have been visited so we mount lazily on first visit and
  // keep them alive for 0ms instant tab switches without losing state.
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

  const liveAgents = useMemo(() => {
    const roster = deriveAgentHubRoster(messages, { isParentStreaming });
    let live = 0;
    for (const entry of roster) {
      if (isLiveStatus(entry.status)) live += 1;
    }
    return live;
  }, [messages, isParentStreaming]);
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
          onPick={pickBuiltinTab}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rail-btn shrink-0"
              data-active="true"
              onClick={() => setGitPanelOpen(false)}
              aria-label="Hide panel"
            >
              <X
                size={16}
                strokeWidth={1.6}
                className="lg:hidden"
                aria-hidden="true"
              />
              <PanelRight
                size={15}
                strokeWidth={1.6}
                className="hidden lg:block"
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Hide panel</TooltipContent>
        </Tooltip>
      </div>

      <div className="rail-body" data-dir={dir}>
        {RAIL_TABS.map((def, idx) => {
          const isActive = def.id === activeBuiltinTab;
          const isBefore = idx < activeIdx;
          const shouldRender = isActive || mountedPanes.has(def.id);

          if (!shouldRender) return null;

          return (
            <div
              key={def.id}
              id={`rail-pane-${def.id}`}
              role="tabpanel"
              className="rail-pane"
              data-active={isActive ? "" : undefined}
              data-side={isBefore ? "before" : undefined}
              inert={!isActive}
            >
              {def.id === "review" && (
                <WorkspaceReviewTab
                  {...gitPanelProps}
                  onOpenFile={openWorkspaceFile}
                  onMentionInChat={onMentionInChat}
                />
              )}
              {def.id === "files" && (
                <WorkspaceFilesTab
                  sessionId={gitPanelProps.session.id}
                  files={files}
                  filesLoading={filesLoading}
                  hasSandbox={gitPanelProps.hasSandbox}
                  refreshFiles={refreshFiles}
                  diffFiles={diffFiles}
                  onOpenDiff={() => pickBuiltinTab("review")}
                  onOpenQuickOpen={() => setQuickOpen(true)}
                  onMentionInChat={onMentionInChat}
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
                  onMentionInChat={onMentionInChat}
                />
              )}
              {def.id === "terminal" && (
                <WorkspaceTerminalTab
                  sessionId={gitPanelProps.session.id}
                  canRun={gitPanelProps.hasSandbox}
                  repoName={gitPanelProps.session.repoName}
                  files={files}
                  onOpenPreview={() => pickBuiltinTab("preview")}
                />
              )}
              {def.id === "tasks" && <WorkspaceTasksTab messages={messages} />}
              {def.id === "context" && (
                <WorkspaceContextTab
                  messages={messages}
                  modelId={resolvedModelId}
                  modelOptions={modelOptions}
                  contextLimit={contextLimit}
                  onCompactConversation={onCompactConversation}
                  isCompacting={isCompacting}
                  isBusy={isParentStreaming}
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
                  onClosePanel={() => setGitPanelOpen(false)}
                />
              )}
            </div>
          );
        })}
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
              className="h-8 text-base sm:text-xs font-mono"
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
                  className="w-full text-left px-2.5 py-2 sm:py-1.5 rounded-md text-xs font-mono text-foreground hover:bg-muted transition-colors truncate cursor-pointer"
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
