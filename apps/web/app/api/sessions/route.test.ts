import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { VercelProjectSelection } from "@/lib/vercel/types";
import * as realSessionGetServerSession from "@/lib/session/get-server-session";
import * as realLibRandomCity from "@/lib/random-city";
import * as realDbUserPreferences from "@/lib/db/user-preferences";
import * as realDbVercelProjectLinks from "@/lib/db/vercel-project-links";
import * as realDbSessions from "@/lib/db/sessions";

mock.module("server-only", () => ({}));

let currentSession: {
  authProvider?: "vercel" | "github";
  user: {
    id: string;
    username: string;
    name: string;
    email?: string;
  };
} | null = {
  user: {
    id: "user-1",
    username: "nico",
    name: "Nico",
  },
};
let existingSessionCount = 0;
let savedLink: VercelProjectSelection | null = null;
let currentVercelToken: string | null = "vercel-token";
let matchingProjects: VercelProjectSelection[] = [];
let matchingProjectsError: Error | null = null;
let startWorkflowGate: Promise<void> | null = null;
const createCalls: Array<Record<string, unknown>> = [];
const createChatCalls: Array<Record<string, unknown>> = [];
const upsertCalls: Array<Record<string, unknown>> = [];
const provisioningKickCalls: string[] = [];
const persistedMessages: Array<Record<string, unknown>> = [];
const claimedStreamCalls: Array<{ chatId: string; runId: string }> = [];
const startedWorkflowArgs: Array<Record<string, unknown>> = [];

const originalNodeEnv = process.env.NODE_ENV;

mock.module("workflow/api", () => ({
  start: async (_fn: unknown, args: Array<Record<string, unknown>>) => {
    if (startWorkflowGate) {
      await startWorkflowGate;
    }
    if (args[0]) {
      startedWorkflowArgs.push(args[0]);
    }
    return { runId: "wrun_atomic_1" };
  },
}));

mock.module("@/app/workflows/chat", () => ({
  runAgentWorkflow: async () => {},
}));

mock.module("@/lib/session/get-server-session", () => ({
  ...realSessionGetServerSession,
  getServerSession: async () => currentSession,
}));

mock.module("@/lib/random-city", () => ({
  ...realLibRandomCity,
  getRandomCityName: () => "Oslo",
}));

mock.module("@/lib/db/user-preferences", () => ({
  ...realDbUserPreferences,
  getUserPreferences: async () => ({
    defaultModelId: "anthropic/claude-haiku-4.5",
    defaultSubagentModelId: null,
    defaultSandboxType: "vercel",
    defaultDiffMode: "unified",
    autoCommitPush: false,
    autoCreatePr: false,
    alertsEnabled: true,
    alertSoundEnabled: true,
    publicUsageEnabled: false,
    globalSkillRefs: [{ source: "vercel/ai", skillName: "ai-sdk" }],
    enabledModelIds: [],
  }),
}));

mock.module("@/lib/db/vercel-project-links", () => ({
  ...realDbVercelProjectLinks,
  getVercelProjectLinkByRepo: async () => savedLink,
  upsertVercelProjectLink: async (input: Record<string, unknown>) => {
    upsertCalls.push(input);
  },
}));

mock.module("@/lib/vercel/token", () => ({
  getUserVercelToken: async () => currentVercelToken,
}));

mock.module("@/lib/vercel/projects", () => ({
  isVercelInvalidTokenError: (error: unknown) =>
    matchingProjectsError !== null && error === matchingProjectsError,
  listMatchingVercelProjects: async () => {
    if (matchingProjectsError) {
      throw matchingProjectsError;
    }
    return matchingProjects;
  },
}));

