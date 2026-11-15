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

registerIntegrationProvider(executorIntegrationProvider);

export function getActiveIntegrationProviderId(): IntegrationProviderId {
  return process.env.INTEGRATION_PROVIDER?.trim() || "executor";
}

export function getIntegrationProvider(
  id?: IntegrationProviderId,
): IntegrationProviderAdapter {
  const targetId = id ?? getActiveIntegrationProviderId();
  const provider = registry.get(targetId);
  if (!provider) {
    return executorIntegrationProvider;
  }
  return provider;
}

export function listIntegrationProviders(): IntegrationProviderAdapter[] {
  return Array.from(registry.values());
}
