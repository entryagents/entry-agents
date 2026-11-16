import { createHmac, timingSafeEqual } from "node:crypto";
import type { McpServerConfig } from "@entry-agents/agent";
import { tool as createAiTool, type ToolSet } from "ai";
import { z } from "zod";
import type {
  ComposioAccountType,
  ComposioConnectedAccountRow,
  ComposioConnectedAccountStatus,
} from "@/lib/db/schema";

export type ComposioToolkitCategory =
  | "Communication"
  | "Productivity"
  | "Engineering"
  | "Design"
  | "CRM"
  | "Analytics";

export interface ComposioConnectedAccountSummary {
  id: string;
  connectedAccountId: string;
  toolkitSlug: string;
  alias: string | null;
  accountType: ComposioAccountType;
  status: ComposioConnectedAccountStatus;
  isDefault: boolean;
  isDisabled: boolean;
  lastError: string | null;
  ownerUserId: string;
  isSharedWithMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ComposioToolkitCatalogItem {
  slug: string;
  name: string;
  description: string;
  category: ComposioToolkitCategory;
  logo: string | null;
  isConnected: boolean;
  status: ComposioConnectedAccountStatus | "NOT_CONNECTED";
  connectedAccountId: string | null;
  accounts: ComposioConnectedAccountSummary[];
  sharedAccounts: ComposioConnectedAccountSummary[];
}

export const COMPOSIO_POPULAR_TOOLKITS: Array<{
  slug: string;
  name: string;
  description: string;
  category: ComposioToolkitCategory;
}> = [
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
  {
    slug: "googlesheets",
    name: "Google Sheets",
    description: "Read, append, and update spreadsheet rows and ranges.",
    category: "Productivity",
  },
  {
    slug: "posthog",
    name: "PostHog",
    description:
      "Query product analytics, feature flags, insights, and cohorts.",
    category: "Analytics",
  },
  {
    slug: "stripe",
    name: "Stripe",
    description:
      "Inspect customers, subscriptions, invoices, and payment intents.",
    category: "CRM",
  },
];

export class ComposioServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 500, code = "COMPOSIO_ERROR") {
    super(message);
    this.name = "ComposioServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function getComposioApiKey(): string | null {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isComposioConfigured(): boolean {
  return getComposioApiKey() !== null;
}

export function scrubSecretsFromText(text: string): string {
  const apiKey = getComposioApiKey();
  let scrubbed = text;
  if (apiKey && apiKey.length >= 4) {
    scrubbed = scrubbed.split(apiKey).join("[REDACTED]");
  }
  const webhookSecret = process.env.COMPOSIO_WEBHOOK_SECRET?.trim();
  if (webhookSecret && webhookSecret.length >= 4) {
    scrubbed = scrubbed.split(webhookSecret).join("[REDACTED]");
  }
  return scrubbed;
}

export interface ComposioSdkLike {
  sessions: {
    create: (
      userId: string,
      config?: Record<string, unknown>,
    ) => Promise<ComposioSessionLike>;
    use: (
      sessionId: string,
      config?: Record<string, unknown>,
    ) => Promise<ComposioSessionLike>;
  };
  connectedAccounts: {
    list: (query?: Record<string, unknown>) => Promise<{
      items?: Array<{
        id: string;
        alias?: string | null;
        status: string;
        statusReason?: string | null;
        isDisabled?: boolean;
        toolkit?: { slug?: string };
        authConfig?: { id?: string };
        createdAt?: string;
        updatedAt?: string;
        experimental?: {
          accountType?: "PRIVATE" | "SHARED";
          aclConfigForShared?: {
            allowAllUsers?: boolean;
            allowedUserIds?: string[];
            notAllowedUserIds?: string[];
          };
        };
      }>;
    }>;
    get: (nanoid: string) => Promise<{
      id: string;
      alias?: string | null;
      status: string;
      statusReason?: string | null;
      isDisabled?: boolean;
      toolkit?: { slug?: string };
      authConfig?: { id?: string };
      userId?: string;
      wordId?: string | null;
      experimental?: {
        accountType?: "PRIVATE" | "SHARED";
      };
    }>;
    link: (
      userId: string,
      authConfigId: string,
      options?: Record<string, unknown>,
    ) => Promise<{
      id: string;
      status?: string;
      redirectUrl?: string | null;
    }>;
    delete: (nanoid: string) => Promise<{ deleted?: boolean }>;
    refresh: (
      nanoid: string,
      options?: Record<string, unknown>,
    ) => Promise<{
      id: string;
      status: string;
      redirectUrl?: string | null;
    }>;
    enable?: (nanoid: string) => Promise<unknown>;
    disable?: (nanoid: string) => Promise<unknown>;
    updateAcl?: (
      nanoid: string,
      params: {
        allowAllUsers?: boolean;
        allowedUserIds?: string[];
        notAllowedUserIds?: string[];
      },
    ) => Promise<unknown>;
    waitForConnection?: (
      connectedAccountId: string,
      timeout?: number,
    ) => Promise<{
      id: string;
      status: string;
      toolkit?: { slug?: string };
    }>;
  };
  toolkits?: {
    authorize?: (
      userId: string,
      toolkitSlug: string,
      authConfigId?: string,
    ) => Promise<{
      id: string;
      status?: string;
      redirectUrl?: string | null;
    }>;
  };
  tools?: {
    getRawToolRouterSessionTools?: (sessionId: string) => Promise<
      Array<{
        slug: string;
        name?: string;
        description?: string;
        inputParameters?: Record<string, unknown>;
      }>
    >;
    getRawComposioToolBySlug?: (slug: string) => Promise<{
      slug: string;
      name?: string;
      description?: string;
      inputParameters?: Record<string, unknown>;
      toolkit?: { slug?: string; name?: string };
    }>;
  };
  triggers?: {
    verifyWebhook?: (params: {
      payload: string;
      signature: string;
      webhookId: string;
      webhookTimestamp: string;
      secret: string;
    }) => Promise<unknown>;
  };
}

export interface ComposioSessionLike {
  sessionId: string;
  mcp?: {
    url: string;
    headers?: Record<string, string>;
  };
  authorize: (
    toolkit: string,
    options?: { callbackUrl?: string; alias?: string },
  ) => Promise<{
    id: string;
    status?: string;
    redirectUrl?: string | null;
  }>;
  toolkits: (options?: {
    toolkits?: string[];
    search?: string;
    limit?: number;
    isConnected?: boolean;
  }) => Promise<{
    items?: Array<{
      slug: string;
      name?: string;
      meta?: { description?: string; logo?: string };
      isNoAuth?: boolean;
      connectedAccount?: {
        id: string;
        status: string;
      } | null;
    }>;
  }>;
  search: (params: { query: string; toolkits?: string[] }) => Promise<{
    success: boolean;
    error: string | null;
    results: Array<{
      index: number;
      useCase: string;
      primaryToolSlugs: string[];
      relatedToolSlugs: string[];
      toolkits: string[];
      executionGuidance?: string;
    }>;
  }>;
  execute: (
    toolSlug: string,
    arguments_?: Record<string, unknown>,
    options?: { account?: string },
  ) => Promise<{
    data: Record<string, unknown>;
    error: string | null;
  }>;
}

let customComposioClientFactory:
  | ((apiKey: string) => Promise<ComposioSdkLike>)
  | null = null;

export function setComposioClientFactoryForTests(
  factory: ((apiKey: string) => Promise<ComposioSdkLike>) | null,
): void {
  customComposioClientFactory = factory;
}

