import {
  abortChatInstanceStreamReads,
  removeChatInstance,
} from "@/lib/chat-instance-manager";
import { clearChatWorkspaceStatus } from "@/lib/workspace-status-store";

type ChatRouteCleanupDependencies = {
  abortTransport: (chatId: string) => void;
  removeInstance: (chatId: string) => void;
  clearWorkspaceStatus?: (chatId: string) => void;
  stopStream?: (chatId: string) => void;
};

const defaultDependencies: ChatRouteCleanupDependencies = {
  abortTransport: abortChatInstanceStreamReads,
  removeInstance: removeChatInstance,
  clearWorkspaceStatus: clearChatWorkspaceStatus,
};

/**
 * Route teardown cleanup for chat pages.
 *
 * Intentionally aborts only SSE reading and reconnect polling (preserving any
 * in-flight POST /api/chat handshake) and never issues a server stop signal, so
 * work continues reliably in the background while the user is off-page.
 */
export function cleanupChatRouteOnUnmount(
  chatId: string,
  dependencies: ChatRouteCleanupDependencies = defaultDependencies,
): void {
  dependencies.abortTransport(chatId);
  dependencies.removeInstance(chatId);
  dependencies.clearWorkspaceStatus?.(chatId);
}
