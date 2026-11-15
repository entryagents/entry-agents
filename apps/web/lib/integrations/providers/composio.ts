import {
  COMPOSIO_POPULAR_TOOLKITS,
  disconnectComposioAccount,
  getOrCreateUserComposioSession,
  initiateComposioConnection,
  isComposioConfigured,
  listComposioToolkitsForUser,
  scrubSecretsFromText,
} from "@/lib/composio/client";
import type {
  IntegrationCapabilities,
  IntegrationConnectResult,
  IntegrationEnvRequirement,
  IntegrationListOptions,
  IntegrationProviderAdapter,
  IntegrationToolkitItem,
  IntegrationToolkitsResult,
} from "../registry-types";

export const COMPOSIO_CAPABILITIES: IntegrationCapabilities = {
  mcpGateway: true,
  scopedConnections: true,
  oauthConnect: true,
  toolSearch: true,
  codeExecution: true,
};

export const composioIntegrationProvider: IntegrationProviderAdapter = {
  id: "composio",
  name: "Composio",
  description:
    "Managed OAuth, multi-account connections, shared team credentials, and dynamic session tool execution.",
  capabilities: COMPOSIO_CAPABILITIES,

  isConfigured(): boolean {
    return isComposioConfigured();
  },

  getRequiredEnvVars(): IntegrationEnvRequirement[] {
    return [
      {
        key: "COMPOSIO_API_KEY",
        required: true,
        description:
          "Server-side Composio API key for session and connected account management.",
      },
      {
        key: "COMPOSIO_WEBHOOK_SECRET",
        required: false,
        description:
          "Webhook signing secret for verifying Composio connection status and trigger events.",
      },
    ];
  },

  async getMcpConfig(userId: string) {
    if (!isComposioConfigured()) {
      return null;
    }
    try {
      const { session } = await getOrCreateUserComposioSession(userId);
      if (session.mcp?.url) {
        return {
          url: session.mcp.url,
          headers: session.mcp.headers ?? {},
        };
      }
      return null;
    } catch {
      return null;
    }
  },

  async listToolkits(
    userId: string,
    query?: string,
    options?: IntegrationListOptions,
  ): Promise<IntegrationToolkitsResult> {
    try {
      const res = await listComposioToolkitsForUser(userId, {
        search: query,
        category: options?.category,
      });

      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? 48;
      const sliced = res.toolkits.slice(offset, offset + limit);

      const items: IntegrationToolkitItem[] = sliced.map((tk) => ({
        slug: tk.slug,
        name: tk.name,
        description: tk.description,
        category: tk.category,
        connected: tk.isConnected,
        accountLabel:
          tk.accounts.find((a) => a.isDefault)?.alias ??
          tk.accounts[0]?.alias ??
          undefined,
        authKind: "oauth2",
      }));

      const categoryMap = new Map<string, number>();
      for (const preset of COMPOSIO_POPULAR_TOOLKITS) {
        categoryMap.set(
          preset.category,
          (categoryMap.get(preset.category) ?? 0) + 1,
        );
      }

      return {
        configured: res.configured,
        providerId: "composio",
        providerName: "Composio",
        capabilities: COMPOSIO_CAPABILITIES,
        requiredEnvVars: this.getRequiredEnvVars(),
        items,
        categories: Array.from(categoryMap.entries()).map(([name, count]) => ({
          name,
          count,
        })),
        totalCount: res.toolkits.length,
        catalogCount: COMPOSIO_POPULAR_TOOLKITS.length,
        connectedCount: res.connectedCount,
      };
    } catch (error) {
      return {
        configured: isComposioConfigured(),
        providerId: "composio",
        providerName: "Composio",
        capabilities: COMPOSIO_CAPABILITIES,
        requiredEnvVars: this.getRequiredEnvVars(),
        items: [],
        error:
          error instanceof Error
            ? scrubSecretsFromText(error.message)
            : "Failed to load Composio catalog",
      };
    }
  },

  async connect(
    userId: string,
    slug: string,
    callbackUrl: string,
  ): Promise<IntegrationConnectResult> {
    try {
      const parsed = new URL(callbackUrl);
      const res = await initiateComposioConnection({
        userId,
        toolkitSlug: slug,
        callbackBaseUrl: parsed.origin,
      });
      return {
        url: res.redirectUrl,
        connected: res.status === "ACTIVE",
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? scrubSecretsFromText(error.message)
            : "Failed to initiate Composio connection",
      };
    }
  },

  async disconnect(
    userId: string,
    slug: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await listComposioToolkitsForUser(userId);
      const tk = res.toolkits.find((t) => t.slug === slug.toLowerCase());
      const targetAccount = tk?.accounts[0];
      if (!targetAccount) {
        return { ok: false, error: `No connected account found for ${slug}` };
      }
      await disconnectComposioAccount({
        userId,
        connectedAccountId: targetAccount.connectedAccountId,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? scrubSecretsFromText(error.message)
            : "Failed to disconnect account",
      };
    }
  },
};
