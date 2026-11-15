import { composioIntegrationProvider } from "./providers/composio";
import { executorIntegrationProvider } from "./providers/executor";
import type {
  IntegrationProviderAdapter,
  IntegrationProviderId,
} from "./registry-types";

const registry = new Map<IntegrationProviderId, IntegrationProviderAdapter>();

export function registerIntegrationProvider(
  adapter: IntegrationProviderAdapter,
): void {
  registry.set(adapter.id, adapter);
}

registerIntegrationProvider(composioIntegrationProvider);
registerIntegrationProvider(executorIntegrationProvider);

export function getActiveIntegrationProviderId(): IntegrationProviderId {
  const configured = process.env.INTEGRATION_PROVIDER?.trim();
  if (configured) {
    return configured;
  }
  if (composioIntegrationProvider.isConfigured()) {
    return "composio";
  }
  return "executor";
}

export function getIntegrationProvider(
  id?: IntegrationProviderId,
): IntegrationProviderAdapter {
  const targetId = id ?? getActiveIntegrationProviderId();
  const provider = registry.get(targetId);
  if (!provider) {
    return composioIntegrationProvider.isConfigured()
      ? composioIntegrationProvider
      : executorIntegrationProvider;
  }
  return provider;
}

export function listIntegrationProviders(): IntegrationProviderAdapter[] {
  return Array.from(registry.values());
}
