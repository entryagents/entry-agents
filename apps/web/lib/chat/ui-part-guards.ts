import type { ModelMessage } from "ai";
import type { WebAgentUIMessage, WebAgentUIToolPart } from "@/app/types";

/**
 * Pure QuickJS-safe replacement for AI SDK's `isToolUIPart`.
 *
 * Workflow bundles (`workflow@5.8.0`, QuickJS VM) crash at module load if any
 * top-level workflow module pulls in runtime exports from `"ai"` because
 * `@ai-sdk/provider-utils` calls `Function.prototype.toString.call(globalThis.fetch)`
 * during module initialization, which throws `TypeError: not a function` in QuickJS.
 */
export function isToolUIPart(
  part: WebAgentUIMessage["parts"][number] | { type?: unknown },
): part is WebAgentUIToolPart {
  if (!part || typeof part !== "object") {
    return false;
  }
  const type = (part as { type?: unknown }).type;
  return (
    typeof type === "string" &&
    (type.startsWith("tool-") || type === "dynamic-tool")
  );
}

/**
 * Pure QuickJS-safe equivalent of:
 * `pruneMessages({ messages, reasoning: "before-last-message", emptyMessages: "remove" })`.
 */
export function pruneReasoningBeforeLastMessage(
  messages: ModelMessage[],
): ModelMessage[] {
  if (messages.length === 0) {
    return [];
  }
  const lastIndex = messages.length - 1;
  const pruned: ModelMessage[] = [];

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message) continue;

    let nextMessage = message;
    if (
      i < lastIndex &&
      message.role === "assistant" &&
      Array.isArray(message.content)
    ) {
      const filteredContent = message.content.filter(
        (part) =>
          !(
            part &&
            typeof part === "object" &&
            (part as { type?: unknown }).type === "reasoning"
          ),
      );
      if (filteredContent.length !== message.content.length) {
        nextMessage = {
          ...message,
          content: filteredContent,
        };
      }
    }

    const content = nextMessage.content;
    const isEmpty =
      content === "" || (Array.isArray(content) && content.length === 0);
    if (isEmpty) {
      continue;
    }

    pruned.push(nextMessage);
  }

  return pruned;
}

export interface ApiCallErrorLike {
  readonly name?: string;
  readonly message: string;
  readonly statusCode?: number;
  readonly isRetryable?: boolean;
  readonly data?: unknown;
}

/**
 * Structural equivalent of `error instanceof APICallError` that avoids a
 * top-level runtime import from `"ai"` in workflow bundles.
 */
export function isApiCallErrorLike(
  error: unknown,
): error is Error & ApiCallErrorLike {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as Record<string, unknown>;
  if (record.name === "AI_APICallError") {
    return true;
  }
  return (
    typeof record.statusCode === "number" &&
    typeof record.isRetryable === "boolean" &&
    typeof record.url === "string"
  );
}

/**
 * Pure QuickJS-safe replacement for AI SDK's `generateId()` when falling back
 * to a generated assistant message ID inside `"use workflow"`.
 */
export function generateWorkflowMessageId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
