"use client";

import { MessageSquare, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useSessionChats } from "@/hooks/use-session-chats";
import { cn } from "@/lib/utils";

/**
 * Desktop-only child chat list under the active session row in the sidebar,
 * replacing the in-chat ChatTabs strip on desktop.
 */
export function SessionChildChats({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();
  const activeChatId = params?.chatId ?? "";
  const { chats, createChat } = useSessionChats(sessionId);
  const [creating, setCreating] = useState(false);

  const handleNewChat = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createChat();
      if (created?.chat?.id) {
        router.push(`/sessions/${sessionId}/chats/${created.chat.id}`);
      }
    } finally {
      setCreating(false);
    }
  };

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
            onClick={() =>
              router.push(`/sessions/${sessionId}/chats/${chat.id}`)
            }
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
        disabled={creating}
        onClick={() => void handleNewChat()}
        className="sable-child-row sable-child-new"
      >
        <Plus
          size={12}
          strokeWidth={1.8}
          className="shrink-0"
          aria-hidden="true"
        />
        <span className="truncate">{creating ? "Creating…" : "New chat"}</span>
      </button>
    </div>
  );
}
