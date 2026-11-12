"use client";

import { useParams, useRouter } from "next/navigation";
import { FileText, GitCompare, Pencil, Plus, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSessionLayout } from "@/app/sessions/[sessionId]/session-layout-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { SubagentIcon } from "@/components/agent-hub/agent-status";
import { FileTypeIcon } from "@/components/file-type-icons";
import { useGitPanel } from "./git-panel-context";

type ChatTabsProps = {
  activeChatId: string;
};

export function ChatTabs({ activeChatId }: ChatTabsProps) {
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const sessionId = params.sessionId ?? "";
  const { chats, createChat, switchChat, deleteChat, renameChat } =
    useSessionLayout();
  const {
    activeView,
    setActiveView,
    focusedDiffFile,
    setFocusedDiffFile,
    changesTabDismissed,
    setChangesTabDismissed,
    focusedFilePath,
    setFocusedFilePath,
    agentOpenFiles,
    switchAgentFileTab,
    closeAgentFileTab,
    fileTabDismissed,
    setFileTabDismissed,
    activeSubagentId,
    activeSubagentTitle,
    activeSubagentType,
    subagentTabDismissed,
    closeSubagentTab,
  } = useGitPanel();

  const isMobile = useIsMobile();

  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeChatTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (container.scrollWidth <= container.clientWidth) return;

      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (activeView !== "chat") {
      return;
    }

    activeChatTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeChatId, activeView, chats.length]);

  const prefetchedChatHrefsRef = useRef(new Set<string>());

  const prefetchChat = useCallback(
    (chatId: string) => {
      if (!sessionId) {
        return;
      }

      const href = `/sessions/${sessionId}/chats/${chatId}`;
      if (prefetchedChatHrefsRef.current.has(href)) {
        return;
      }

      prefetchedChatHrefsRef.current.add(href);
      router.prefetch(href);
    },
    [router, sessionId],
  );

  const [changesTabIndex, setChangesTabIndex] = useState<number | null>(null);
  useEffect(() => {
    const isChangesVisible = !changesTabDismissed && !!focusedDiffFile;
    if (isChangesVisible && changesTabIndex === null) {
      setChangesTabIndex(chats.length);
    } else if (!isChangesVisible) {
      setChangesTabIndex(null);
    }
  }, [focusedDiffFile, changesTabDismissed, chats.length, changesTabIndex]);

  const [fileTabIndex, setFileTabIndex] = useState<number | null>(null);
  useEffect(() => {
    const isFileVisible = agentOpenFiles.length > 0;
    if (isFileVisible && fileTabIndex === null) {
      setFileTabIndex(
        chats.length + (!changesTabDismissed && !!focusedDiffFile ? 1 : 0),
      );
    } else if (!isFileVisible) {
      setFileTabIndex(null);
    }
  }, [
    agentOpenFiles.length,
    chats.length,
    fileTabIndex,
    changesTabDismissed,
    focusedDiffFile,
  ]);

  const [subagentTabIndex, setSubagentTabIndex] = useState<number | null>(null);
  useEffect(() => {
    const isSubagentVisible = !subagentTabDismissed && !!activeSubagentId;
    if (isSubagentVisible && subagentTabIndex === null) {
      setSubagentTabIndex(
        chats.length +
          (!changesTabDismissed && !!focusedDiffFile ? 1 : 0) +
          (!fileTabDismissed && !!focusedFilePath ? 1 : 0),
      );
    } else if (!isSubagentVisible) {
      setSubagentTabIndex(null);
    }
  }, [
    activeSubagentId,
    subagentTabDismissed,
    chats.length,
    subagentTabIndex,
    changesTabDismissed,
    focusedDiffFile,
    fileTabDismissed,
    focusedFilePath,
  ]);

  const handleNewChat = () => {
    const { chat } = createChat();
    switchChat(chat.id);
    setActiveView("chat");
  };

  const handleCloseChanges = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveView("chat");
      setFocusedDiffFile(null);
      setChangesTabDismissed(true);
    },
    [setActiveView, setFocusedDiffFile, setChangesTabDismissed],
  );

  const handleCloseFile = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveView("chat");
      setFocusedFilePath(null);
      setFileTabDismissed(true);
    },
    [setActiveView, setFocusedFilePath, setFileTabDismissed],
  );

  const handleCloseSubagent = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      closeSubagentTab();
    },
    [closeSubagentTab],
  );

  const handleStartRename = useCallback(
    (chatId: string, currentTitle: string) => {
      setRenamingChatId(chatId);
      setRenameValue(currentTitle || "");
      setTimeout(() => renameInputRef.current?.select(), 0);
    },
    [],
  );

  const handleFinishRename = useCallback(async () => {
    if (!renamingChatId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      try {
        await renameChat(renamingChatId, trimmed);
      } catch (err) {
        console.error("Failed to rename chat:", err);
      }
    }
    setRenamingChatId(null);
  }, [renamingChatId, renameValue, renameChat]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingChatId) return;
    const idToDelete = deletingChatId;
    setDeletingChatId(null);

    try {
      await deleteChat(idToDelete);
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }

    if (idToDelete === activeChatId) {
      const remaining = chats.filter((c) => c.id !== idToDelete);
      if (remaining.length > 0) {
        switchChat(remaining[0].id);
      }
    }
  }, [deletingChatId, activeChatId, chats, deleteChat, switchChat]);

  const canDelete = chats.length > 1;
  const showChangesTab = !changesTabDismissed && !!focusedDiffFile;
  const insertAt = showChangesTab ? (changesTabIndex ?? chats.length) : null;
  const showFileTabs = agentOpenFiles.length > 0;
  const fileInsertAt = showFileTabs
    ? (fileTabIndex ?? chats.length + (showChangesTab ? 1 : 0))
    : null;

  const showSubagentTab = !subagentTabDismissed && !!activeSubagentId;
  const subagentInsertAt = showSubagentTab
    ? (subagentTabIndex ??
      chats.length +
        (showChangesTab ? 1 : 0) +
        (showFileTabs ? agentOpenFiles.length : 0))
    : null;

  const tabElements = useMemo(() => {
    const changesTabEl = showChangesTab ? (
      <div
        key="__changes__"
        className={cn(
          "group relative flex shrink-0 items-center border-b-2 transition-colors",
          activeView === "diff"
            ? "border-foreground text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <button
          type="button"
          onClick={() => setActiveView("diff")}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer"
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span>Changes</span>
        </button>
        <button
          type="button"
          onClick={handleCloseChanges}
          className={cn(
            "mr-1 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground cursor-pointer",
            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    ) : null;

    const fileTabEls = agentOpenFiles.map((filePath) => {
      const fileName = filePath.split("/").pop() ?? filePath;
      const isFocused = activeView === "file" && focusedFilePath === filePath;

      return (
        <div
          key={`__file_${filePath}__`}
          className={cn(
            "group relative flex shrink-0 items-center border-b-2 transition-colors",
            isFocused
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <button
            type="button"
            onClick={() => switchAgentFileTab(filePath)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer"
            title={filePath}
          >
            <FileTypeIcon path={fileName} className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[140px] truncate">{fileName}</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeAgentFileTab(filePath);
            }}
            className={cn(
              "mr-1 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground cursor-pointer",
              isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label={`Close ${fileName}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      );
    });

    const subagentTabEl = showSubagentTab ? (
      <div
        key="__subagent__"
        className={cn(
          "group relative flex shrink-0 items-center border-b-2 transition-colors",
          activeView === "subagent"
            ? "border-foreground text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <button
          type="button"
          onClick={() => setActiveView("subagent")}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer"
        >
          <SubagentIcon
            type={activeSubagentType ?? "agent"}
            className="h-3.5 w-3.5 text-muted-foreground"
          />
          <span className="max-w-[130px] truncate">
            {activeSubagentTitle || "Subagent"}
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
        </button>
        <button
          type="button"
          onClick={handleCloseSubagent}
          className={cn(
            "mr-1 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground cursor-pointer",
            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          aria-label="Close subagent tab"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    ) : null;

    const elements: ReactNode[] = [];

    chats.forEach((chat, index) => {
      if (insertAt === index) {
        elements.push(changesTabEl);
      }
      if (fileInsertAt === index) {
        elements.push(...fileTabEls);
      }
      if (subagentInsertAt === index) {
        elements.push(subagentTabEl);
      }

      const isActive = chat.id === activeChatId && activeView === "chat";
      const isRenaming = renamingChatId === chat.id;

      elements.push(
        <div
          key={chat.id}
          ref={isActive ? activeChatTabRef : undefined}
          className={cn(
            "group relative flex shrink-0 items-center border-b-2 transition-colors",
            isActive
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {isRenaming ? (
            <div className="flex items-center px-2 py-[7px]">
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => void handleFinishRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleFinishRename();
                  }
                  if (e.key === "Escape") {
                    setRenamingChatId(null);
                  }
                }}
                className="max-w-[130px] rounded border border-border bg-background px-1.5 py-0 text-sm font-medium outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            </div>
          ) : (
            <button
              type="button"
              onMouseEnter={() => prefetchChat(chat.id)}
              onFocus={() => prefetchChat(chat.id)}
              onClick={() => {
                if (chat.id !== activeChatId) {
                  switchChat(chat.id);
                }
                setActiveView("chat");
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer"
            >
              <span className="max-w-[120px] truncate">
                {chat.title || "New Chat"}
              </span>
              {chat.hasUnread && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          )}

          {!isRenaming && (
            <div
              className={cn(
                "flex items-center gap-0.5 pr-1 transition-opacity",
                isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(chat.id, chat.title || "");
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label="Rename chat"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingChatId(chat.id);
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                  aria-label="Close chat"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>,
      );
    });

    if (insertAt !== null && insertAt >= chats.length) {
      elements.push(changesTabEl);
    }

    if (fileInsertAt !== null && fileInsertAt >= chats.length) {
      elements.push(...fileTabEls);
    }

    if (subagentInsertAt !== null && subagentInsertAt >= chats.length) {
      elements.push(subagentTabEl);
    }

    return elements;
  }, [
    activeChatId,
    activeSubagentTitle,
    activeSubagentType,
    activeView,
    agentOpenFiles,
    canDelete,
    chats,
    closeAgentFileTab,
    fileInsertAt,
    focusedFilePath,
    handleCloseChanges,
    handleCloseSubagent,
    handleFinishRename,
    handleStartRename,
    insertAt,
    isMobile,
    prefetchChat,
    renameValue,
    renamingChatId,
    setActiveView,
    showChangesTab,
    showSubagentTab,
    subagentInsertAt,
    switchAgentFileTab,
    switchChat,
  ]);

  return (
    <>
      <div className="flex items-center gap-0 border-b border-border bg-muted/30 px-1">
        <div
          ref={scrollContainerRef}
          className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabElements}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleNewChat}
                className="ml-1 flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New chat</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Dialog
        open={deletingChatId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingChatId(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Close chat?</DialogTitle>
            <DialogDescription>
              This will permanently delete this chat and its messages. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingChatId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
