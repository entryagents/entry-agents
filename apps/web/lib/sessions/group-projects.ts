import type { SessionWithUnread } from "@/hooks/use-sessions";
import type { Project } from "@/lib/db/schema";
import { parseUtcTimestamp } from "@/lib/sessions/format-compact-age";

export type SidebarProjectGroup =
  | {
      kind: "github";
      key: string;
      projectId?: string;
      name: string;
      repoOwner: string;
      repoName: string;
      defaultBranch?: string | null;
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
  return parseUtcTimestamp(session.lastActivityAt)?.getTime() ?? 0;
}

function makeGithubProjectKey(owner: string, repo: string): string {
  return `github:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function groupSessionsByProject(
  sessions: SessionWithUnread[],
  customProjects: (Pick<Project, "id" | "name" | "createdAt" | "updatedAt"> &
    Partial<Pick<Project, "repoOwner" | "repoName" | "defaultBranch">>)[] = [],
): {
  projects: SidebarProjectGroup[];
  standaloneSessions: SessionWithUnread[];
} {
  const projectMap = new Map<string, SidebarProjectGroup>();
  const projectIdToKey = new Map<string, string>();
  const standaloneSessions: SessionWithUnread[] = [];

  for (const project of customProjects) {
    const updatedMs =
      parseUtcTimestamp(project.updatedAt)?.getTime() ??
      parseUtcTimestamp(project.createdAt)?.getTime() ??
      0;

    if (project.repoOwner && project.repoName) {
      const key = makeGithubProjectKey(project.repoOwner, project.repoName);
      projectIdToKey.set(project.id, key);
      if (!projectMap.has(key)) {
        projectMap.set(key, {
          kind: "github",
          key,
          projectId: project.id,
          name: project.repoName,
          repoOwner: project.repoOwner,
          repoName: project.repoName,
          defaultBranch: project.defaultBranch ?? null,
          sessions: [],
          hasStreaming: false,
          hasUnread: false,
          latestActivityMs: updatedMs,
        });
      }
      continue;
    }

    const key = `folder:${project.id}`;
    projectIdToKey.set(project.id, key);
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
      const mappedKey =
        projectIdToKey.get(session.projectId) ?? `folder:${session.projectId}`;
      const existingByProjectId = projectMap.get(mappedKey);
      if (existingByProjectId) {
        existingByProjectId.sessions.push(session);
        existingByProjectId.hasStreaming =
          existingByProjectId.hasStreaming || Boolean(session.hasStreaming);
        existingByProjectId.hasUnread =
          existingByProjectId.hasUnread || Boolean(session.hasUnread);
        if (activityMs > existingByProjectId.latestActivityMs) {
          existingByProjectId.latestActivityMs = activityMs;
        }
        continue;
      }
    }

    if (!session.repoOwner || !session.repoName) {
      standaloneSessions.push(session);
      continue;
    }

    const key = makeGithubProjectKey(session.repoOwner, session.repoName);
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

  const projects = Array.from(projectMap.values())
    .map((group) => ({
      ...group,
      sessions: group.sessions.toSorted(
        (a, b) => getSessionActivityMs(b) - getSessionActivityMs(a),
      ),
    }))
    .sort((a, b) => b.latestActivityMs - a.latestActivityMs);

  return { projects, standaloneSessions };
}
