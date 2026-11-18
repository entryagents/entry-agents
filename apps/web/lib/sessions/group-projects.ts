import type { SessionWithUnread } from "@/hooks/use-sessions";

export interface SidebarProjectGroup {
  key: string;
  repoOwner: string;
  repoName: string;
  sessions: SessionWithUnread[];
  hasStreaming: boolean;
  hasUnread: boolean;
  latestActivityMs: number;
}

export function groupSessionsByProject(sessions: SessionWithUnread[]): {
  projects: SidebarProjectGroup[];
  standaloneSessions: SessionWithUnread[];
} {
  const projectMap = new Map<string, SidebarProjectGroup>();
  const standaloneSessions: SessionWithUnread[] = [];

  for (const session of sessions) {
    if (!session.repoOwner || !session.repoName) {
      standaloneSessions.push(session);
      continue;
    }

    const key = `${session.repoOwner}/${session.repoName}`;
    const activityMs = session.lastActivityAt
      ? new Date(session.lastActivityAt).getTime()
      : 0;

    const existing = projectMap.get(key);
    if (existing) {
      existing.sessions.push(session);
      existing.hasStreaming =
        existing.hasStreaming || Boolean(session.hasStreaming);
      existing.hasUnread = existing.hasUnread || Boolean(session.hasUnread);
      if (activityMs > existing.latestActivityMs) {
        existing.latestActivityMs = activityMs;
      }
    } else {
      projectMap.set(key, {
        key,
        repoOwner: session.repoOwner,
        repoName: session.repoName,
        sessions: [session],
        hasStreaming: Boolean(session.hasStreaming),
        hasUnread: Boolean(session.hasUnread),
        latestActivityMs: activityMs,
      });
    }
  }

  const projects = Array.from(projectMap.values()).sort(
    (a, b) => b.latestActivityMs - a.latestActivityMs,
  );

  return { projects, standaloneSessions };
}
