import type {
  IntegrationCapabilities,
  IntegrationConnectResult,
  IntegrationEnvRequirement,
  IntegrationProviderAdapter,
  IntegrationToolkitItem,
  IntegrationToolkitsResult,
} from "../registry-types";

const DEFAULT_EXECUTOR_MCP_URL = "https://api.executor.sh/mcp";
const DEFAULT_EXECUTOR_DASHBOARD_URL = "https://app.executor.sh";

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
    required: true,
    description:
      "Personal access token from executor.sh -> Account settings -> Tokens",
  },
  {
    key: "EXECUTOR_MCP_URL",
    required: false,
    description:
      "Executor Streamable HTTP MCP endpoint (defaults to https://api.executor.sh/mcp)",
  },
  {
    key: "EXECUTOR_ORGANIZATION",
    required: false,
    description:
      "Optional Executor organization ID or slug when using a full-account token",
  },
  {
    key: "EXECUTOR_CONNECTION_ID",
    required: false,
    description:
      "Optional scoped connection ID to restrict tools via /mcp?connection=<id>",
  },
];

function getExecutorMcpUrl(): string {
  const base = process.env.EXECUTOR_MCP_URL?.trim() || DEFAULT_EXECUTOR_MCP_URL;
  const connectionId = process.env.EXECUTOR_CONNECTION_ID?.trim();
  if (!connectionId) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connection=${encodeURIComponent(connectionId)}`;
}

async function callExecutorMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = process.env.EXECUTOR_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch(getExecutorMcpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Executor MCP returned ${res.status}`);
  }
  const json = (await res.json()) as {
    result?: { content?: Array<{ type?: string; text?: string }> };
    error?: { message?: string };
  };
  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  const text = json.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export const executorIntegrationProvider: IntegrationProviderAdapter = {
  id: "executor",
  name: "Executor",
  description:
    "Unified MCP gateway & credential vault (executor.sh). Connect Gmail, GitHub, Linear, Slack, Notion, and custom apps once.",
  capabilities: EXECUTOR_CAPABILITIES,

  isConfigured(): boolean {
    return Boolean(process.env.EXECUTOR_API_KEY?.trim());
  },

  getRequiredEnvVars(): IntegrationEnvRequirement[] {
    return EXECUTOR_ENV_REQUIREMENTS;
  },

  getMcpConfig(_userId: string) {
    const apiKey = process.env.EXECUTOR_API_KEY?.trim();
    if (!apiKey) return null;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };
    const org = process.env.EXECUTOR_ORGANIZATION?.trim();
    if (org) {
      headers["X-Executor-Organization"] = org;
    }
    return {
      url: getExecutorMcpUrl(),
      headers,
    };
  },

  async listToolkits(
    _userId: string,
    query?: string,
  ): Promise<IntegrationToolkitsResult> {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        configured: false,
        providerId: this.id,
        providerName: this.name,
        capabilities: this.capabilities,
        requiredEnvVars: this.getRequiredEnvVars(),
        items: [],
      };
    }

    try {
      const raw = await callExecutorMcpTool("skills", {});
      const items: IntegrationToolkitItem[] = [];
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (entry && typeof entry === "object") {
            const rec = entry as Record<string, unknown>;
            const app = String(rec.app ?? rec.name ?? "app");
            const desc = String(rec.description ?? "Connected Executor app");
            if (
              !query ||
              app.toLowerCase().includes(query.toLowerCase()) ||
              desc.toLowerCase().includes(query.toLowerCase())
            ) {
              items.push({
                slug: app,
                name: app,
                description: desc,
                category: "executor-app",
                connected: true,
              });
            }
          }
        }
      }

      return {
        configured: true,
        providerId: this.id,
        providerName: this.name,
        capabilities: this.capabilities,
        requiredEnvVars: this.getRequiredEnvVars(),
        items,
      };
    } catch (error) {
      return {
        configured: true,
        providerId: this.id,
        providerName: this.name,
        capabilities: this.capabilities,
        requiredEnvVars: this.getRequiredEnvVars(),
        items: [],
        error:
          error instanceof Error
            ? error.message
            : "Failed to query Executor MCP endpoint",
      };
    }
  },

  async connect(
    _userId: string,
    slug: string,
    _callbackUrl: string,
  ): Promise<IntegrationConnectResult> {
    if (!this.isConfigured()) {
      return {
        error:
          "EXECUTOR_API_KEY is not set. Add your Executor personal access token to your environment.",
      };
    }
    const dashboardBase =
      process.env.EXECUTOR_DASHBOARD_URL?.trim() ||
      DEFAULT_EXECUTOR_DASHBOARD_URL;
    return {
      url: `${dashboardBase}/apps/${encodeURIComponent(slug)}`,
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
