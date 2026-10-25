"use client";

import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  type SessionChatListItem,
  useSessionChats,
} from "@/hooks/use-session-chats";
import type { Session } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  GitPanelProvider,
  useGitPanel,
} from "./chats/[chatId]/git-panel-context";
import { SessionHeader } from "./chats/[chatId]/session-header";
import { ChatTabs } from "./chats/[chatId]/chat-tabs";
import { SessionLayoutContext } from "./session-layout-context";

type SessionLayoutShellProps = {
  session: Session;
  initialChatsData?: {
    defaultModelId: string | null;
    chats: SessionChatListItem[];
  };
  children: ReactNode;
};

/**
 * Inner component that reads panelContent from context and renders
 * the horizontal split: left column (header + tabs + page) | third column workspace.
 */
function SessionLayoutInner({
  activeChatId,
  children,
}: {
  activeChatId: string;
  children: ReactNode;
}) {
  const {
    panelPortalRef,
    gitPanelOpen,
    setGitPanelOpen,
    isWorkspaceExpanded,
  } = useGitPanel();

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Left column: header + tabs + chat content */}
      <div
        className={cn(
          "flex min-w-0 flex-col overflow-hidden transition-all duration-200",
          gitPanelOpen && isWorkspaceExpanded
            ? "hidden"
            : gitPanelOpen
              ? "flex-1 lg:flex-none lg:w-[460px] xl:w-[500px] 2xl:w-[540px] shrink-0 border-r border-border"
              : "flex-1",
        )}
      >
        <SessionHeader />
        {activeChatId && <ChatTabs activeChatId={activeChatId} />}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>

      {/* Mobile backdrop for outside-click dismissal */}
      {gitPanelOpen && (
        <button
          type="button"
          aria-label="Close workspace"
          className="absolute inset-0 z-20 bg-background/40 backdrop-blur-sm lg:hidden"
          onClick={() => setGitPanelOpen(false)}
        />
      )}

      {/* Portal target for the third-column workspace — slideover on mobile, dedicated workspace panel on desktop */}
      <div
        ref={panelPortalRef}
        className={cn(
          "absolute right-0 top-0 z-30 flex h-full flex-col overflow-hidden border-l border-border bg-background shadow-xl transition-all duration-200 ease-in-out lg:relative lg:right-auto lg:top-auto lg:z-0 lg:shadow-none",
          gitPanelOpen
            ? isWorkspaceExpanded
              ? "w-full translate-x-0"
              : "w-[92vw] sm:w-[540px] lg:w-auto lg:flex-1 translate-x-0"
            : "w-0 translate-x-full lg:translate-x-0 border-l-0 overflow-hidden pointer-events-none",
        )}
      />
    </div>
  );
}

export function SessionLayoutShell({
  session: initialSession,
  initialChatsData,
  children,
}: SessionLayoutShellProps) {
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();
  const routeChatId = params.chatId ?? "";
  const [optimisticActiveChatId, setOptimisticActiveChatId] = useState<
    string | null
  >(null);
  const [_isNavigatingChat, startChatNavigationTransition] = useTransition();
  const prefetchedChatHrefsRef = useRef(new Set<string>());

  const sessionId = initialSession.id;

  const {
    chats,
    loading: chatsLoading,
    createChat,
    deleteChat,
    renameChat,
  } = useSessionChats(sessionId, { initialData: initialChatsData });

  const getChatHref = useCallback(
    (chatId: string) => `/sessions/${sessionId}/chats/${chatId}`,
    [sessionId],
  );

  const switchChat = useCallback(
    (chatId: string) => {
      if (chatId === (optimisticActiveChatId ?? routeChatId)) {
        return;
      }

      const href = getChatHref(chatId);
      prefetchedChatHrefsRef.current.add(href);
      setOptimisticActiveChatId(chatId);
      startChatNavigationTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [getChatHref, optimisticActiveChatId, routeChatId, router],
  );

  useEffect(() => {
    if (optimisticActiveChatId && optimisticActiveChatId === routeChatId) {
      setOptimisticActiveChatId(null);
    }
  }, [optimisticActiveChatId, routeChatId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const chat of chats.slice(0, 6)) {
        const href = getChatHref(chat.id);
        if (prefetchedChatHrefsRef.current.has(href)) {
          continue;
        }

        prefetchedChatHrefsRef.current.add(href);
        router.prefetch(href);
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [chats, getChatHref, router]);

  const activeChatId = optimisticActiveChatId ?? routeChatId;

  const layoutContext = useMemo(
    () => ({
      session: {
        title: initialSession.title,
        repoName: initialSession.repoName,
        repoOwner: initialSession.repoOwner,
        cloneUrl: initialSession.cloneUrl,
        branch: initialSession.branch,
        status: initialSession.status,
        prNumber: initialSession.prNumber,
        prStatus: initialSession.prStatus ?? null,
        linesAdded: initialSession.linesAdded,
        linesRemoved: initialSession.linesRemoved,
      },
      chats,
      chatsLoading,
      createChat,
      switchChat,
      deleteChat,
      renameChat,
    }),
    [
      initialSession,
      chats,
      chatsLoading,
      createChat,
      switchChat,
      deleteChat,
      renameChat,
    ],
  );

  return (
    <SessionLayoutContext.Provider value={layoutContext}>
      <GitPanelProvider>
        <SessionLayoutInner activeChatId={activeChatId}>
          {children}
        </SessionLayoutInner>
      </GitPanelProvider>
    </SessionLayoutContext.Provider>
  );
}
