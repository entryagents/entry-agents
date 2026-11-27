import { describe, expect, it } from "bun:test";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import { groupSessionsByProject } from "./group-projects";

function makeSession(
  overrides: Partial<SessionWithUnread> & { id: string },
): SessionWithUnread {
  return {
    projectId: null,
    title: "Test session",
    status: "completed",
    repoOwner: null,
    repoName: null,
    branch: null,
    linesAdded: null,
    linesRemoved: null,
    prNumber: null,
    prStatus: null,
    createdAt: new Date("2026-11-18T10:00:00Z"),
    lastActivityAt: new Date("2026-11-18T10:00:00Z"),
    hasUnread: false,
    hasStreaming: false,
    latestChatId: "chat-1",
    ...overrides,
  };
}

describe("groupSessionsByProject", () => {
  it("includes empty custom folders and groups sessions into folders, repos, and standalone", () => {
    const customProjects = [
      {
        id: "proj-empty",
        name: "Empty Folder",
        createdAt: new Date("2026-11-18T08:00:00Z"),
        updatedAt: new Date("2026-11-18T08:00:00Z"),
      },
      {
        id: "proj-work",
        name: "Work Notes",
        createdAt: new Date("2026-11-18T09:00:00Z"),
        updatedAt: new Date("2026-11-18T09:00:00Z"),
      },
    ];

    const sessions = [
      makeSession({
        id: "s-folder",
        projectId: "proj-work",
        lastActivityAt: new Date("2026-11-18T12:00:00Z"),
      }),
      makeSession({
        id: "s-github",
        repoOwner: "acme",
        repoName: "web",
        lastActivityAt: new Date("2026-11-18T11:00:00Z"),
      }),
      makeSession({
        id: "s-standalone",
        lastActivityAt: new Date("2026-11-18T13:00:00Z"),
      }),
    ];

    const result = groupSessionsByProject(sessions, customProjects);

    expect(result.standaloneSessions.map((s) => s.id)).toEqual([
      "s-standalone",
    ]);
    expect(result.projects).toHaveLength(3);
    expect(result.projects.map((p) => p.key)).toEqual([
      "folder:proj-work",
      "github:acme/web",
      "folder:proj-empty",
    ]);

    const workFolder = result.projects[0];
    expect(workFolder?.kind).toBe("folder");
    expect(workFolder?.sessions.map((s) => s.id)).toEqual(["s-folder"]);

    const emptyFolder = result.projects[2];
    expect(emptyFolder?.kind).toBe("folder");
    expect(emptyFolder?.sessions).toHaveLength(0);
  });

  it("includes persisted GitHub repo projects with 0 chats and merges sessions case-insensitively", () => {
    const customProjects = [
      {
        id: "proj-gh-empty",
        name: "entryagents/empress",
        repoOwner: "entryagents",
        repoName: "empress",
        defaultBranch: "main",
        createdAt: new Date("2026-11-18T14:00:00Z"),
        updatedAt: new Date("2026-11-18T14:00:00Z"),
      },
      {
        id: "proj-gh-active",
        name: "entryagents/entry-agents",
        repoOwner: "entryagents",
        repoName: "entry-agents",
        defaultBranch: "main",
        createdAt: new Date("2026-11-18T09:00:00Z"),
        updatedAt: new Date("2026-11-18T09:00:00Z"),
      },
    ];

    const sessions = [
      makeSession({
        id: "s-1",
        repoOwner: "EntryAgents",
        repoName: "Entry-Agents",
        lastActivityAt: new Date("2026-11-18T15:00:00Z"),
      }),
    ];

    const result = groupSessionsByProject(sessions, customProjects);
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0]?.key).toBe("github:entryagents/entry-agents");
    expect(result.projects[0]?.sessions.map((s) => s.id)).toEqual(["s-1"]);
    expect(result.projects[1]?.key).toBe("github:entryagents/empress");
    expect(result.projects[1]?.sessions).toHaveLength(0);
  });
});
