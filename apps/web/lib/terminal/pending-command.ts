/**
 * Queues a shell command triggered from the composer (`!<cmd>`) so the
 * Workspace Terminal tab executes it immediately whether it is already mounted
 * or lazily mounts after the panel opens.
 */

export interface PendingTerminalCommand {
  id: number;
  sessionId: string;
  command: string;
}

type Listener = (entry: PendingTerminalCommand) => void;

const pendingBySession = new Map<string, PendingTerminalCommand>();
const listenersBySession = new Map<string, Set<Listener>>();

export function queuePendingTerminalCommand(
  sessionId: string,
  command: string,
): void {
  const trimmed = command.trim();
  if (!sessionId || !trimmed) return;
  const entry: PendingTerminalCommand = {
    id: Date.now(),
    sessionId,
    command: trimmed,
  };
  const listeners = listenersBySession.get(sessionId);
  if (listeners && listeners.size > 0) {
    for (const fn of listeners) {
      fn(entry);
    }
    return;
  }
  pendingBySession.set(sessionId, entry);
}

export function subscribePendingTerminalCommand(
  sessionId: string,
  listener: Listener,
): () => void {
  if (!sessionId) return () => {};
  let set = listenersBySession.get(sessionId);
  if (!set) {
    set = new Set();
    listenersBySession.set(sessionId, set);
  }
  set.add(listener);

  // Immediately deliver any command queued while the terminal tab was unmounted.
  const queued = pendingBySession.get(sessionId);
  if (queued) {
    pendingBySession.delete(sessionId);
    listener(queued);
  }

  return () => {
    const current = listenersBySession.get(sessionId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersBySession.delete(sessionId);
    }
  };
}
