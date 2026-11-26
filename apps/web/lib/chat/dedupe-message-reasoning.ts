import { isToolUIPart } from "ai";
import type { WebAgentUIMessage, WebAgentUIToolPart } from "@/app/types";
import { isFriendlyChatErrorText } from "./friendly-error";

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

  const reasoningEntries: Array<{
    index: number;
    itemId: string | undefined;
    normalized: string;
    isStreaming: boolean;
    part: WebAgentUIMessage["parts"][number];
  }> = [];

  for (let i = 0; i < message.parts.length; i += 1) {
    const part = message.parts[i];
    if (part.type !== "reasoning") continue;
    reasoningEntries.push({
      index: i,
      itemId: getReasoningItemId(part),
      normalized: normalizeText(part.text),
      isStreaming: (part as { state?: string }).state === "streaming",
      part,
    });
  }

  if (reasoningEntries.length <= 1) {
    return message;
  }

  // Exact + prefix deduplication so a shorter DB checkpoint reasoning part
  // merged with a longer local streamed reasoning part collapses cleanly,
  // while distinct multi-summary parts (neither a prefix of the other) stay.
  const dropIndices = new Set<number>();

  for (let i = 0; i < reasoningEntries.length; i += 1) {
    if (dropIndices.has(reasoningEntries[i].index)) continue;
    for (let j = i + 1; j < reasoningEntries.length; j += 1) {
      if (dropIndices.has(reasoningEntries[j].index)) continue;
      const a = reasoningEntries[i];
      const b = reasoningEntries[j];
      if (!a.normalized || !b.normalized) continue;

      const sameBucket =
        a.itemId !== undefined && b.itemId !== undefined
          ? a.itemId === b.itemId
          : a.itemId === undefined && b.itemId === undefined;
      if (!sameBucket) continue;

      const isExact = a.normalized === b.normalized;
      const minLen = Math.min(a.normalized.length, b.normalized.length);
      const isPrefix =
        !isExact &&
        (a.itemId !== undefined || minLen >= 12) &&
        (b.normalized.startsWith(a.normalized) ||
          a.normalized.startsWith(b.normalized));

      if (!isExact && !isPrefix) continue;

      // Keep whichever part has longer text (or non-streaming on tie).
      const preferB =
        b.normalized.length > a.normalized.length ||
        (b.normalized.length === a.normalized.length &&
          a.isStreaming &&
          !b.isStreaming);
      if (preferB) {
        dropIndices.add(a.index);
        break;
      }
      dropIndices.add(b.index);
    }
  }

  if (dropIndices.size === 0) {
    return message;
  }

  return {
    ...message,
    parts: message.parts.filter((_, index) => !dropIndices.has(index)),
  };
}

/**
 * Extract a secondary signature (toolName + canonical input) for matching
 * an orphaned `input-available` / `input-streaming` tool call from an
 * interrupted step attempt against a subsequent completed retry of the
 * exact same tool call (which receives a new toolCallId).
 */
function getToolCallSignature(
  part: WebAgentUIMessage["parts"][number],
): string | undefined {
  if (!isToolUIPart(part)) return undefined;
  const anyPart = part as unknown as Record<string, unknown>;
  const toolName =
    typeof anyPart.toolName === "string" ? anyPart.toolName : part.type;
  const rawInput =
    typeof anyPart.input === "string"
      ? anyPart.input
      : JSON.stringify(anyPart.input ?? "");
  return `${toolName}:${rawInput}`;
}

