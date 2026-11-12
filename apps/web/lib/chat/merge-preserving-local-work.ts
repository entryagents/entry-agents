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
      // Both exist: combine parts so neither loses work
      const mergedParts = dedupeMessageParts({
        ...serverMsg,
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
