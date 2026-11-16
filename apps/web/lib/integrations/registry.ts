import { composioIntegrationProvider } from "./providers/composio";
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

export function getActiveIntegrationProviderId(): IntegrationProviderId {
  const configured = process.env.INTEGRATION_PROVIDER?.trim();
  if (configured) {
    return configured;
  }
  return "composio";
}

export function getIntegrationProvider(
  id?: IntegrationProviderId,
): IntegrationProviderAdapter {
  const targetId = id ?? getActiveIntegrationProviderId();
  const provider = registry.get(targetId);
  return provider ?? composioIntegrationProvider;
}

export function listIntegrationProviders(): IntegrationProviderAdapter[] {
  return Array.from(registry.values());
}