export async function getComposioClient(): Promise<ComposioSdkLike> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new ComposioServiceError(
      "COMPOSIO_API_KEY is not configured on the server.",
      503,
      "COMPOSIO_UNCONFIGURED",
    );
  }
  if (customComposioClientFactory) {
    return await customComposioClientFactory(apiKey);
  }
  const { Composio } = await import("@composio/core");
  const instance = new Composio({
    apiKey,
    allowTracking: false,
    disableVersionCheck: true,
  });
  return instance as unknown as ComposioSdkLike;
}

export function normalizeAccountStatus(
  rawStatus?: string | null,
  isDisabled?: boolean,
): ComposioConnectedAccountStatus {
  if (isDisabled) {
    return "INACTIVE";
  }
  const upper = (rawStatus ?? "").toUpperCase();
  if (
    upper === "INITIALIZING" ||
    upper === "INITIATED" ||
    upper === "ACTIVE" ||
    upper === "FAILED" ||
    upper === "EXPIRED" ||
    upper === "INACTIVE"
  ) {
    return upper;
  }
  return "INITIATED";
}

function mapRowToSummary(
  row: ComposioConnectedAccountRow,
  viewerUserId: string,
): ComposioConnectedAccountSummary {
  return {
    id: row.id,
    connectedAccountId: row.connectedAccountId,
    toolkitSlug: row.toolkitSlug,
    alias: row.alias,
    accountType: row.accountType,
    status: row.isDisabled ? "INACTIVE" : row.status,
    isDefault: row.isDefault,
    isDisabled: row.isDisabled,
    lastError: row.lastError,
    ownerUserId: row.userId,
    isSharedWithMe: row.userId !== viewerUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const inflightSessions = new Map<string, Promise<ComposioSessionLike>>();

/**
 * Resolves or creates a per-user Composio session using Entry's authenticated
 * user.id as the stable Composio user_id.
 */
export async function getOrCreateUserComposioSession(
  userId: string,
  options?: {
    forceRecreate?: boolean;
    connectedAccountsOverride?: Record<string, string | string[]>;
    callbackUrl?: string;
  },
): Promise<{ session: ComposioSessionLike; client: ComposioSdkLike }> {
  if (!userId || !userId.trim()) {
    throw new ComposioServiceError(
      "Authenticated Entry userId is required to create a Composio session.",
      401,
      "UNAUTHORIZED",
    );
  }

  const client = await getComposioClient();
  const {
    getComposioSessionId,
    setComposioSessionId,
    deleteComposioSessionId,
    listUserComposioConnectedAccounts,
    listAuthorizedSharedAccountsForUser,
  } = await import("@/lib/db/composio-sessions");

  // Compute connectedAccounts mapping (including multi-account and shared accounts)
  const [ownAccounts, sharedAccounts] = await Promise.all([
    listUserComposioConnectedAccounts(userId).catch(
      () => [] as ComposioConnectedAccountRow[],
    ),
    listAuthorizedSharedAccountsForUser(userId).catch(
      () => [] as ComposioConnectedAccountRow[],
    ),
  ]);

  const activeByToolkit = new Map<string, string[]>();
  for (const acc of ownAccounts) {
    if (acc.status === "ACTIVE" && !acc.isDisabled) {
      const list = activeByToolkit.get(acc.toolkitSlug) ?? [];
      if (acc.isDefault) {
        list.unshift(acc.connectedAccountId);
      } else {
        list.push(acc.connectedAccountId);
      }
      activeByToolkit.set(acc.toolkitSlug, list);
    }
  }
  for (const shared of sharedAccounts) {
    if (shared.status === "ACTIVE" && !shared.isDisabled) {
      const list = activeByToolkit.get(shared.toolkitSlug) ?? [];
      if (!list.includes(shared.connectedAccountId)) {
        list.push(shared.connectedAccountId);
      }
      activeByToolkit.set(shared.toolkitSlug, list);
    }
  }

  const connectedAccountsConfig: Record<string, string | string[]> = {
    ...Object.fromEntries(
      Array.from(activeByToolkit.entries()).map(([slug, ids]) => [
        slug,
        ids.length === 1 ? ids[0] : ids,
      ]),
    ),
    ...options?.connectedAccountsOverride,
  };

  const sessionConfig: Record<string, unknown> = {
    mcp: true,
    multiAccount: {
      enable: true,
      maxAccountsPerToolkit: 5,
    },
    ...(Object.keys(connectedAccountsConfig).length > 0
      ? { connectedAccounts: connectedAccountsConfig }
      : {}),
    ...(options?.callbackUrl
      ? {
          manageConnections: {
            enable: true,
            callbackUrl: options.callbackUrl,
          },
        }
      : {}),
  };

  const existingSessionId = await getComposioSessionId(userId).catch(
    () => null,
  );
  const hasCustomOverride =
    Boolean(options?.forceRecreate) ||
    Boolean(options?.connectedAccountsOverride) ||
    sharedAccounts.length > 0;

  const lockKey = `${userId}:${hasCustomOverride ? "fresh" : (existingSessionId ?? "new")}`;
  const pending = inflightSessions.get(lockKey);
  if (pending) {
    const session = await pending;
    return { session, client };
  }

  const promise = (async () => {
    if (!hasCustomOverride && existingSessionId) {
      try {
        const resumed = await client.sessions.use(existingSessionId, {
          mcp: true,
        });
        if (resumed?.sessionId) {
          return resumed;
        }
      } catch {
        await deleteComposioSessionId(userId).catch(() => {});
      }
    }

    const created = await client.sessions.create(userId, sessionConfig);
    await setComposioSessionId(userId, created.sessionId).catch(() => {});
    return created;
  })();

  inflightSessions.set(lockKey, promise);
  try {
    const session = await promise;
    return { session, client };
  } finally {
    inflightSessions.delete(lockKey);
  }
}

/**
 * Synchronizes connected accounts from Composio for the authenticated user
 * with local metadata rows so external status changes are reflected accurately.
 */
export async function syncUserComposioAccounts(
  userId: string,
): Promise<ComposioConnectedAccountRow[]> {
  const { listUserComposioConnectedAccounts, upsertComposioConnectedAccount } =
    await import("@/lib/db/composio-sessions");

  if (!isComposioConfigured()) {
    return await listUserComposioConnectedAccounts(userId);
  }

  try {
    const client = await getComposioClient();
    const remoteList = await client.connectedAccounts.list({
      userIds: [userId],
      limit: 100,
    });
    const remoteItems = Array.isArray(remoteList?.items)
      ? remoteList.items
      : [];

    for (const item of remoteItems) {
      const slug = item.toolkit?.slug?.toLowerCase();
      if (!item.id || !slug) continue;
      const status = normalizeAccountStatus(item.status, item.isDisabled);
      const accountType =
        item.experimental?.accountType === "SHARED" ? "SHARED" : "PRIVATE";
      await upsertComposioConnectedAccount({
        userId,
        composioUserId: userId,
        connectedAccountId: item.id,
        toolkitSlug: slug,
        authConfigId: item.authConfig?.id ?? null,
        alias: item.alias ?? null,
        accountType,
        status,
        isDisabled: Boolean(item.isDisabled),
        lastError: item.statusReason ?? null,
        lastVerifiedAt: new Date(),
      });
    }
  } catch (error) {
    console.warn(
      `[composio] Failed to sync connected accounts for user ${userId}:`,
      error instanceof Error ? scrubSecretsFromText(error.message) : error,
    );
  }

  return await listUserComposioConnectedAccounts(userId);
}

let cachedLiveToolkits: {
  fetchedAt: number;
  items: Array<{
    slug: string;
    name: string;
    description: string;
    category: ComposioToolkitCategory;
    logo: string | null;
  }>;
} | null = null;

function mapComposioCategory(
  rawCategory?: string | null,
): ComposioToolkitCategory {
  const c = (rawCategory ?? "").toLowerCase();
  if (
    c.includes("email") ||
    c.includes("chat") ||
    c.includes("comm") ||
    c.includes("social") ||
    c.includes("messaging")
  ) {
    return "Communication";
  }
  if (
    c.includes("dev") ||
    c.includes("code") ||
    c.includes("eng") ||
    c.includes("git") ||
    c.includes("issue") ||
    c.includes("ci")
  ) {
    return "Engineering";
  }
  if (c.includes("design") || c.includes("figma") || c.includes("media")) {
    return "Design";
  }
  if (
    c.includes("crm") ||
    c.includes("sales") ||
    c.includes("payment") ||
    c.includes("billing") ||
    c.includes("commerce")
  ) {
    return "CRM";
  }
  if (c.includes("analytic") || c.includes("monitor") || c.includes("data")) {
    return "Analytics";
  }
  return "Productivity";
}

async function getLiveComposioCatalog(): Promise<
  Array<{
    slug: string;
    name: string;
    description: string;
    category: ComposioToolkitCategory;
    logo: string | null;
  }>
> {
  if (
    cachedLiveToolkits &&
    Date.now() - cachedLiveToolkits.fetchedAt < 5 * 60_000
  ) {
    return cachedLiveToolkits.items;
  }

  const presetMap = new Map(
    COMPOSIO_POPULAR_TOOLKITS.map((p) => [
      p.slug.toLowerCase(),
      {
        ...p,
        logo: `https://logos.composio.dev/api/${p.slug.toLowerCase()}`,
      },
    ]),
  );

  if (!isComposioConfigured()) {
    return Array.from(presetMap.values());
  }

  try {
    const client = (await getComposioClient()) as ComposioSdkLike & {
      toolkits?: {
        get?: (opts?: { limit?: number }) => Promise<
          Array<{
            slug?: string;
            name?: string;
            meta?: {
              description?: string;
              logo?: string;
              categories?: Array<{ slug?: string; name?: string }>;
            };
          }>
        >;
      };
    };

    const raw = await client.toolkits?.get?.({ limit: 200 });
    if (Array.isArray(raw) && raw.length > 0) {
      for (const tk of raw) {
        const slug = tk.slug?.trim().toLowerCase();
        if (!slug) continue;
        const existing = presetMap.get(slug);
        const rawCat =
          tk.meta?.categories?.[0]?.slug ?? tk.meta?.categories?.[0]?.name;
        presetMap.set(slug, {
          slug,
          name:
            existing?.name ??
            tk.name?.trim() ??
            slug.charAt(0).toUpperCase() + slug.slice(1),
          description:
            existing?.description ??
            tk.meta?.description?.trim() ??
            `Connect ${tk.name ?? slug} tools to your workspace.`,
          category: existing?.category ?? mapComposioCategory(rawCat),
          logo:
            tk.meta?.logo?.trim() || `https://logos.composio.dev/api/${slug}`,
        });
      }
    }
  } catch (err) {
    console.warn(
      "[composio] Failed to fetch live toolkit catalog:",
      err instanceof Error ? scrubSecretsFromText(err.message) : err,
    );
  }

  const items = Array.from(presetMap.values());
  cachedLiveToolkits = { fetchedAt: Date.now(), items };
  return items;
}

/**
 * Lists the full toolkit catalog + connected accounts + shared accounts for a user.
 */
export async function listComposioToolkitsForUser(
  userId: string,
  options?: {
    search?: string;
    category?: string;
  },
): Promise<{
  configured: boolean;
  toolkits: ComposioToolkitCatalogItem[];
  connectedCount: number;
  categoryCounts: Record<string, number>;
  sharedAccounts: ComposioConnectedAccountSummary[];
}> {
  const { listAuthorizedSharedAccountsForUser } =
    await import("@/lib/db/composio-sessions");

  const configured = isComposioConfigured();
  const [ownRows, sharedRows, baseCatalog] = await Promise.all([
    syncUserComposioAccounts(userId).catch(
      () => [] as ComposioConnectedAccountRow[],
    ),
    listAuthorizedSharedAccountsForUser(userId).catch(
      () => [] as ComposioConnectedAccountRow[],
    ),
    getLiveComposioCatalog(),
  ]);

  const ownByToolkit = new Map<string, ComposioConnectedAccountSummary[]>();
  for (const row of ownRows) {
    const list = ownByToolkit.get(row.toolkitSlug) ?? [];
    list.push(mapRowToSummary(row, userId));
    ownByToolkit.set(row.toolkitSlug, list);
  }

  const sharedByToolkit = new Map<string, ComposioConnectedAccountSummary[]>();
  const allSharedSummaries: ComposioConnectedAccountSummary[] = [];
  for (const row of sharedRows) {
    const summary = mapRowToSummary(row, userId);
    allSharedSummaries.push(summary);
    const list = sharedByToolkit.get(row.toolkitSlug) ?? [];
    list.push(summary);
    sharedByToolkit.set(row.toolkitSlug, list);
  }

  const fullCatalog: ComposioToolkitCatalogItem[] = baseCatalog.map(
    (preset) => {
      const slug = preset.slug.toLowerCase();
      const accounts = ownByToolkit.get(slug) ?? [];
      const sharedAccounts = sharedByToolkit.get(slug) ?? [];
      const primaryActive =
        accounts.find((a) => a.status === "ACTIVE" && a.isDefault) ??
        accounts.find((a) => a.status === "ACTIVE") ??
        accounts[0] ??
        null;

      return {
        slug,
        name: preset.name,
        description: preset.description,
        category: preset.category,
        logo: preset.logo ?? `https://logos.composio.dev/api/${slug}`,
        isConnected: accounts.some((a) => a.status === "ACTIVE"),
        status: primaryActive ? primaryActive.status : "NOT_CONNECTED",
        connectedAccountId: primaryActive
          ? primaryActive.connectedAccountId
          : null,
        accounts,
        sharedAccounts,
      };
    },
  );

  // Also include any custom/dynamic toolkits the user has connected outside presets
  const presetSlugs = new Set(fullCatalog.map((i) => i.slug));
  for (const [slug, accounts] of ownByToolkit.entries()) {
    if (!presetSlugs.has(slug)) {
      const primary =
        accounts.find((a) => a.status === "ACTIVE") ?? accounts[0];
      fullCatalog.push({
        slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        description: `Connected ${slug} integration.`,
        category: "Productivity",
        logo: `https://logos.composio.dev/api/${slug}`,
        isConnected: accounts.some((a) => a.status === "ACTIVE"),
        status: primary ? primary.status : "NOT_CONNECTED",
        connectedAccountId: primary ? primary.connectedAccountId : null,
        accounts,
        sharedAccounts: sharedByToolkit.get(slug) ?? [],
      });
    }
  }

  // Compute category counts from the full catalog before filtering
  const categoryCounts: Record<string, number> = {
    All: fullCatalog.length,
    Connected: fullCatalog.filter(
      (item) => item.isConnected || item.sharedAccounts.length > 0,
    ).length,
    Communication: 0,
    Productivity: 0,
    Engineering: 0,
    Design: 0,
    CRM: 0,
    Analytics: 0,
  };
  for (const item of fullCatalog) {
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
  }

  let catalogItems = fullCatalog;

  const search = options?.search?.trim().toLowerCase();
  if (search) {
    catalogItems = catalogItems.filter(
      (item) =>
        item.name.toLowerCase().includes(search) ||
        item.slug.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search) ||
        item.category.toLowerCase().includes(search),
    );
  }

  const category = options?.category?.trim();
  if (category && category !== "all" && category !== "All") {
    if (category.toLowerCase() === "connected") {
      catalogItems = catalogItems.filter(
        (item) => item.isConnected || item.sharedAccounts.length > 0,
      );
    } else {
      catalogItems = catalogItems.filter(
        (item) => item.category.toLowerCase() === category.toLowerCase(),
      );
    }
  }

  const connectedCount = fullCatalog.filter((item) => item.isConnected).length;

  return {
    configured,
    toolkits: catalogItems,
    connectedCount,
    categoryCounts,
    sharedAccounts: allSharedSummaries,
  };
}

export interface InitiateComposioConnectionInput {
  userId: string;
  toolkitSlug: string;
  callbackBaseUrl: string;
  alias?: string | null;
  accountType?: ComposioAccountType;
  allowMultiple?: boolean;
  authConfigId?: string | null;
  chatId?: string | null;
  sessionId?: string | null;
  returnPath?: string | null;
}

export interface InitiateComposioConnectionResult {
  redirectUrl: string;
  connectedAccountId: string;
  stateNonce: string;
  status: ComposioConnectedAccountStatus;
  toolkitSlug: string;
  alias: string | null;
  accountType: ComposioAccountType;
}

/**
 * Initiates a new Composio OAuth connection or Connect Link for the authenticated Entry user.
 */
export async function initiateComposioConnection(
  input: InitiateComposioConnectionInput,
): Promise<InitiateComposioConnectionResult> {
  const { createComposioOAuthAttempt, upsertComposioConnectedAccount } =
    await import("@/lib/db/composio-sessions");

  const normalizedSlug = input.toolkitSlug.trim().toLowerCase();
  if (!normalizedSlug) {
    throw new ComposioServiceError(
      "Toolkit slug is required.",
      400,
      "INVALID_TOOLKIT",
    );
  }

  const stateNonce = `csn_${crypto.randomUUID().replace(/-/g, "")}`;
  const callbackUrlObj = new URL(
    "/api/composio/callback",
    input.callbackBaseUrl,
  );
  callbackUrlObj.searchParams.set("state", stateNonce);
  callbackUrlObj.searchParams.set("toolkit", normalizedSlug);
  const callbackUrl = callbackUrlObj.toString();

  const { session, client } = await getOrCreateUserComposioSession(
    input.userId,
    {
      callbackUrl,
    },
  );

  let connectionReq: {
    id: string;
    status?: string;
    redirectUrl?: string | null;
  };

  const accountType: ComposioAccountType = input.accountType ?? "PRIVATE";

  if (input.authConfigId && client.connectedAccounts.link) {
    connectionReq = await client.connectedAccounts.link(
      input.userId,
      input.authConfigId,
      {
        callbackUrl,
        ...(input.alias ? { alias: input.alias } : {}),
        allowMultiple: input.allowMultiple ?? true,
        ...(accountType === "SHARED"
          ? {
              experimental: {
                accountType: "SHARED",
                aclConfigForShared: {
                  allowedUserIds: [input.userId],
                },
              },
            }
          : {}),
      },
    );
  } else {
    connectionReq = await session.authorize(normalizedSlug, {
      callbackUrl,
      ...(input.alias ? { alias: input.alias } : {}),
    });
  }

  if (!connectionReq?.redirectUrl || !connectionReq?.id) {
    throw new ComposioServiceError(
      `Composio did not return a Connect Link redirect URL for ${normalizedSlug}.`,
      502,
      "MISSING_REDIRECT_URL",
    );
  }

  if (
    accountType === "SHARED" &&
    !input.authConfigId &&
    client.connectedAccounts.updateAcl
  ) {
    await client.connectedAccounts
      .updateAcl(connectionReq.id, {
        allowedUserIds: [input.userId],
      })
      .catch(() => {});
  }

  await createComposioOAuthAttempt({
    userId: input.userId,
    stateNonce,
    toolkitSlug: normalizedSlug,
    connectedAccountId: connectionReq.id,
    alias: input.alias ?? null,
    accountType,
    chatId: input.chatId ?? null,
    sessionId: input.sessionId ?? null,
    returnPath: input.returnPath ?? null,
  });

  const status = normalizeAccountStatus(connectionReq.status ?? "INITIATED");
  await upsertComposioConnectedAccount({
    userId: input.userId,
    composioUserId: input.userId,
    connectedAccountId: connectionReq.id,
    toolkitSlug: normalizedSlug,
    authConfigId: input.authConfigId ?? null,
    alias: input.alias ?? null,
    accountType,
    status,
  });

  return {
    redirectUrl: connectionReq.redirectUrl,
    connectedAccountId: connectionReq.id,
    stateNonce,
    status,
    toolkitSlug: normalizedSlug,
    alias: input.alias ?? null,
    accountType,
  };
}

/**
 * Verifies an OAuth callback against the authenticated Entry user, the stored
 * state nonce, and Composio's server-side connectedAccount state.
 * Rejects expired, mismatched, or cross-user callback attempts.
 */
export async function verifyAndCompleteComposioCallback(input: {
  authenticatedUserId: string;
  stateNonce: string;
  connectedAccountId?: string | null;
  statusParam?: string | null;
}): Promise<{
  account: ComposioConnectedAccountRow;
  returnPath: string;
  chatId: string | null;
  sessionId: string | null;
}> {
  const {
    getComposioOAuthAttemptByNonce,
    completeComposioOAuthAttempt,
    upsertComposioConnectedAccount,
    getComposioConnectedAccountById,
  } = await import("@/lib/db/composio-sessions");

  const attempt = await getComposioOAuthAttemptByNonce(input.stateNonce);
  if (!attempt) {
    throw new ComposioServiceError(
      "Invalid or unknown OAuth callback state.",
      400,
      "INVALID_OAUTH_STATE",
    );
  }

  // Prevent OAuth session fixation / cross-user callback hijacking
  if (attempt.userId !== input.authenticatedUserId) {
    throw new ComposioServiceError(
      "OAuth callback user does not match the initiating Entry user.",
      403,
      "CROSS_USER_CALLBACK_REJECTED",
    );
  }

  if (attempt.status !== "PENDING") {
    throw new ComposioServiceError(
      `OAuth attempt has already been processed (${attempt.status}).`,
      400,
      "OAUTH_ATTEMPT_ALREADY_USED",
    );
  }

  if (attempt.expiresAt.getTime() < Date.now()) {
    await completeComposioOAuthAttempt(input.stateNonce, "EXPIRED");
    throw new ComposioServiceError(
      "OAuth connection attempt expired. Please initiate a new connection.",
      400,
      "OAUTH_ATTEMPT_EXPIRED",
    );
  }

  const targetAccountId =
    input.connectedAccountId?.trim() || attempt.connectedAccountId;
  if (!targetAccountId) {
    await completeComposioOAuthAttempt(input.stateNonce, "FAILED");
    throw new ComposioServiceError(
      "Missing connectedAccountId in OAuth callback.",
      400,
      "MISSING_CONNECTED_ACCOUNT_ID",
    );
  }

  // Verify the account is not owned by another Entry user locally
  const existingLocal = await getComposioConnectedAccountById(targetAccountId);
  if (existingLocal && existingLocal.userId !== input.authenticatedUserId) {
    await completeComposioOAuthAttempt(input.stateNonce, "FAILED");
    throw new ComposioServiceError(
      "Connected account is already owned by another user.",
      403,
      "CROSS_USER_ACCOUNT_REJECTED",
    );
  }

  if (input.statusParam?.toLowerCase() === "failed") {
    await completeComposioOAuthAttempt(
      input.stateNonce,
      "FAILED",
      targetAccountId,
    );
    const failedRow = await upsertComposioConnectedAccount({
      userId: input.authenticatedUserId,
      composioUserId: input.authenticatedUserId,
      connectedAccountId: targetAccountId,
      toolkitSlug: attempt.toolkitSlug,
      alias: attempt.alias,
      accountType: attempt.accountType,
      status: "FAILED",
      lastError: "OAuth provider returned status=failed",
      lastVerifiedAt: new Date(),
    });
    return {
      account: failedRow,
      returnPath: attempt.returnPath ?? "/settings/connections",
      chatId: attempt.chatId,
      sessionId: attempt.sessionId,
    };
  }

  // Verify status directly with Composio API
  const client = await getComposioClient();
  const remoteAccount = await client.connectedAccounts.get(targetAccountId);

  if (
    remoteAccount.userId &&
    remoteAccount.userId !== input.authenticatedUserId
  ) {
    await completeComposioOAuthAttempt(input.stateNonce, "FAILED");
    throw new ComposioServiceError(
      "Composio connected account userId does not match authenticated user.",
      403,
      "REMOTE_USER_MISMATCH",
    );
  }

  const verifiedStatus = normalizeAccountStatus(
    remoteAccount.status,
    remoteAccount.isDisabled,
  );

  await completeComposioOAuthAttempt(
    input.stateNonce,
    verifiedStatus === "ACTIVE" ? "COMPLETED" : "FAILED",
    targetAccountId,
  );

  const account = await upsertComposioConnectedAccount({
    userId: input.authenticatedUserId,
    composioUserId: input.authenticatedUserId,
    connectedAccountId: targetAccountId,
    toolkitSlug:
      remoteAccount.toolkit?.slug?.toLowerCase() ?? attempt.toolkitSlug,
    authConfigId: remoteAccount.authConfig?.id ?? null,
    alias: remoteAccount.alias ?? attempt.alias,
    accountType: remoteAccount.experimental?.accountType ?? attempt.accountType,
    status: verifiedStatus,
    isDisabled: Boolean(remoteAccount.isDisabled),
    lastError: remoteAccount.statusReason ?? null,
    lastVerifiedAt: new Date(),
  });

  return {
    account,
    returnPath: attempt.returnPath ?? "/settings/connections",
    chatId: attempt.chatId,
    sessionId: attempt.sessionId,
  };
}

/**
 * Redeems a single-use Composio OAuth Callback Identity Verification `session_uri`
 * by calling `POST /api/v3.1/connected_accounts/complete_auth` with the
 * authenticated Entry user's ID and project API key.
 *
 * Defends against OAuth session fixation: Composio activates the connection
 * only if `user_id` matches the user who initiated the flow.
 */
export async function completeComposioDeferredAuth(input: {
  authenticatedUserId: string;
  sessionUri: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  account: ComposioConnectedAccountRow;
  connectedAccountId: string;
  toolkitSlug: string;
}> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new ComposioServiceError(
      "COMPOSIO_API_KEY is not configured on the server.",
      503,
      "COMPOSIO_UNCONFIGURED",
    );
  }
  if (!input.authenticatedUserId.trim()) {
    throw new ComposioServiceError(
      "Authenticated Entry user is required.",
      401,
      "UNAUTHORIZED",
    );
  }
  if (!input.sessionUri.trim()) {
    throw new ComposioServiceError(
      "Missing session_uri in OAuth callback.",
      400,
      "MISSING_SESSION_URI",
    );
  }

  const doFetch = input.fetchImpl ?? fetch;
  const response = await doFetch(
    "https://backend.composio.dev/api/v3.1/connected_accounts/complete_auth",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        user_id: input.authenticatedUserId,
        session_uri: input.sessionUri.trim(),
      }),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as {
    connected_account_id?: string;
    connectedAccountId?: string;
    toolkit_slug?: string;
    toolkitSlug?: string;
    message?: string;
    error?: { message?: string } | string;
  };

  if (response.status === 404) {
    throw new ComposioServiceError(
      "OAuth verification session expired or was already redeemed. Please try connecting again.",
      404,
      "SESSION_URI_EXPIRED",
    );
  }

  if (response.status === 400) {
    const errMsg =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ||
          payload.message ||
          "Callback identity verification failed: user mismatch.";
    throw new ComposioServiceError(
      scrubSecretsFromText(errMsg),
      400,
      "CALLBACK_IDENTITY_MISMATCH",
    );
  }

  if (!response.ok) {
    const errMsg =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ||
          payload.message ||
          `Composio complete_auth failed (${response.status}).`;
    throw new ComposioServiceError(
      scrubSecretsFromText(errMsg),
      response.status >= 400 ? response.status : 502,
      "COMPLETE_AUTH_FAILED",
    );
  }

  const connectedAccountId =
    payload.connected_account_id?.trim() ||
    payload.connectedAccountId?.trim() ||
    "";
  const toolkitSlug = (
    payload.toolkit_slug?.trim() ||
    payload.toolkitSlug?.trim() ||
    "integration"
  ).toLowerCase();

  if (!connectedAccountId) {
    throw new ComposioServiceError(
      "Composio complete_auth did not return a connected_account_id.",
      502,
      "MISSING_CONNECTED_ACCOUNT_ID",
    );
  }

  const { getComposioConnectedAccountById, upsertComposioConnectedAccount } =
    await import("@/lib/db/composio-sessions");

  const existingLocal =
    await getComposioConnectedAccountById(connectedAccountId);
  if (existingLocal && existingLocal.userId !== input.authenticatedUserId) {
    throw new ComposioServiceError(
      "Connected account is already owned by another user.",
      403,
      "CROSS_USER_ACCOUNT_REJECTED",
    );
  }

  const account = await upsertComposioConnectedAccount({
    userId: input.authenticatedUserId,
    composioUserId: input.authenticatedUserId,
    connectedAccountId,
    toolkitSlug,
    status: "ACTIVE",
    isDisabled: false,
    lastError: null,
    lastVerifiedAt: new Date(),
  });

  return {
    account,
    connectedAccountId,
    toolkitSlug,
  };
}

