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
 * the horizontal split: left column (header + tabs + page) | draggable splitter | third column workspace.
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [chatWidthPercent, setChatWidthPercent] = useState<number>(48);
  const [isDragging, setIsDragging] = useState(false);

  // Restore saved width from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("entry_agents_workspace_split");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 20 && parsed <= 80) {
          setChatWidthPercent(parsed);
        }
      }
    } catch {}
  }, []);

  // Dragging event listeners
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(Math.max(newWidth, 20), 80);
      setChatWidthPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem("entry_agents_workspace_split", String(chatWidthPercent));
      } catch {}
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, chatWidthPercent]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-full overflow-hidden",
        isDragging && "select-none cursor-col-resize",
      )}
    >
      {/* Invisible overlay during drag to prevent iframes from intercepting mouse events */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}

      {/* Left column: header + tabs + chat content */}
      <div
        className={cn(
          "flex min-w-0 flex-col overflow-hidden transition-[width] duration-75",
          gitPanelOpen && isWorkspaceExpanded
            ? "hidden"
            : gitPanelOpen
              ? "flex-1 lg:flex-none shrink-0 border-r border-border"
              : "flex-1",
        )}
        style={{
          width:
            gitPanelOpen && !isWorkspaceExpanded
              ? typeof window !== "undefined" && window.innerWidth >= 1024
                ? `${chatWidthPercent}%`
                : undefined
              : undefined,
        }}
      >
        <SessionHeader />
        {activeChatId && <ChatTabs activeChatId={activeChatId} />}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>

      {/* Draggable Divider Handle (Desktop only) */}
      {gitPanelOpen && !isWorkspaceExpanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDoubleClick={() => {
            setChatWidthPercent(50);
            try {
              localStorage.setItem("entry_agents_workspace_split", "50");
            } catch {}
          }}
          className={cn(
            "hidden lg:flex relative items-center justify-center w-2 -mx-1 z-20 cursor-col-resize select-none shrink-0 group transition-colors",
            isDragging ? "bg-primary" : "hover:bg-primary/40 bg-transparent",
          )}
          title="Drag to resize panels, double-click to reset 50/50"
        >
          <div
            className={cn(
              "w-[1px] h-full bg-border transition-all group-hover:bg-primary group-hover:w-[2px]",
              isDragging && "bg-primary w-[2px]",
            )}
          />
        </div>
      )}

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
          "absolute right-0 top-0 z-30 flex h-full flex-col overflow-hidden border-l border-border bg-background shadow-xl transition-all duration-75 lg:relative lg:right-auto lg:top-auto lg:z-0 lg:shadow-none",
          gitPanelOpen
            ? isWorkspaceExpanded
              ? "w-full translate-x-0"
              : "w-[92vw] sm:w-[540px] lg:w-auto lg:flex-1 translate-x-0"
            : "w-0 translate-x-full lg:translate-x-0 border-l-0 overflow-hidden pointer-events-none",
        )}
        style={{
          width:
            gitPanelOpen && !isWorkspaceExpanded
              ? typeof window !== "undefined" && window.innerWidth >= 1024
                ? `${100 - chatWidthPercent}%`
                : undefined
              : undefined,
        }}
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
