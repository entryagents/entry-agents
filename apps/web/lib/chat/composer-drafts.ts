/**
 * Per-chat composer draft persistence (localStorage) and Up/Down prompt recall.
 * 1:1 port of Sable's `drafts.ts` packing & retention rules.
 */

const STORAGE_KEY = "entry.composer.drafts";
const MAX_DRAFTS = 40;
const MAX_CHARS = 40_000;

export function packDrafts(
  drafts: Record<string, string>,
): Record<string, string> {
  const entries = Object.entries(drafts).filter(
    ([, text]) => text && text.trim() !== "" && text.length <= MAX_CHARS,
  );
  return Object.fromEntries(entries.slice(-MAX_DRAFTS));
}

export function unpackDrafts(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v && v.length <= MAX_CHARS) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

let memoryCache: Record<string, string> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function ensureLoaded(): Record<string, string> {
  if (memoryCache !== null) return memoryCache;
  if (typeof window === "undefined") {
    memoryCache = {};
    return memoryCache;
  }
  try {
    memoryCache = unpackDrafts(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    memoryCache = {};
  }
  if (!listenersBound) {
    listenersBound = true;
    const flush = () => flushDraftsNow();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }
  return memoryCache;
}

export function flushDraftsNow(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (memoryCache === null || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(packDrafts(memoryCache)),
    );
  } catch {
    // Ignore storage quota or private-mode failures.
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null || typeof window === "undefined") return;
  flushTimer = setTimeout(flushDraftsNow, 500);
}

export function readChatDraft(chatId: string | undefined): string {
  if (!chatId) return "";
  return ensureLoaded()[chatId] ?? "";
}

export function writeChatDraft(chatId: string | undefined, text: string): void {
  if (!chatId) return;
  const cache = ensureLoaded();
  if (!text || text.trim() === "") {
    if (chatId in cache) {
      delete cache[chatId];
      scheduleFlush();
    }
    return;
  }
  // Re-insert so most recently edited drafts stay at the tail of MAX_DRAFTS.
  if (chatId in cache) {
    delete cache[chatId];
  }
  cache[chatId] = text.slice(0, MAX_CHARS);
  scheduleFlush();
}

export function clearChatDraft(chatId: string | undefined): void {
  writeChatDraft(chatId, "");
}

export interface PromptRecallState {
  index: number | null;
  stashedDraft: string;
}

/**
 * Steps through sent user prompts (oldest -> newest) on ArrowUp / ArrowDown.
 * Returns null if the key press should not be intercepted.
 */
export function stepPromptRecall(params: {
  direction: "up" | "down";
  history: readonly string[];
  currentInput: string;
  state: PromptRecallState;
}): { nextInput: string; nextState: PromptRecallState } | null {
  const { direction, history, currentInput, state } = params;
  if (history.length === 0) return null;

  if (direction === "up") {
    if (state.index === null) {
      // Only start recall when input is empty/whitespace.
      if (currentInput.trim() !== "") return null;
      const nextIndex = history.length - 1;
      return {
        nextInput: history[nextIndex],
        nextState: { index: nextIndex, stashedDraft: currentInput },
      };
    }
    if (state.index <= 0) return null;
    const nextIndex = state.index - 1;
    return {
      nextInput: history[nextIndex],
      nextState: { index: nextIndex, stashedDraft: state.stashedDraft },
    };
  }

  // direction === "down"
  if (state.index === null) return null;
  if (state.index >= history.length - 1) {
    return {
      nextInput: state.stashedDraft,
      nextState: { index: null, stashedDraft: "" },
    };
  }
  const nextIndex = state.index + 1;
  return {
    nextInput: history[nextIndex],
    nextState: { index: nextIndex, stashedDraft: state.stashedDraft },
  };
}
