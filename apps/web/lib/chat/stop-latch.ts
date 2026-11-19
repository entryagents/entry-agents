const STORAGE_KEY = "entry:user-stopped-chats";
const stoppedChatsInMemory = new Set<string>();

function readStorage(): Set<string> {
  if (typeof window === "undefined") {
    return stoppedChatsInMemory;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return stoppedChatsInMemory;
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const id of parsed) {
        if (typeof id === "string" && id.length > 0) {
          stoppedChatsInMemory.add(id);
        }
      }
    }
  } catch {
    // Ignore storage read failures (private mode / disabled storage).
  }
  return stoppedChatsInMemory;
}

function writeStorage(chatIds: Set<string>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const list = Array.from(chatIds).slice(-50);
    if (list.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    // Ignore storage write failures.
  }
}

/**
 * Records that the user explicitly clicked Stop for `chatId`.
 * Stored both in-memory and in sessionStorage so route transitions or
 * recovery listeners never forget an explicit user stop and restart the chat.
 */
export function markChatStoppedByUser(chatId: string): void {
  if (!chatId) return;
  const set = readStorage();
  set.add(chatId);
  writeStorage(set);
}

/**
 * Clears the explicit stop latch ONLY on explicit user intent (sending a new
 * prompt or manually clicking Retry).
 */
export function clearChatStoppedByUser(chatId: string): void {
  if (!chatId) return;
  const set = readStorage();
  if (set.delete(chatId)) {
    writeStorage(set);
  }
}

export function isChatStoppedByUser(chatId: string): boolean {
  if (!chatId) return false;
  return readStorage().has(chatId);
}
