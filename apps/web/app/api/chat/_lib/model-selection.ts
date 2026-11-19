import type { AgentModelSelection } from "@entry-agents/agent";
import { isModelDisabled } from "@/lib/model-availability";
import {
  sanitizeReasoningEffort,
  toReasoningProviderOptions,
} from "@/lib/model-reasoning";
import { toSafeChatError } from "@/lib/chat/friendly-error";
import { selectLatestGatewayModelId } from "@/lib/models";

interface ResolveChatModelSelectionParams {
  selectedModelId: string | null | undefined;
  reasoningEffort?: string | null;
  missingModelLabel: string;
}

/**
 * Returns a model id that is live on the gateway RIGHT NOW, derived from
 * the gateway's own routed list (never a hardcoded fallback model).
 *
 * If no model is requested or the requested model is unavailable/disabled,
 * resolves automatically to the latest live model advertised by entry-gateway.
 * We only error when the gateway has zero live models.
 */
export async function resolveLiveModelId(
  requestedModelId: string | null | undefined,
): Promise<string | null> {
  if (requestedModelId && !(await isModelDisabled(requestedModelId))) {
    return requestedModelId;
  }

  const { fetchAvailableLanguageModels } =
    await import("@/lib/models-with-context");
  const live = await fetchAvailableLanguageModels().catch(() => []);
  return selectLatestGatewayModelId(live);
}

/**
 * Resolves a user's requested model into the concrete selection the agent
 * runtime should use. Unavailable or unset models resolve to the latest live
 * entry-gateway model (see resolveLiveModelId); only a fully-empty gateway
 * errors.
 */
export async function resolveChatModelSelection({
  selectedModelId,
  reasoningEffort,
  missingModelLabel,
}: ResolveChatModelSelectionParams): Promise<AgentModelSelection> {
  const resolvedModelId = await resolveLiveModelId(selectedModelId ?? null);

  if (!resolvedModelId) {
    throw toSafeChatError(
      `${missingModelLabel}: no AI models are reachable right now. Please try again in a moment.`,
    );
  }

  const { fetchAvailableLanguageModels } =
    await import("@/lib/models-with-context");
  const liveModels = await fetchAvailableLanguageModels().catch(() => []);

  const effort = sanitizeReasoningEffort(
    resolvedModelId,
    reasoningEffort,
    liveModels,
  );
  const providerOptionsOverrides = toReasoningProviderOptions(
    effort,
    resolvedModelId,
  );

  return {
    id: resolvedModelId as AgentModelSelection["id"],
    ...(providerOptionsOverrides ? { providerOptionsOverrides } : {}),
  };
}
