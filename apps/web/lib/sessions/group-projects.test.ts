import { describe, expect, it } from "bun:test";
import type { SessionWithUnread } from "@/hooks/use-sessions";
import { groupSessionsByProject } from "./group-projects";

function makeSession(
  overrides: Partial<SessionWithUnread> & { id: string },
): SessionWithUnread {
  return {
    userId: "user-1",
    title: "Test session",
    status: "completed",
    repoOwner: null,
    repoName: null,
    branch: null,
    cloneUrl: null,
    vercelProjectId: null,
    vercelProjectName: null,
    vercelTeamId: null,
    vercelTeamSlug: null,
    isNewBranch: false,
    autoCommitPushOverride: null,
    autoCreatePrOverride: null,
    autoApproveToolsOverride: null,
    permissionModeOverride: null,
    globalSkillRefs: [],
    sandboxState: null,
    lifecycleState: null,
    lifecycleVersion: 0,
    lastActivityAt: new Date("2026-11-18T10:00:00Z"),
    sandboxExpiresAt: null,
    hibernateAfter: null,
    lifecycleRunId: null,
    sandboxProvisioningRunId: null,
    lifecycleError: null,
    migrationFailureCount: 0,
    activeBashCommand: null,
    prNumber: null,
    prStatus: null,
    linesAdded: null,
    linesRemoved: null,
    createdAt: new Date("2026-11-18T10:00:00Z"),
    updatedAt: new Date("2026-11-18T10:00:00Z"),
    hasUnread: false,
    hasStreaming: false,
    ...overrides,
  } as SessionWithUnread;
}

describe("groupSessionsByProject", () => {
  it("groups repository sessions into projects sorted by latest activity and separates standalone chats", () => {
    const older = makeSession({
      id: "s1",
      repoOwner: "acme",
      repoName: "alpha",
      lastActivityAt: new Date("2026-11-18T08:00:00Z"),
    });
    const newer = makeSession({
      id: "s2",
      repoOwner: "acme",
      repoName: "beta",
      lastActivityAt: new Date("2026-11-18T12:00:00Z"),
      hasUnread: true,
    });
    const secondAlpha = makeSession({
      id: "s3",
      repoOwner: "acme",
      repoName: "alpha",
      lastActivityAt: new Date("2026-11-18T09:00:00Z"),
    });
    const blank = makeSession({
      id: "s4",
      repoOwner: null,
      repoName: null,
    });

    const result = groupSessionsByProject([older, newer, secondAlpha, blank]);

    expect(result.standaloneSessions.map((s) => s.id)).toEqual(["s4"]);
    expect(result.projects.map((p) => p.key)).toEqual([
      "acme/beta",
      "acme/alpha",
    ]);
    expect(result.projects[0]?.hasUnread).toBe(true);
    expect(result.projects[1]?.sessions.map((s) => s.id)).toEqual(["s1", "s3"]);
  });
});
