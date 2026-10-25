"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useIsMobile } from "@/hooks/use-mobile";

export type GitPanelTab = "diff" | "pr" | "files" | "review" | "preview" | "terminal";
export type ActiveView = "chat" | "diff" | "file";
export type DiffScope = "uncommitted" | "branch";

type GitPanelContextValue = {
  /** Whether the right git / workspace panel is open */
  gitPanelOpen: boolean;
  setGitPanelOpen: (open: boolean) => void;

  /** Whether the workspace is expanded full width */
  isWorkspaceExpanded: boolean;
  setIsWorkspaceExpanded: (
    expanded: boolean | ((prev: boolean) => boolean),
  ) => void;

  /** Dynamic open files tabs in the workspace */
  openFiles: string[];
  setOpenFiles: React.Dispatch<React.SetStateAction<string[]>>;

  /** Active workspace tab ("preview" | "diff" | "git" | "terminal" | filePath) */
  activeWorkspaceTab: string;
  setActiveWorkspaceTab: (tab: string) => void;

  /** Close a dynamic file tab */
  closeWorkspaceFile: (filePath: string) => void;

  /** Active tab within the git panel */
  gitPanelTab: GitPanelTab;
  setGitPanelTab: (tab: GitPanelTab) => void;

  /** Active view in the main content area (chat messages vs diff) */
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  /** Whether the user has explicitly closed the Changes tab */
  changesTabDismissed: boolean;
  setChangesTabDismissed: (dismissed: boolean) => void;

  /** File path to scroll to in the diff tab view */
  focusedDiffFile: string | null;
  setFocusedDiffFile: (file: string | null) => void;
  focusedDiffRequestId: number;

  /** Open the diff tab in the main content area / workspace */
  openDiffToFile: (filePath: string) => void;

  /** Diff scope: "uncommitted" = uncommitted only, "branch" = all changes vs base */
  diffScope: DiffScope;
  setDiffScope: (scope: DiffScope) => void;

  /** Whether there are uncommitted changes that need attention */
  hasActionNeeded: boolean;
  setHasActionNeeded: (needed: boolean) => void;

  /** Number of changed files (for badge display on toggle button) */
  changesCount: number;
  setChangesCount: (count: number) => void;

  /** Whether there are committed (pushed) changes on the branch */
  hasCommittedChanges: boolean;
  setHasCommittedChanges: (has: boolean) => void;

  /** File path currently open in the file tab view */
  focusedFilePath: string | null;
  setFocusedFilePath: (file: string | null) => void;

  /** Whether the user has explicitly closed the File tab */
  fileTabDismissed: boolean;
  setFileTabDismissed: (dismissed: boolean) => void;

  /** Open a file in the workspace dynamic tabs */
  openFileTab: (filePath: string) => void;

  /** Share dialog trigger */
  shareRequested: boolean;
  setShareRequested: (requested: boolean) => void;

  /** Change-repo dialog trigger */
  changeRepoRequested: boolean;
  setChangeRepoRequested: (requested: boolean) => void;

  /** Ref to the DOM node where the git panel should be portaled into */
  panelPortalRef: RefObject<HTMLDivElement | null>;

  /** Ref to the DOM node where header action buttons should be portaled into */
  headerActionsRef: RefObject<HTMLDivElement | null>;
};

const GitPanelContext = createContext<GitPanelContextValue | undefined>(
  undefined,
);

export function GitPanelProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<string>("preview");
  const [gitPanelTab, setGitPanelTab] = useState<GitPanelTab>("files");
  const [activeView, setActiveView] = useState<ActiveView>("chat");
  const [focusedDiffFile, setFocusedDiffFile] = useState<string | null>(null);
  const [focusedDiffRequestId, setFocusedDiffRequestId] = useState(0);
  const [changesTabDismissed, setChangesTabDismissed] = useState(false);
  const [diffScope, setDiffScope] = useState<DiffScope>("uncommitted");
  const [hasActionNeeded, setHasActionNeeded] = useState(false);
  const [changesCount, setChangesCount] = useState(0);
  const [hasCommittedChanges, setHasCommittedChanges] = useState(false);
  const [focusedFilePath, setFocusedFilePath] = useState<string | null>(null);
  const [fileTabDismissed, setFileTabDismissed] = useState(false);
  const [shareRequested, setShareRequested] = useState(false);
  const [changeRepoRequested, setChangeRepoRequested] = useState(false);
  const panelPortalRef = useRef<HTMLDivElement | null>(null);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);

  const closeWorkspaceFile = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        const next = prev.filter((p) => p !== filePath);
        if (activeWorkspaceTab === filePath) {
          const idx = prev.indexOf(filePath);
          const nextActive = next[idx - 1] ?? next[0] ?? "preview";
          setActiveWorkspaceTab(nextActive);
        }
        return next;
      });
    },
    [activeWorkspaceTab],
  );

  const openDiffToFile = useCallback(
    (filePath: string) => {
      setFocusedDiffFile(filePath);
      setFocusedDiffRequestId((prev) => prev + 1);
      setActiveWorkspaceTab("diff");
      setGitPanelOpen(true);
      if (isMobile) {
        setActiveView("diff");
        setChangesTabDismissed(false);
      }
    },
    [isMobile],
  );

  const openFileTab = useCallback(
    (filePath: string) => {
      setFocusedFilePath(filePath);
      setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
      setActiveWorkspaceTab(filePath);
      setGitPanelOpen(true);
      if (isMobile) {
        setActiveView("file");
        setFileTabDismissed(false);
      }
    },
    [isMobile],
  );

  const value = useMemo(
    () => ({
      gitPanelOpen,
      setGitPanelOpen,
      isWorkspaceExpanded,
      setIsWorkspaceExpanded,
      openFiles,
      setOpenFiles,
      activeWorkspaceTab,
      setActiveWorkspaceTab,
      closeWorkspaceFile,
      gitPanelTab,
      setGitPanelTab,
      activeView,
      setActiveView,
      changesTabDismissed,
      setChangesTabDismissed,
      focusedDiffFile,
      setFocusedDiffFile,
      focusedDiffRequestId,
      openDiffToFile,
      diffScope,
      setDiffScope,
      hasActionNeeded,
      setHasActionNeeded,
      changesCount,
      setChangesCount,
      hasCommittedChanges,
      setHasCommittedChanges,
      focusedFilePath,
      setFocusedFilePath,
      fileTabDismissed,
      setFileTabDismissed,
      openFileTab,
      shareRequested,
      setShareRequested,
      changeRepoRequested,
      setChangeRepoRequested,
      panelPortalRef,
      headerActionsRef,
    }),
    [
      gitPanelOpen,
      isWorkspaceExpanded,
      openFiles,
      activeWorkspaceTab,
      closeWorkspaceFile,
      gitPanelTab,
      activeView,
      changesTabDismissed,
      focusedDiffFile,
      focusedDiffRequestId,
      openDiffToFile,
      focusedFilePath,
      fileTabDismissed,
      openFileTab,
      diffScope,
      hasActionNeeded,
      changesCount,
      hasCommittedChanges,
      shareRequested,
      changeRepoRequested,
    ],
  );

  return (
    <GitPanelContext.Provider value={value}>
      {children}
    </GitPanelContext.Provider>
  );
}

export function useGitPanel() {
  const context = useContext(GitPanelContext);
  if (!context) {
    throw new Error("useGitPanel must be used within a GitPanelProvider");
  }
  return context;
}
