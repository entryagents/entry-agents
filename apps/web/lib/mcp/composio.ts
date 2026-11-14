import type { McpServerConfig } from "@entry-agents/agent";

const COMPOSIO_MCP_SERVER_NAME = "composio";

export interface ComposioToolkitCatalogItem {
  slug: string;
  name: string;
  description: string;
  category: "Communication" | "Productivity" | "Engineering" | "Design" | "CRM";
  isConnected: boolean;
  status: "ACTIVE" | "INITIATED" | "EXPIRED" | "NOT_CONNECTED";
  connectedAccountId: string | null;
}

export const COMPOSIO_POPULAR_TOOLKITS: Array<
  Omit<
    ComposioToolkitCatalogItem,
    "isConnected" | "status" | "connectedAccountId"
  >
> = [
  {
    slug: "gmail",
    name: "Gmail",
    description:
      "Read, search, draft, and send emails with full thread context.",
    category: "Communication",
  },
  {
    slug: "slack",
    name: "Slack",
    description:
      "Post updates, search channels, and reply to workspace threads.",
    category: "Communication",
  },
  {
    slug: "notion",
    name: "Notion",
    description:
      "Search pages, query databases, and write structured documentation.",
    category: "Productivity",
  },
  {
    slug: "linear",
    name: "Linear",
    description:
      "Create issues, triage bugs, update cycles, and track roadmaps.",
    category: "Engineering",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    description:
      "Inspect schedules, check availability, and create calendar events.",
    category: "Productivity",
  },
  {
    slug: "googledrive",
    name: "Google Drive",
    description:
      "Search cloud files, read documents, and manage shared folders.",
    category: "Productivity",
  },
  {
    slug: "github",
    name: "GitHub (Composio)",
    description:
      "Cross-repo issue triage, release notes, and workflow automation.",
    category: "Engineering",
  },
  {
    slug: "jira",
    name: "Jira",
    description:
      "Create sprint tickets, transition issue states, and sync backlogs.",
    category: "Engineering",
  },
  {
    slug: "figma",
    name: "Figma",
    description:
      "Inspect design files, variables, component trees, and comments.",
    category: "Design",
  },
  {
    slug: "discord",
    name: "Discord",
    description:
      "Send channel notifications, manage threads, and inspect server activity.",
    category: "Communication",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Manage CRM contacts, companies, deals, and pipeline notes.",
    category: "CRM",
  },
  {
    slug: "asana",
    name: "Asana",
    description:
      "Track project tasks, assignees, due dates, and team milestones.",
    category: "Productivity",
  },
];

async function resolveComposioApiKey(userId: string): Promise<{
  apiKey: string | null;
  source: "env" | "user_secret" | null;
}> {
  const envKey = process.env.COMPOSIO_API_KEY?.trim();
  if (envKey) {
    return { apiKey: envKey, source: "env" };
  }

  try {
    const { getDecryptedUserSecretsForExecution } =
      await import("@/lib/db/secrets");
    const { secrets } = await getDecryptedUserSecretsForExecution(userId);
    const match = secrets.find(
      (s) => s.name.toUpperCase() === "COMPOSIO_API_KEY" && s.value.trim(),
    );
    if (match) {
      return { apiKey: match.value.trim(), source: "user_secret" };
    }
  } catch (error) {
    console.warn(
      "[composio-mcp] Failed to check user secrets for COMPOSIO_API_KEY:",
      error instanceof Error ? error.message : error,
    );
  }

  return { apiKey: null, source: null };
}

