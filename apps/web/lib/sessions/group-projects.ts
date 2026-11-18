import type { SessionWithUnread } from "@/hooks/use-sessions";
import type { Project } from "@/lib/db/schema";

export type SidebarProjectGroup =
  | {
      kind: "github";
      key: string;
      name: string;
      repoOwner: string;
      repoName: string;
      sessions: SessionWithUnread[];
      hasStreaming: boolean;
      hasUnread: boolean;
      latestActivityMs: number;
    }
  | {
      kind: "folder";
      key: string;
      projectId: string;
      name: string;
      sessions: SessionWithUnread[];
      hasStreaming: boolean;
      hasUnread: boolean;
      latestActivityMs: number;
    };

function getSessionActivityMs(session: SessionWithUnread): number {
  return session.lastActivityAt
    ? new Date(session.lastActivityAt).getTime()
    : 0;
}

export function groupSessionsByProject(
  sessions: SessionWithUnread[],
  customProjects: Pick<
    Project,
    "id" | "name" | "createdAt" | "updatedAt"
  >[] = [],
): {
  projects: SidebarProjectGroup[];
  standaloneSessions: SessionWithUnread[];
} {
  const projectMap = new Map<string, SidebarProjectGroup>();
  const standaloneSessions: SessionWithUnread[] = [];

  for (const project of customProjects) {
    const key = `folder:${project.id}`;
    const updatedMs = project.updatedAt
      ? new Date(project.updatedAt).getTime()
      : project.createdAt
        ? new Date(project.createdAt).getTime()
        : 0;
    projectMap.set(key, {
      kind: "folder",
      key,
      projectId: project.id,
      name: project.name,
      sessions: [],
      hasStreaming: false,
      hasUnread: false,
      latestActivityMs: updatedMs,
    });
  }

  for (const session of sessions) {
    const activityMs = getSessionActivityMs(session);

    if (session.projectId) {
      const folderKey = `folder:${session.projectId}`;
      const existingFolder = projectMap.get(folderKey);
      if (existingFolder) {
        existingFolder.sessions.push(session);
        existingFolder.hasStreaming =
          existingFolder.hasStreaming || Boolean(session.hasStreaming);
        existingFolder.hasUnread =
          existingFolder.hasUnread || Boolean(session.hasUnread);
        if (activityMs > existingFolder.latestActivityMs) {
          existingFolder.latestActivityMs = activityMs;
        }
        continue;
      }
    }

    if (!session.repoOwner || !session.repoName) {
      standaloneSessions.push(session);
      continue;
    }

    const key = `github:${session.repoOwner}/${session.repoName}`;
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
        kind: "github",
        key,
        name: session.repoName,
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
