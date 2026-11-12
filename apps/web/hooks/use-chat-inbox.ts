"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function useChatInbox(chatId: string | undefined, isStreaming: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const refresh = useCallback(async () => {
    if (!chatId) return;
    try {
      const res = await fetch(`/api/chat/${chatId}/inbox`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        unreadCount?: number;
        totalCount?: number;
      };
      if (typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
      if (typeof data.totalCount === "number") {
        setTotalCount(data.totalCount);
      }
    } catch {
      // Non-fatal: inbox badge will refresh on next poll
    }
  }, [chatId]);

  useEffect(() => {
    void refresh();
  }, [refresh, isStreaming]);

  const sendInboxMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!chatId || !trimmed) return false;
      setIsSending(true);
      try {
        const res = await fetch(`/api/chat/${chatId}/inbox`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });
        if (!res.ok) {
          toast.error("Failed to send inbox message");
          return false;
        }
        const data = (await res.json()) as {
          unreadCount?: number;
          totalCount?: number;
        };
        if (typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        } else {
          setUnreadCount((c) => c + 1);
        }
        if (typeof data.totalCount === "number") {
          setTotalCount(data.totalCount);
        } else {
          setTotalCount((c) => c + 1);
        }
        toast.success("Sent to agent inbox — agent will read on next step");
        return true;
      } catch {
        toast.error("Failed to send inbox message");
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [chatId],
  );

  return {
    unreadCount,
    totalCount,
    isSending,
    sendInboxMessage,
    refreshInbox: refresh,
  };
}