/**
 * Reconnects an expired, failed, or revoked connected account.
 */
export async function reconnectComposioAccount(input: {
  userId: string;
  connectedAccountId: string;
  callbackBaseUrl: string;
}): Promise<{
  redirectUrl: string | null;
  account: ComposioConnectedAccountRow;
}> {
  const {
    getComposioConnectedAccountById,
    upsertComposioConnectedAccount,
    createComposioOAuthAttempt,
  } = await import("@/lib/db/composio-sessions");

  const existing = await getComposioConnectedAccountById(
    input.connectedAccountId,
  );
  if (!existing || existing.userId !== input.userId) {
    throw new ComposioServiceError(
      "Connected account not found for this user.",
      404,
      "ACCOUNT_NOT_FOUND",
    );
  }

  const stateNonce = `csn_${crypto.randomUUID().replace(/-/g, "")}`;
  const callbackUrlObj = new URL(
    "/api/composio/callback",
    input.callbackBaseUrl,
  );
  callbackUrlObj.searchParams.set("state", stateNonce);
  callbackUrlObj.searchParams.set("toolkit", existing.toolkitSlug);
  const callbackUrl = callbackUrlObj.toString();

  const client = await getComposioClient();
  const refreshed = await client.connectedAccounts.refresh(
    input.connectedAccountId,
    {
      redirectUrl: callbackUrl,
    },
  );

  if (refreshed.redirectUrl) {
    await createComposioOAuthAttempt({
      userId: input.userId,
      stateNonce,
      toolkitSlug: existing.toolkitSlug,
      connectedAccountId: existing.connectedAccountId,
      alias: existing.alias,
      accountType: existing.accountType,
    });
  }

  const nextStatus = normalizeAccountStatus(refreshed.status);
  const updated = await upsertComposioConnectedAccount({
    userId: input.userId,
    composioUserId: input.userId,
    connectedAccountId: existing.connectedAccountId,
    toolkitSlug: existing.toolkitSlug,
    authConfigId: existing.authConfigId,
    alias: existing.alias,
    accountType: existing.accountType,
    status: nextStatus,
    isDefault: existing.isDefault,
    lastError: null,
    lastVerifiedAt: new Date(),
  });

  return {
    redirectUrl: refreshed.redirectUrl ?? null,
    account: updated,
  };
}

