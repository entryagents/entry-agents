import type { ModelMessage } from "ai";

const DEFAULT_KEEP_RECENT_TOOL_RESULTS = 6;
const DEFAULT_MAX_STALE_TOOL_OUTPUT_CHARS = 2_000;
const STALE_HEAD_CHARS = 600;
const STALE_TAIL_CHARS = 400;

function compactStringOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const omitted = text.length - STALE_HEAD_CHARS - STALE_TAIL_CHARS;
  return `${text.slice(0, STALE_HEAD_CHARS)}\n\n... [${omitted} chars of earlier tool output compacted to conserve context; re-run or re-read if needed] ...\n\n${text.slice(-STALE_TAIL_CHARS)}`;
}

function compactToolResultPart(
  part: Record<string, unknown>,
  maxChars: number,
): { part: Record<string, unknown>; changed: boolean } {
  if (part.type !== "tool-result") {
    return { part, changed: false };
  }

  const output = part.output as
    | { type?: unknown; value?: unknown }
    | string
    | undefined;

  if (typeof output === "string") {
    if (output.length <= maxChars) {
      return { part, changed: false };
    }
    return {
      part: { ...part, output: compactStringOutput(output, maxChars) },
      changed: true,
    };
  }

  if (output && typeof output === "object") {
    if (output.type === "text" && typeof output.value === "string") {
      if (output.value.length <= maxChars) {
        return { part, changed: false };
      }
      return {
        part: {
          ...part,
          output: {
            ...output,
            value: compactStringOutput(output.value, maxChars),
          },
        },
        changed: true,
      };
    }

    if (output.type === "json" && output.value !== undefined) {
      let serialized: string;
      try {
        serialized = JSON.stringify(output.value);
      } catch {
        return { part, changed: false };
      }
      if (serialized.length <= maxChars) {
        return { part, changed: false };
      }
      return {
        part: {
          ...part,
          output: {
            type: "text",
            value: compactStringOutput(serialized, maxChars),
          },
        },
        changed: true,
      };
    }

    if (output.type === "content" && Array.isArray(output.value)) {
      let changed = false;
      const nextValue = output.value.map((item) => {
        if (
          item &&
          typeof item === "object" &&
          (item as { type?: unknown }).type === "text" &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          const text = (item as { text: string }).text;
          if (text.length > maxChars) {
            changed = true;
            return {
              ...item,
              text: compactStringOutput(text, maxChars),
            };
          }
        }
        return item;
      });
      if (!changed) {
        return { part, changed: false };
      }
      return {
        part: {
          ...part,
          output: {
            ...output,
            value: nextValue,
          },
        },
        changed: true,
      };
    }
  }

  return { part, changed: false };
}

/**
 * Compacts bulky tool-result payloads from older steps in `modelMessages` while
 * preserving the most recent `keepRecentToolResults` tool results verbatim.
 *
 * Why: multi-step agent turns (e.g. browsing, reading files, running bash)
 * otherwise re-transmit 10k-16k chars per earlier tool call on every step,
 * filling the context window in ~10-15 steps even when only recent results are
 * still relevant.
 */
export function pruneStaleToolResults(
  messages: ModelMessage[],
  options?: {
    keepRecentToolResults?: number;
    maxStaleChars?: number;
  },
): ModelMessage[] {
  const keepRecent =
    options?.keepRecentToolResults ?? DEFAULT_KEEP_RECENT_TOOL_RESULTS;
  const maxStaleChars =
    options?.maxStaleChars ?? DEFAULT_MAX_STALE_TOOL_OUTPUT_CHARS;

  // Locate all tool-result indices from newest to oldest.
  const toolResultCoords: Array<{ msgIdx: number; partIdx: number }> = [];
  for (let m = 0; m < messages.length; m += 1) {
    const msg = messages[m];
    if (msg?.role !== "tool" || !Array.isArray(msg.content)) continue;
    for (let p = 0; p < msg.content.length; p += 1) {
      const part = msg.content[p];
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "tool-result"
      ) {
        toolResultCoords.push({ msgIdx: m, partIdx: p });
      }
    }
  }

  if (toolResultCoords.length <= keepRecent) {
    return messages;
  }

  const protectedKeys = new Set<string>();
  for (
    let i = toolResultCoords.length - keepRecent;
    i < toolResultCoords.length;
    i += 1
  ) {
    const coord = toolResultCoords[i];
    if (coord) {
      protectedKeys.add(`${coord.msgIdx}:${coord.partIdx}`);
    }
  }

  let anyChanged = false;
  const nextMessages = messages.map((msg, mIdx) => {
    if (msg.role !== "tool" || !Array.isArray(msg.content)) {
      return msg;
    }
    let msgChanged = false;
    const nextContent = msg.content.map((part, pIdx) => {
      if (protectedKeys.has(`${mIdx}:${pIdx}`)) {
        return part;
      }
      if (!part || typeof part !== "object") {
        return part;
      }
      const compacted = compactToolResultPart(
        part as Record<string, unknown>,
        maxStaleChars,
      );
      if (compacted.changed) {
        msgChanged = true;
        return compacted.part as (typeof msg.content)[number];
      }
      return part;
    });
    if (!msgChanged) {
      return msg;
    }
    anyChanged = true;
    return { ...msg, content: nextContent };
  });

  return anyChanged ? nextMessages : messages;
}
