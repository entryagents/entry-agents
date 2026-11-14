import type { ModelMessage } from "ai";

export type ToolCallIndex = {
  byLocation: Map<number, Map<number, string>>;
  orderedKeys: string[];
};

export type PendingCompactionCandidates = {
  pendingToolCallKeys: Set<string>;
  pendingAnonymousToolResults: number;
};

type JsonRecord = Record<string, unknown>;

export function extractToolTargetSummary(part: JsonRecord): string | undefined {
  const input =
    part.input && typeof part.input === "object"
      ? (part.input as Record<string, unknown>)
      : undefined;
  if (!input) return undefined;

  const rawTarget =
    (typeof input.filePath === "string" && input.filePath) ||
    (typeof input.path === "string" && input.path) ||
    (typeof input.command === "string" && input.command) ||
    (typeof input.url === "string" && input.url) ||
    (typeof input.pattern === "string" && input.pattern) ||
    (typeof input.query === "string" && input.query);

  if (!rawTarget) return undefined;
  const singleLine = rawTarget.replace(/\s+/g, " ").trim();
  if (!singleLine) return undefined;
  return singleLine.length > 100 ? `${singleLine.slice(0, 97)}...` : singleLine;
}

export function indexToolCalls(messages: ModelMessage[]): ToolCallIndex {
  const byLocation = new Map<number, Map<number, string>>();
  const orderedKeys: string[] = [];
  let anonymousCallIndex = 0;

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (!message || !Array.isArray(message.content)) continue;

    for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
      const part = message.content[partIndex];
      if (!isToolCallPart(part)) continue;

      const key =
        typeof part.toolCallId === "string"
          ? `id:${part.toolCallId}`
          : `anon:${anonymousCallIndex++}`;

      const indexedParts =
        byLocation.get(messageIndex) ?? new Map<number, string>();
      indexedParts.set(partIndex, key);
      byLocation.set(messageIndex, indexedParts);
      orderedKeys.push(key);
    }
  }

  return { byLocation, orderedKeys };
}

/**
 * Find older `read`, `dir_list`, and `git_status` calls outside the protected
 * recent tail that have been superseded by a newer `read`, `write`, or `edit`
 * targeting the same path/window later in the conversation.
 */
