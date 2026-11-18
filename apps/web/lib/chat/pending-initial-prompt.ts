import type { BuiltComposerMessage } from "@/app/sessions/[sessionId]/chats/[chatId]/components/chat-composer";

const STORAGE_PREFIX = "entry:pending-prompt:";
const MAX_AGE_MS = 5 * 60 * 1000;

export interface PendingInitialPrompt {
  payload: BuiltComposerMessage["payload"];
  displayText: string;
  createdAt: number;
}

export function savePendingInitialPrompt(
  chatId: string,
  built: BuiltComposerMessage,
): void {
  if (typeof window === "undefined") return;
  try {
    const entry: PendingInitialPrompt = {
      payload: built.payload,
      displayText: built.displayText,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${chatId}`,
      JSON.stringify(entry),
    );
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function consumePendingInitialPrompt(
  chatId: string,
): PendingInitialPrompt | null {
  if (typeof window === "undefined") return null;
  const key = `${STORAGE_PREFIX}${chatId}`;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    window.sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as Partial<PendingInitialPrompt>;
    if (
      !parsed ||
      typeof parsed.createdAt !== "number" ||
      Date.now() - parsed.createdAt > MAX_AGE_MS ||
      !parsed.payload
    ) {
      return null;
    }
    return {
      payload: parsed.payload,
      displayText:
        typeof parsed.displayText === "string" ? parsed.displayText : "",
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}
