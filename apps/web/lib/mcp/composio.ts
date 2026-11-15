import type { McpServerConfig } from "@entry-agents/agent";
import { ComposioAccountNotFoundError } from "./composio-errors";

export { ComposioAccountNotFoundError };

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

const TOOLKIT_SLUG_PATTERN = /^[a-z0-9_-]{1,64}$/;

export function normalizeComposioToolkitSlug(rawSlug: string): string {
  const normalized = rawSlug.trim().toLowerCase();
  if (!TOOLKIT_SLUG_PATTERN.test(normalized)) {
    throw new ComposioApiError(
      `Invalid toolkit identifier "${rawSlug}". Toolkit slugs may only contain lowercase letters, numbers, hyphens, and underscores.`,
      400,
    );
  }
  return normalized;
}

export class ComposioApiError extends Error {
  readonly statusCode: number;
  readonly requestId?: string;

  constructor(message: string, statusCode = 500, requestId?: string) {
    super(message);
    this.name = "ComposioApiError";
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

function scrubSecretFromText(text: string, apiKey: string | null): string {
  if (!apiKey || apiKey.length < 4) {
    return text;
  }
  return text.split(apiKey).join("[REDACTED]");
}

function extractComposioErrorDetails(
  error: unknown,
  apiKey: string | null,
): {
  statusCode: number;
  message: string;
  requestId?: string;
  isStaleSession: boolean;
  isAuthConfigMissing: boolean;
} {
  if (error instanceof ComposioApiError) {
    return {
      statusCode: error.statusCode,
      message: scrubSecretFromText(error.message, apiKey),
      requestId: error.requestId,
      isStaleSession: false,
      isAuthConfigMissing: false,
    };
  }

  const errObj =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const causeObj =
    typeof errObj.cause === "object" && errObj.cause !== null
      ? (errObj.cause as Record<string, unknown>)
      : {};

  const rawStatus =
    typeof errObj.status === "number"
      ? errObj.status
      : typeof errObj.statusCode === "number"
        ? errObj.statusCode
        : typeof causeObj.status === "number"
          ? causeObj.status
          : undefined;

  const nestedError =
    typeof errObj.error === "object" && errObj.error !== null
      ? (errObj.error as Record<string, unknown>)
      : typeof causeObj.error === "object" && causeObj.error !== null
        ? (causeObj.error as Record<string, unknown>)
        : undefined;

  const innerNestedError =
    nestedError &&
    typeof nestedError.error === "object" &&
    nestedError.error !== null
      ? (nestedError.error as Record<string, unknown>)
      : undefined;

  const extractedDetail =
    (typeof innerNestedError?.message === "string" &&
      innerNestedError.message) ||
    (typeof innerNestedError?.detail === "string" && innerNestedError.detail) ||
    (typeof nestedError?.message === "string" && nestedError.message) ||
    (typeof nestedError?.detail === "string" && nestedError.detail) ||
    (typeof causeObj.message === "string" && causeObj.message) ||
    (error instanceof Error ? error.message : String(error));

  const requestId =
    (typeof innerNestedError?.request_id === "string" &&
      innerNestedError.request_id) ||
    (typeof nestedError?.request_id === "string" && nestedError.request_id) ||
    (typeof errObj.request_id === "string" && errObj.request_id) ||
    undefined;

  const scrubbed = scrubSecretFromText(extractedDetail.trim(), apiKey);
  const lower = scrubbed.toLowerCase();

  const isStaleSession =
    rawStatus === 404 ||
    lower.includes("session not found") ||
    lower.includes("session expired") ||
    lower.includes("invalid session") ||
    lower.includes("tool_router/session") ||
    (lower.includes("session") &&
      (lower.includes("not found") ||
        lower.includes("expired") ||
        lower.includes("does not exist") ||
        lower.includes("invalid")));

  const isAuthConfigMissing =
    lower.includes("auth config") ||
    lower.includes("auth_config") ||
    lower.includes("no auth") ||
    lower.includes("managed auth") ||
    lower.includes("not enabled for tool router") ||
    lower.includes("failed to create connected account link");

  if (
    rawStatus === 401 ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized")
  ) {
    return {
      statusCode: 401,
      message:
        "Composio rejected COMPOSIO_API_KEY (401 Unauthorized). Verify that the API key in your environment settings is valid and active.",
      requestId,
      isStaleSession: false,
      isAuthConfigMissing: false,
    };
  }

  if (rawStatus === 403 || lower.includes("permission denied")) {
    return {
      statusCode: 403,
      message: `Composio API key lacks permission for this action (403 Forbidden). Ensure your key has Session Management and Connected Accounts permissions (${scrubbed}).`,
      requestId,
      isStaleSession: false,
      isAuthConfigMissing: false,
    };
  }

  if (rawStatus === 429 || lower.includes("rate limit")) {
    return {
      statusCode: 429,
      message:
        "Composio rate limit reached (429). Wait a moment and try again.",
      requestId,
      isStaleSession: false,
      isAuthConfigMissing: false,
    };
  }

  const statusCode =
    rawStatus && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 502;

  return {
    statusCode,
    message: scrubbed || "Unexpected Composio API error",
    requestId,
    isStaleSession,
    isAuthConfigMissing,
  };
}

type ComposioInstance = InstanceType<typeof import("@composio/core").Composio>;
type ComposioSession = Awaited<ReturnType<ComposioInstance["create"]>> & {
  mcp?: {
    url: string;
    headers?: Record<string, string>;
  };
};

function createComposioSdkClient(
  ComposioCtor: typeof import("@composio/core").Composio,
  apiKey: string,
): ComposioInstance {
  return new ComposioCtor({
    apiKey,
    allowTracking: false,
    disableVersionCheck: true,
  });
}

const inflightSessionPromises = new Map<string, Promise<ComposioSession>>();

async function resumeOrCreateComposioSession(
  composio: ComposioInstance,
  userId: string,
  existingSessionId: string | null,
  options?: { forceRecreate?: boolean; apiKey?: string },
): Promise<ComposioSession> {
  const keyFingerprint = (options?.apiKey ?? "").slice(-8);
  const inflightKey = `${userId}:${keyFingerprint}:${options?.forceRecreate ? "fresh" : (existingSessionId ?? "new")}`;
  const pending = inflightSessionPromises.get(inflightKey);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    const { deleteComposioSessionId, setComposioSessionId } =
      await import("@/lib/db/composio-sessions");

    if (options?.forceRecreate && existingSessionId) {
      await deleteComposioSessionId(userId).catch(() => {});
    } else if (existingSessionId) {
      try {
        const resumed = await composio.use(existingSessionId, { mcp: true });
        if (resumed?.sessionId) {
          return resumed;
        }
      } catch (error) {
        console.warn(
          `[composio-mcp] Failed to resume session for user ${userId}, minting a new one:`,
          error instanceof Error ? error.message : error,
        );
        await deleteComposioSessionId(userId).catch(() => {});
      }
    }

    const created = await composio.create(userId, { mcp: true });
    await setComposioSessionId(userId, created.sessionId);
    return created;
  })();