export function findSupersededReadToolCallKeys({
  messages,
  toolCallIndex,
  recentToolCallKeys,
  compactedToolNotice,
}: {
  messages: ModelMessage[];
  toolCallIndex: ToolCallIndex;
  recentToolCallKeys: Set<string>;
  compactedToolNotice: string;
}): Set<string> {
  const occurrences: Array<{
    key: string;
    messageIndex: number;
    toolName: string;
    dedupSignature: string;
    pathKey?: string;
    alreadyCompacted: boolean;
  }> = [];

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (!message || !Array.isArray(message.content)) continue;
    const partKeys = toolCallIndex.byLocation.get(messageIndex);

    for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
      const part = message.content[partIndex];
      if (!part || !isToolCallPart(part)) continue;

      const key = partKeys?.get(partIndex);
      if (!key) continue;

      const partRecord = part as JsonRecord;
      const toolName =
        typeof partRecord.toolName === "string"
          ? partRecord.toolName
          : undefined;
      if (!toolName) continue;

      const input =
        partRecord.input && typeof partRecord.input === "object"
          ? (partRecord.input as Record<string, unknown>)
          : undefined;
      if (!input) continue;

      const filePath =
        (typeof input.filePath === "string" && input.filePath) ||
        (typeof input.path === "string" && input.path) ||
        undefined;

      let dedupSignature: string | undefined;
      if (toolName === "read" && filePath) {
        const offset = typeof input.offset === "number" ? input.offset : 1;
        const limit = typeof input.limit === "number" ? input.limit : 2000;
        dedupSignature = `read:${filePath}:${offset}:${limit}`;
      } else if (toolName === "dir_list" && filePath) {
        dedupSignature = `dir_list:${filePath}`;
      } else if (toolName === "git_status") {
        dedupSignature = "git_status";
      } else if ((toolName === "edit" || toolName === "write") && filePath) {
        dedupSignature = `mutate:${filePath}`;
      }

      if (!dedupSignature) continue;

      occurrences.push({
        key,
        messageIndex,
        toolName,
        dedupSignature,
        pathKey: filePath,
        alreadyCompacted: isCompactedToolCallPart(part, compactedToolNotice),
      });
    }
  }

  const superseded = new Set<string>();
  const latestReadBySig = new Map<string, number>();
  const latestMutationByPath = new Map<string, number>();

  for (let i = 0; i < occurrences.length; i++) {
    const item = occurrences[i]!;
    if (item.toolName === "edit" || item.toolName === "write") {
      if (item.pathKey) {
        latestMutationByPath.set(item.pathKey, i);
      }
      continue;
    }
    latestReadBySig.set(item.dedupSignature, i);
  }

  for (let i = 0; i < occurrences.length; i++) {
    const item = occurrences[i]!;
    if (item.alreadyCompacted || recentToolCallKeys.has(item.key)) continue;
    if (item.toolName === "edit" || item.toolName === "write") continue;

    const latestSameSig = latestReadBySig.get(item.dedupSignature);
    const latestPathMut = item.pathKey
      ? latestMutationByPath.get(item.pathKey)
      : undefined;

    if (
      (latestSameSig !== undefined && latestSameSig > i) ||
      (item.toolName === "read" &&
        latestPathMut !== undefined &&
        latestPathMut > i)
    ) {
      superseded.add(item.key);
    }
  }

  return superseded;
}

export function findPendingCompactionCandidates({
  messages,
  toolCallIndex,
  recentToolCallKeys,
  compactedToolNotice,
}: {
  messages: ModelMessage[];
  toolCallIndex: ToolCallIndex;
  recentToolCallKeys: Set<string>;
  compactedToolNotice: string;
}): PendingCompactionCandidates {
  const pendingToolCallKeys = new Set<string>();
  let pendingAnonymousToolResults = 0;

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (!message || !Array.isArray(message.content)) continue;

    const partKeys = toolCallIndex.byLocation.get(messageIndex);

    for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
      const part = message.content[partIndex];
      if (!part) continue;

      if (isToolCallPart(part)) {
        const key = partKeys?.get(partIndex);
        if (
          key &&
          !recentToolCallKeys.has(key) &&
          !isCompactedToolCallPart(part, compactedToolNotice)
        ) {
          pendingToolCallKeys.add(key);
        }
        continue;
      }

      if (!isToolResultPart(part)) {
        continue;
      }

      const key =
        typeof part.toolCallId === "string" ? `id:${part.toolCallId}` : null;

      if (
        key &&
        !recentToolCallKeys.has(key) &&
        !isCompactedToolResultPart(part, compactedToolNotice)
      ) {
        pendingToolCallKeys.add(key);
      }

      if (!key && !isCompactedToolResultPart(part, compactedToolNotice)) {
        pendingAnonymousToolResults++;
      }
    }
  }

  return {
    pendingToolCallKeys,
    pendingAnonymousToolResults,
  };
}

export function getPendingCompactionUnits(
  pendingCandidates: PendingCompactionCandidates,
): number {
  return (
    pendingCandidates.pendingToolCallKeys.size +
    pendingCandidates.pendingAnonymousToolResults
  );
}