mock.module("@/lib/db/sessions", () => ({
  ...realDbSessions,
  countSessionsByUserId: async () => existingSessionCount,
  createSessionWithInitialChat: async (input: {
    session: Record<string, unknown>;
    initialChat: Record<string, unknown>;
    initialMessage?: Record<string, unknown>;
  }) => {
    createCalls.push(input.session);
    createChatCalls.push(input.initialChat);
    if (input.initialMessage) {
      persistedMessages.push({
        ...input.initialMessage,
        chatId: String(input.initialChat.id),
      });
    }
    return {
      session: {
        ...input.session,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      chat: {
        id: String(input.initialChat.id),
        sessionId: String(input.session.id),
        title: String(input.initialChat.title),
        modelId: String(input.initialChat.modelId),
        reasoningEffort:
          (input.initialChat.reasoningEffort as string | null | undefined) ??
          null,
        status: (input.initialChat.status as string | undefined) ?? "idle",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  },
  createChatMessageIfNotExists: async (input: Record<string, unknown>) => {
    persistedMessages.push(input);
    return input;
  },
  claimChatActiveStreamId: async (chatId: string, runId: string) => {
    claimedStreamCalls.push({ chatId, runId });
    return true;
  },
  setChatRunStatus: async () => {},
  touchChat: async () => {},
  updateChat: async () => null,
  updateSession: async () => null,
  getArchivedSessionCountByUserId: async () => 0,
  getSessionsWithUnreadByUserId: async () => [],
  getUsedSessionTitles: async () => new Set<string>(),
}));

mock.module("@/lib/sandbox/provisioning-kick", () => ({
  kickSandboxProvisioningWorkflow: async (sessionId: string) => {
    provisioningKickCalls.push(sessionId);
    return { status: "started", runId: `provision-${sessionId}` };
  },
}));

const routeModulePromise = import("./route");

function createJsonRequest(
  body: unknown,
  url = "http://localhost/api/sessions",
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/sessions POST vercel project linking", () => {
  afterEach(() => {
    Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  });

  beforeEach(() => {
    currentSession = {
      user: {
        id: "user-1",
        username: "nico",
        name: "Nico",
      },
    };
    existingSessionCount = 0;
    savedLink = null;
    currentVercelToken = "vercel-token";
    matchingProjects = [];
    matchingProjectsError = null;
    startWorkflowGate = null;
    createCalls.length = 0;
    createChatCalls.length = 0;
    upsertCalls.length = 0;
    provisioningKickCalls.length = 0;
    persistedMessages.length = 0;
    claimedStreamCalls.length = 0;
    startedWorkflowArgs.length = 0;
  });

  test("explicit Vercel project is validated against live repo matches before it is persisted", async () => {
    const { POST } = await routeModulePromise;

    const vercelProject: VercelProjectSelection = {
      projectId: "project-1",
      projectName: "tampered-name",
      teamId: "team-x",
      teamSlug: "tampered-team",
    };
    matchingProjects = [
      {
        projectId: "project-1",
        projectName: "app",
        teamId: "team-1",
        teamSlug: "acme",
      },
    ];

    const response = await POST(
      createJsonRequest({
        repoOwner: "Vercel",
        repoName: "Open-Harness",
        branch: "main",
        cloneUrl: "https://github.com/Vercel/Open-Harness",
        vercelProject,
      }),
    );
    const body = (await response.json()) as {
      session: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(upsertCalls).toEqual([
      {
        userId: "user-1",
        repoOwner: "Vercel",
        repoName: "Open-Harness",
        project: matchingProjects[0],
      },
    ]);
    expect(createCalls[0]).toMatchObject({
      repoOwner: "Vercel",
      repoName: "Open-Harness",
      vercelProjectId: "project-1",
      vercelProjectName: "app",
      vercelTeamId: "team-1",
      vercelTeamSlug: "acme",
    });
    expect(body.session.vercelProjectId).toBe("project-1");
    expect(body.session.vercelProjectName).toBe("app");
    expect(provisioningKickCalls).toEqual([String(body.session.id)]);
  });

  test("rejects explicit Vercel projects that are not a live match for the repo", async () => {
    const { POST } = await routeModulePromise;

    matchingProjects = [
      {
        projectId: "project-2",
        projectName: "dashboard",
        teamId: null,
        teamSlug: null,
      },
    ];

    const response = await POST(
      createJsonRequest({
        repoOwner: "entryagents",
        repoName: "entry-agents",
        branch: "main",
        cloneUrl: "https://github.com/entryagents/entry-agents",
        vercelProject: {
          projectId: "project-999",
          projectName: "rogue-project",
          teamId: null,
          teamSlug: null,
        },
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "Selected Vercel project no longer matches this repository",
    );
    expect(upsertCalls).toHaveLength(0);
    expect(createCalls).toHaveLength(0);
  });

  test("omitting vercelProject falls back to the saved repo link", async () => {
    const { POST } = await routeModulePromise;

    savedLink = {
      projectId: "project-2",
      projectName: "dashboard",
      teamId: null,
      teamSlug: null,
    };

    const response = await POST(
      createJsonRequest({
        repoOwner: "entryagents",
        repoName: "entry-agents",
        branch: "main",
        cloneUrl: "https://github.com/entryagents/entry-agents",
      }),
    );
    const body = (await response.json()) as {
      session: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(upsertCalls).toHaveLength(0);
    expect(createCalls[0]).toMatchObject({
      vercelProjectId: "project-2",
      vercelProjectName: "dashboard",
      vercelTeamId: null,
      vercelTeamSlug: null,
    });
    expect(body.session.vercelProjectName).toBe("dashboard");
  });

  test("explicit null suppresses Vercel linking for that session", async () => {
    const { POST } = await routeModulePromise;

    savedLink = {
      projectId: "project-2",
      projectName: "dashboard",
      teamId: null,
      teamSlug: null,
    };

    const response = await POST(
      createJsonRequest({
        repoOwner: "entryagents",
        repoName: "entry-agents",
        branch: "main",
        cloneUrl: "https://github.com/entryagents/entry-agents",
        vercelProject: null,
      }),
    );
    const body = (await response.json()) as {
      session: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(upsertCalls).toHaveLength(0);
    expect(createCalls[0]).toMatchObject({
      vercelProjectId: null,
      vercelProjectName: null,
      vercelTeamId: null,
      vercelTeamSlug: null,
    });
    expect(body.session.vercelProjectId).toBeNull();
  });

  test("new sessions snapshot the user global skill refs", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "entryagents",
        repoName: "entry-agents",
        branch: "main",
        cloneUrl: "https://github.com/entryagents/entry-agents",
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      globalSkillRefs: [{ source: "vercel/ai", skillName: "ai-sdk" }],
    });
  });

  test("rejects invalid repository owners", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: 'vercel" && echo nope && "',
        repoName: "entry-agents",
        branch: "main",
        cloneUrl: "https://github.com/entryagents/entry-agents",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid repository owner");
    expect(createCalls).toHaveLength(0);
  });

  test("persists autoCreatePr when autoCommitPush is enabled", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        repoOwner: "entryagents",
        repoName: "entry-agents",
        branch: "feature/auto-pr",
        cloneUrl: "https://github.com/entryagents/entry-agents",
        autoCommitPush: true,
        autoCreatePr: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      autoCommitPushOverride: true,
      autoCreatePrOverride: true,
    });
  });

  test("persists permissionModeOverride, modelId, and reasoningEffort when creating a session", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        permissionModeOverride: "fullAccess",
        modelId: "openai/gpt-5",
        reasoningEffort: "high",
      }),
    );

    expect(response.status).toBe(200);
    expect(createCalls[0]).toMatchObject({
      permissionModeOverride: "fullAccess",
    });
    expect(createChatCalls[0]).toMatchObject({
      modelId: "openai/gpt-5",
    });
  });

  test("rejects invalid permissionModeOverride values", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        permissionModeOverride: "invalidMode",
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid permissionModeOverride value");
    expect(createCalls).toHaveLength(0);
  });

  test("atomically persists initialMessage in transaction and returns immediately while starting runAgentWorkflow in background", async () => {
    const { POST } = await routeModulePromise;

    let releaseWorkflowStart!: () => void;
    startWorkflowGate = new Promise<void>((resolve) => {
      releaseWorkflowStart = resolve;
    });

    const response = await POST(
      createJsonRequest({
        title: "Build cloud workflow",
        initialMessage: {
          id: "msg_initial_1",
          role: "user",
          parts: [
            { type: "text", text: "Build durable cloud workflow execution" },
          ],
        },
      }),
    );

    const body = (await response.json()) as {
      session: Record<string, unknown>;
      chat: Record<string, unknown>;
      initialWorkflowScheduled?: boolean;
    };

    // HTTP response returns immediately without waiting on workflow/api start()
    expect(response.status).toBe(200);
    expect(body.initialWorkflowScheduled).toBe(true);
    expect(body.chat.status).toBe("queued");
    expect(persistedMessages).toHaveLength(1);
    expect(persistedMessages[0]).toMatchObject({
      id: "msg_initial_1",
      chatId: body.chat.id,
      role: "user",
    });
    expect(startedWorkflowArgs).toHaveLength(0);

    // Release the background workflow start and verify it runs & claims stream
    releaseWorkflowStart();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(startedWorkflowArgs).toHaveLength(1);
    expect(startedWorkflowArgs[0]).toMatchObject({
      chatId: body.chat.id,
      sessionId: body.session.id,
      userId: "user-1",
      inputMessagesPersisted: true,
    });
    expect(claimedStreamCalls).toEqual([
      {
        chatId: String(body.chat.id),
        runId: "wrun_atomic_1",
      },
    ]);
  });

  test("rejects initialMessage with more than 5 attachments before creating a session", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      createJsonRequest({
        title: "Too many attachments",
        initialMessage: {
          id: "msg_too_many",
          role: "user",
          parts: Array.from({ length: 6 }, (_, i) => ({
            type: "file",
            url: `https://example.com/file-${i}.png`,
            mediaType: "image/png",
          })),
        },
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Maximum 5 attachments allowed per message");
    expect(createCalls).toHaveLength(0);
    expect(persistedMessages).toHaveLength(0);
  });
});