  inflightSessionPromises.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inflightSessionPromises.delete(inflightKey);
  }
}

async function runWithComposioSession<T>(
  userId: string,
  apiKey: string,
  operation: (
    session: ComposioSession,
    composio: ComposioInstance,
  ) => Promise<T>,
): Promise<T> {
  const { Composio } = await import("@composio/core");
  const { getComposioSessionId } = await import("@/lib/db/composio-sessions");

  const composio = createComposioSdkClient(Composio, apiKey);
  const existingSessionId = await getComposioSessionId(userId);
  const session = await resumeOrCreateComposioSession(
    composio,
    userId,
    existingSessionId,
    { apiKey },
  );

  try {
    return await operation(session, composio);
  } catch (error) {
    if (!existingSessionId) {
      throw error;
    }
    const details = extractComposioErrorDetails(error, apiKey);
    if (details.statusCode === 401 || details.statusCode === 403) {
      throw error;
    }
    console.warn(
      `[composio-mcp] Stored session ${existingSessionId} failed during operation for user ${userId}; recreating fresh session:`,
      details.message,
    );
    const freshSession = await resumeOrCreateComposioSession(
      composio,
      userId,
      existingSessionId,
      { forceRecreate: true, apiKey },
    );
    return await operation(freshSession, composio);
  }
}

