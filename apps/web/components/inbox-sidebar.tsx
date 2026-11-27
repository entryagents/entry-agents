"use client";

import {
  Archive,
  ChevronDown,
  Folder,
  FolderGit2,
  FolderInput,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  Settings,
  SmilePlus,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "@/app/providers";
import "./sidebar/sable-sidebar.css";
import { EntryMark } from "@/components/entry-mark";
import { GitHubImportDialog } from "@/components/github-import-dialog";
import { SessionChildChats } from "@/components/sidebar/session-child-chats";
import { SidebarProjectsSection } from "@/components/sidebar-projects-section";
import {
  DesktopBalanceBox,
  DesktopCodexBillingStatus,
  useBillingMe,
  formatExpirationDate,
} from "@/components/sidebar-billing-widget";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BranchPickerDialog } from "@/components/branch-picker-dialog";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { getValidRenameTitle } from "@/components/inbox-sidebar-rename";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSession } from "@/hooks/use-session";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import { signOut } from "@/lib/auth/actions";
import type { Project } from "@/lib/db/schema";
import type { Session as AuthSession } from "@/lib/session/types";
import { groupSessionsByProject } from "@/lib/sessions/group-projects";
import {
  formatCompactSessionAge,
  groupSessionsByRecency,
} from "@/lib/sessions/group-by-time";

type InboxSidebarProps = {
  sessions: SessionWithUnread[];
  customProjects?: Project[];
  archivedCount: number;
  sessionsLoading: boolean;
  activeSessionId: string;
  pendingSessionId: string | null;
  onSessionClick: (session: SessionWithUnread) => void;
  onSessionPrefetch: (session: SessionWithUnread) => void;
  onRenameSession?: (sessionId: string, title: string) => Promise<void>;
  onMoveSessionToFolder?: (
    sessionId: string,
    projectId: string | null,
  ) => Promise<void>;
  onArchiveSession: (sessionId: string) => Promise<void>;
  onUnarchiveSession: (sessionId: string) => Promise<void>;
  onOpenNewSession: () => void;
  onCreateFolder?: (name: string) => Promise<void>;
  onRenameFolder?: (projectId: string, name: string) => Promise<void>;
  onDeleteFolder?: (projectId: string) => Promise<void>;
  onStartChatInFolder?: (projectId: string) => void;
  onCreateSessionForRepo: (repoOwner: string, repoName: string) => void;
  onCreateSessionFromBranch: (
    repoOwner: string,
    repoName: string,
    branch: string,
  ) => void;
  initialUser?: AuthSession["user"];
};

type ArchivedSessionsResponse = {
  sessions: SessionWithUnread[];
  archivedCount: number;
  pagination?: {
    hasMore: boolean;
    nextOffset: number;
  };
  error?: string;
};

const ARCHIVED_SESSIONS_PAGE_SIZE = 50;

const sessionRowPerformanceStyle: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "2.25rem",
};

function DiffStats({
  added,
  removed,
}: {
  added: number | null;
  removed: number | null;
}) {
  if (added === null && removed === null) return null;
  if (added === 0 && removed === 0) return null;

  return (
    <span className="flex items-center gap-0.5 font-mono text-[10px]">
      {added !== null ? (
        <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>
      ) : null}
      {removed !== null ? (
        <span className="text-rose-600 dark:text-rose-400">-{removed}</span>
      ) : null}
    </span>
  );
}

function getSessionStatusIcon(session: SessionWithUnread) {
  // Actively streaming / waiting for LLM
  if (session.hasStreaming) {
    return (
      <Loader2
        className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground/75"
        strokeWidth={1.6}
      />
    );
  }

  // PR merged
  if (session.prNumber && session.prStatus === "merged") {
    return (
      <GitMerge
        className="h-3.5 w-3.5 shrink-0 text-indigo-500"
        strokeWidth={1.5}
      />
    );
  }

  // PR open
  if (session.prNumber && session.prStatus === "open") {
    return (
      <GitPullRequest
        className="h-3.5 w-3.5 shrink-0 text-emerald-500"
        strokeWidth={1.5}
      />
    );
  }

  // PR closed (not merged)
  if (session.prNumber && session.prStatus === "closed") {
    return (
      <GitPullRequest
        className="h-3.5 w-3.5 shrink-0 text-rose-500"
        strokeWidth={1.5}
      />
    );
  }

  // Has a branch with code changes
  const hasDiff = session.linesAdded || session.linesRemoved;
  if (session.branch && hasDiff) {
    return (
      <GitBranch
        className="h-3.5 w-3.5 shrink-0 text-foreground/80"
        strokeWidth={1.5}
      />
    );
  }

  // Has a branch but no changes yet
  if (session.branch) {
    return (
      <GitBranch
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
        strokeWidth={1.5}
      />
    );
  }

  // Plain chat or idle workspace without branch: keep row uncluttered so chat titles breathe
  return null;
}

