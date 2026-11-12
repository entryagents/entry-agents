import type { WebAgentUIMessage } from "@/app/types";
import {
  dedupeMessageList,
  dedupeMessageParts,
} from "./dedupe-message-reasoning";

/**
 * Merges server-authoritative messages with local client messages, guaranteeing
 * that no chat message, user prompt, partial assistant text, or tool work ever
 * leaves the UI when an error or network drop occurs.
 *
 * Rules:
 * 1. If serverMessages is empty or undefined, return localMessages (deduped).
 * 2. If localMessages is empty or undefined, return serverMessages (deduped).
 * 3. Preserve any local message that does not exist in serverMessages (e.g. an
 *    optimistic user prompt that failed to reach the server, or in-flight assistant
 *    stream that hasn't been committed to DB).
 * 4. For messages that exist in both server and local:
 *    - Merge their parts using dedupeMessageParts so any streaming text or tool results
 *      present locally aren't truncated if the server snapshot is slightly behind.
 * 5. Maintain chronological message order.
 */
export function mergePreservingLocalWork(
  serverMessages: WebAgentUIMessage[] | null | undefined,
  localMessages: WebAgentUIMessage[] | null | undefined,
): WebAgentUIMessage[] {
  const safeServer = serverMessages ?? [];
  const safeLocal = localMessages ?? [];

  if (safeServer.length === 0) {
    return dedupeMessageList(safeLocal);
  }
  if (safeLocal.length === 0) {
    return dedupeMessageList(safeServer);
  }

  const localById = new Map<string, WebAgentUIMessage>();
  for (const msg of safeLocal) {
    localById.set(msg.id, msg);
  }

  const result: WebAgentUIMessage[] = [];
  const handledIds = new Set<string>();

  // First process server messages, merging with local message if present
  for (const serverMsg of safeServer) {
    handledIds.add(serverMsg.id);
    const localMsg = localById.get(serverMsg.id);

    if (!localMsg) {
      result.push(serverMsg);
    } else {
      const serverUsage = serverMsg.metadata?.totalMessageUsage;
      const localUsage = localMsg.metadata?.totalMessageUsage;
      const serverTokens =
        serverUsage?.totalTokens ??
        (serverUsage?.inputTokens ?? 0) + (serverUsage?.outputTokens ?? 0);
      const localTokens =
        localUsage?.totalTokens ??
        (localUsage?.inputTokens ?? 0) + (localUsage?.outputTokens ?? 0);
      const preferredTotalUsage =
        serverUsage && (!localUsage || serverTokens >= localTokens)
          ? serverUsage
          : localUsage;

      const serverCost = serverMsg.metadata?.totalMessageCost;
      const localCost = localMsg.metadata?.totalMessageCost;
      const validServerCost =
        typeof serverCost === "number" &&
        Number.isFinite(serverCost) &&
        serverCost >= 0
          ? serverCost
          : undefined;
      const validLocalCost =
        typeof localCost === "number" &&
        Number.isFinite(localCost) &&
        localCost >= 0
          ? localCost
          : undefined;
      const preferredTotalCost =
        validServerCost !== undefined &&
        (validLocalCost === undefined || validServerCost >= validLocalCost)
          ? validServerCost
          : validLocalCost;

      const serverSteps = serverMsg.metadata?.stepBreakdown;
      const localSteps = localMsg.metadata?.stepBreakdown;
      const preferredStepBreakdown =
        serverSteps &&
        serverSteps.length > 0 &&
        (!localSteps || serverSteps.length >= localSteps.length)
          ? serverSteps
          : localSteps;

      const serverTps = serverMsg.metadata?.tps;
      const localTps = localMsg.metadata?.tps;
      const preferredTps =
        typeof serverTps === "number" &&
        Number.isFinite(serverTps) &&
        serverTps > 0
          ? serverTps
          : typeof localTps === "number" &&
              Number.isFinite(localTps) &&
              localTps > 0
            ? localTps
            : undefined;

      // Both exist: combine parts and metadata so neither loses work or billing metrics
      const mergedMetadata =
        serverMsg.metadata || localMsg.metadata
          ? {
              ...localMsg.metadata,
              ...serverMsg.metadata,
              selectedModelId:
                serverMsg.metadata?.selectedModelId ??
                localMsg.metadata?.selectedModelId,
              modelId:
                serverMsg.metadata?.modelId ?? localMsg.metadata?.modelId,
              totalMessageCost: preferredTotalCost,
              totalMessageUsage: preferredTotalUsage,
              lastStepUsage:
                serverMsg.metadata?.lastStepUsage ??
                localMsg.metadata?.lastStepUsage,
              stepBreakdown: preferredStepBreakdown,
              ...(preferredTps !== undefined ? { tps: preferredTps } : {}),
            }
          : undefined;

      const mergedParts = dedupeMessageParts({
        ...serverMsg,
        metadata: mergedMetadata,
        parts: [...serverMsg.parts, ...localMsg.parts],
      });
      result.push(mergedParts);
    }
  }

  // Next, append any local messages missing from server
  for (const localMsg of safeLocal) {
    if (!handledIds.has(localMsg.id)) {
      handledIds.add(localMsg.id);
      result.push(localMsg);
    }
  }

  return dedupeMessageList(result);
}
