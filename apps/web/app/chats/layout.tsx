import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { getLastRepoByUserId } from "@/lib/db/last-repo";
import {
  getArchivedSessionCountByUserId,
  getSessionsWithUnreadByUserId,
} from "@/lib/db/sessions";
import { getServerSession } from "@/lib/session/get-server-session";
import { SessionsRouteShell } from "../sessions/sessions-route-shell";
import ChatsIndexLoading from "./loading";

type ChatsLayoutProps = {
  children: ReactNode;
};

async function ChatsLayoutContent({ children }: ChatsLayoutProps) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/");
  }

  const [lastRepo, sessions, archivedCount] = await Promise.all([
    getLastRepoByUserId(session.user.id),
    getSessionsWithUnreadByUserId(session.user.id, {
      status: "active",
      excludeDesktop: true,
    }),
    getArchivedSessionCountByUserId(session.user.id),
  ]);

  return (
    <SessionsRouteShell
      currentUser={session.user}
      initialSessionsData={{ sessions, archivedCount }}
      lastRepo={lastRepo}
    >
      {children}
    </SessionsRouteShell>
  );
}

export default function ChatsLayout({ children }: ChatsLayoutProps) {
  return (
    <Suspense fallback={<ChatsIndexLoading />}>
      <ChatsLayoutContent>{children}</ChatsLayoutContent>
    </Suspense>
  );
}
