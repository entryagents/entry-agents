"use client";

import { useParams, useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { InboxSidebar } from "@/components/inbox-sidebar";
import { SidebarResize } from "@/components/sidebar/sidebar-resize";
import { NewSessionDialog } from "@/components/new-session-dialog";
import { QuickSwitch } from "@/components/sessions/quick-switch";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useBackgroundChatNotifications } from "@/hooks/use-background-chat-notifications";
import { useSessions, type SessionWithUnread } from "@/hooks/use-sessions";
import { useProjects } from "@/hooks/use-projects";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { Session as AuthSession } from "@/lib/session/types";
import { SessionsShellProvider } from "./sessions-shell-context";

type SessionsRouteShellProps = {
  children: ReactNode;
  currentUser: AuthSession["user"];
  initialSessionsData?: {
    sessions: SessionWithUnread[];
    archivedCount: number;
  };
  lastRepo: { owner: string; repo: string } | null;
};

const RouteContentShell = memo(function RouteContentShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {children}
    </SidebarInset>
  );
});

export function SessionsRouteShell({
  children,
  currentUser,
  initialSessionsData,
  lastRepo,
}: SessionsRouteShellProps) {
  const router = useRouter();
  const params = useParams<{ sessionId?: string; chatId?: string }>();
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [optimisticActiveSessionId, setOptimisticActiveSessionId] = useState<
    string | null
  >(null);
  const [isNavigating, startNavigationTransition] = useTransition();
  const prefetchedSessionHrefsRef = useRef(new Set<string>());

  const {
    sessions,
    archivedCount,
    loading: sessionsLoading,
    createSession,
    renameSession,
    moveSessionToProject,
    archiveSession,
    unarchiveSession,
  } = useSessions({
    enabled: true,
    includeArchived: false,
    initialData: initialSessionsData,
  });

  const routeChatId = typeof params.chatId === "string" ? params.chatId : null;
  const routeSessionId =
    typeof params.sessionId === "string"
      ? params.sessionId
      : routeChatId
        ? (sessions.find((s) => s.latestChatId === routeChatId)?.id ?? null)
        : null;

  const {
    projects: customProjects,
    createProject,
    createRepoProject,
    renameProject,
    deleteProject,
  } = useProjects({ enabled: true });

  const getSessionHref = useCallback((targetSession: SessionWithUnread) => {
    if (targetSession.latestChatId) {
      return `/chats/${targetSession.latestChatId}`;
    }

    return `/chats/${targetSession.id}`;
  }, []);

  const { preferences } = useUserPreferences();

  const openNewSessionDialog = useCallback(() => {
    setOptimisticActiveSessionId(null);
    if (routeSessionId || routeChatId) {
      startNavigationTransition(() => {
        router.push("/chats", { scroll: false });
      });
    }
  }, [routeChatId, routeSessionId, router, startNavigationTransition]);

  const handleSessionClick = useCallback(
    (targetSession: SessionWithUnread) => {
      if (targetSession.id === (optimisticActiveSessionId ?? routeSessionId)) {
        return;
      }

      const href = getSessionHref(targetSession);
      prefetchedSessionHrefsRef.current.add(href);
      setOptimisticActiveSessionId(targetSession.id);
      startNavigationTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [
      getSessionHref,
      optimisticActiveSessionId,
      routeSessionId,
      router,
      startNavigationTransition,
    ],
  );

  const handleSessionPrefetch = useCallback(
    (targetSession: SessionWithUnread) => {
      const href = getSessionHref(targetSession);
      if (prefetchedSessionHrefsRef.current.has(href)) {
        return;
      }

      prefetchedSessionHrefsRef.current.add(href);
      router.prefetch(href);
    },
    [getSessionHref, router],
  );

  useEffect(() => {
    const prefetchSidebarTargets = () => {
      const staticTargets = ["/chats", "/settings/profile", "/settings/usage"];
      for (const href of staticTargets) {
        if (prefetchedSessionHrefsRef.current.has(href)) {
          continue;
        }
        prefetchedSessionHrefsRef.current.add(href);
        router.prefetch(href);
      }

      for (const session of sessions.slice(0, 15)) {
        const href = getSessionHref(session);
        if (prefetchedSessionHrefsRef.current.has(href)) {
          continue;
        }

        prefetchedSessionHrefsRef.current.add(href);
        router.prefetch(href);
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(prefetchSidebarTargets, {
        timeout: 300,
      });
      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timer = window.setTimeout(prefetchSidebarTargets, 150);
    return () => {
      window.clearTimeout(timer);
    };
  }, [getSessionHref, router, sessions]);

  const handleRenameSession = useCallback(
    async (targetSessionId: string, title: string) => {
      await renameSession(targetSessionId, title);
    },
    [renameSession],
  );

  const handleArchiveSession = useCallback(
    async (targetSessionId: string) => {
      await archiveSession(targetSessionId);

      if (targetSessionId === routeSessionId) {
        setOptimisticActiveSessionId(null);
        startNavigationTransition(() => {
          router.push("/chats", { scroll: false });
        });
      }
    },
    [archiveSession, routeSessionId, router, startNavigationTransition],
  );

  const handleUnarchiveSession = useCallback(
    async (targetSessionId: string) => {
      await unarchiveSession(targetSessionId);

      if (targetSessionId === routeSessionId) {
        window.location.reload();
      }
    },
    [routeSessionId, unarchiveSession],
  );

  const handleCreateSessionForRepo = useCallback(
    async (repoOwner: string, repoName: string) => {
      try {
        const project = await createRepoProject({ repoOwner, repoName });
        setOptimisticActiveSessionId(null);
        const query = new URLSearchParams({
          repoOwner: project.repoOwner ?? repoOwner,
          repoName: project.repoName ?? repoName,
          projectId: project.id,
        });
        startNavigationTransition(() => {
          router.push(`/chats?${query.toString()}`, {
            scroll: false,
          });
        });
      } catch (error) {
        console.error("Failed to create repository project:", error);
      }
    },
    [createRepoProject, router, startNavigationTransition],
  );

  const handleCreateSessionFromBranch = useCallback(
    async (repoOwner: string, repoName: string, branch: string) => {
      try {
        const project = await createRepoProject({
          repoOwner,
          repoName,
          defaultBranch: branch,
        });
        setOptimisticActiveSessionId(null);
        const query = new URLSearchParams({
          repoOwner: project.repoOwner ?? repoOwner,
          repoName: project.repoName ?? repoName,
          projectId: project.id,
          branch,
        });
        startNavigationTransition(() => {
          router.push(`/chats?${query.toString()}`, {
            scroll: false,
          });
        });
      } catch (error) {
        console.error("Failed to open new chat for branch:", error);
      }
    },
    [createRepoProject, router, startNavigationTransition],
  );

  useEffect(() => {
    if (
      optimisticActiveSessionId &&
      optimisticActiveSessionId === routeSessionId
    ) {
      setOptimisticActiveSessionId(null);
    }
  }, [optimisticActiveSessionId, routeSessionId]);

  const activeSessionId = optimisticActiveSessionId ?? routeSessionId ?? "";
  const pendingSessionId = isNavigating ? optimisticActiveSessionId : null;

  useBackgroundChatNotifications(sessions, routeSessionId, handleSessionClick, {
    alertsEnabled: preferences?.alertsEnabled ?? true,
    alertSoundEnabled: preferences?.alertSoundEnabled ?? true,
  });

  const shellContextValue = useMemo(
    () => ({
      openNewSessionDialog,
      createSession,
    }),
    [createSession, openNewSessionDialog],
  );

  const handleStartChatInFolder = useCallback(
    (projectId: string) => {
      setOptimisticActiveSessionId(null);
      startNavigationTransition(() => {
        router.push(`/chats?projectId=${encodeURIComponent(projectId)}`, {
          scroll: false,
        });
      });
    },
    [router, startNavigationTransition],
  );

  return (
    <SessionsShellProvider value={shellContextValue}>
      <SidebarProvider
        className="h-dvh overflow-hidden"
        style={
          {
            "--sidebar-width": "16.5rem",
          } as CSSProperties
        }
      >
        <Sidebar collapsible="offcanvas" className="border-r border-border">
          <SidebarContent className="bg-muted/20">
            <InboxSidebar
              sessions={sessions}
              customProjects={customProjects}
              archivedCount={archivedCount}
              sessionsLoading={sessionsLoading}
              activeSessionId={activeSessionId}
              pendingSessionId={pendingSessionId}
              onSessionClick={handleSessionClick}
              onSessionPrefetch={handleSessionPrefetch}
              onRenameSession={handleRenameSession}
              onMoveSessionToFolder={async (sessionId, projectId) => {
                await moveSessionToProject(sessionId, projectId);
              }}
              onArchiveSession={handleArchiveSession}
              onUnarchiveSession={handleUnarchiveSession}
              onOpenNewSession={openNewSessionDialog}
              onCreateFolder={async (name, assignSessionId) => {
                const created = await createProject(name, {
                  assignSessionId: assignSessionId ?? null,
                });
                handleStartChatInFolder(created.id);
              }}
              onRenameFolder={async (projectId, name) => {
                await renameProject(projectId, name);
              }}
              onDeleteFolder={deleteProject}
              onStartChatInFolder={handleStartChatInFolder}
              onCreateSessionForRepo={handleCreateSessionForRepo}
              onCreateSessionFromBranch={handleCreateSessionFromBranch}
              initialUser={currentUser}
            />
          </SidebarContent>
        </Sidebar>
        <SidebarResize />
        <RouteContentShell>{children}</RouteContentShell>
      </SidebarProvider>

      <QuickSwitch
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSessionClick}
      />

      <NewSessionDialog
        open={newSessionOpen}
        onOpenChange={setNewSessionOpen}
        lastRepo={lastRepo}
        createSession={createSession}
      />
    </SessionsShellProvider>
  );
}