export function estimateCompactionSavings({
  messages,
  toolCallIndex,
  pendingCandidates,
  compactedToolNotice,
}: {
  messages: ModelMessage[];
  toolCallIndex: ToolCallIndex;
  pendingCandidates: PendingCompactionCandidates;
  compactedToolNotice: string;
}): number {
  let savingsChars = 0;
  const metaByKey = buildToolMetaByKey(messages, toolCallIndex);

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (!message || !Array.isArray(message.content)) continue;

    const partKeys = toolCallIndex.byLocation.get(messageIndex);

    for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
      const part = message.content[partIndex];
      if (!part) continue;

      const oldLength = JSON.stringify(part).length;
      let compactedPart: JsonRecord | null = null;

      if (isToolCallPart(part)) {
        const key = partKeys?.get(partIndex);
        if (
          key &&
          pendingCandidates.pendingToolCallKeys.has(key) &&
          !isCompactedToolCallPart(part, compactedToolNotice)
        ) {
          compactedPart = compactToolCallPart(
            part,
            compactedToolNotice,
            metaByKey.get(key),
          );
        }
      } else if (isToolResultPart(part)) {
        const key =
          typeof part.toolCallId === "string" ? `id:${part.toolCallId}` : null;

        if (
          key &&
          pendingCandidates.pendingToolCallKeys.has(key) &&
          !isCompactedToolResultPart(part, compactedToolNotice)
        ) {
          compactedPart = compactToolResultPart(
            part,
            compactedToolNotice,
            metaByKey.get(key),
          );
        }

        if (
          !key &&
          pendingCandidates.pendingAnonymousToolResults > 0 &&
          !isCompactedToolResultPart(part, compactedToolNotice)
        ) {
          compactedPart = compactToolResultPart(part, compactedToolNotice);
        }
      }

      if (!compactedPart) {
        continue;
      }

      const newLength = JSON.stringify(compactedPart).length;
      const delta = oldLength - newLength;
      if (delta > 0) {
        savingsChars += delta;
      }
    }
  }

  return Math.ceil(savingsChars / 4);
}

interface ToolCallMeta {
  toolName?: string;
  target?: string;
}

function buildToolMetaByKey(
  messages: ModelMessage[],
  toolCallIndex: ToolCallIndex,
): Map<string, ToolCallMeta> {
  const map = new Map<string, ToolCallMeta>();
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex];
    if (!message || !Array.isArray(message.content)) continue;
    const partKeys = toolCallIndex.byLocation.get(messageIndex);
    for (let partIndex = 0; partIndex < message.content.length; partIndex++) {
      const part = message.content[partIndex];
      if (!part || !isToolCallPart(part)) continue;
      const key = partKeys?.get(partIndex);
      if (!key) continue;
      const partRecord = part as JsonRecord;
      map.set(key, {
        toolName:
          typeof partRecord.toolName === "string"
            ? partRecord.toolName
            : undefined,
        target: extractToolTargetSummary(partRecord),
      });
    }
  }
  return map;
}

export function compactToolData({
  messages,
  toolCallIndex,
  pendingCandidates,
  compactedToolNotice,
}: {
  messages: ModelMessage[];
  toolCallIndex: ToolCallIndex;
  pendingCandidates: PendingCompactionCandidates;
  compactedToolNotice: string;
}): ModelMessage[] {
  const metaByKey = buildToolMetaByKey(messages, toolCallIndex);

  return messages.map((message, messageIndex) => {
    if (!message || !Array.isArray(message.content)) {
      return message;
    }

    const partKeys = toolCallIndex.byLocation.get(messageIndex);
    let changed = false;

    const compactedContent = message.content.map((part, partIndex) => {
      if (!part) return part;

      if (isToolCallPart(part)) {
        const key = partKeys?.get(partIndex);
        if (
          key &&
          pendingCandidates.pendingToolCallKeys.has(key) &&
          !isCompactedToolCallPart(part, compactedToolNotice)
        ) {
          changed = true;
          return compactToolCallPart(
            part,
            compactedToolNotice,
            metaByKey.get(key),
          ) as typeof part;
        }
      }

      if (isToolResultPart(part)) {
        const key =
          typeof part.toolCallId === "string" ? `id:${part.toolCallId}` : null;

        if (
          key &&
          pendingCandidates.pendingToolCallKeys.has(key) &&
          !isCompactedToolResultPart(part, compactedToolNotice)
        ) {
          changed = true;
          return compactToolResultPart(
            part,
            compactedToolNotice,
            metaByKey.get(key),
          ) as typeof part;
        }

        if (
          !key &&
          pendingCandidates.pendingAnonymousToolResults > 0 &&
          !isCompactedToolResultPart(part, compactedToolNotice)
        ) {
          changed = true;
          return compactToolResultPart(
            part,
            compactedToolNotice,
          ) as typeof part;
        }
      }

      return part;
    });

    if (!changed) {
      return message;
    }

    return {
      ...message,
      content: compactedContent,
    } as ModelMessage;
  });
}

