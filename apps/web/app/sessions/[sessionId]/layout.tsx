import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getChatSummariesBySessionId } from "@/lib/db/sessions";
import { getSessionByIdCached } from "@/lib/db/sessions-cache";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { isUserAdmin } from "@/lib/db/users";
import { sanitizeUserPreferencesForSession } from "@/lib/model-access";
import { getServerSession } from "@/lib/session/get-server-session";
import { SessionLayoutShell } from "./session-layout-shell";

interface SessionLayoutProps {
  params: Promise<{ sessionId: string }>;
  children: ReactNode;
}

export default async function SessionLayout({
  params,
  children,
}: SessionLayoutProps) {
  const { sessionId } = await params;

  // Kick off independent reads immediately in parallel so auth, session,
  // headers, chat summaries, and preferences overlap instead of waterfalling.
  const sessionPromise = getServerSession();
  const sessionRecordPromise = getSessionByIdCached(sessionId);
  const headersPromise = headers();
  const preferencesPromise = sessionPromise
    .then((s) => (s?.user ? getUserPreferences(s.user.id) : null))
    .catch(() => null);
  const chatsPromise = sessionRecordPromise
    .then((rec) =>
      rec ? getChatSummariesBySessionId(sessionId, rec.userId) : null,
    )
    .catch(() => null);

  const [session, sessionRecord] = await Promise.all([
    sessionPromise,
    sessionRecordPromise,
  ]);
  if (!session?.user) {
    redirect("/");
  }

  if (!sessionRecord) {
    notFound();
  }

  const isOwner = sessionRecord.userId === session.user.id;
  const isAdmin = isOwner
    ? false
    : await isUserAdmin(session.user.id).catch(() => false);
  if (!isOwner && !isAdmin) {
    redirect("/");
  }

  let initialChatsData:
    | {
        chats: Awaited<ReturnType<typeof getChatSummariesBySessionId>>;
        defaultModelId: string | null;
      }
    | undefined;

  try {
    const [requestHeaders, chats, rawPreferences] = await Promise.all([
      headersPromise,
      chatsPromise,
      preferencesPromise,
    ]);
    if (chats && rawPreferences) {
      const requestHost = requestHeaders.get("host") ?? "";
      const preferences = sanitizeUserPreferencesForSession(
        rawPreferences,
        session,
        requestHost,
      );
      initialChatsData = {
        chats,
        defaultModelId: preferences.defaultModelId,
      };
    }
  } catch (error) {
    console.error("Failed to prefetch session chat data:", error);
  }

  return (
    <SessionLayoutShell
      session={sessionRecord}
      initialChatsData={initialChatsData}
    >
      {children}
    </SessionLayoutShell>
  );
}