/**
 * Disconnects and revokes a connected account in Composio and removes it locally.
 */
export async function disconnectComposioAccount(input: {
  userId: string;
  connectedAccountId: string;
}): Promise<{ deleted: boolean }> {
  const {
    getComposioConnectedAccountById,
    deleteUserComposioConnectedAccount,
    deleteComposioSessionId,
  } = await import("@/lib/db/composio-sessions");

  const existing = await getComposioConnectedAccountById(
    input.connectedAccountId,
  );
  if (!existing || existing.userId !== input.userId) {
    throw new ComposioServiceError(
      "Connected account not found or unauthorized.",
      404,
      "ACCOUNT_NOT_FOUND",
    );
  }

  if (isComposioConfigured()) {
    const client = await getComposioClient();
    await client.connectedAccounts
      .delete(input.connectedAccountId)
      .catch((err) => {
        console.warn(
          `[composio] Remote delete warning for ${input.connectedAccountId}:`,
          err instanceof Error ? scrubSecretsFromText(err.message) : err,
        );
      });
  }

  const deleted = await deleteUserComposioConnectedAccount(
    input.userId,
    input.connectedAccountId,
  );
  await deleteComposioSessionId(input.userId).catch(() => {});

  return { deleted };
}

/**
 * Updates shared connection access grants and syncs ACL to Composio.
 */
