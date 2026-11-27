"use client";

import { MessageSquare, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useSessionChats } from "@/hooks/use-session-chats";
import { cn } from "@/lib/utils";

/**
 * Desktop-only child chat list under the active session row in the sidebar,
 * replacing the in-chat ChatTabs strip on desktop.
 *
 * Clicking "New chat" routes cleanly to the New Chat composer pre-targeted to
 * this session (`/chats?sessionId=...`) instead of eagerly creating an empty
 * chat row in the database.
 */
export function SessionChildChats({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();
  const activeChatId = params?.chatId ?? "";
  const { chats } = useSessionChats(sessionId);

  const newChatHref = `/chats?sessionId=${encodeURIComponent(sessionId)}`;

  if (chats.length === 0) return null;

  return (
    <div
      className="hidden md:flex sable-child-list"
      role="list"
      aria-label="Session chats"
    >
      {chats.map((chat) => {
        const isActive = chat.id === activeChatId;
        return (
          <button
            key={chat.id}
            type="button"
            role="listitem"
            data-on={isActive ? "" : undefined}
            className={cn("sable-child-row", isActive && "font-medium")}
            onClick={() => router.push(`/chats/${chat.id}`)}
            onMouseEnter={() => router.prefetch(`/chats/${chat.id}`)}
            onFocus={() => router.prefetch(`/chats/${chat.id}`)}
          >
            <MessageSquare
              size={12}
              strokeWidth={1.6}
              className="shrink-0 opacity-70"
              aria-hidden="true"
            />
            <span className="truncate flex-1">{chat.title || "New chat"}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => router.push(newChatHref, { scroll: false })}
        onMouseEnter={() => router.prefetch(newChatHref)}
        onFocus={() => router.prefetch(newChatHref)}
        className="sable-child-row sable-child-new"
      >
        <Plus
          size={12}
          strokeWidth={1.8}
          className="shrink-0"
          aria-hidden="true"
        />
        <span className="truncate">New chat</span>
      </button>
    </div>
  );
}