async function extractConnectedToolkitSlugsFromSession(
  session: ComposioSession,
): Promise<string[]> {
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
}

export async function resolveComposioRuntimeContext(userId: string): Promise<{
  mcpServer: McpServerConfig | null;
  connectedToolkits: string[];
}> {
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    return { mcpServer: null, connectedToolkits: [] };
  }

  try {
    return await runWithComposioSession(userId, apiKey, async (session) => {
      const mcpServer: McpServerConfig | null = session.mcp?.url
        ? {
            name: COMPOSIO_MCP_SERVER_NAME,
            transport: "http",
            url: session.mcp.url,
            headers: session.mcp.headers,
          }
        : null;

      let connectedToolkits: string[] = [];
      try {
        connectedToolkits =
          await extractConnectedToolkitSlugsFromSession(session);
      } catch (toolkitError) {
        console.warn(
          `[composio-mcp] Failed to inspect connected toolkits for user ${userId}:`,
          toolkitError instanceof Error ? toolkitError.message : toolkitError,
        );
      }

      return { mcpServer, connectedToolkits };
    });
  } catch (error) {
    console.warn(
      `[composio-mcp] Failed to resolve Composio runtime context for user ${userId}, continuing without it:`,
      error instanceof Error ? error.message : error,
    );
    return { mcpServer: null, connectedToolkits: [] };
  }
}

export async function getComposioMcpServerConfig(
  userId: string,
): Promise<McpServerConfig | null> {
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    return await runWithComposioSession(userId, apiKey, async (session) => {
      if (!session.mcp?.url) {
        return null;
      }

      return {
        name: COMPOSIO_MCP_SERVER_NAME,
        transport: "http",
        url: session.mcp.url,
        headers: session.mcp.headers,
      };
    });
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
    return await runWithComposioSession(userId, apiKey, async (session) =>
      extractConnectedToolkitSlugsFromSession(session),
    );
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
    return await runWithComposioSession(userId, apiKey, async (session) => {
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
    });
  } catch (error) {
    const details = extractComposioErrorDetails(error, apiKey);
    console.warn(
      `[composio-mcp] Failed to list toolkits for user ${userId}:`,
      details.message,
    );
    return {
      configured: true,
      sessionId: null,
      mcpUrl: null,
      toolkits: defaultToolkits,
      error: details.message,
    };
  }
}

