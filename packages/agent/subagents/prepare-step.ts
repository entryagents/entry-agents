import type { LanguageModel, ModelMessage, StepResult, ToolSet } from "ai";
import {
  addCacheControl,
  compactMessagesWithStats,
  estimateMessagesTokens,
  selectProtectedRecentStart,
} from "../context-management";
import {
  createReadFileState,
  rebuildReadFileState,
  type ReadFileState,
} from "../tools/read-state";
import { SUBAGENT_STEP_LIMIT, SUBAGENT_WRAP_UP_PROMPT } from "./constants";

/**
 * Remove assistant tool-call parts that lack a matching tool-result part so a
 * partial or interrupted subagent step never poisons subsequent model calls with
 * `AI_MissingToolResultsError`.
 */
export function sanitizeDanglingSubagentToolCalls(
  messages: ModelMessage[],
): ModelMessage[] {
  const resultedIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "tool" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (
          part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "tool-result" &&
          typeof (part as { toolCallId?: unknown }).toolCallId === "string"
        ) {
          resultedIds.add((part as { toolCallId: string }).toolCallId);
        }
      }
    }
  }

  let changed = false;
  const sanitized = messages
    .map((message) => {
      if (message.role !== "assistant" || !Array.isArray(message.content)) {
        return message;
      }
      const filtered = message.content.filter((part) => {
        if (!part || typeof part !== "object") return true;
        const p = part as { type?: string; toolCallId?: unknown };
        if (p.type !== "tool-call") return true;
        return (
          typeof p.toolCallId === "string" && resultedIds.has(p.toolCallId)
        );
      });
      if (filtered.length !== message.content.length) {
        changed = true;
        return { ...message, content: filtered } as ModelMessage;
      }
      return message;
    })
    .filter((message) => {
      if (message.role !== "assistant") return true;
      if (Array.isArray(message.content) && message.content.length === 0) {
        changed = true;
        return false;
      }
      return true;
    });

  return changed ? sanitized : messages;
}

function stripOlderReasoningParts(
  messages: ModelMessage[],
  protectedTailStart: number,
): ModelMessage[] {
  let changed = false;
  const next = messages
    .map((message, index) => {
      if (
        index >= protectedTailStart ||
        message.role !== "assistant" ||
        !Array.isArray(message.content)
      ) {
        return message;
      }
      const filtered = message.content.filter(
        (part) =>
          !part ||
          typeof part !== "object" ||
          (part as { type?: string }).type !== "reasoning",
      );
      if (filtered.length !== message.content.length) {
        changed = true;
        return { ...message, content: filtered } as ModelMessage;
      }
      return message;
    })
    .filter((message) => {
      if (message.role !== "assistant") return true;
      if (Array.isArray(message.content) && message.content.length === 0) {
        changed = true;
        return false;
      }
      return true;
    });

  return changed ? next : messages;
}

function summarizeMessageForDigest(message: ModelMessage): string {
  const roleLabel = message.role.toUpperCase();
  if (typeof message.content === "string") {
    const trimmed = message.content.replace(/\s+/g, " ").trim();
    return trimmed ? `[${roleLabel}] ${trimmed.slice(0, 400)}` : "";
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  const fragments: string[] = [];
  for (const part of message.content) {
    if (!part || typeof part !== "object") continue;
    const obj = part as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string") {
      const text = obj.text.replace(/\s+/g, " ").trim();
      if (text) fragments.push(text.slice(0, 350));
    } else if (obj.type === "tool-call") {
      const name = typeof obj.toolName === "string" ? obj.toolName : "tool";
      const input = obj.input ?? obj.args;
      const target =
        input && typeof input === "object"
          ? JSON.stringify(input).slice(0, 140)
          : "";
      fragments.push(`call:${name}${target ? `(${target})` : ""}`);
    } else if (obj.type === "tool-result") {
      const name = typeof obj.toolName === "string" ? obj.toolName : "tool";
      fragments.push(`result:${name}${obj.isError ? "[ERR]" : ""}`);
    }
  }
  const combined = fragments.join("; ").trim();
  return combined ? `[${roleLabel}] ${combined.slice(0, 500)}` : "";
}

/**
 * Tier-2 fallback compaction when standard tool-result masking isn't enough
 * (for example, long assistant prose/reasoning chains on multi-turn runs).
 */
