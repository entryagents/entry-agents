"use client";

import { useParams, useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
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
import { ReviewProvider } from "./chats/[chatId]/review-context";
import { TriageProvider } from "@/components/triage/triage-context";
import { TriageDeck } from "@/components/triage/triage-deck";
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
 * Suppresses width/slide transitions across 2 animation frames whenever switching chats
 * so route transitions feel instant and never replay panel resize animations.
 */
function usePanelNavigationSuppression(key: string): boolean {
  const prevKeyRef = useRef(key);
  const [suppressed, setSuppressed] = useState(false);

  useEffect(() => {
    if (prevKeyRef.current === key) {
      return;
    }
    prevKeyRef.current = key;
    setSuppressed(true);

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setSuppressed(false);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) {
        window.cancelAnimationFrame(raf2);
      }
    };
  }, [key]);

  return suppressed;
}

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
  const { panelPortalRef, gitPanelOpen, setGitPanelOpen, isWorkspaceExpanded } =
    useGitPanel();
  const suppressPanelTransition = usePanelNavigationSuppression(activeChatId);

  const containerRef = useRef<HTMLDivElement>(null);
  const [chatWidthPercent, setChatWidthPercent] = useState<number>(46);
  const liveWidthRef = useRef<number>(46);
  const [isDragging, setIsDragging] = useState(false);

  const persistSplit = useCallback((nextWidth: number) => {
    try {
      localStorage.setItem("entry_agents_workspace_split", String(nextWidth));
    } catch {
      // Ignore localStorage write errors in restricted contexts
    }
  }, []);

  // Restore saved width from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("entry_agents_workspace_split");
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 22 && parsed <= 78) {
          liveWidthRef.current = parsed;
          setChatWidthPercent(parsed);
        }
      }
    } catch {
      // Ignore localStorage read errors in restricted contexts
    }
  }, []);

  useEffect(() => {
    liveWidthRef.current = chatWidthPercent;
  }, [chatWidthPercent]);

  // Dragging event listeners — update CSS custom properties directly on DOM
  // during mousemove so we never trigger full React tree re-renders per pixel.
  useEffect(() => {
    if (!isDragging) return;
    document.documentElement.dataset.railResizing = "true";

    let rafId = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(Math.max(newWidth, 22), 78);
      liveWidthRef.current = clamped;

      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        container.style.setProperty("--chat-width", `${clamped}%`);
        container.style.setProperty("--workspace-width", `${100 - clamped}%`);
      });
    };

    const handleMouseUp = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      const finalWidth = liveWidthRef.current;
      setIsDragging(false);
      setChatWidthPercent(finalWidth);
      persistSplit(finalWidth);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      delete document.documentElement.dataset.railResizing;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, persistSplit]);

  const splitStyles = useMemo(
    () =>
      ({
        "--chat-width": `${chatWidthPercent}%`,
        "--workspace-width": `${100 - chatWidthPercent}%`,
      }) as React.CSSProperties,
    [chatWidthPercent],
  );

  return (
    <div
      ref={containerRef}
      style={splitStyles}
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
          "flex min-w-0 flex-col overflow-hidden",
          !suppressPanelTransition &&
            !isDragging &&
            "transition-[width] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
          gitPanelOpen && isWorkspaceExpanded
            ? "hidden"
            : gitPanelOpen
              ? "flex-1 lg:w-[var(--chat-width)] lg:flex-none shrink-0 border-r border-border"
              : "flex-1",
        )}
      >
        <SessionHeader />
        {activeChatId && (
          <div className="md:hidden">
            <ChatTabs activeChatId={activeChatId} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>

      {/* Draggable Divider Handle (Desktop only) */}
      {gitPanelOpen && !isWorkspaceExpanded && (
        <div
          role="separator"
          aria-label="Resize chat and workspace panels"
          aria-orientation="vertical"
          aria-valuenow={Math.round(chatWidthPercent)}
          aria-valuemin={22}
          aria-valuemax={78}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDoubleClick={() => {
            setChatWidthPercent(50);
            persistSplit(50);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              const next = Math.max(22, chatWidthPercent - 2);
              setChatWidthPercent(next);
              persistSplit(next);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              const next = Math.min(78, chatWidthPercent + 2);
              setChatWidthPercent(next);
              persistSplit(next);
            } else if (e.key === "0" || e.key === "Home") {
              e.preventDefault();
              setChatWidthPercent(50);
              persistSplit(50);
            }
          }}
          className={cn(
            "hidden lg:flex relative items-center justify-center w-2 -mx-1 z-20 cursor-col-resize select-none shrink-0 group focus-visible:outline-none",
          )}
          title="Drag to resize panels · Double-click for 50/50"
        >
          <div
            className={cn(
              "w-[1px] h-full bg-border transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-foreground/25 group-focus-visible:bg-foreground/35",
              isDragging && "bg-foreground/45",
            )}
          />
          <div
            className={cn(
              "pointer-events-none absolute h-[72px] w-[3px] rounded-full bg-foreground/25 opacity-0 scale-y-[0.56] transition-[opacity,transform,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:scale-y-100 group-focus-visible:opacity-100 group-focus-visible:scale-y-100",
              isDragging && "opacity-100 scale-y-100 bg-foreground/50",
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
          "absolute right-0 top-0 z-30 flex h-full min-w-0 flex-col overflow-hidden border-l border-border bg-background shadow-xl lg:relative lg:right-auto lg:top-auto lg:z-0 lg:shadow-none",
          !suppressPanelTransition &&
            !isDragging &&
            "transition-[transform,width] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
          gitPanelOpen
            ? isWorkspaceExpanded
              ? "w-full translate-x-0 pb-[env(safe-area-inset-bottom)] lg:pb-0"
              : "w-full sm:w-[540px] lg:w-[var(--workspace-width)] lg:flex-none lg:shrink-0 translate-x-0 pb-[env(safe-area-inset-bottom)] lg:pb-0"
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
  const { mutate } = useSWRConfig();
  const params = useParams<{ chatId?: string }>();
  const routeChatId = params.chatId ?? "";
  const [optimisticActiveChatId, setOptimisticActiveChatId] = useState<
    string | null
  >(null);
  const [_isNavigatingChat, startChatNavigationTransition] = useTransition();
  const prefetchedChatHrefsRef = useRef(new Set<string>());

  const sessionId = initialSession.id;
  const [liveTitle, setLiveTitle] = useState(initialSession.title);

  useEffect(() => {
    setLiveTitle(initialSession.title);
  }, [initialSession.id, initialSession.title]);

  useEffect(() => {
    const onTitleUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{ sessionId?: string; title?: string }>
      ).detail;
      if (detail?.sessionId === sessionId && typeof detail.title === "string") {
        setLiveTitle(detail.title);
      }
    };
    window.addEventListener("entry:session-title-updated", onTitleUpdated);
    return () => {
      window.removeEventListener("entry:session-title-updated", onTitleUpdated);
    };
  }, [sessionId]);

  const renameSessionTitle = useCallback(
    async (nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (!trimmed || trimmed === liveTitle) return;
      const prevTitle = liveTitle;
      setLiveTitle(trimmed);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        const data = (await res.json()) as {
          session?: Session;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to update session title");
        }
        const confirmed = data.session?.title ?? trimmed;
        setLiveTitle(confirmed);
        window.dispatchEvent(
          new CustomEvent("entry:session-title-updated", {
            detail: { sessionId, title: confirmed },
          }),
        );
        await mutate<{ sessions: Session[] }>(
          "/api/sessions",
          (current) =>
            current
              ? {
                  ...current,
                  sessions: current.sessions.map((s) =>
                    s.id === sessionId ? { ...s, title: confirmed } : s,
                  ),
                }
              : current,
          { revalidate: false },
        );
      } catch (err) {
        setLiveTitle(prevTitle);
        throw err;
      }
    },
    [liveTitle, mutate, sessionId],
  );

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
        id: initialSession.id,
        title: liveTitle,
        createdAt: initialSession.createdAt,
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
      renameSessionTitle,
    }),
    [
      initialSession,
      liveTitle,
      chats,
      chatsLoading,
      createChat,
      switchChat,
      deleteChat,
      renameChat,
      renameSessionTitle,
    ],
  );

  return (
    <SessionLayoutContext.Provider value={layoutContext}>
      <GitPanelProvider>
        <ReviewProvider sessionId={initialSession.id}>
          <TriageProvider>
            <SessionLayoutInner activeChatId={activeChatId}>
              {children}
            </SessionLayoutInner>
            <TriageDeck />
          </TriageProvider>
        </ReviewProvider>
      </GitPanelProvider>
    </SessionLayoutContext.Provider>
  );
}
