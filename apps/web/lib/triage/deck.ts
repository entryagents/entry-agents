import { isToolUIPart } from "ai";
import type { WebAgentUIMessage } from "@/app/types";

export interface TriageQuestionOption {
  label: string;
  description?: string;
}

export interface TriageQuestionItem {
  question: string;
  header?: string;
  options: TriageQuestionOption[];
  multiSelect?: boolean;
}

export type TriagePrompt =
  | {
      key: string;
      kind: "permission";
      sessionId: string;
      chatId: string;
      sessionTitle: string;
      toolCallId: string;
      approvalId: string;
      toolName: string;
      input: unknown;
    }
  | {
      key: string;
      kind: "question";
      sessionId: string;
      chatId: string;
      sessionTitle: string;
      toolCallId: string;
      questions: TriageQuestionItem[];
    };

/**
 * Extracts pending tool approvals and unanswered `ask_user_question` prompts
 * from a chat's messages.
 */
export function extractTriagePromptsFromMessages(
  messages: readonly WebAgentUIMessage[],
  ctx: { sessionId: string; chatId: string; sessionTitle: string },
): TriagePrompt[] {
  const out: TriagePrompt[] = [];
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.parts)) continue;
    for (const part of msg.parts) {
      if (!isToolUIPart(part)) continue;
      const raw = part as Record<string, unknown>;
      const toolName = part.type.replace(/^tool-/, "");
      const toolCallId =
        typeof raw.toolCallId === "string" ? raw.toolCallId : "";
      if (!toolCallId) continue;

      if (part.state === "approval-requested") {
        const approval = raw.approval as { id?: string } | undefined;
        const approvalId =
          typeof approval?.id === "string" ? approval.id : toolCallId;
        out.push({
          key: `perm:${ctx.chatId}:${approvalId}`,
          kind: "permission",
          sessionId: ctx.sessionId,
          chatId: ctx.chatId,
          sessionTitle: ctx.sessionTitle,
          toolCallId,
          approvalId,
          toolName,
          input: raw.input,
        });
      } else if (
        toolName === "ask_user_question" &&
        part.state === "input-available"
      ) {
        const input = raw.input as
          | { questions?: TriageQuestionItem[] }
          | undefined;
        const questions = Array.isArray(input?.questions)
          ? input.questions
          : [];
        if (questions.length > 0) {
          out.push({
            key: `q:${ctx.chatId}:${toolCallId}`,
            kind: "question",
            sessionId: ctx.sessionId,
            chatId: ctx.chatId,
            sessionTitle: ctx.sessionTitle,
            toolCallId,
            questions,
          });
        }
      }
    }
  }
  return out;
}

// ── the stack (1:1 port of Sable's src/features/triage/deck.ts) ──

/** How a card left the stack: answered yes (up), answered no (aside), sent to the back, or gone elsewhere. */
export type Exit = "allow" | "deny" | "back" | "away";

export interface DeckState {
  /** Card keys front to back. */
  order: string[];
  /** Cards answered here, with how they left. */
  gone: Record<string, Exit>;
  /** Cards answered in this opening of the deck (for its end state). */
  answered: number;
}

export type DeckEvent =
  | { type: "sync"; keys: string[] }
  | { type: "next" }
  | { type: "prev" }
  | { type: "answer"; key: string; exit: Exit };

export const emptyDeck = (keys: string[] = []): DeckState => ({
  order: keys,
  gone: {},
  answered: 0,
});

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Cards keep their place while the deck is open: one answered elsewhere leaves,
 * a new one joins at the back, and the user's own moves (next, previous) are
 * not undone by the next update.
 */
export function deckReducer(state: DeckState, e: DeckEvent): DeckState {
  switch (e.type) {
    case "sync": {
      const live = new Set(e.keys);
      const kept = state.order.filter((k) => live.has(k));
      const have = new Set(kept);
      const order = [
        ...kept,
        ...e.keys.filter((k) => !have.has(k) && !state.gone[k]),
      ];
      return sameList(order, state.order) ? state : { ...state, order };
    }
    case "next": {
      if (state.order.length < 2) return state;
      const [first, ...rest] = state.order;
      return first ? { ...state, order: [...rest, first] } : state;
    }
    case "prev": {
      if (state.order.length < 2) return state;
      const last = state.order[state.order.length - 1];
      return last
        ? { ...state, order: [last, ...state.order.slice(0, -1)] }
        : state;
    }
    case "answer":
      if (!state.order.includes(e.key)) return state;
      return {
        order: state.order.filter((k) => k !== e.key),
        gone: { ...state.gone, [e.key]: e.exit },
        answered: state.answered + 1,
      };
  }
}

export function exitOf(
  state: DeckState,
  key: string,
  live: ReadonlySet<string>,
): Exit {
  return state.gone[key] ?? (live.has(key) ? "back" : "away");
}

// ── keys ──

export type DeckAction =
  | { type: "close" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "open" }
  | { type: "allow" }
  | { type: "deny" }
  | { type: "pick"; index: number }
  | { type: "advance" }
  | { type: "skip" }
  | { type: "step"; by: 1 | -1 };

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** What a key does in the deck, for the front card's kind (null: no card in front). */
export function deckAction(
  e: KeyLike,
  kind: "permission" | "question" | null,
): DeckAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "Escape") return { type: "close" };
  if (!kind) return null;
  if (!e.shiftKey && (k === "j" || k === "ArrowDown")) return { type: "next" };
  if (!e.shiftKey && (k === "k" || k === "ArrowUp")) return { type: "prev" };
  if (!e.shiftKey && k === "o") return { type: "open" };
  if (/^[1-9]$/.test(k) && !e.shiftKey) {
    return { type: "pick", index: Number(k) - 1 };
  }
  if (kind === "permission") {
    if (k === "Enter" && !e.shiftKey) return { type: "allow" };
    if (k === "d" && !e.shiftKey) return { type: "deny" };
    return null;
  }
  if (k === "Enter" && !e.shiftKey) return { type: "advance" };
  if (k === "s" && !e.shiftKey) return { type: "skip" };
  if (!e.shiftKey && (k === "ArrowRight" || k === "ArrowLeft")) {
    return { type: "step", by: k === "ArrowRight" ? 1 : -1 };
  }
  return null;
}

export function deckKeyAllowed(
  e: KeyLike & {
    repeat?: boolean;
    isComposing?: boolean;
    defaultPrevented?: boolean;
    target?: EventTarget | null;
  },
): boolean {
  if (e.defaultPrevented || e.isComposing || e.repeat) return false;
  const t = e.target as
    | (Partial<HTMLElement> & { tagName?: string })
    | null
    | undefined;
  if (!t?.tagName) return true;
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
    return false;
  }
  if ((e.key === "Enter" || e.key === " ") && /^(BUTTON|A)$/.test(t.tagName)) {
    return false;
  }
  return true;
}