function extractWordTrigrams(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const trigrams = new Set<string>();
  if (words.length < 3) {
    for (const w of words) trigrams.add(w);
    return trigrams;
  }
  for (let i = 0; i <= words.length - 3; i += 1) {
    trigrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return trigrams;
}

function computeTrigramJaccard(a: string, b: string): number {
  const setA = extractWordTrigrams(a);
  const setB = extractWordTrigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function dedupeWithinSingleTextPart(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs.length < 4) return text;

  const kept: string[] = [];
  const seenLargeParagraphs: string[] = [];
  for (const rawParagraph of paragraphs) {
    const trimmed = rawParagraph.trim();
    if (!trimmed) continue;
    if (trimmed.length >= 120) {
      const isDuplicate = seenLargeParagraphs.some(
        (prev) =>
          prev === trimmed ||
          (Math.min(prev.length, trimmed.length) /
            Math.max(prev.length, trimmed.length) >=
            0.55 &&
            computeTrigramJaccard(prev, trimmed) >= 0.78),
      );
      if (isDuplicate) {
        continue;
      }
      seenLargeParagraphs.push(trimmed);
    }
    kept.push(rawParagraph);
  }
  return kept.length === paragraphs.length ? text : kept.join("\n\n");
}

function isNearDuplicateProse(a: string, b: string): boolean {
  if (a.length < 80 || b.length < 80) return false;
  const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (ratio < 0.55) return false;
  return computeTrigramJaccard(a, b) >= 0.72;
}

/**
 * Full message parts deduplication (reasoning, tool calls, dynamic tools,
 * and mid-message setup-error text splits).
 * Used when rendering and on stream updates so replayed stream chunks never
 * stack duplicate subagents, duplicate thoughts, or split a turn in half
 * with a friendly error banner.
 */
export function dedupeMessageParts<T extends WebAgentUIMessage>(message: T): T {
  if (!message.parts || message.parts.length === 0) {
    return message;
  }

  // First deduplicate reasoning
  const withDedupedReasoning = dedupeMessageReasoning(message);

  // Check whether this assistant message has real work (reasoning, tool call,
  // or non-error prose). If it does, any inline friendly setup-error text part
  // that got injected mid-turn should be moved to metadata.turnError rather
  // than splitting the assistant message in two.
  const hasNonErrorAssistantWork =
    message.role === "assistant" &&
    withDedupedReasoning.parts.some((part) => {
      if (part.type === "reasoning" || isToolUIPart(part)) {
        return true;
      }
      if (part.type === "text") {
        const trimmed = (part.text ?? "").trim();
        return trimmed.length > 0 && !isFriendlyChatErrorText(trimmed);
      }
      return false;
    });

  const seenToolCalls = new Map<string, number>();
  const seenIncompleteToolBySignature = new Map<string, number>();
  const seenCompletedToolSignatures = new Set<string>();
  const seenTextNormalized = new Map<string, number>();

  // Pre-detect if this message has replay signals (duplicate reasoning removed
  // or duplicate toolCallIds present) so we can safely collapse even short
  // replayed text blocks across tool boundaries.
  const preSeenToolIds = new Set<string>();
  let hasAnyReplaySignals = withDedupedReasoning !== message;
  if (!hasAnyReplaySignals) {
    for (const part of withDedupedReasoning.parts) {
      const tid = getToolCallIdentity(part);
      if (tid) {
        if (preSeenToolIds.has(tid)) {
          hasAnyReplaySignals = true;
          break;
        }
        preSeenToolIds.add(tid);
      }
    }
  }

  let hasToolDuplicates = false;
  let extractedTurnError: string | undefined;
  const filteredParts: WebAgentUIMessage["parts"] = [];
  const seenSnippetKeys = new Set<string>();
  const seenFileKeys = new Set<string>();

  let lastTextIndex = -1;

  for (const part of withDedupedReasoning.parts) {
    const toolIdentity = getToolCallIdentity(part);
    if (toolIdentity) {
      const newPart = part as WebAgentUIToolPart;
      const toolSig = getToolCallSignature(part);
      const isNewComplete =
        newPart.state === "output-available" ||
        newPart.state === "output-error";
      const isNewIncomplete =
        newPart.state === "input-available" ||
        newPart.state === "input-streaming";

      if (seenToolCalls.has(toolIdentity)) {
        hasToolDuplicates = true;
        const existingIndex = seenToolCalls.get(toolIdentity)!;
        const existingPart = filteredParts[existingIndex] as WebAgentUIToolPart;
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
          if (toolSig && isNewComplete) {
            seenIncompleteToolBySignature.delete(toolSig);
            seenCompletedToolSignatures.add(toolSig);
          }
        }
        continue;
      }

      // If an earlier step attempt left an orphaned `input-available` tool call
      // with the exact same toolName + input and a later retry succeeded with
      // `output-available` (under a new toolCallId), replace the orphaned call
      // in place so the UI does not show duplicate gray + completed tool rows.
      if (
        toolSig &&
        isNewComplete &&
        seenIncompleteToolBySignature.has(toolSig)
      ) {
        hasToolDuplicates = true;
        const orphanIndex = seenIncompleteToolBySignature.get(toolSig)!;
        filteredParts[orphanIndex] = part;
        seenIncompleteToolBySignature.delete(toolSig);
        seenCompletedToolSignatures.add(toolSig);
        seenToolCalls.set(toolIdentity, orphanIndex);
        lastTextIndex = -1;
        continue;
      }

      // Conversely, if a completed tool call with this exact signature is
      // already present and a stale local snapshot appends an incomplete
      // orphan for the same command, skip the incomplete orphan.
      if (
        toolSig &&
        isNewIncomplete &&
        seenCompletedToolSignatures.has(toolSig)
      ) {
        hasToolDuplicates = true;
        continue;
      }

      const insertIndex = filteredParts.length;
      seenToolCalls.set(toolIdentity, insertIndex);
      if (toolSig) {
        if (isNewIncomplete && !seenIncompleteToolBySignature.has(toolSig)) {
          seenIncompleteToolBySignature.set(toolSig, insertIndex);
        } else if (isNewComplete) {
          seenCompletedToolSignatures.add(toolSig);
        }
      }
      filteredParts.push(part);
      lastTextIndex = -1;
      continue;
    }

    if (part.type === "text") {
      const cleanedInternal = dedupeWithinSingleTextPart(part.text ?? "");
      const activePart =
        cleanedInternal !== (part.text ?? "")
          ? { ...part, text: cleanedInternal }
          : part;
      if (activePart !== part) {
        hasToolDuplicates = true;
      }
      const newText = (activePart.text ?? "").trim();
      if (!newText) {
        continue;
      }
      if (hasNonErrorAssistantWork && isFriendlyChatErrorText(newText)) {
        hasToolDuplicates = true;
        extractedTurnError = extractedTurnError ?? newText;
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
          seenTextNormalized.delete(prevText);
          seenTextNormalized.set(newText, lastTextIndex);
          filteredParts[lastTextIndex] = activePart;
          continue;
        }
        if (prevText.startsWith(newText)) {
          hasToolDuplicates = true;
          continue;
        }
      }

      // Non-adjacent duplicate or near-identical replayed text (e.g. from
      // step replay or mergePreservingLocalWork).
      if (seenTextNormalized.has(newText)) {
        if (hasAnyReplaySignals || hasToolDuplicates || newText.length >= 20) {
          hasToolDuplicates = true;
          continue;
        }
      } else {
        let handledReplayText = false;
        for (const [
          existingText,
          existingIdx,
        ] of seenTextNormalized.entries()) {
          if (hasAnyReplaySignals || hasToolDuplicates) {
            if (existingText.length >= 12 && newText.startsWith(existingText)) {
              hasToolDuplicates = true;
              seenTextNormalized.delete(existingText);
              seenTextNormalized.set(newText, existingIdx);
              filteredParts[existingIdx] = activePart;
              handledReplayText = true;
              break;
            }
            if (newText.length >= 12 && existingText.startsWith(newText)) {
              hasToolDuplicates = true;
              handledReplayText = true;
              break;
            }
          }
          if (isNearDuplicateProse(existingText, newText)) {
            hasToolDuplicates = true;
            if (newText.length > existingText.length) {
              seenTextNormalized.delete(existingText);
              seenTextNormalized.set(newText, existingIdx);
              filteredParts[existingIdx] = activePart;
            }
            handledReplayText = true;
            break;
          }
        }
        if (handledReplayText) {
          continue;
        }
      }

      lastTextIndex = filteredParts.length;
      seenTextNormalized.set(newText, lastTextIndex);
      filteredParts.push(activePart);
      continue;
    }

    if (
      part.type === "step-start" &&
      filteredParts.length > 0 &&
      filteredParts[filteredParts.length - 1]?.type === "step-start"
    ) {
      hasToolDuplicates = true;
      continue;
    }

    if (part.type === "data-snippet") {
      const snippetPart = part as {
        id?: string;
        data?: { filename?: string; content?: string };
      };
      const snippetKey = snippetPart.id
        ? `id:${snippetPart.id}`
        : `content:${snippetPart.data?.filename ?? ""}:${snippetPart.data?.content?.length ?? 0}:${snippetPart.data?.content?.slice(0, 128) ?? ""}`;
      if (seenSnippetKeys.has(snippetKey)) {
        hasToolDuplicates = true;
        continue;
      }
      seenSnippetKeys.add(snippetKey);
    }

    if (part.type === "file") {
      const filePart = part as {
        url?: string;
        filename?: string;
        mediaType?: string;
      };
      const fileKey = filePart.url
        ? `url:${filePart.url}`
        : `file:${filePart.filename ?? ""}:${filePart.mediaType ?? ""}`;
      if (seenFileKeys.has(fileKey)) {
        hasToolDuplicates = true;
        continue;
      }
      seenFileKeys.add(fileKey);
    }

    filteredParts.push(part);
  }

  if (
    !hasToolDuplicates &&
    extractedTurnError === undefined &&
    withDedupedReasoning === message
  ) {
    return message;
  }

  const nextMetadata =
    extractedTurnError && !message.metadata?.turnError
      ? {
          ...message.metadata,
          turnError: extractedTurnError,
        }
      : message.metadata;

  return {
    ...message,
    ...(nextMetadata !== undefined ? { metadata: nextMetadata } : {}),
    parts: filteredParts,
  };
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
        const existing = result[existingIdx];
        const mergedMeta =
          existing.metadata || msg.metadata
            ? {
                ...existing.metadata,
                ...msg.metadata,
                totalMessageCost:
                  typeof msg.metadata?.totalMessageCost === "number" &&
                  Number.isFinite(msg.metadata.totalMessageCost) &&
                  msg.metadata.totalMessageCost >= 0
                    ? msg.metadata.totalMessageCost
                    : existing.metadata?.totalMessageCost,
                totalMessageUsage:
                  msg.metadata?.totalMessageUsage ??
                  existing.metadata?.totalMessageUsage,
                lastStepUsage:
                  msg.metadata?.lastStepUsage ??
                  existing.metadata?.lastStepUsage,
                stepBreakdown:
                  (msg.metadata?.stepBreakdown?.length ?? 0) >=
                  (existing.metadata?.stepBreakdown?.length ?? 0)
                    ? msg.metadata?.stepBreakdown?.length
                      ? msg.metadata.stepBreakdown
                      : existing.metadata?.stepBreakdown
                    : existing.metadata?.stepBreakdown,
              }
            : undefined;

        result[existingIdx] = dedupeMessageParts({
          ...result[existingIdx],
          metadata: mergedMeta,
          parts: [...result[existingIdx].parts, ...msg.parts],
        });
      }
      continue;
    }

    // Check if consecutive assistant message is a duplicate of the previous
    if (msg.role === "assistant" && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.role === "assistant") {
        const mergedMeta =
          prev.metadata || msg.metadata
            ? {
                ...prev.metadata,
                ...msg.metadata,
                totalMessageCost:
                  typeof msg.metadata?.totalMessageCost === "number" &&
                  Number.isFinite(msg.metadata.totalMessageCost) &&
                  msg.metadata.totalMessageCost >= 0
                    ? msg.metadata.totalMessageCost
                    : prev.metadata?.totalMessageCost,
                totalMessageUsage:
                  msg.metadata?.totalMessageUsage ??
                  prev.metadata?.totalMessageUsage,
                lastStepUsage:
                  msg.metadata?.lastStepUsage ?? prev.metadata?.lastStepUsage,
                stepBreakdown:
                  (msg.metadata?.stepBreakdown?.length ?? 0) >=
                  (prev.metadata?.stepBreakdown?.length ?? 0)
                    ? msg.metadata?.stepBreakdown?.length
                      ? msg.metadata.stepBreakdown
                      : prev.metadata?.stepBreakdown
                    : prev.metadata?.stepBreakdown,
              }
            : undefined;

        const merged = dedupeMessageParts({
          ...prev,
          metadata: mergedMeta,
          parts: [...prev.parts, ...msg.parts],
        });
        if (merged.parts.length < prev.parts.length + msg.parts.length) {
          result[result.length - 1] = merged;
          continue;
        }
      }
    }

    seenMessageIds.add(msg.id);
    result.push(msg);
  }

  return result;
}
