export type IntegrationProviderId = string;

export interface IntegrationCapabilities {
  mcpGateway: boolean;
  scopedConnections: boolean;
  oauthConnect: boolean;
  toolSearch: boolean;
  codeExecution: boolean;
}

export interface IntegrationEnvRequirement {
  key: string;
  required: boolean;
  description: string;
}

export interface IntegrationCatalogCategory {
  name: string;
  count: number;
}

export interface IntegrationToolkitItem {
  slug: string;
  name: string;
  description: string;
  category: string;
  connected: boolean;
  accountLabel?: string;
  iconUrl?: string;
  authKind?: string;
  packageName?: string;
}

export interface IntegrationListOptions {
  category?: string;
  offset?: number;
  limit?: number;
}

export interface IntegrationConnectionSummary {
  connected: boolean;
  source: "oauth" | "pat" | "env" | "none";
  authMode: "oauth" | "pat";
  organization?: string;
  organizationName?: string;
  connectionId?: string;
  mcpUrl: string;
  hasRefreshToken: boolean;
  expiresAt?: number;
  connectedAt?: string;
  lastTestError?: string | null;
  lastCheckedAt?: string | null;
}

export interface IntegrationToolkitsResult {
  configured: boolean;
  providerId: IntegrationProviderId;
  providerName: string;
  capabilities: IntegrationCapabilities;
  requiredEnvVars: IntegrationEnvRequirement[];
  items: IntegrationToolkitItem[];
  categories?: IntegrationCatalogCategory[];
  totalCount?: number;
  catalogCount?: number;
  connectedCount?: number;
  connectionStatus?: IntegrationConnectionSummary;
  error?: string;
  recovery?: {
    action?: string;
    instructions?: string;
  };
}

export interface IntegrationConnectResult {
  url?: string;
  connected?: boolean;
  error?: string;
}

export interface IntegrationProviderAdapter {
  readonly id: IntegrationProviderId;
  readonly name: string;
  readonly description: string;
  readonly capabilities: IntegrationCapabilities;
  isConfigured(): boolean;
  getRequiredEnvVars(): IntegrationEnvRequirement[];
  getMcpConfig(userId: string): Promise<{
    url: string;
    headers: Record<string, string>;
  } | null>;
  listToolkits(
    userId: string,
    query?: string,
    options?: IntegrationListOptions,
  ): Promise<IntegrationToolkitsResult>;
  connect(
    userId: string,
    slug: string,
    callbackUrl: string,
  ): Promise<IntegrationConnectResult>;
  disconnect(
    userId: string,
    slug: string,
  ): Promise<{ ok: boolean; error?: string }>;
}
