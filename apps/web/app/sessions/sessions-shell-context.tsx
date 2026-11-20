"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { CreateSessionInput } from "@/hooks/use-sessions";

type SessionsShellContextValue = {
  openNewSessionDialog: () => void;
  createSession: (input: CreateSessionInput) => Promise<{
    session: { id: string };
    chat: { id: string };
    workflowRunId?: string | null;
    initialWorkflowScheduled?: boolean;
  }>;
};

const SessionsShellContext = createContext<
  SessionsShellContextValue | undefined
>(undefined);

export function SessionsShellProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SessionsShellContextValue;
}) {
  return (
    <SessionsShellContext.Provider value={value}>
      {children}
    </SessionsShellContext.Provider>
  );
}

export function useSessionsShell() {
  const context = useContext(SessionsShellContext);

  if (!context) {
    throw new Error(
      "useSessionsShell must be used within SessionsShellProvider",
    );
  }

  return context;
}
