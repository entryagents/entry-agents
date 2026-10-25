import type { AgentModelSelection } from "@entry-agents/agent";
import { isModelDisabled } from "@/lib/model-availability";
import {
  sanitizeReasoningEffort,
  toReasoningProviderOptions,
} from "@/lib/model-reasoning";
import { toSafeChatError } from "@/lib/chat/friendly-error";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";

interface ResolveChatModelSelectionParams {
  selectedModelId: string | null | undefined;
  reasoningEffort?: string | null;
  missingModelLabel: string;
}

/**
 * Returns a model id that is live on the gateway RIGHT NOW, derived from
 * the gateway's own routed list (never a hardcoded free model).
 *
 * Changed 2026-10-25 (owner): "remove hardcoded free models asap and this
 * should never show again" -- the old behaviour threw `Selected model
 * "qwen3.8-flash:free" is currently unavailable` whenever a chat was
 * still pinned to a route the gateway had dropped. Chats now self-heal:
 * if the requested model is unavailable we move to the healthiest live
 * model (APP_DEFAULT_MODEL_ID when it is live, otherwise the first live
 * gateway model). The caller persists the swap on the chat row so the
 * picker shows the model that is actually running -- this is visible,
 * not silent. We only error when the gateway has zero live models.
 */
export async function resolveLiveModelId(
  requestedModelId: string | null | undefined,
): Promise<string | null> {
  if (requestedModelId && !(await isModelDisabled(requestedModelId))) {
    return requestedModelId;
  }

  const { fetchAvailableLanguageModels } = await import(
    "@/lib/models-with-context"
  );
  const live = await fetchAvailableLanguageModels().catch(() => []);
  const liveIds = live.map((m) => m.id);
  if (liveIds.includes(APP_DEFAULT_MODEL_ID)) {
    return APP_DEFAULT_MODEL_ID;
  }
  return liveIds[0] ?? null;
}

/**
 * Resolves a user's requested model into the concrete selection the agent
 * runtime should use. Unavailable models are healed to a live gateway
 * model (see resolveLiveModelId); only a fully-empty gateway errors.
 */
export async function resolveChatModelSelection({
  selectedModelId,
  reasoningEffort,
  missingModelLabel,
}: ResolveChatModelSelectionParams): Promise<AgentModelSelection> {
  const resolvedModelId = await resolveLiveModelId(
    selectedModelId ?? APP_DEFAULT_MODEL_ID,
  );

  if (!resolvedModelId) {
    throw toSafeChatError(
      `${missingModelLabel}: no AI models are reachable right now. Please try again in a moment.`,
    );
  }

  const effort = sanitizeReasoningEffort(resolvedModelId, reasoningEffort);
  const providerOptionsOverrides = toReasoningProviderOptions(
    effort,
    resolvedModelId,
  );

  return {
    id: resolvedModelId as AgentModelSelection["id"],
    ...(providerOptionsOverrides ? { providerOptionsOverrides } : {}),
  };
}
