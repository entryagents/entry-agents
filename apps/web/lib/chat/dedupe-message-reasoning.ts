import { isToolUIPart } from "ai";
import type { WebAgentUIMessage, WebAgentUIToolPart } from "@/app/types";

/**
 * Returns a reasoning item ID from a part's provider metadata, if present.
 * Supports OpenAI, Azure, Google, Anthropic, or custom gateway itemId metadata.
 */
function getReasoningItemId(
  part: WebAgentUIMessage["parts"][number],
): string | undefined {
  if (part.type !== "reasoning") return undefined;

  const meta = part.providerMetadata as
    | Record<string, Record<string, unknown> | undefined>
    | undefined;

  const provider =
    meta?.openai ??
    meta?.azure ??
    meta?.anthropic ??
    meta?.google ??
    meta?.gateway;
  const itemId = provider?.itemId ?? provider?.id;
  return typeof itemId === "string" ? itemId : undefined;
}

/**
 * Normalizes text for duplicate checking while preserving whitespace semantics.
 */
function normalizeText(text: string): string {
  return text.trim();
}

/**
 * Extract a stable deduplication identity for tool call parts.
 */
function getToolCallIdentity(
  part: WebAgentUIMessage["parts"][number],
): string | undefined {
  if (!isToolUIPart(part)) return undefined;

  if (part.toolCallId) {
    return `toolCallId:${part.toolCallId}`;
  }

  // Dynamic tool or subagent invocation fallback
  const anyPart = part as unknown as Record<string, unknown>;
  const toolName = anyPart.toolName ?? part.type;
  if (toolName === "task" || toolName === "dynamic-tool" || anyPart.toolName) {
    const rawInput =
      typeof anyPart.input === "string"
        ? anyPart.input
        : JSON.stringify(anyPart.input ?? "");
    return `tool:${toolName}:${rawInput}`;
  }

  return undefined;
}

/**
 * Deduplicate reasoning parts from a message.
 * Compatible with existing test suite expectations:
 * - If itemId is present, removes exact duplicate reasoning (same itemId and same text).
 * - Multi-summary parts (same itemId, different text) are preserved.
 * - If no itemId, removes exact duplicate reasoning (identical text).
 * - Non-reasoning parts (text, step-start, etc.) are kept untouched.
 */
export function dedupeMessageReasoning<T extends WebAgentUIMessage>(
  message: T,
): T {
  if (!message.parts || message.parts.length <= 1) {
    return message;
  }

  const seen = new Set<string>();
  let hasDuplicates = false;

  for (const part of message.parts) {
    if (part.type !== "reasoning") continue;

    const itemId = getReasoningItemId(part);
    // Composite key: if itemId is present use that + text; if not present, use normalized text if non-empty
    const key = itemId
      ? `${itemId}\0${part.text}`
      : normalizeText(part.text).length > 0
        ? `noId\0${normalizeText(part.text)}`
        : null;

    if (!key) continue;

    if (seen.has(key)) {
      hasDuplicates = true;
      break;
    }
    seen.add(key);
  }

  if (!hasDuplicates) return message;

  const deduped = new Set<string>();
  const filteredParts = message.parts.filter((part) => {
    if (part.type !== "reasoning") return true;

    const itemId = getReasoningItemId(part);
    const key = itemId
      ? `${itemId}\0${part.text}`
      : normalizeText(part.text).length > 0
        ? `noId\0${normalizeText(part.text)}`
        : null;

    if (!key) return true;

    if (deduped.has(key)) return false;
    deduped.add(key);
    return true;
  });

  return { ...message, parts: filteredParts };
}

/**
 * Full message parts deduplication (reasoning, tool calls, dynamic tools).
 * Used when rendering and on stream updates so replayed stream chunks never
 * stack duplicate subagents or thoughts.
 */
export function dedupeMessageParts<T extends WebAgentUIMessage>(message: T): T {
  if (!message.parts || message.parts.length <= 1) {
    return message;
  }

  // First deduplicate reasoning
  const withDedupedReasoning = dedupeMessageReasoning(message);

  const seenToolCalls = new Map<string, number>();
  let hasToolDuplicates = false;
  const filteredParts: WebAgentUIMessage["parts"] = [];

  let lastTextIndex = -1;

  for (const part of withDedupedReasoning.parts) {
    const toolIdentity = getToolCallIdentity(part);
    if (toolIdentity) {
      if (seenToolCalls.has(toolIdentity)) {
        hasToolDuplicates = true;
        const existingIndex = seenToolCalls.get(toolIdentity)!;
        const existingPart = filteredParts[existingIndex] as WebAgentUIToolPart;
        const newPart = part as WebAgentUIToolPart;
        const existingPre = Boolean(
          (existingPart as unknown as { preliminary?: boolean }).preliminary,
        );
        const newPre = Boolean(
          (newPart as unknown as { preliminary?: boolean }).preliminary,
        );
        const isNewMoreComplete =
          (newPart.state === "output-available" &&
            existingPart.state !== "output-available") ||
          (!newPre && existingPre);
        if (isNewMoreComplete) {
          filteredParts[existingIndex] = part;
        }
        continue;
      }

      seenToolCalls.set(toolIdentity, filteredParts.length);
      filteredParts.push(part);
      lastTextIndex = -1;
      continue;
    }

    if (part.type === "text") {
      const newText = (part.text ?? "").trim();
      if (!newText) {
        continue;
      }
      if (lastTextIndex >= 0) {
        const prevTextPart = filteredParts[lastTextIndex] as {
          type: "text";
          text: string;
        };
        const prevText = (prevTextPart.text ?? "").trim();
        if (prevText === newText) {
          hasToolDuplicates = true;
          continue;
        }
        if (newText.startsWith(prevText)) {
          hasToolDuplicates = true;
          filteredParts[lastTextIndex] = part;
          continue;
        }
        if (prevText.startsWith(newText)) {
          hasToolDuplicates = true;
          continue;
        }
      }
      lastTextIndex = filteredParts.length;
      filteredParts.push(part);
      continue;
    }

    filteredParts.push(part);
  }

  if (!hasToolDuplicates && withDedupedReasoning === message) {
    return message;
  }

  return { ...message, parts: filteredParts };
}

/**
 * Deduplicates a list of messages:
 * 1. Deduplicates parts within each message.
 * 2. Deduplicates messages by id and prevents identical consecutive assistant blocks from stream re-attaches.
 */
export function dedupeMessageList<T extends WebAgentUIMessage>(
  messages: T[],
): T[] {
  if (!messages || messages.length === 0) {
    return [];
  }

  const result: T[] = [];
  const seenMessageIds = new Set<string>();

  for (const rawMsg of messages) {
    const msg = dedupeMessageParts(rawMsg);

    if (seenMessageIds.has(msg.id)) {
      const existingIdx = result.findIndex((m) => m.id === msg.id);
      if (existingIdx !== -1 && msg.role === "assistant") {
        result[existingIdx] = dedupeMessageParts({
          ...result[existingIdx],
          parts: [...result[existingIdx].parts, ...msg.parts],
        });
      }
      continue;
    }

    // Check if consecutive assistant message is a duplicate of the previous
    if (msg.role === "assistant" && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.role === "assistant") {
        const merged = dedupeMessageParts({
          ...prev,
          parts: [...prev.parts, ...msg.parts],
        });
        if (merged.parts.length === prev.parts.length) {
          continue;
        }
      }
    }

    seenMessageIds.add(msg.id);
    result.push(msg);
  }

  return result;
}
