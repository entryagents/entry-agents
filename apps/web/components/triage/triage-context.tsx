"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import type { TriagePrompt } from "@/lib/triage/deck";

export interface ActiveChatTriageHandlers {
  chatId: string;
  livePrompts: TriagePrompt[];
  onApproveTool: (approvalId: string) => void;
  onDenyTool: (approvalId: string, reason?: string) => void;
  onSubmitQuestion: (answers: Record<string, string | string[]>) => void;
  onCancelQuestion: () => void;
}

interface TriageContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  prompts: TriagePrompt[];
  activeHandlers: ActiveChatTriageHandlers | null;
  setActiveHandlers: (handlers: ActiveChatTriageHandlers | null) => void;
  refreshPending: () => void;
}

const TriageContext = createContext<TriageContextValue | undefined>(undefined);

export function TriageProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [activeHandlers, setActiveHandlers] =
    useState<ActiveChatTriageHandlers | null>(null);

  const { data, mutate } = useSWR<{ prompts: TriagePrompt[] }>(
    "/api/triage/pending",
    fetcher,
    {
      refreshInterval: open ? 4000 : 20000,
      revalidateOnFocus: true,
    },
  );

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // Global Ctrl+I / Cmd+I shortcut to toggle the Triage Deck.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        if (e.key.toLowerCase() === "i") {
          e.preventDefault();
          setOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const prompts = useMemo(() => {
    const remote = data?.prompts ?? [];
    if (!activeHandlers) return remote;
    // Prefer live in-memory prompts for the active chat; merge other chats from API.
    const otherChats = remote.filter((p) => p.chatId !== activeHandlers.chatId);
    return [...activeHandlers.livePrompts, ...otherChats];
  }, [data?.prompts, activeHandlers]);

  const refreshPending = useCallback(() => {
    void mutate();
  }, [mutate]);

  const value = useMemo<TriageContextValue>(
    () => ({
      open,
      setOpen,
      toggle,
      prompts,
      activeHandlers,
      setActiveHandlers,
      refreshPending,
    }),
    [open, toggle, prompts, activeHandlers, refreshPending],
  );

  return (
    <TriageContext.Provider value={value}>{children}</TriageContext.Provider>
  );
}

export function useTriage(): TriageContextValue {
  const ctx = useContext(TriageContext);
  if (!ctx) {
    throw new Error("useTriage must be used inside a TriageProvider");
  }
  return ctx;
}