export async function updateSharedComposioConnectionAccess(input: {
  ownerUserId: string;
  connectedAccountId: string;
  action: "grant" | "revoke";
  targetUserId: string;
}): Promise<{ allowedUserIds: string[] }> {
  const {
    grantSharedComposioAccountAccess,
    revokeSharedComposioAccountAccess,
    listActiveSharedGrantsForOwner,
  } = await import("@/lib/db/composio-sessions");

  if (input.action === "grant") {
    await grantSharedComposioAccountAccess({
      ownerUserId: input.ownerUserId,
      connectedAccountId: input.connectedAccountId,
      granteeUserId: input.targetUserId,
    });
  } else {
    await revokeSharedComposioAccountAccess({
      ownerUserId: input.ownerUserId,
      connectedAccountId: input.connectedAccountId,
      granteeUserId: input.targetUserId,
    });
  }

  const activeGrants = await listActiveSharedGrantsForOwner(
    input.ownerUserId,
    input.connectedAccountId,
  );
  const allowedUserIds = Array.from(
    new Set([input.ownerUserId, ...activeGrants.map((g) => g.granteeUserId)]),
  );

  if (isComposioConfigured()) {
    const client = await getComposioClient();
    if (client.connectedAccounts.updateAcl) {
      await client.connectedAccounts.updateAcl(input.connectedAccountId, {
        allowAllUsers: false,
        allowedUserIds,
      });
    }
  }

  return { allowedUserIds };
}