async function resumeOrCreateComposioSession(
  composio: InstanceType<typeof import("@composio/core").Composio>,
  userId: string,
  existingSessionId: string | null,
) {
  const { setComposioSessionId } = await import("@/lib/db/composio-sessions");

  if (existingSessionId) {
    try {
      return await composio.use(existingSessionId, { mcp: true });
    } catch (error) {
      console.warn(
        `[composio-mcp] Failed to resume session for user ${userId}, minting a new one:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const created = await composio.create(userId, { mcp: true });
  await setComposioSessionId(userId, created.sessionId);
  return created;
}

export async function getComposioMcpServerConfig(
  userId: string,
): Promise<McpServerConfig | null> {
  const { apiKey } = await resolveComposioApiKey(userId);
  if (!apiKey) {
    return null;
  }

  try {
    const { Composio } = await import("@composio/core");
    const { getComposioSessionId } = await import("@/lib/db/composio-sessions");

    const composio = new Composio({ apiKey });
    const existingSessionId = await getComposioSessionId(userId);
    const session = await resumeOrCreateComposioSession(
      composio,
      userId,
      existingSessionId,
    );

    if (!session.mcp?.url) {
      return null;
    }

    return {
      name: COMPOSIO_MCP_SERVER_NAME,
      transport: "http",
      url: session.mcp.url,
      headers: session.mcp.headers,
    };
  } catch (error) {
    console.warn(
      `[composio-mcp] Failed to resolve Composio MCP config for user ${userId}, continuing without it:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export interface ComposioToolkitsStatusResult {
  configured: boolean;
  keySource: "env" | "user_secret" | null;
  sessionId: string | null;
  mcpUrl: string | null;
  toolkits: ComposioToolkitCatalogItem[];
  error?: string;
}

export async function listComposioToolkitsForUser(
  userId: string,
): Promise<ComposioToolkitsStatusResult> {
  const defaultToolkits: ComposioToolkitCatalogItem[] =
    COMPOSIO_POPULAR_TOOLKITS.map((t) => ({
      ...t,
      isConnected: false,
      status: "NOT_CONNECTED",
      connectedAccountId: null,
    }));

  const { apiKey, source } = await resolveComposioApiKey(userId);
  if (!apiKey) {
    return {
      configured: false,
      keySource: null,
      sessionId: null,
      mcpUrl: null,
      toolkits: defaultToolkits,
    };
  }

  try {
    const { Composio } = await import("@composio/core");
    const { getComposioSessionId } = await import("@/lib/db/composio-sessions");

    const composio = new Composio({ apiKey });
    const existingSessionId = await getComposioSessionId(userId);
    const session = await resumeOrCreateComposioSession(
      composio,
      userId,
      existingSessionId,
    );

    const slugs = COMPOSIO_POPULAR_TOOLKITS.map((t) => t.slug);
    const remote = await session.toolkits({
      toolkits: slugs,
      limit: 50,
    });

    const remoteBySlug = new Map(
      (remote.items ?? []).map((item) => [item.slug.toLowerCase(), item]),
    );

    const merged: ComposioToolkitCatalogItem[] = COMPOSIO_POPULAR_TOOLKITS.map(
      (preset) => {
        const found = remoteBySlug.get(preset.slug.toLowerCase());
        const isActive = Boolean(found?.connection?.isActive);
        const rawStatus =
          found?.connection?.connectedAccount?.status?.toUpperCase();
        const status: ComposioToolkitCatalogItem["status"] = isActive
          ? "ACTIVE"
          : rawStatus === "INITIATED"
            ? "INITIATED"
            : rawStatus === "EXPIRED"
              ? "EXPIRED"
              : "NOT_CONNECTED";

        return {
          ...preset,
          isConnected: isActive,
          status,
          connectedAccountId: found?.connection?.connectedAccount?.id ?? null,
        };
      },
    );

    return {
      configured: true,
      keySource: source,
      sessionId: session.sessionId,
      mcpUrl: session.mcp?.url ?? null,
      toolkits: merged,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[composio-mcp] Failed to list toolkits for user ${userId}:`,
      message,
    );
    return {
      configured: true,
      keySource: source,
      sessionId: null,
      mcpUrl: null,
      toolkits: defaultToolkits,
      error: message,
    };
  }
}

export async function authorizeComposioToolkitForUser(params: {
  userId: string;
  toolkitSlug: string;
  callbackUrl: string;
}): Promise<{
  ok: true;
  redirectUrl: string;
  connectionId: string | null;
}> {
  const { apiKey } = await resolveComposioApiKey(params.userId);
  if (!apiKey) {
    throw new Error(
      "Composio API key is not configured. Add COMPOSIO_API_KEY in Connections or API Keys & Secrets.",
    );
  }

  const { Composio } = await import("@composio/core");
  const { getComposioSessionId } = await import("@/lib/db/composio-sessions");

  const composio = new Composio({ apiKey });
  const existingSessionId = await getComposioSessionId(params.userId);
  const session = await resumeOrCreateComposioSession(
    composio,
    params.userId,
    existingSessionId,
  );

  const connectionRequest = await session.authorize(
    params.toolkitSlug.toLowerCase(),
    {
      callbackUrl: params.callbackUrl,
    },
  );

  if (!connectionRequest.redirectUrl) {
    throw new Error(
      `Composio did not return an authorization redirect URL for ${params.toolkitSlug}.`,
    );
  }

  return {
    ok: true,
    redirectUrl: connectionRequest.redirectUrl,
    connectionId: connectionRequest.id ?? null,
  };
}
