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

export interface IntegrationToolkitItem {
  slug: string;
  name: string;
  description: string;
  category: string;
  connected: boolean;
  accountLabel?: string;
}

export interface IntegrationToolkitsResult {
  configured: boolean;
  providerId: IntegrationProviderId;
  providerName: string;
  capabilities: IntegrationCapabilities;
  requiredEnvVars: IntegrationEnvRequirement[];
  items: IntegrationToolkitItem[];
  error?: string;
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
  getMcpConfig(userId: string): {
    url: string;
    headers: Record<string, string>;
  } | null;
  listToolkits(
    userId: string,
    query?: string,
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