function getRepoGroupLabel(session: SessionWithUnread): string {
  const repoName = session.repoName?.trim();
  const repoOwner = session.repoOwner?.trim();

  if (!repoName) {
    return "Chats";
  }

  return repoOwner ? `${repoOwner}/${repoName}` : repoName;
}

type SessionRowProps = {
  session: SessionWithUnread;
  isActive: boolean;
  isPending: boolean;
  folders?: Project[];
  onSessionClick: (session: SessionWithUnread) => void;
  onSessionPrefetch: (session: SessionWithUnread) => void;
  onRenameSession?: (sessionId: string, title: string) => Promise<void>;
  onMoveSessionToFolder?: (
    sessionId: string,
    projectId: string | null,
  ) => Promise<void>;
  onArchiveSession: (session: SessionWithUnread) => void;
  onUnarchiveSession: (session: SessionWithUnread) => void;
  onOpenBranchPicker?: (owner: string, repo: string) => void;
};

const SessionRow = memo(function SessionRow({
  session,
  isActive,
  isPending,
  folders,
  onSessionClick,
  onSessionPrefetch,
  onRenameSession,
  onMoveSessionToFolder,
  onArchiveSession,
  onUnarchiveSession,
  onOpenBranchPicker,
}: SessionRowProps) {
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();
  const [isHovered, setIsHovered] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const [renamePending, setRenamePending] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(session.title);
    }
  }, [isRenaming, session.title]);

  useEffect(() => {
    if (!isRenaming || !renameInputRef.current) {
      return;
    }

    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [isRenaming]);

  const hasDiff = session.linesAdded !== null || session.linesRemoved !== null;
  const showActionButtons = isHovered || moveMenuOpen;

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    onSessionPrefetch(session);
  }, [onSessionPrefetch, session]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenameValue(session.title);
    setRenamePending(false);
    setIsRenaming(false);
  }, [session.title]);

  const handleFinishRename = useCallback(async () => {
    if (!onRenameSession) {
      handleCancelRename();
      return;
    }

    const nextTitle = getValidRenameTitle({
      draftTitle: renameValue,
      originalTitle: session.title,
    });
    if (!nextTitle) {
      handleCancelRename();
      return;
    }

    setRenamePending(true);
    try {
      await onRenameSession(session.id, nextTitle);
    } catch (error) {
      console.error("Failed to rename session:", error);
    } finally {
      setRenamePending(false);
      setIsRenaming(false);
    }
  }, [
    handleCancelRename,
    onRenameSession,
    renameValue,
    session.id,
    session.title,
  ]);

  const repoOwner = session.repoOwner?.trim() ?? "";
  const repoName = session.repoName?.trim() ?? "";
  const hasRepo = Boolean(repoOwner && repoName);

  const actionButtons = showActionButtons ? (
    <>
      {!isMobile && hasRepo && onOpenBranchPicker ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              aria-label={`Create session from branch for ${repoName}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenBranchPicker(repoOwner, repoName);
              }}
            >
              <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            Create from branch
          </TooltipContent>
        </Tooltip>
      ) : null}
      {onRenameSession ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground/60 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-muted-foreground"
              aria-label="Rename chat"
              onClick={(event) => {
                event.stopPropagation();
                setRenameValue(session.title);
                setIsRenaming(true);
              }}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            Rename chat
          </TooltipContent>
        </Tooltip>
      ) : null}
      {folders && folders.length > 0 && onMoveSessionToFolder ? (
        <DropdownMenu open={moveMenuOpen} onOpenChange={setMoveMenuOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground/60 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-muted-foreground"
                  aria-label="Move to folder"
                  onClick={(event) => event.stopPropagation()}
                >
                  <FolderInput className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              Move to folder
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" sideOffset={4} className="w-44">
            {folders.map((folder) => {
              const isCurrent = session.projectId === folder.id;
              return (
                <DropdownMenuItem
                  key={folder.id}
                  disabled={isCurrent}
                  onSelect={() => {
                    void onMoveSessionToFolder(session.id, folder.id);
                  }}
                >
                  <Folder className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span className="truncate">{folder.name}</span>
                </DropdownMenuItem>
              );
            })}
            {session.projectId ? (
              <DropdownMenuItem
                onSelect={() => {
                  void onMoveSessionToFolder(session.id, null);
                }}
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Remove from folder</span>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground/60 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-muted-foreground"
            aria-label={
              session.status === "archived" ? "Unarchive chat" : "Archive chat"
            }
            onClick={(event) => {
              event.stopPropagation();
              if (session.status === "archived") {
                onUnarchiveSession(session);
                return;
              }
              onArchiveSession(session);
            }}
          >
            <Archive className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {session.status === "archived" ? "Unarchive chat" : "Archive chat"}
        </TooltipContent>
      </Tooltip>
    </>
  ) : null;

  const statusIcon = getSessionStatusIcon(session);
  const ageLabel = formatCompactSessionAge(
    session.lastActivityAt ?? session.createdAt,
  );

  const rowButton = isRenaming ? (
    <div
      className={`group relative flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-background px-2 text-left outline-none transition-[background-color,opacity] ${
        renamePending ? "opacity-80" : "opacity-100"
      }`}
      style={sessionRowPerformanceStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {statusIcon ? (
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          {statusIcon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-left">
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onBlur={() => {
            void handleFinishRename();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleFinishRename();
            } else if (event.key === "Escape") {
              event.preventDefault();
              handleCancelRename();
            }
          }}
          disabled={renamePending}
          maxLength={120}
          className="h-5 w-full rounded border-0 bg-transparent p-0 text-[13px] leading-5 text-foreground outline-none"
        />
      </span>
    </div>
  ) : (
    <div
      className={`group flex h-8 w-full items-center gap-1 rounded-lg px-2 transition-[background-color,opacity] duration-120 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isActive
          ? "bg-foreground/[0.08] text-foreground"
          : "hover:bg-foreground/[0.045]"
      } ${isPending ? "opacity-75" : "opacity-100"}`}
      style={sessionRowPerformanceStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        title={[
          session.title,
          hasRepo ? `${repoOwner}/${repoName}` : "",
          session.branch ?? "",
        ]
          .filter(Boolean)
          .join(" · ")}
        className="flex h-full min-w-0 flex-1 items-center gap-2 text-left outline-none cursor-pointer focus-visible:ring-1 focus-visible:ring-ring rounded-md"
        onClick={() => {
          if (isMobile) setOpenMobile(false);
          onSessionClick(session);
        }}
        onFocus={() => onSessionPrefetch(session)}
        aria-busy={isPending}
      >
        {statusIcon ? (
          <span className="flex size-3.5 shrink-0 items-center justify-center">
            {statusIcon}
          </span>
        ) : session.hasUnread && !isActive ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-foreground"
            aria-label="Unread activity"
          />
        ) : null}
        <span
          className={`min-w-0 flex-1 truncate text-[13px] leading-[18px] transition-colors duration-120 ${
            isActive
              ? "font-medium text-foreground"
              : session.hasUnread
                ? "font-medium text-foreground"
                : "font-normal text-foreground/75 group-hover:text-foreground"
          }`}
        >
          {session.title}
        </span>
      </button>

      {actionButtons ? (
        <span className="flex shrink-0 items-center gap-0.5 pl-1">
          {actionButtons}
        </span>
      ) : (
        <span className="flex shrink-0 items-center justify-end gap-1.5 pl-1 font-mono text-[10.5px] tabular-nums text-muted-foreground/65">
          {session.hasUnread && !isActive && statusIcon ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-foreground"
              aria-label="Unread activity"
            />
          ) : null}
          {session.prNumber ? (
            <span
              className={
                session.prStatus === "merged"
                  ? "text-indigo-500 dark:text-indigo-400"
                  : session.prStatus === "open"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-500 dark:text-rose-400"
              }
            >
              #{session.prNumber}
            </span>
          ) : null}
          {hasDiff ? (
            <DiffStats
              added={session.linesAdded}
              removed={session.linesRemoved}
            />
          ) : ageLabel ? (
            <span>{ageLabel}</span>
          ) : null}
        </span>
      )}
    </div>
  );

  return rowButton;
}, areSessionRowsEqual);

function areSessionRowsEqual(
  prev: SessionRowProps,
  next: SessionRowProps,
): boolean {
  if (prev.isActive !== next.isActive || prev.isPending !== next.isPending) {
    return false;
  }

  return (
    prev.session.id === next.session.id &&
    prev.session.title === next.session.title &&
    prev.session.hasStreaming === next.session.hasStreaming &&
    prev.session.hasUnread === next.session.hasUnread &&
    prev.session.repoOwner === next.session.repoOwner &&
    prev.session.repoName === next.session.repoName &&
    prev.session.projectId === next.session.projectId &&
    prev.folders === next.folders &&
    prev.session.branch === next.session.branch &&
    prev.session.prNumber === next.session.prNumber &&
    prev.session.prStatus === next.session.prStatus &&
    prev.session.linesAdded === next.session.linesAdded &&
    prev.session.linesRemoved === next.session.linesRemoved &&
    String(prev.session.lastActivityAt) === String(next.session.lastActivityAt)
  );
}

export function InboxSidebar({
  sessions,
  customProjects = [],
  archivedCount,
  sessionsLoading,
  activeSessionId,
  pendingSessionId,
  onSessionClick,
  onSessionPrefetch,
  onRenameSession,
  onMoveSessionToFolder,
  onArchiveSession,
  onUnarchiveSession,
  onOpenNewSession,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onStartChatInFolder,
  onCreateSessionForRepo,
  onCreateSessionFromBranch,
  initialUser,
}: InboxSidebarProps) {
  const router = useRouter();
  const { session } = useSession();
  const { isMobile, setOpenMobile } = useSidebar();
  const [showArchived, setShowArchived] = useState(false);
  const [importGithubOpen, setImportGithubOpen] = useState(false);
  const [archivedSessions, setArchivedSessions] = useState<SessionWithUnread[]>(
    [],
  );
  const [archivedSessionsLoading, setArchivedSessionsLoading] = useState(false);
  const [archivedSessionsError, setArchivedSessionsError] = useState<
    string | null
  >(null);
  const [hasMoreArchivedSessions, setHasMoreArchivedSessions] = useState(false);
  const archivedRequestInFlightRef = useRef(false);
  const lastLoadedArchivedCountRef = useRef(0);
  const [branchPickerRepo, setBranchPickerRepo] = useState<{
    owner: string;
    repo: string;
  } | null>(null);
  const [isCreatingFromBranch, setIsCreatingFromBranch] = useState(false);
  const [archiveConfirmSession, setArchiveConfirmSession] =
    useState<SessionWithUnread | null>(null);

  const fetchArchivedSessionsPage = useCallback(
    async ({ offset, replace }: { offset: number; replace: boolean }) => {
      if (archivedRequestInFlightRef.current) {
        return;
      }

      archivedRequestInFlightRef.current = true;
      setArchivedSessionsLoading(true);
      setArchivedSessionsError(null);

      try {
        const query = new URLSearchParams({
          status: "archived",
          limit: String(ARCHIVED_SESSIONS_PAGE_SIZE),
          offset: String(offset),
        });
        const res = await fetch(`/api/sessions?${query.toString()}`);
        const data = (await res.json()) as ArchivedSessionsResponse;

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load archived sessions");
        }

        setArchivedSessions((current) => {
          if (replace) {
            return data.sessions;
          }

          const existingIds = new Set(current.map((session) => session.id));
          const nextSessions = data.sessions.filter(
            (session) => !existingIds.has(session.id),
          );

          return [...current, ...nextSessions];
        });
        lastLoadedArchivedCountRef.current = data.archivedCount;
        setHasMoreArchivedSessions(Boolean(data.pagination?.hasMore));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load archived sessions";
        setArchivedSessionsError(message);
      } finally {
        archivedRequestInFlightRef.current = false;
        setArchivedSessionsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!showArchived) {
      return;
    }

    if (archivedCount === 0) {
      setArchivedSessions([]);
      setHasMoreArchivedSessions(false);
      setArchivedSessionsError(null);
      lastLoadedArchivedCountRef.current = 0;
      return;
    }

    if (lastLoadedArchivedCountRef.current === archivedCount) {
      return;
    }

    void fetchArchivedSessionsPage({ offset: 0, replace: true });
  }, [archivedCount, fetchArchivedSessionsPage, showArchived]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [desktopSearchQuery, setDesktopSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const { theme, setTheme } = useTheme();
  const { data: billingData } = useBillingMe();
  const creditDisplay = billingData
    ? (billingData.creditBalanceCents / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";
  const activeSessions = sessions;
  const displayedSessions = showArchived ? archivedSessions : activeSessions;
  const showLoadingSkeleton =
    (!showArchived && sessionsLoading && sessions.length === 0) ||
    (showArchived && archivedSessionsLoading && archivedSessions.length === 0);
  const sidebarUser = session?.user ?? initialUser;
  const filteredDisplayedSessions = useMemo(() => {
    if (!desktopSearchQuery.trim()) {
      return displayedSessions;
    }
    const q = desktopSearchQuery.trim().toLowerCase();
    return displayedSessions.filter((s) => {
      const repoLabel = getRepoGroupLabel(s).toLowerCase();
      const branchLabel = (s.branch ?? "").toLowerCase();
      const prLabel = s.prNumber ? `#${s.prNumber}` : "";
      return (
        s.title.toLowerCase().includes(q) ||
        repoLabel.includes(q) ||
        branchLabel.includes(q) ||
        prLabel.includes(q)
      );
    });
  }, [desktopSearchQuery, displayedSessions]);

  const { projects: projectGroups, standaloneSessions } = useMemo(
    () => groupSessionsByProject(filteredDisplayedSessions, customProjects),
    [customProjects, filteredDisplayedSessions],
  );

  const recencyGroups = useMemo(
    () => groupSessionsByRecency(standaloneSessions),
    [standaloneSessions],
  );

  const handleImportRepo = useCallback(
    async (owner: string, repo: string) => {
      await onCreateSessionForRepo(owner, repo);
      if (isMobile) {
        setOpenMobile(false);
      }
    },
    [isMobile, onCreateSessionForRepo, setOpenMobile],
  );

  const handleSessionClick = useCallback(
    (session: SessionWithUnread) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      onSessionClick(session);
    },
    [isMobile, onSessionClick, setOpenMobile],
  );

  const handleSessionPrefetch = useCallback(
    (session: SessionWithUnread) => {
      onSessionPrefetch(session);
    },
    [onSessionPrefetch],
  );

  const handleArchiveSession = useCallback((session: SessionWithUnread) => {
    setArchiveConfirmSession(session);
  }, []);

  const handleConfirmArchive = useCallback(async () => {
    if (!archiveConfirmSession) return;
    const session = archiveConfirmSession;
    setArchiveConfirmSession(null);
    try {
      await onArchiveSession(session.id);
      setArchivedSessions((current) => {
        const nextSessions = [
          { ...session, status: "archived" as const },
          ...current.filter(
            (existingSession) => existingSession.id !== session.id,
          ),
        ];
        const maxCachedSessions = Math.max(
          current.length,
          ARCHIVED_SESSIONS_PAGE_SIZE,
        );

        return nextSessions.slice(0, maxCachedSessions);
      });
      setHasMoreArchivedSessions(
        (currentHasMore) =>
          currentHasMore || archivedCount + 1 > ARCHIVED_SESSIONS_PAGE_SIZE,
      );
    } catch (err) {
      console.error("Failed to archive session:", err);
    }
  }, [archiveConfirmSession, archivedCount, onArchiveSession]);

  const handleUnarchiveSession = useCallback(
    async (session: SessionWithUnread) => {
      try {
        await onUnarchiveSession(session.id);
        setArchivedSessions((current) =>
          current.filter(
            (existingSession) => existingSession.id !== session.id,
          ),
        );
      } catch (err) {
        console.error("Failed to unarchive session:", err);
      }
    },
    [onUnarchiveSession],
  );

  const handleLoadMoreArchivedSessions = useCallback(() => {
    if (archivedSessionsLoading) {
      return;
    }

    void fetchArchivedSessionsPage({
      offset: archivedSessions.length,
      replace: false,
    });
  }, [
    archivedSessions.length,
    archivedSessionsLoading,
    fetchArchivedSessionsPage,
  ]);

  const handleRetryArchivedSessions = useCallback(() => {
    void fetchArchivedSessionsPage({ offset: 0, replace: true });
  }, [fetchArchivedSessionsPage]);

  const handleOpenBranchPicker = useCallback((owner: string, repo: string) => {
    setBranchPickerRepo({ owner, repo });
  }, []);

  const handleBranchSelected = useCallback(
    async (branch: string) => {
      if (!branchPickerRepo) return;
      setIsCreatingFromBranch(true);
      try {
        await onCreateSessionFromBranch(
          branchPickerRepo.owner,
          branchPickerRepo.repo,
          branch,
        );
        setBranchPickerRepo(null);
        if (isMobile) setOpenMobile(false);
      } catch (error) {
        console.error("Failed to create session from branch:", error);
      } finally {
        setIsCreatingFromBranch(false);
      }
    },
    [branchPickerRepo, onCreateSessionFromBranch, isMobile, setOpenMobile],
  );

  return (
    <>
      <div className="flex h-full min-h-0 flex-col bg-sidebar pr-1 pl-0.5 select-none">
        {/* Compact Brand + On-Demand Utility Triggers (Search, Archive) */}
        <div className="flex h-11 shrink-0 items-center justify-between gap-1 px-1.5 pt-px">
          <button
            type="button"
            onClick={() => {
              if (isMobile) setOpenMobile(false);
              onOpenNewSession();
            }}
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-left transition-colors duration-120 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-foreground/[0.045] active:bg-foreground/[0.07] cursor-pointer"
            title="Entry — New chat"
          >
            <EntryMark className="size-[18px] shrink-0 text-foreground" />
            <span className="text-[13.5px] font-medium tracking-tight text-foreground">
              Entry
            </span>
          </button>

          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen((prev) => {
                      if (prev) {
                        setDesktopSearchQuery("");
                        return false;
                      }
                      return true;
                    });
                  }}
                  aria-label={searchOpen ? "Close search" : "Search chats"}
                  aria-pressed={searchOpen}
                  className={`grid size-7 place-items-center rounded-md transition-colors duration-120 cursor-pointer ${
                    searchOpen || desktopSearchQuery
                      ? "bg-foreground/[0.08] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                  }`}
                >
                  <Search className="size-3.5" strokeWidth={1.6} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                Filter chats (⌘K for command palette)
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  aria-label={
                    showArchived
                      ? "Back to active chats"
                      : `View archived chats (${archivedCount})`
                  }
                  aria-pressed={showArchived}
                  className={`relative grid size-7 place-items-center rounded-md transition-colors duration-120 cursor-pointer ${
                    showArchived
                      ? "bg-foreground/[0.08] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                  }`}
                >
                  <Archive className="size-3.5" strokeWidth={1.6} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {showArchived
                  ? "Back to active chats"
                  : archivedCount > 0
                    ? `Archive (${archivedCount})`
                    : "Archive"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Sleek Monochrome New chat Bar */}
        <div className="mt-1 mb-1.5 flex shrink-0 items-center px-1.5">
          <div className="flex h-8 w-full items-center overflow-hidden rounded-lg border border-border/75 bg-background/85 transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-foreground/20 dark:bg-white/[0.04] dark:hover:bg-white/[0.065]">
            <button
              type="button"
              onClick={() => {
                if (isMobile) setOpenMobile(false);
                onOpenNewSession();
              }}
              className="group flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-[13px] font-medium text-foreground transition-transform duration-120 active:scale-[0.985] cursor-pointer"
            >
              <Plus
                className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-120 group-hover:text-foreground"
                strokeWidth={1.75}
              />
              <span className="truncate">New chat</span>
            </button>
            <span
              aria-hidden="true"
              className="h-4 w-px shrink-0 bg-border/60"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-full w-7 shrink-0 place-items-center text-muted-foreground transition-colors duration-120 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-foreground/[0.05] hover:text-foreground cursor-pointer"
                  aria-label="New chat options"
                >
                  <ChevronDown className="size-3.5" strokeWidth={1.6} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                    onOpenNewSession();
                  }}
                  className="gap-2 text-xs"
                >
                  <PlusCircle
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <span>Blank chat</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setImportGithubOpen(true)}
                  className="gap-2 text-xs"
                >
                  <FolderGit2
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <span>Import from GitHub</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* On-Demand Inline Search Bar */}
        {searchOpen || desktopSearchQuery ? (
          <div className="mb-1.5 px-1.5">
            <div className="flex h-8 shrink-0 items-center rounded-lg border border-border bg-background/90 pr-1.5 pl-2.5">
              <Search
                className="mr-2 size-3.5 shrink-0 text-muted-foreground/75"
                strokeWidth={1.6}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={desktopSearchQuery}
                onChange={(e) => setDesktopSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDesktopSearchQuery("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Filter chats..."
                className="w-full bg-transparent text-[12.5px] text-foreground placeholder:text-muted-foreground/65 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setDesktopSearchQuery("");
                  setSearchOpen(false);
                }}
                className="ml-1 grid size-5 place-items-center rounded-md text-muted-foreground transition-colors duration-120 hover:bg-foreground/[0.06] hover:text-foreground cursor-pointer"
                aria-label="Close filter"
              >
                <X className="size-3" strokeWidth={1.6} />
              </button>
            </div>
          </div>
        ) : null}

        {/* Contextual Archive Mode Banner (only shown while browsing Archive) */}
        {showArchived ? (
          <div className="mb-1.5 flex items-center justify-between px-3 py-1 text-[11.5px]">
            <span className="font-medium text-foreground">
              Archived{" "}
              <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                {archivedCount}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              Back to active
            </button>
          </div>
        ) : null}

        {/* Unified Smooth Repository & Recency-Grouped Session List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 sable-side-list">
          {showLoadingSkeleton ? (
            <div className="space-y-1 p-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="space-y-1.5 rounded-lg px-2 py-2">
                  <div className="h-3.5 w-3/4 rounded bg-muted/60" />
                  <div className="h-3 w-1/2 rounded bg-muted/45" />
                </div>
              ))}
            </div>
          ) : !showArchived && !desktopSearchQuery.trim() ? (
            <>
              <SidebarProjectsSection
                projects={projectGroups}
                activeSessionId={activeSessionId}
                onOpenImportGithub={() => setImportGithubOpen(true)}
                onCreateFolder={onCreateFolder ?? (async () => {})}
                onRenameFolder={onRenameFolder ?? (async () => {})}
                onDeleteFolder={onDeleteFolder ?? (async () => {})}
                onStartChatInFolder={(projectId) => {
                  if (isMobile) {
                    setOpenMobile(false);
                  }
                  onStartChatInFolder?.(projectId);
                }}
                onCreateSessionForRepo={handleImportRepo}
                renderSessionRow={(sessionItem) => (
                  <div key={sessionItem.id}>
                    <SessionRow
                      session={sessionItem}
                      isActive={sessionItem.id === activeSessionId}
                      isPending={sessionItem.id === pendingSessionId}
                      folders={customProjects}
                      onSessionClick={handleSessionClick}
                      onSessionPrefetch={handleSessionPrefetch}
                      onRenameSession={onRenameSession}
                      onMoveSessionToFolder={onMoveSessionToFolder}
                      onArchiveSession={handleArchiveSession}
                      onUnarchiveSession={handleUnarchiveSession}
                      onOpenBranchPicker={handleOpenBranchPicker}
                    />
                    {sessionItem.id === activeSessionId && (
                      <SessionChildChats sessionId={sessionItem.id} />
                    )}
                  </div>
                )}
              />

              {recencyGroups.length > 0 ? (
                <div className="mt-1 space-y-3 border-t border-border/50 pt-2">
                  {recencyGroups.map((group) => (
                    <div key={group.label} className="space-y-0.5">
                      <div className="flex h-6 items-center justify-between px-2">
                        <span className="text-[11px] font-medium text-muted-foreground/75">
                          {group.label}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {group.sessions.map((sessionItem) => (
                          <div key={sessionItem.id}>
                            <SessionRow
                              session={sessionItem}
                              isActive={sessionItem.id === activeSessionId}
                              isPending={sessionItem.id === pendingSessionId}
                              folders={customProjects}
                              onSessionClick={handleSessionClick}
                              onSessionPrefetch={handleSessionPrefetch}
                              onRenameSession={onRenameSession}
                              onMoveSessionToFolder={onMoveSessionToFolder}
                              onArchiveSession={handleArchiveSession}
                              onUnarchiveSession={handleUnarchiveSession}
                              onOpenBranchPicker={handleOpenBranchPicker}
                            />
                            {sessionItem.id === activeSessionId && (
                              <SessionChildChats sessionId={sessionItem.id} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : projectGroups.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No chats yet
                </div>
              ) : null}
            </>
          ) : filteredDisplayedSessions.length === 0 ? (
            <div className="px-3 py-12 text-center text-xs text-muted-foreground">
              {desktopSearchQuery
                ? "No matching sessions"
                : (archivedSessionsError ?? "No archived sessions")}
              {showArchived && archivedSessionsError ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRetryArchivedSessions}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-0.5">
                {filteredDisplayedSessions.map((sessionItem) => (
                  <div key={sessionItem.id}>
                    <SessionRow
                      session={sessionItem}
                      isActive={sessionItem.id === activeSessionId}
                      isPending={sessionItem.id === pendingSessionId}
                      onSessionClick={handleSessionClick}
                      onSessionPrefetch={handleSessionPrefetch}
                      onRenameSession={onRenameSession}
                      onArchiveSession={handleArchiveSession}
                      onUnarchiveSession={handleUnarchiveSession}
                      onOpenBranchPicker={handleOpenBranchPicker}
                    />
                    {sessionItem.id === activeSessionId && (
                      <SessionChildChats sessionId={sessionItem.id} />
                    )}
                  </div>
                ))}
              </div>

              {showArchived &&
              (hasMoreArchivedSessions || archivedSessionsError) ? (
                <div className="px-2 pb-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={
                      archivedSessionsError
                        ? handleRetryArchivedSessions
                        : handleLoadMoreArchivedSessions
                    }
                    disabled={archivedSessionsLoading}
                  >
                    {archivedSessionsLoading
                      ? "Loading..."
                      : archivedSessionsError
                        ? "Retry loading archived sessions"
                        : "Load more archived sessions"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Ultra-Compact Bottom Dock: Single-Row Usage Bar + User Profile */}
        {sidebarUser ? (
          <div className="mt-1 space-y-1 border-t border-border/50 px-1.5 py-2">
            <DesktopCodexBillingStatus />
            <div className="flex items-center gap-1.5">
              <Popover open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onMouseEnter={() => {
                      router.prefetch("/settings/usage");
                      router.prefetch("/settings/profile");
                    }}
                    onFocus={() => {
                      router.prefetch("/settings/usage");
                      router.prefetch("/settings/profile");
                    }}
                    className={`flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                      profileMenuOpen
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/60 text-foreground"
                    }`}
                    aria-label="Open profile menu"
                  >
                    <Avatar className="h-6 w-6 shrink-0 border border-border/60">
                      {sidebarUser.avatar ? (
                        <AvatarImage
                          src={sidebarUser.avatar}
                          alt={sidebarUser.username}
                        />
                      ) : null}
                      <AvatarFallback className="bg-background text-[10px]">
                        <EntryMark className="h-3 w-3 text-foreground" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none text-foreground">
                      {sidebarUser.username}
                    </span>
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="w-[244px] overflow-hidden rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-xl"
                >
                  {/* User Identity Header */}
                  <div className="flex items-center justify-between gap-2.5 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
                        {sidebarUser.username}
                      </p>
                      {sidebarUser.email ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {sidebarUser.email}
                        </p>
                      ) : null}
                    </div>
                    <Avatar className="h-7 w-7 shrink-0 border border-border/60">
                      {sidebarUser.avatar ? (
                        <AvatarImage
                          src={sidebarUser.avatar}
                          alt={sidebarUser.username}
                        />
                      ) : null}
                      <AvatarFallback className="bg-background text-xs">
                        <EntryMark className="h-3.5 w-3.5 text-foreground" />
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  <div className="border-t border-border py-1">
                    {billingData?.expiresAt ? (
                      <div className="flex w-full items-center justify-between px-3.5 py-1.5 text-[12px] text-muted-foreground">
                        <span>Expires</span>
                        <span className="font-mono text-xs tabular-nums text-foreground/80">
                          {formatExpirationDate(billingData.expiresAt)}
                        </span>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onMouseEnter={() => router.prefetch("/settings/usage")}
                      onFocus={() => router.prefetch("/settings/usage")}
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (isMobile) setOpenMobile(false);
                        router.push("/settings/usage");
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-[13px] text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 cursor-pointer"
                    >
                      <span>Usage &amp; balance</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {creditDisplay}
                      </span>
                    </button>

                    <button
                      type="button"
                      onMouseEnter={() => router.prefetch("/settings/profile")}
                      onFocus={() => router.prefetch("/settings/profile")}
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (isMobile) setOpenMobile(false);
                        router.push("/settings/profile");
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-[13px] text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 cursor-pointer"
                    >
                      <span>Settings</span>
                      <Settings
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>

                  <div className="border-t border-border py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (isMobile) setOpenMobile(false);
                        setFeedbackOpen(true);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-[13px] text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 cursor-pointer"
                    >
                      <span>Feedback</span>
                      <SmilePlus
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    </button>

                    <div className="flex items-center justify-between px-3.5 py-1.5 text-[13px] text-foreground">
                      <span>Theme</span>
                      <div className="flex items-center gap-0.5 rounded-full border border-border bg-background/60 p-0.5">
                        <button
                          type="button"
                          onClick={() => setTheme("system")}
                          aria-label="System theme"
                          title="System theme"
                          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                            theme === "system"
                              ? "border border-border bg-muted text-foreground shadow-2xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Monitor className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme("light")}
                          aria-label="Light theme"
                          title="Light theme"
                          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                            theme === "light"
                              ? "border border-border bg-muted text-foreground shadow-2xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Sun className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheme("dark")}
                          aria-label="Dark theme"
                          title="Dark theme"
                          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${
                            theme === "dark"
                              ? "border border-border bg-muted text-foreground shadow-2xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Moon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (isMobile) setOpenMobile(false);
                        void signOut();
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-[13px] text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/60 cursor-pointer"
                    >
                      <span>Sign out</span>
                      <LogOut
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>
                </PopoverContent>
              </Popover>

              <DesktopBalanceBox />
            </div>
          </div>
        ) : null}
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      <GitHubImportDialog
        open={importGithubOpen}
        onOpenChange={setImportGithubOpen}
        onImportRepo={handleImportRepo}
      />

      {branchPickerRepo ? (
        <BranchPickerDialog
          open={Boolean(branchPickerRepo)}
          onOpenChange={(open) => {
            if (!open) setBranchPickerRepo(null);
          }}
          owner={branchPickerRepo.owner}
          repo={branchPickerRepo.repo}
          isCreating={isCreatingFromBranch}
          onSelectBranch={handleBranchSelected}
        />
      ) : null}

      {/* Archive confirmation dialog */}
      <Dialog
        open={archiveConfirmSession !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveConfirmSession(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive chat?</DialogTitle>
            <DialogDescription>
              This will stop the sandbox and archive the chat. You can still
              view it in the archive tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                void handleConfirmArchive();
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