async function ensureToolkitAuthConfigAndLinkFallback(params: {
  composio: ComposioInstance;
  session: ComposioSession;
  userId: string;
  toolkitSlug: string;
  callbackUrl: string;
}): Promise<{ id?: string; redirectUrl?: string | null } | null> {
  const { composio, session, userId, toolkitSlug, callbackUrl } = params;
  const authConfigsApi = (
    composio as unknown as {
      authConfigs?: {
        list?: (query: {
          toolkit?: string;
          showDisabled?: boolean;
          limit?: number;
        }) => Promise<{
          items?: Array<{
            id: string;
            status?: string;
            isComposioManaged?: boolean;
            isEnabledForToolRouter?: boolean;
          }>;
        }>;
        enable?: (nanoid: string) => Promise<unknown>;
        create?: (
          toolkit: string,
          options?: {
            type: "use_composio_managed_auth";
            isEnabledForToolRouter?: boolean;
          },
        ) => Promise<{ id: string }>;
      };
    }
  ).authConfigs;

  let activeAuthConfigId: string | null = null;

  if (authConfigsApi && typeof authConfigsApi.list === "function") {
    try {
      const existing = await authConfigsApi.list({
        toolkit: toolkitSlug,
        showDisabled: true,
        limit: 20,
      });
      const items = existing.items ?? [];
      const enabledConfig =
        items.find(
          (cfg) =>
            cfg.status?.toUpperCase() !== "DISABLED" &&
            cfg.isEnabledForToolRouter !== false,
        ) ?? items.find((cfg) => cfg.status?.toUpperCase() !== "DISABLED");

      if (enabledConfig) {
        activeAuthConfigId = enabledConfig.id;
      } else {
        const disabledConfig = items.find(
          (cfg) => cfg.status?.toUpperCase() === "DISABLED",
        );
        if (disabledConfig && typeof authConfigsApi.enable === "function") {
          await authConfigsApi.enable(disabledConfig.id);
          activeAuthConfigId = disabledConfig.id;
        } else if (typeof authConfigsApi.create === "function") {
          const created = await authConfigsApi.create(toolkitSlug, {
            type: "use_composio_managed_auth",
            isEnabledForToolRouter: true,
          });
          activeAuthConfigId = created.id;
        }
      }
    } catch (configError) {
      console.warn(
        `[composio-mcp] Could not auto-provision managed auth config for ${toolkitSlug}:`,
        configError instanceof Error ? configError.message : configError,
      );
    }
  }

  if (activeAuthConfigId) {
    try {
      const retried = await session.authorize(toolkitSlug, { callbackUrl });
      if (retried?.redirectUrl) {
        return retried;
      }
    } catch {
      // Fall through to connectedAccounts.link with the resolved authConfigId
    }

    const connectedAccountsApi = (
      composio as unknown as {
        connectedAccounts?: {
          link?: (
            userId: string,
            authConfigId: string,
            options?: { callbackUrl?: string; allowMultiple?: boolean },
          ) => Promise<{ id?: string; redirectUrl?: string | null }>;
        };
      }
    ).connectedAccounts;

    if (
      connectedAccountsApi &&
      typeof connectedAccountsApi.link === "function"
    ) {
      const linked = await connectedAccountsApi.link(
        userId,
        activeAuthConfigId,
        {
          callbackUrl,
          allowMultiple: true,
        },
      );
      if (linked?.redirectUrl) {
        return linked;
      }
    }
  }

  return null;
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
    throw new ComposioApiError(
      "Composio integration is not configured on this server (COMPOSIO_API_KEY is unset).",
      503,
    );
  }

  const normalizedSlug = normalizeComposioToolkitSlug(params.toolkitSlug);

  try {
    return await runWithComposioSession(
      params.userId,
      apiKey,
      async (session, composio) => {
        let connectionRequest: {
          id?: string;
          redirectUrl?: string | null;
        } | null = null;
        let primaryAuthorizeError: unknown;

        try {
          connectionRequest = await session.authorize(normalizedSlug, {
            callbackUrl: params.callbackUrl,
          });
        } catch (authorizeErr) {
          primaryAuthorizeError = authorizeErr;
          const details = extractComposioErrorDetails(authorizeErr, apiKey);
          if (
            details.isStaleSession ||
            details.statusCode === 401 ||
            details.statusCode === 403 ||
            details.statusCode === 429
          ) {
            throw authorizeErr;
          }
          connectionRequest = await ensureToolkitAuthConfigAndLinkFallback({
            composio,
            session,
            userId: params.userId,
            toolkitSlug: normalizedSlug,
            callbackUrl: params.callbackUrl,
          });
          if (!connectionRequest) {
            throw authorizeErr;
          }
        }

        if (!connectionRequest?.redirectUrl) {
          const fallbackRequest = await ensureToolkitAuthConfigAndLinkFallback({
            composio,
            session,
            userId: params.userId,
            toolkitSlug: normalizedSlug,
            callbackUrl: params.callbackUrl,
          });
          if (fallbackRequest?.redirectUrl) {
            connectionRequest = fallbackRequest;
          }
        }

        if (!connectionRequest?.redirectUrl) {
          if (primaryAuthorizeError) {
            throw primaryAuthorizeError;
          }
          throw new ComposioApiError(
            `Composio did not return an authorization redirect URL for ${normalizedSlug}. Verify that ${normalizedSlug} has an active OAuth configuration in your Composio project.`,
            502,
          );
        }

        return {
          ok: true as const,
          redirectUrl: connectionRequest.redirectUrl,
          connectionId: connectionRequest.id ?? null,
        };
      },
    );
  } catch (error) {
    if (error instanceof ComposioApiError) {
      throw error;
    }
    const details = extractComposioErrorDetails(error, apiKey);
    throw new ComposioApiError(
      details.message,
      details.statusCode,
      details.requestId,
    );
  }
}

