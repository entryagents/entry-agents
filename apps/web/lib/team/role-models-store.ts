export const TEAM_ROLE_IDS = [
  "architect",
  "explorer",
  "executor",
  "design",
  "reviewer",
] as const;

export type TeamRoleId = (typeof TEAM_ROLE_IDS)[number];

const STORAGE_PREFIX = "entry:team-role-models:";
const ALLOWED_ROLE_SET = new Set<string>(TEAM_ROLE_IDS);
const EMPTY_RECORD: Record<string, string> = {};

const memoryStore = new Map<string, Record<string, string>>();
const listenersByChat = new Map<string, Set<() => void>>();

function sanitizeRoleModels(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return EMPTY_RECORD;
  const out: Record<string, string> = {};
  for (const [role, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_ROLE_SET.has(role) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[role] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : EMPTY_RECORD;
}

function readFromSessionStorage(chatId: string): Record<string, string> | null {
  if (typeof window === "undefined" || !chatId) return null;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${chatId}`);
    if (!raw) return null;
    return sanitizeRoleModels(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeToSessionStorage(
  chatId: string,
  pins: Record<string, string>,
): void {
  if (typeof window === "undefined" || !chatId) return;
  try {
    if (Object.keys(pins).length === 0) {
      window.sessionStorage.removeItem(`${STORAGE_PREFIX}${chatId}`);
    } else {
      window.sessionStorage.setItem(
        `${STORAGE_PREFIX}${chatId}`,
        JSON.stringify(pins),
      );
    }
  } catch {
    // Ignore storage quota or restricted context errors
  }
}

export function getTeamRoleModelsSnapshot(
  chatId: string,
): Record<string, string> {
  if (!chatId) return EMPTY_RECORD;
  const cached = memoryStore.get(chatId);
  if (cached) return cached;

  const stored = readFromSessionStorage(chatId);
  if (stored) {
    memoryStore.set(chatId, stored);
    return stored;
  }
  return EMPTY_RECORD;
}

export function setTeamRoleModelPin(
  chatId: string,
  role: string,
  modelId: string | null,
): void {
  if (!chatId || !ALLOWED_ROLE_SET.has(role)) return;
  const current = getTeamRoleModelsSnapshot(chatId);
  const next: Record<string, string> = { ...current };
  const trimmed = typeof modelId === "string" ? modelId.trim() : "";
  if (trimmed) {
    next[role] = trimmed;
  } else {
    delete next[role];
  }
  const normalized = Object.keys(next).length > 0 ? next : EMPTY_RECORD;
  memoryStore.set(chatId, normalized);
  writeToSessionStorage(chatId, normalized);

  const listeners = listenersByChat.get(chatId);
  if (listeners) {
    for (const listener of listeners) {
      listener();
    }
  }
}

export function subscribeTeamRoleModels(
  chatId: string,
  listener: () => void,
): () => void {
  if (!chatId) return () => {};
  let set = listenersByChat.get(chatId);
  if (!set) {
    set = new Set();
    listenersByChat.set(chatId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) {
      listenersByChat.delete(chatId);
    }
  };
}