/**
 * Verifies a Composio webhook signature and updates connected account state idempotently.
 */
export async function verifyAndProcessComposioWebhook(input: {
  rawBody: string;
  signature: string | null;
  webhookId: string | null;
  webhookTimestamp: string | null;
}): Promise<{
  verified: boolean;
  eventType: string;
  connectedAccountId: string | null;
  updatedStatus: ComposioConnectedAccountStatus | null;
}> {
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new ComposioServiceError(
      "COMPOSIO_WEBHOOK_SECRET is not configured.",
      503,
      "WEBHOOK_SECRET_MISSING",
    );
  }
  if (!input.signature || !input.webhookId || !input.webhookTimestamp) {
    throw new ComposioServiceError(
      "Missing required webhook signature headers.",
      401,
      "MISSING_WEBHOOK_HEADERS",
    );
  }

  // Verify HMAC-SHA256 signature (Standard Webhooks / Composio format: `${webhookId}.${webhookTimestamp}.${rawBody}`)
  const signedContent = `${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}`;
  const expectedBase64 = createHmac("sha256", secret)
    .update(signedContent)
    .digest("base64");
  const expectedHex = createHmac("sha256", secret)
    .update(signedContent)
    .digest("hex");

  const providedSignatures = input.signature
    .split(" ")
    .map((part) => part.replace(/^v1,/, "").trim())
    .filter(Boolean);

  const matchesHmac = providedSignatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    const b64Buf = Buffer.from(expectedBase64);
    const hexBuf = Buffer.from(expectedHex);
    return (
      (sigBuf.length === b64Buf.length && timingSafeEqual(sigBuf, b64Buf)) ||
      (sigBuf.length === hexBuf.length && timingSafeEqual(sigBuf, hexBuf))
    );
  });

  if (!matchesHmac) {
    // Also try SDK verifyWebhook if available
    let sdkVerified = false;
    if (isComposioConfigured()) {
      try {
        const client = await getComposioClient();
        if (client.triggers?.verifyWebhook) {
          await client.triggers.verifyWebhook({
            payload: input.rawBody,
            signature: input.signature,
            webhookId: input.webhookId,
            webhookTimestamp: input.webhookTimestamp,
            secret,
          });
          sdkVerified = true;
        }
      } catch {
        sdkVerified = false;
      }
    }
    if (!sdkVerified) {
      throw new ComposioServiceError(
        "Invalid Composio webhook signature.",
        401,
        "INVALID_WEBHOOK_SIGNATURE",
      );
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    throw new ComposioServiceError(
      "Invalid JSON in Composio webhook payload.",
      400,
      "INVALID_WEBHOOK_JSON",
    );
  }

  const eventType =
    (typeof parsed.type === "string" && parsed.type) ||
    (typeof parsed.event === "string" && parsed.event) ||
    "unknown";
  const data =
    typeof parsed.data === "object" && parsed.data !== null
      ? (parsed.data as Record<string, unknown>)
      : parsed;

  const connectedAccountId =
    (typeof data.connectedAccountId === "string" && data.connectedAccountId) ||
    (typeof data.connected_account_id === "string" &&
      data.connected_account_id) ||
    (typeof data.id === "string" && data.id.startsWith("ca_") ? data.id : null);

  let updatedStatus: ComposioConnectedAccountStatus | null = null;
  if (connectedAccountId) {
    const rawStatus =
      (typeof data.status === "string" && data.status) ||
      (eventType.toLowerCase().includes("expired")
        ? "EXPIRED"
        : eventType.toLowerCase().includes("failed")
          ? "FAILED"
          : eventType.toLowerCase().includes("inactive") ||
              eventType.toLowerCase().includes("revoked")
            ? "INACTIVE"
            : eventType.toLowerCase().includes("active")
              ? "ACTIVE"
              : null);

    if (rawStatus) {
      updatedStatus = normalizeAccountStatus(rawStatus);
      const { updateComposioConnectedAccountStatusByWebhook } =
        await import("@/lib/db/composio-sessions");
      const reason =
        typeof data.statusReason === "string"
          ? data.statusReason
          : typeof data.reason === "string"
            ? data.reason
            : null;
      await updateComposioConnectedAccountStatusByWebhook(
        connectedAccountId,
        updatedStatus,
        reason,
      );
    }
  }

  return {
    verified: true,
    eventType,
    connectedAccountId,
    updatedStatus,
  };
}