function buildContextualNotice(
  compactedToolNotice: string,
  meta?: ToolCallMeta,
): string {
  if (!meta?.toolName && !meta?.target) {
    return compactedToolNotice;
  }
  const label = meta.toolName ?? "tool";
  const targetSuffix = meta.target ? ` (${meta.target})` : "";
  return `${compactedToolNotice} [Previously ran: ${label}${targetSuffix}]`;
}

function compactToolCallPart(
  part: JsonRecord,
  compactedToolNotice: string,
  meta?: ToolCallMeta,
): JsonRecord {
  return {
    ...part,
    input: {
      compacted: true,
      ...(meta?.target ? { target: meta.target } : {}),
      message: buildContextualNotice(compactedToolNotice, meta),
    },
  };
}

function compactToolResultPart(
  part: JsonRecord,
  compactedToolNotice: string,
  meta?: ToolCallMeta,
): JsonRecord {
  const { result: _result, content, ...rest } = part;
  const notice = buildContextualNotice(compactedToolNotice, meta);
  return {
    ...rest,
    result: {
      compacted: true,
      message: notice,
    },
    ...(content !== undefined
      ? {
          content: [
            {
              type: "text",
              text: notice,
            },
          ],
        }
      : {}),
    output: {
      type: "text",
      value: notice,
    },
  };
}

function isCompactedMessageText(
  value: unknown,
  compactedToolNotice: string,
): boolean {
  return (
    typeof value === "string" &&
    (value === compactedToolNotice || value.startsWith(compactedToolNotice))
  );
}

function isCompactedToolCallPart(
  part: JsonRecord,
  compactedToolNotice: string,
): boolean {
  const input = part.input;
  if (!input || typeof input !== "object") {
    return false;
  }

  const normalizedInput = input as {
    compacted?: unknown;
    message?: unknown;
  };

  return (
    normalizedInput.compacted === true &&
    isCompactedMessageText(normalizedInput.message, compactedToolNotice)
  );
}

function isCompactedToolResultPart(
  part: JsonRecord,
  compactedToolNotice: string,
): boolean {
  if (
    part.output &&
    typeof part.output === "object" &&
    (part.output as { type?: unknown; value?: unknown }).type === "text" &&
    isCompactedMessageText(
      (part.output as { type?: unknown; value?: unknown }).value,
      compactedToolNotice,
    )
  ) {
    return true;
  }

  if (
    part.result &&
    typeof part.result === "object" &&
    (part.result as { compacted?: unknown; message?: unknown }).compacted ===
      true &&
    isCompactedMessageText(
      (part.result as { compacted?: unknown; message?: unknown }).message,
      compactedToolNotice,
    )
  ) {
    return true;
  }

  return false;
}

function isToolCallPart(
  part: unknown,
): part is JsonRecord & { toolCallId?: unknown } {
  if (!part || typeof part !== "object") return false;
  return (part as { type?: unknown }).type === "tool-call";
}

function isToolResultPart(
  part: unknown,
): part is JsonRecord & { toolCallId?: unknown } {
  if (!part || typeof part !== "object") return false;
  return (part as { type?: unknown }).type === "tool-result";
}