export async function verifyComposioToolkitConnectionForUser(params: {
  userId: string;
  toolkitSlug: string;
}): Promise<{
  ok: true;
  toolkitSlug: string;
  isConnected: boolean;
  status: ComposioToolkitCatalogItem["status"];
  connectedAccountId: string | null;
}> {
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    throw new ComposioApiError(
      "Composio integration is not configured on this server (COMPOSIO_API_KEY is unset).",
      503,
    );
  }

  const normalizedSlug = normalizeComposioToolkitSlug(params.toolkitSlug);

  try {
    return await runWithComposioSession(
      params.userId,
      apiKey,
      async (session, composio) => {
        if (typeof session.toolkits === "function") {
          const response = await session.toolkits({
            toolkits: [normalizedSlug],
            limit: 10,
          });
          const match = (response.items ?? []).find(
            (item) => item.slug?.toLowerCase() === normalizedSlug,
          );
          if (match) {
            const catalogStatus = toCatalogStatus(match.connection);
            if (catalogStatus.isConnected) {
              return {
                ok: true as const,
                toolkitSlug: normalizedSlug,
                ...catalogStatus,
              };
            }
          }
        }

        // Fallback: inspect connectedAccounts directly in case the Tool Router session
        // cache has not yet observed the newly completed OAuth callback.
        try {
          const accounts = await composio.connectedAccounts.list({
            userIds: [params.userId],
            toolkitSlugs: [normalizedSlug],
            limit: 20,
          });
          const activeAccount = (accounts.items ?? []).find(
            (acc: { id?: string; status?: string }) =>
              acc.status?.toUpperCase() === "ACTIVE",
          );
          if (activeAccount?.id) {
            return {
              ok: true as const,
              toolkitSlug: normalizedSlug,
              isConnected: true,
              status: "ACTIVE" as const,
              connectedAccountId: activeAccount.id,
            };
          }
          const initiatedAccount = (accounts.items ?? []).find(
            (acc: { id?: string; status?: string }) =>
              acc.status?.toUpperCase() === "INITIATED",
          );
          if (initiatedAccount?.id) {
            return {
              ok: true as const,
              toolkitSlug: normalizedSlug,
              isConnected: false,
              status: "INITIATED" as const,
              connectedAccountId: initiatedAccount.id,
            };
          }
        } catch {
          // Best-effort fallback
        }

        return {
          ok: true as const,
          toolkitSlug: normalizedSlug,
          isConnected: false,
          status: "NOT_CONNECTED" as const,
          connectedAccountId: null,
        };
      },
    );
  } catch (error) {
    if (error instanceof ComposioApiError) {
      throw error;
    }
    const details = extractComposioErrorDetails(error, apiKey);
    throw new ComposioApiError(
      details.message,
      details.statusCode,
      details.requestId,
    );
  }
}

export async function disconnectComposioAccountForUser(params: {
  userId: string;
  connectedAccountId: string;
}): Promise<{ ok: true }> {
  const apiKey = resolveComposioApiKey();
  if (!apiKey) {
    throw new ComposioApiError(
      "Composio integration is not configured on this server (COMPOSIO_API_KEY is unset).",
      503,
    );
  }

  try {
    const { Composio } = await import("@composio/core");
    const composio = createComposioSdkClient(Composio, apiKey);

    let cursor: string | undefined;
    let ownedByUser = false;
    for (let page = 0; page < 10; page += 1) {
      const accounts = await composio.connectedAccounts.list({
        userIds: [params.userId],
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });

      if (
        accounts.items.some((item) => item.id === params.connectedAccountId)
      ) {
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
  } catch (error) {
    if (
      error instanceof ComposioAccountNotFoundError ||
      error instanceof ComposioApiError
    ) {
      throw error;
    }
    const details = extractComposioErrorDetails(error, apiKey);
    throw new ComposioApiError(
      details.message,
      details.statusCode,
      details.requestId,
    );
  }
}