/**
 * Builds Composio's session-based dynamic meta tools for the AI SDK agent runtime:
 * - COMPOSIO_SEARCH_TOOLS
 * - COMPOSIO_GET_TOOL_SCHEMAS
 * - COMPOSIO_MANAGE_CONNECTIONS
 * - COMPOSIO_MULTI_EXECUTE_TOOL
 * - COMPOSIO_WAIT_FOR_CONNECTIONS
 *
 * Never loads the full Composio tool catalog into the model context.
 */
export async function createComposioAgentMetaTools(input: {
  userId: string;
  chatId?: string;
  sessionId?: string;
  callbackBaseUrl?: string;
}): Promise<{
  tools: ToolSet;
  connectedToolkits: string[];
  mcpConfig: McpServerConfig | null;
}> {
  if (!isComposioConfigured()) {
    return { tools: {}, connectedToolkits: [], mcpConfig: null };
  }

  const baseUrl =
    input.callbackBaseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const { session, client } = await getOrCreateUserComposioSession(
    input.userId,
    {
      callbackUrl: `${baseUrl}/api/composio/callback`,
    },
  );

  const {
    listUserComposioConnectedAccounts,
    listAuthorizedSharedAccountsForUser,
  } = await import("@/lib/db/composio-sessions");

  const [ownAccounts, sharedAccounts] = await Promise.all([
    listUserComposioConnectedAccounts(input.userId).catch(
      () => [] as ComposioConnectedAccountRow[],
    ),
    listAuthorizedSharedAccountsForUser(input.userId).catch(
      () => [] as ComposioConnectedAccountRow[],
    ),
  ]);

  const connectedToolkits = Array.from(
    new Set(
      [...ownAccounts, ...sharedAccounts]
        .filter((a) => a.status === "ACTIVE" && !a.isDisabled)
        .map((a) => a.toolkitSlug),
    ),
  );

  const mcpConfig: McpServerConfig | null = session.mcp?.url
    ? {
        name: "composio",
        transport: "http",
        url: session.mcp.url,
        headers: session.mcp.headers ?? {},
      }
    : null;

  const searchToolsSchema = z.object({
    query: z
      .string()
      .describe(
        "Natural language description of the integration task or use case to search for (e.g. 'send email via gmail', 'create linear issue').",
      ),
    toolkits: z
      .array(z.string())
      .optional()
      .describe(
        "Optional list of lowercase toolkit slugs to scope the search (e.g. ['gmail', 'slack']).",
      ),
  });

  const getSchemasSchema = z.object({
    toolSlugs: z
      .array(z.string())
      .min(1)
      .describe(
        "Tool slugs returned by COMPOSIO_SEARCH_TOOLS to inspect input parameters for (e.g. ['GMAIL_SEND_EMAIL']).",
      ),
  });

  const manageConnectionsSchema = z.object({
    action: z
      .enum(["status", "connect", "reconnect", "list_accounts"])
      .describe(
        "Action to perform: check connection status, initiate a Connect Link for a missing toolkit, reconnect an expired account, or list connected accounts.",
      ),
    toolkit: z
      .string()
      .describe("Lowercase toolkit slug (e.g. 'gmail', 'slack', 'github')."),
    alias: z
      .string()
      .optional()
      .describe(
        "Optional account label/alias when connecting or selecting between multiple accounts (e.g. 'Work Gmail', 'Personal Gmail').",
      ),
    connectedAccountId: z
      .string()
      .optional()
      .describe("Optional specific connectedAccountId to check or reconnect."),
  });

  const multiExecuteSchema = z.object({
    tools: z
      .array(
        z.object({
          toolSlug: z
            .string()
            .describe("Exact Composio tool slug (e.g. 'GMAIL_SEND_EMAIL')."),
          arguments: z
            .record(z.string(), z.unknown())
            .default({})
            .describe("Tool input arguments matching its schema."),
          account: z
            .string()
            .optional()
            .describe(
              "Optional connectedAccountId or account alias when the user has multiple connected accounts for this toolkit.",
            ),
        }),
      )
      .min(1)
      .describe("One or more Composio tools to execute in this session."),
  });

  const waitForConnectionsSchema = z.object({
    connectedAccountId: z
      .string()
      .describe(
        "The connectedAccountId returned by COMPOSIO_MANAGE_CONNECTIONS.",
      ),
    timeoutMs: z
      .number()
      .optional()
      .describe("Optional wait timeout in milliseconds (default 15000)."),
  });

  const tools: ToolSet = {
    COMPOSIO_SEARCH_TOOLS: createAiTool({
      description:
        "Dynamically search the Composio integration catalog for relevant tools by use case without loading all tools upfront. Returns primary tool slugs, toolkit connection status, and execution guidance.",
      inputSchema: searchToolsSchema,
      execute: async (rawArgs) => {
        const args = searchToolsSchema.parse(rawArgs);
        const searchRes = await session.search({
          query: args.query,
          ...(args.toolkits ? { toolkits: args.toolkits } : {}),
        });

        const latestOwn = await listUserComposioConnectedAccounts(input.userId);
        const latestShared = await listAuthorizedSharedAccountsForUser(
          input.userId,
        );
        const activeAccounts = [...latestOwn, ...latestShared].filter(
          (a) => a.status === "ACTIVE" && !a.isDisabled,
        );

        return {
          success: searchRes.success,
          error: searchRes.error ? scrubSecretsFromText(searchRes.error) : null,
          results: searchRes.results,
          connectedAccounts: activeAccounts.map((a) => ({
            connectedAccountId: a.connectedAccountId,
            toolkitSlug: a.toolkitSlug,
            alias: a.alias,
            accountType: a.accountType,
            isDefault: a.isDefault,
          })),
        };
      },
    }),

    COMPOSIO_GET_TOOL_SCHEMAS: createAiTool({
      description:
        "Retrieve full input parameter schemas and descriptions for specific Composio tool slugs discovered via COMPOSIO_SEARCH_TOOLS.",
      inputSchema: getSchemasSchema,
      execute: async (rawArgs) => {
        const args = getSchemasSchema.parse(rawArgs);
        const schemas: Array<{
          slug: string;
          name?: string;
          description?: string;
          inputParameters?: Record<string, unknown>;
          error?: string;
        }> = [];

        for (const slug of args.toolSlugs) {
          try {
            if (client.tools?.getRawComposioToolBySlug) {
              const toolDef = await client.tools.getRawComposioToolBySlug(slug);
              schemas.push({
                slug: toolDef.slug,
                name: toolDef.name,
                description: toolDef.description,
                inputParameters: toolDef.inputParameters,
              });
            } else {
              schemas.push({
                slug,
                description: `Schema for ${slug}`,
                inputParameters: { type: "object", additionalProperties: true },
              });
            }
          } catch (err) {
            schemas.push({
              slug,
              error:
                err instanceof Error
                  ? scrubSecretsFromText(err.message)
                  : "Failed to load tool schema",
            });
          }
        }
        return { schemas };
      },
    }),

    COMPOSIO_MANAGE_CONNECTIONS: createAiTool({
      description:
        "Check connection status, list multiple connected accounts for a toolkit, or initiate an interactive Composio Connect Link inside the conversation when an integration is not yet connected or has expired.",
      inputSchema: manageConnectionsSchema,
      execute: async (rawArgs) => {
        const args = manageConnectionsSchema.parse(rawArgs);
        const slug = args.toolkit.trim().toLowerCase();
        const own = await syncUserComposioAccounts(input.userId);
        const shared = await listAuthorizedSharedAccountsForUser(
          input.userId,
          slug,
        );
        const matchingOwn = own.filter((a) => a.toolkitSlug === slug);
        const allMatching = [
          ...matchingOwn.map((a) => mapRowToSummary(a, input.userId)),
          ...shared.map((a) => mapRowToSummary(a, input.userId)),
        ];

        if (args.action === "status" || args.action === "list_accounts") {
          const active = allMatching.filter((a) => a.status === "ACTIVE");
          return {
            action: args.action,
            toolkit: slug,
            isConnected: active.length > 0,
            accounts: allMatching,
            requiresAccountSelection: active.length > 1,
          };
        }

        if (args.action === "reconnect" && args.connectedAccountId) {
          const reconnected = await reconnectComposioAccount({
            userId: input.userId,
            connectedAccountId: args.connectedAccountId,
            callbackBaseUrl: baseUrl,
          });
          return {
            action: "reconnect",
            toolkit: slug,
            connectedAccountId: reconnected.account.connectedAccountId,
            status: reconnected.account.status,
            connectLinkUrl: reconnected.redirectUrl,
            message: reconnected.redirectUrl
              ? `Please reconnect your ${slug} account using the Connect Link.`
              : `Reconnected ${slug} account (${reconnected.account.status}).`,
          };
        }

        const initiated = await initiateComposioConnection({
          userId: input.userId,
          toolkitSlug: slug,
          callbackBaseUrl: baseUrl,
          alias: args.alias ?? null,
          allowMultiple: true,
          chatId: input.chatId ?? null,
          sessionId: input.sessionId ?? null,
          returnPath:
            input.sessionId && input.chatId
              ? `/sessions/${input.sessionId}/chats/${input.chatId}`
              : "/settings/connections",
        });

        return {
          action: "connect",
          toolkit: slug,
          status: initiated.status,
          connectedAccountId: initiated.connectedAccountId,
          connectLinkUrl: initiated.redirectUrl,
          alias: initiated.alias,
          message: `Connect your ${slug} account using the secure Composio Connect Link to continue.`,
        };
      },
    }),

    COMPOSIO_WAIT_FOR_CONNECTIONS: createAiTool({
      description:
        "Verify whether a pending Composio connection has completed OAuth and transitioned to ACTIVE.",
      inputSchema: waitForConnectionsSchema,
      execute: async (rawArgs) => {
        const args = waitForConnectionsSchema.parse(rawArgs);
        if (client.connectedAccounts.waitForConnection) {
          try {
            const remote = await client.connectedAccounts.waitForConnection(
              args.connectedAccountId,
              args.timeoutMs ?? 15_000,
            );
            await syncUserComposioAccounts(input.userId);
            return {
              connectedAccountId: remote.id,
              status: normalizeAccountStatus(remote.status),
              isConnected: normalizeAccountStatus(remote.status) === "ACTIVE",
            };
          } catch (err) {
            return {
              connectedAccountId: args.connectedAccountId,
              status: "INITIATED",
              isConnected: false,
              error:
                err instanceof Error
                  ? scrubSecretsFromText(err.message)
                  : "Connection is still pending",
            };
          }
        }
        const accounts = await syncUserComposioAccounts(input.userId);
        const match = accounts.find(
          (a) => a.connectedAccountId === args.connectedAccountId,
        );
        return {
          connectedAccountId: args.connectedAccountId,
          status: match?.status ?? "INITIATED",
          isConnected: match?.status === "ACTIVE",
        };
      },
    }),

    COMPOSIO_MULTI_EXECUTE_TOOL: createAiTool({
      description:
        "Execute one or more discovered Composio integration tools in the user's authenticated session. Automatically verifies that the required toolkit connection is ACTIVE before executing.",
      inputSchema: multiExecuteSchema,
      execute: async (rawArgs) => {
        const args = multiExecuteSchema.parse(rawArgs);
        const own = await syncUserComposioAccounts(input.userId);
        const shared = await listAuthorizedSharedAccountsForUser(input.userId);
        const allAvailable = [...own, ...shared];

        const executions = await Promise.all(
          args.tools.map(async (call) => {
            const toolkitPrefix = call.toolSlug
              .split("_")[0]
              ?.toLowerCase()
              .trim();
            const toolkitAccounts = allAvailable.filter(
              (a) => a.toolkitSlug === toolkitPrefix,
            );
            const activeToolkitAccounts = toolkitAccounts.filter(
              (a) => a.status === "ACTIVE" && !a.isDisabled,
            );

            // Verify ACTIVE connection before executing authenticated tool
            if (toolkitPrefix && activeToolkitAccounts.length === 0) {
              const expiredOrFailed = toolkitAccounts.find(
                (a) =>
                  a.status === "EXPIRED" ||
                  a.status === "FAILED" ||
                  a.status === "INACTIVE",
              );
              return {
                toolSlug: call.toolSlug,
                success: false,
                code: expiredOrFailed
                  ? `CONNECTION_${expiredOrFailed.status}`
                  : "CONNECTION_REQUIRED",
                error: expiredOrFailed
                  ? `Your ${toolkitPrefix} connection (${expiredOrFailed.alias || expiredOrFailed.connectedAccountId}) is ${expiredOrFailed.status}. Call COMPOSIO_MANAGE_CONNECTIONS with action='reconnect' to re-authenticate.`
                  : `No active ${toolkitPrefix} connection found for this user. Call COMPOSIO_MANAGE_CONNECTIONS with action='connect' and toolkit='${toolkitPrefix}' to generate a Connect Link.`,
              };
            }

            // Resolve explicit account by ID or alias, or fall back to default
            let resolvedAccountId: string | undefined;
            if (call.account) {
              const target = call.account.trim();
              const matched = activeToolkitAccounts.find(
                (a) =>
                  a.connectedAccountId === target ||
                  (a.alias && a.alias.toLowerCase() === target.toLowerCase()),
              );
              if (!matched) {
                return {
                  toolSlug: call.toolSlug,
                  success: false,
                  code: "ACCOUNT_NOT_AUTHORIZED",
                  error: `Requested account '${target}' is not an active or authorized ${toolkitPrefix} connection for this user.`,
                };
              }
              resolvedAccountId = matched.connectedAccountId;
            } else if (activeToolkitAccounts.length > 0) {
              const preferred =
                activeToolkitAccounts.find((a) => a.isDefault) ??
                activeToolkitAccounts[0];
              resolvedAccountId = preferred?.connectedAccountId;
            }

            try {
              const res = await session.execute(
                call.toolSlug,
                call.arguments,
                resolvedAccountId ? { account: resolvedAccountId } : undefined,
              );
              return {
                toolSlug: call.toolSlug,
                accountUsed: resolvedAccountId ?? null,
                success: !res.error,
                data: res.data,
                error: res.error ? scrubSecretsFromText(res.error) : null,
              };
            } catch (err) {
              const rawMsg = err instanceof Error ? err.message : String(err);
              const scrubbed = scrubSecretsFromText(rawMsg);
              const isRateLimit =
                scrubbed.includes("429") ||
                scrubbed.toLowerCase().includes("rate limit");
              return {
                toolSlug: call.toolSlug,
                accountUsed: resolvedAccountId ?? null,
                success: false,
                code: isRateLimit ? "RATE_LIMITED" : "EXECUTION_FAILED",
                error: scrubbed,
              };
            }
          }),
        );

        return {
          results: executions,
          allSucceeded: executions.every((e) => e.success),
        };
      },
    }),
  };

  // Alias COMPOSIO_MULTI_EXECUTE to COMPOSIO_MULTI_EXECUTE_TOOL for prompt compatibility
  tools.COMPOSIO_MULTI_EXECUTE = tools.COMPOSIO_MULTI_EXECUTE_TOOL;

  return {
    tools,
    connectedToolkits,
    mcpConfig,
  };
}