export function compactSubagentHistoryFallback(
  messages: ModelMessage[],
): ModelMessage[] {
  if (messages.length <= 6) {
    return messages;
  }

  const recentStart = Math.max(2, selectProtectedRecentStart(messages));
  const stripped = stripOlderReasoningParts(messages, recentStart);
  if (recentStart <= 2) {
    return stripped;
  }

  const head = stripped[0];
  const middle = stripped.slice(1, recentStart);
  const tail = stripped.slice(recentStart);

  const digestLines: string[] = [];
  let chars = 0;
  for (const msg of middle) {
    const line = summarizeMessageForDigest(msg);
    if (!line) continue;
    if (chars + line.length > 8_000) {
      digestLines.push("[... earlier subagent steps omitted ...]");
      break;
    }
    digestLines.push(`- ${line}`);
    chars += line.length;
  }

  if (digestLines.length === 0) {
    return head ? [head, ...tail] : tail;
  }

  const digestMessage: ModelMessage = {
    role: "user",
    content: `[Subagent Context Digest — ${middle.length} earlier messages compacted]\n${digestLines.join("\n")}`,
  };

  return head ? [head, digestMessage, ...tail] : [digestMessage, ...tail];
}

function hasTrailingWrapUpNotice(messages: ModelMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "user") return false;
  if (typeof last.content === "string") {
    return last.content.includes(SUBAGENT_WRAP_UP_PROMPT);
  }
  return false;
}

export interface PrepareSubagentStepInput<TOOLS extends ToolSet = ToolSet> {
  steps?: Array<StepResult<TOOLS>>;
  stepNumber?: number;
  messages: ModelMessage[];
  model: LanguageModel;
  experimental_context?: unknown;
  trackReadFileState?: boolean;
  stepLimit?: number;
}

export function prepareSubagentStep<TOOLS extends ToolSet = ToolSet>({
  steps,
  stepNumber,
  messages,
  model,
  experimental_context,
  trackReadFileState = false,
  stepLimit = SUBAGENT_STEP_LIMIT,
}: PrepareSubagentStepInput<TOOLS>) {
  const context = (experimental_context ?? {}) as {
    readFileState?: unknown;
    contextWindow?: number;
    compactionThreshold?: number;
  };

  let readFileState: ReadFileState | undefined;
  if (trackReadFileState) {
    readFileState =
      context.readFileState instanceof Map
        ? context.readFileState
        : createReadFileState();
    rebuildReadFileState(messages, readFileState);
  }

  const lastKnownInputTokens = steps?.at(-1)?.usage?.inputTokens;
  let workingMessages = sanitizeDanglingSubagentToolCalls(messages);

  const stats = compactMessagesWithStats({
    messages: workingMessages,
    model,
    contextWindowOverride: context.contextWindow,
    compactionThresholdOverride: context.compactionThreshold,
    lastKnownInputTokens,
  });
  workingMessages = stats.messages;

  // Tier-2 compaction fallback if tool masking alone stayed above 90% of budget.
  if (
    stats.postTokens >= Math.round(stats.effectiveThresholdTokens * 0.9) &&
    workingMessages.length > 6
  ) {
    const preFallbackTokens = estimateMessagesTokens(workingMessages);
    const compactedFallback = compactSubagentHistoryFallback(workingMessages);
    if (estimateMessagesTokens(compactedFallback) < preFallbackTokens) {
      workingMessages = compactedFallback;
    }
  }

  const effectiveStepNumber =
    typeof stepNumber === "number" ? stepNumber : (steps?.length ?? 0);
  const approachingLimit = effectiveStepNumber >= stepLimit - 3;
  const atFinalBudgetStep = effectiveStepNumber >= stepLimit - 1;

  if (approachingLimit && !hasTrailingWrapUpNotice(workingMessages)) {
    workingMessages = [
      ...workingMessages,
      {
        role: "user",
        content: SUBAGENT_WRAP_UP_PROMPT,
      },
    ];
  }

  return {
    messages: addCacheControl({
      messages: workingMessages,
      model,
    }),
    ...(atFinalBudgetStep ? { activeTools: [] as Array<keyof TOOLS> } : {}),
    experimental_context: {
      ...context,
      ...(trackReadFileState && readFileState ? { readFileState } : {}),
    },
  };
}
