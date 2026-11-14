import type { McpServerConfig } from "@entry-agents/agent";

const COMPOSIO_MCP_SERVER_NAME = "composio";

export type ComposioToolkitCategory =
  | "Communication"
  | "Productivity"
  | "Engineering"
  | "Design"
  | "CRM"
  | "Integration";

export interface ComposioToolkitCatalogItem {
  slug: string;
  name: string;
  description: string;
  category: ComposioToolkitCategory;
  logo: string | null;
  isConnected: boolean;
  status: "ACTIVE" | "INITIATED" | "EXPIRED" | "NOT_CONNECTED";
  connectedAccountId: string | null;
}

export const COMPOSIO_POPULAR_TOOLKITS: Array<
  Omit<
    ComposioToolkitCatalogItem,
    "logo" | "isConnected" | "status" | "connectedAccountId"
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

const PRESET_BY_SLUG = new Map(
  COMPOSIO_POPULAR_TOOLKITS.map((item) => [item.slug.toLowerCase(), item]),
);

function resolveComposioApiKey(): string | null {
  const envKey = process.env.COMPOSIO_API_KEY?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

export class ComposioAccountNotFoundError extends Error {
  constructor(message = "Connected Composio account not found for this user.") {
    super(message);
    this.name = "ComposioAccountNotFoundError";
  }
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
  const apiKey = resolveComposioApiKey();
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

export async function getConnectedComposioToolkitsForUser(
  userId: string,
): Promise<string[]> {
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    return [];
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

    if (typeof session.toolkits !== "function") {
      return [];
    }

    const connected = await session.toolkits({
      isConnected: true,
      limit: 100,
    });

    const slugs = new Set<string>();
    for (const item of connected.items ?? []) {
      if (item.connection?.isActive === false) continue;
      const slug = item.slug?.trim().toLowerCase();
      if (slug) {
        slugs.add(slug);
      }
    }

    return Array.from(slugs).toSorted();
  } catch (error) {
    console.warn(
      `[composio-mcp] Failed to inspect connected toolkits for user ${userId}:`,
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export interface ComposioToolkitsStatusResult {
  configured: boolean;
  sessionId: string | null;
  mcpUrl: string | null;
  toolkits: ComposioToolkitCatalogItem[];
  error?: string;
}

interface RemoteToolkitState {
  slug: string;
  name?: string;
  logo?: string;
  connection?: {
    isActive?: boolean;
    connectedAccount?: {
      id?: string;
      status?: string;
    };
  };
}

function toCatalogStatus(connection: RemoteToolkitState["connection"]): {
  isConnected: boolean;
  status: ComposioToolkitCatalogItem["status"];
  connectedAccountId: string | null;
} {
  const isActive = Boolean(connection?.isActive);
  const rawStatus = connection?.connectedAccount?.status?.toUpperCase();
  const status: ComposioToolkitCatalogItem["status"] = isActive
    ? "ACTIVE"
    : rawStatus === "INITIATED"
      ? "INITIATED"
      : rawStatus === "EXPIRED"
        ? "EXPIRED"
        : "NOT_CONNECTED";

  return {
    isConnected: isActive,
    status,
    connectedAccountId: connection?.connectedAccount?.id ?? null,
  };
}

function toCatalogItem(
  slug: string,
  remote?: RemoteToolkitState,
): ComposioToolkitCatalogItem {
  const normalizedSlug = slug.toLowerCase();
  const preset = PRESET_BY_SLUG.get(normalizedSlug);
  const conn = toCatalogStatus(remote?.connection);

  return {
    slug: preset?.slug ?? normalizedSlug,
    name: preset?.name ?? remote?.name ?? slug,
    description:
      preset?.description ??
      "Connect this app via Composio Tool Router so agents can discover and run its actions.",
    category: preset?.category ?? "Integration",
    logo: remote?.logo ?? null,
    ...conn,
  };
}

function matchesSearchQuery(
  item: Pick<ComposioToolkitCatalogItem, "slug" | "name" | "description">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.slug.toLowerCase().includes(q) ||
    item.name.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q)
  );
}

export async function listComposioToolkitsForUser(
  userId: string,
  options?: { search?: string },
): Promise<ComposioToolkitsStatusResult> {
  const searchQuery = options?.search?.trim() ?? "";

  const defaultToolkits: ComposioToolkitCatalogItem[] =
    COMPOSIO_POPULAR_TOOLKITS.map((t) => ({
      ...t,
      logo: null,
      isConnected: false,
      status: "NOT_CONNECTED" as const,
      connectedAccountId: null,
    })).filter((item) => matchesSearchQuery(item, searchQuery));

  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    return {
      configured: false,
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

    const popularSlugs = COMPOSIO_POPULAR_TOOLKITS.map((t) => t.slug);
    const [catalogRemote, connectedRemote] = await Promise.all([
      searchQuery
        ? session.toolkits({
            search: searchQuery,
            limit: 36,
          })
        : session.toolkits({
            toolkits: popularSlugs,
            limit: 50,
          }),
      session
        .toolkits({
          isConnected: true,
          limit: 100,
        })
        .catch(() => ({ items: [] as RemoteToolkitState[] })),
    ]);

    const remoteBySlug = new Map<string, RemoteToolkitState>();
    for (const item of catalogRemote.items ?? []) {
      remoteBySlug.set(item.slug.toLowerCase(), item);
    }
    for (const item of connectedRemote.items ?? []) {
      const key = item.slug.toLowerCase();
      const existing = remoteBySlug.get(key);
      remoteBySlug.set(key, {
        ...existing,
        ...item,
        logo: item.logo ?? existing?.logo,
        connection: item.connection ?? existing?.connection,
      });
    }

    if (searchQuery) {
      const slugOrder: string[] = [];
      const seenSlugs = new Set<string>();
      const pushSlug = (slug: string) => {
        const lower = slug.toLowerCase();
        if (!seenSlugs.has(lower)) {
          seenSlugs.add(lower);
          slugOrder.push(lower);
        }
      };

      for (const preset of COMPOSIO_POPULAR_TOOLKITS) {
        if (matchesSearchQuery(preset, searchQuery)) {
          pushSlug(preset.slug);
        }
      }
      for (const item of catalogRemote.items ?? []) {
        pushSlug(item.slug);
      }
      for (const item of connectedRemote.items ?? []) {
        const candidate = toCatalogItem(item.slug, item);
        if (matchesSearchQuery(candidate, searchQuery)) {
          pushSlug(item.slug);
        }
      }

      const items = slugOrder
        .map((slug) => toCatalogItem(slug, remoteBySlug.get(slug)))
        .toSorted((a, b) => {
          if (a.isConnected !== b.isConnected) {
            return a.isConnected ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      return {
        configured: true,
        sessionId: session.sessionId,
        mcpUrl: session.mcp?.url ?? null,
        toolkits: items,
      };
    }

    const merged: ComposioToolkitCatalogItem[] = [];
    const includedSlugs = new Set<string>();

    for (const preset of COMPOSIO_POPULAR_TOOLKITS) {
      const key = preset.slug.toLowerCase();
      includedSlugs.add(key);
      merged.push(toCatalogItem(key, remoteBySlug.get(key)));
    }

    for (const item of connectedRemote.items ?? []) {
      const key = item.slug.toLowerCase();
      if (includedSlugs.has(key)) continue;
      includedSlugs.add(key);
      merged.push(toCatalogItem(key, remoteBySlug.get(key)));
    }

    return {
      configured: true,
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
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    throw new Error(
      "Composio integration is not configured on this server (COMPOSIO_API_KEY is unset).",
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

export async function disconnectComposioAccountForUser(params: {
  userId: string;
  connectedAccountId: string;
}): Promise<{ ok: true }> {
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    throw new Error(
      "Composio integration is not configured on this server (COMPOSIO_API_KEY is unset).",
    );
  }

  const { Composio } = await import("@composio/core");
  const composio = new Composio({ apiKey });

  let cursor: string | undefined;
  let ownedByUser = false;
  for (let page = 0; page < 10; page += 1) {
    const accounts = await composio.connectedAccounts.list({
      userIds: [params.userId],
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });

    if (accounts.items.some((item) => item.id === params.connectedAccountId)) {
      ownedByUser = true;
      break;
    }

    if (!accounts.nextCursor) {
      break;
    }
    cursor = accounts.nextCursor;
  }

  if (!ownedByUser) {
    throw new ComposioAccountNotFoundError();
  }

  await composio.connectedAccounts.delete(params.connectedAccountId);
  return { ok: true };
}
