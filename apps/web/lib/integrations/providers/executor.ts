import {
  getDefaultExecutorConfigFromEnv,
  getUserExecutorStatus,
  resolveExecutorRuntimeAuth,
} from "@/lib/db/executor-connection";
import type {
  IntegrationCapabilities,
  IntegrationConnectResult,
  IntegrationEnvRequirement,
  IntegrationListOptions,
  IntegrationProviderAdapter,
  IntegrationToolkitsResult,
} from "../registry-types";
import {
  getExecutorCatalog,
  mergeCatalogAndConnectedApps,
} from "./executor-catalog";
import {
  buildExecutorAuthHeaders,
  buildExecutorMcpUrl,
  DEFAULT_EXECUTOR_DASHBOARD_URL,
  DEFAULT_EXECUTOR_MCP_URL,
  ExecutorMcpError,
  fetchExecutorConnectedApps,
  initiateExecutorAppConnect,
} from "./executor-mcp";

export const EXECUTOR_CAPABILITIES: IntegrationCapabilities = {
  mcpGateway: true,
  scopedConnections: true,
  oauthConnect: true,
  toolSearch: true,
  codeExecution: true,
};

const EXECUTOR_ENV_REQUIREMENTS: IntegrationEnvRequirement[] = [
  {
    key: "EXECUTOR_API_KEY",
    required: false,
    description:
      "Platform personal access token fallback from executor.sh -> Account settings -> Tokens (per-user OAuth works without this)",
  },
  {
    key: "EXECUTOR_MCP_URL",
    required: false,
    description: `Executor Streamable HTTP MCP endpoint (defaults to ${DEFAULT_EXECUTOR_MCP_URL})`,
  },
  {
    key: "EXECUTOR_ORGANIZATION",
    required: false,
    description:
      "Executor organization ID or slug required when authenticating with a full-account PAT",
  },
  {
    key: "EXECUTOR_CONNECTION_ID",
    required: false,
    description:
      "Default scoped connection ID preselected during Executor OAuth (/mcp?connection=<id>)",
  },
];

export const executorIntegrationProvider: IntegrationProviderAdapter = {
  id: "executor",
  name: "Executor",
  description:
    "Unified MCP gateway & credential vault (executor.sh). Connect Gmail, GitHub, Linear, Slack, Notion, and 1,840+ official apps once.",
  capabilities: EXECUTOR_CAPABILITIES,

  isConfigured(): boolean {
    const env = getDefaultExecutorConfigFromEnv();
    return Boolean(env.apiKey);
  },

  getRequiredEnvVars(): IntegrationEnvRequirement[] {
    return EXECUTOR_ENV_REQUIREMENTS;
  },

  async getMcpConfig(userId: string) {
    const auth = await resolveExecutorRuntimeAuth(userId);
    if (!auth) return null;

    return {
      url: buildExecutorMcpUrl({
        baseUrl: auth.mcpUrl,
        authMode: auth.authMode,
        connectionId: auth.connectionId,
        organization: auth.organization,
      }),
      headers: buildExecutorAuthHeaders(auth),
    };
  },

  async listToolkits(
    userId: string,
    query?: string,
    options?: IntegrationListOptions,
  ): Promise<IntegrationToolkitsResult> {
    const [status, catalog, runtimeAuth] = await Promise.all([
      getUserExecutorStatus(userId).catch(() => ({
        connected: this.isConfigured(),
        source: (this.isConfigured() ? "env" : "none") as "env" | "none",
        authMode: "pat" as const,
        mcpUrl: DEFAULT_EXECUTOR_MCP_URL,
        hasRefreshToken: false,
      })),
      getExecutorCatalog(),
      resolveExecutorRuntimeAuth(userId).catch(() => null),
    ]);

    const connectedMap = new Map<
      string,
      { accountLabel?: string; description?: string }
    >();
    let connectionError: string | undefined;
    let recovery: { action?: string; instructions?: string } | undefined;

    if (runtimeAuth) {
      try {
        const connectedApps = await fetchExecutorConnectedApps(runtimeAuth);
        for (const app of connectedApps) {
          connectedMap.set(app.slug, {
            accountLabel: app.accountLabel,
            description: app.description,
          });
        }
      } catch (error) {
        if (error instanceof ExecutorMcpError) {
          connectionError = error.message;
          recovery = error.recovery;
        } else {
          connectionError =
            error instanceof Error
              ? error.message
              : "Failed to query connected Executor apps";
        }
      }
    }

    const merged = mergeCatalogAndConnectedApps({
      catalog,
      connectedSlugs: connectedMap,
      query,
      category: options?.category,
      offset: options?.offset,
      limit: options?.limit,
    });

    return {
      configured: status.connected,
      providerId: this.id,
      providerName: this.name,
      capabilities: this.capabilities,
      requiredEnvVars: this.getRequiredEnvVars(),
      items: merged.items,
      categories: merged.categories,
      totalCount: merged.totalCount,
      catalogCount: merged.catalogCount,
      connectedCount: merged.connectedCount,
      connectionStatus: status,
      ...(connectionError ? { error: connectionError } : {}),
      ...(recovery ? { recovery } : {}),
    };
  },

  async connect(
    userId: string,
    slug: string,
    _callbackUrl: string,
  ): Promise<IntegrationConnectResult> {
    const auth = await resolveExecutorRuntimeAuth(userId).catch(() => null);
    if (!auth) {
      return {
        url: `${DEFAULT_EXECUTOR_DASHBOARD_URL}/apps/${encodeURIComponent(slug)}`,
      };
    }

    const initiated = await initiateExecutorAppConnect(auth, slug);
    return {
      url: initiated.url,
      connected: initiated.connected,
    };
  },

  async disconnect(
    _userId: string,
    _slug: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return {
      ok: true,
    };
  },
};
