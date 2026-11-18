import type { ModelMessage } from "ai";
import { withoutUndefined } from "@/app/workflows/serialization";

export type SerializableCompactionCheckpoint = {
  summaryText: string;
  compactedUpToMessageCount: number;
  compactedUpToMessageId?: string;
};

/**
 * Defensive guard against AI_MissingToolResultsError (real incident,
 * 2026-08-17: a chat's turn started failing identically on every retry --
 * "Tool result is missing for tool call X" -- 4 attempts in a row, same
 * toolCallId every time, then a fatal AI_NoOutputGeneratedError once the
 * Workflow SDK's step retries ran out). Root cause: `modelMessages` is
 * appended to directly across step iterations (see
 * `modelMessages.push(...result.responseMessages)` in the main loop)
 * using the raw AI SDK response messages, which is NOT run back
 * through `convertMessages`'s `ignoreIncompleteToolCalls: true` --
 * that sanitization only ever runs once, on the turn's ORIGINAL history
 * from the DB. If a tool-call ends up in `response.messages` without a
 * matching tool-result (e.g. the step aborted mid tool-execution from
 * real-time credit-exhaustion/turn-spend-cap billing, or any other path
 * that stops generation between the tool-call and its result), that
 * broken pair then poisons every subsequent model call for the rest of
 * the turn -- and because the Workflow SDK retries the exact same step
 * input on transient failures, it fails the identical way every retry
 * until the whole turn dies with an empty response.
 *
 * Called right after every append to `modelMessages` and after compaction
 * slicing so the array going into the next `runAgentStep` call can never
 * contain an orphaned tool-call, regardless of which path produced it.
 * Mutates the array in place (via splice) since `modelMessages` is a
 * `const` binding to a shared array across the loop.
 */
export function stripDanglingToolCalls(messages: ModelMessage[]): void {
  const resultedToolCallIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "tool" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "tool-result") {
          resultedToolCallIds.add(part.toolCallId);
        }
      }
    }
  }

  const sanitized = messages
    .map((message) => {
      if (message.role !== "assistant" || !Array.isArray(message.content)) {
        return message;
      }
      const filteredContent = message.content.filter(
        (part) =>
          part.type !== "tool-call" || resultedToolCallIds.has(part.toolCallId),
      );
      if (filteredContent.length === message.content.length) {
        return message;
      }
      return { ...message, content: filteredContent };
    })
    .filter((message) => {
      if (message.role !== "assistant") {
        return true;
      }
      return !Array.isArray(message.content) || message.content.length > 0;
    });

  if (
    sanitized.length !== messages.length ||
    sanitized.some((message, index) => message !== messages[index])
  ) {
    messages.splice(0, messages.length, ...sanitized);
  }
}

export const loadCompactionCheckpointStep = async (
  chatId: string,
): Promise<SerializableCompactionCheckpoint | null> => {
  "use step";
  try {
    const { getLatestCompactionCheckpoint } =
      await import("@/lib/db/compaction-checkpoints");
    const row = await getLatestCompactionCheckpoint(chatId);
    if (!row || !row.summaryText) {
      return null;
    }
    return withoutUndefined({
      summaryText: row.summaryText,
      compactedUpToMessageCount: row.compactedUpToMessageCount,
      ...(row.compactedUpToMessageId
        ? { compactedUpToMessageId: row.compactedUpToMessageId }
        : {}),
    });
  } catch (err) {
    console.warn(
      `[chat-workflow] Failed to load compaction checkpoint for chat ${chatId}:`,
      err,
    );
    return null;
  }
};

export function summarizeMessagePartForDigest(part: unknown): string {
  if (!part || typeof part !== "object") {
    return "";
  }
  const obj = part as Record<string, unknown>;
  if (obj.type === "text" && typeof obj.text === "string") {
    return obj.text.slice(0, 600);
  }
  if (obj.type === "tool-call") {
    const name = typeof obj.toolName === "string" ? obj.toolName : "tool";
    const input = obj.input ?? obj.args;
    const raw =
      input && typeof input === "object"
        ? JSON.stringify(input).slice(0, 220)
        : "";
    return `[tool-call ${name}${raw ? ` ${raw}` : ""}]`;
  }
  if (obj.type === "tool-result") {
    const name = typeof obj.toolName === "string" ? obj.toolName : "tool";
    const out = obj.output;
    const raw =
      typeof out === "string"
        ? out.slice(0, 260)
        : out !== undefined
          ? JSON.stringify(out).slice(0, 260)
          : "";
    return `[tool-result ${name}${obj.isError ? " ERROR" : ""}: ${raw}]`;
  }
  return "";
}

export function buildOlderMessagesDigest(messages: ModelMessage[]): string {
  const MAX_DIGEST_CHARS = 28_000;
  const lines: string[] = [];
  let totalChars = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    const body =
      typeof msg.content === "string"
        ? msg.content.slice(0, 800)
        : Array.isArray(msg.content)
          ? msg.content
              .map(summarizeMessagePartForDigest)
              .filter(Boolean)
              .join(" ")
          : "";
    if (!body) continue;
    const entry = `[${i + 1} ${msg.role}]: ${body}`;
    if (totalChars + entry.length > MAX_DIGEST_CHARS) {
      lines.push(
        `...(${messages.length - i} additional message(s) omitted due to digest cap)`,
      );
      break;
    }
    lines.push(entry);
    totalChars += entry.length;
  }

  return lines.join("\n");
}

export function buildFallbackCompactionSummary(
  messages: ModelMessage[],
): string {
  const userSnippets: string[] = [];
  const toolNames = new Set<string>();
  const filePaths = new Set<string>();

  for (const msg of messages) {
    if (msg.role === "user") {
      const txt =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((p) =>
                  p && typeof p === "object" && "text" in p
                    ? String((p as { text?: unknown }).text ?? "")
                    : "",
                )
                .join(" ")
            : "";
      const cleaned = txt.trim();
      if (cleaned) {
        userSnippets.push(`- ${cleaned.slice(0, 280)}`);
      }
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part || typeof part !== "object") continue;
        const rec = part as Record<string, unknown>;
        if (rec.type === "tool-call" && typeof rec.toolName === "string") {
          toolNames.add(rec.toolName);
          const input = (rec.input ?? rec.args) as
            | Record<string, unknown>
            | undefined;
          const candidatePath =
            input?.filePath ?? input?.path ?? input?.targetFile;
          if (typeof candidatePath === "string" && candidatePath.length > 0) {
            filePaths.add(candidatePath);
          }
        }
      }
    }
  }

  return [
    "## Goal",
    ...(userSnippets.length > 0
      ? userSnippets.slice(-4)
      : ["- Continue the active engineering task."]),
    "## Files Modified / Read",
    ...(filePaths.size > 0
      ? [...filePaths].slice(0, 24).map((p) => `- ${p}`)
      : ["- None recorded"]),
    "## Current Progress & Remaining Work",
    toolNames.size > 0
      ? `- Prior steps used tools: ${[...toolNames].join(", ")}.`
      : "- Earlier conversation compacted to stay within budget.",
  ].join("\n");
}

export const compactAndCheckpointStep = async (params: {
  messages: ModelMessage[];
  modelId: string;
  contextWindowOverride?: number;
  compactionThresholdOverride?: number;
  lastKnownInputTokens?: number;
  chatId: string;
  sessionId: string;
  userId: string;
  totalUiMessageCount: number;
  lastUiMessageId?: string;
  forceTier2?: boolean;
}): Promise<{
  messages: ModelMessage[];
  changed: boolean;
  didCheckpoint: boolean;
}> => {
  "use step";
  const { generateText } = await import("ai");
  const {
    compactMessagesWithStats,
    estimateMessagesTokens,
    runWithCompactionSink,
    selectProtectedRecentStart,
    sharedProvider,
  } = await import("@entry-agents/agent");
  const { recordCompactionEvent } = await import("@/lib/db/compaction");
  const { saveCompactionCheckpoint } =
    await import("@/lib/db/compaction-checkpoints");

  const tier1 = await runWithCompactionSink(
    (event) =>
      recordCompactionEvent(event, {
        userId: params.userId,
        chatId: params.chatId,
        sessionId: params.sessionId,
      }),
    async () =>
      compactMessagesWithStats({
        messages: params.messages,
        model: params.modelId,
        contextWindowOverride: params.contextWindowOverride,
        compactionThresholdOverride: params.compactionThresholdOverride,
        lastKnownInputTokens: params.lastKnownInputTokens,
      }),
  );

  if (!tier1.needsCheckpointSummary && !params.forceTier2) {
    return withoutUndefined({
      messages: tier1.didCompact ? tier1.messages : params.messages,
      changed: tier1.didCompact,
      didCheckpoint: false,
    });
  }

  let tailStart =
    tier1.protectedTailStart > 0
      ? tier1.protectedTailStart
      : selectProtectedRecentStart(tier1.messages);
  while (
    tailStart < tier1.messages.length &&
    tier1.messages[tailStart]?.role === "tool"
  ) {
    tailStart++;
  }

  const olderMessages = tier1.messages.slice(0, tailStart);
  if (olderMessages.length < 2) {
    return withoutUndefined({
      messages: tier1.didCompact ? tier1.messages : params.messages,
      changed: tier1.didCompact,
      didCheckpoint: false,
    });
  }

  const digestText = buildOlderMessagesDigest(olderMessages);
  let summaryText = "";
  try {
    const modelInstance = sharedProvider(params.modelId);
    const { text } = await generateText({
      model: modelInstance,
      maxOutputTokens: 1200,
      system:
        "You compress an ongoing software-engineering conversation into a concise, accurate handoff checkpoint. Preserve facts, file paths, commands, and errors verbatim; omit filler.",
      prompt: [
        "Summarize the earlier conversation into these exact markdown sections:",
        "## Goal",
        "## Constraints & Decisions",
        "## Files Modified / Read",
        "## Current Progress & Remaining Work",
        "## Key Tool Findings / Errors",
        "",
        digestText,
      ].join("\n"),
    });
    summaryText = text.trim();
  } catch (err) {
    console.warn(
      `[chat-workflow] Tier 2 summarizer failed for chat ${params.chatId}; using deterministic fallback:`,
      err,
    );
  }

  if (!summaryText) {
    summaryText = buildFallbackCompactionSummary(olderMessages);
  }

  const checkpointMessage: ModelMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text: `<compaction-checkpoint>\n${summaryText}\n</compaction-checkpoint>`,
      },
    ],
  };

  const tailMessages = tier1.messages.slice(tailStart);
  let safeTailOffset = 0;
  while (
    safeTailOffset < tailMessages.length &&
    tailMessages[safeTailOffset]?.role === "tool"
  ) {
    safeTailOffset++;
  }

  const nextMessages: ModelMessage[] = [
    checkpointMessage,
    ...tailMessages.slice(safeTailOffset),
  ];
  stripDanglingToolCalls(nextMessages);

  const postTokens = estimateMessagesTokens(nextMessages);

  await saveCompactionCheckpoint({
    chatId: params.chatId,
    sessionId: params.sessionId,
    summaryText,
    compactedUpToMessageCount: params.totalUiMessageCount,
    ...(params.lastUiMessageId
      ? { compactedUpToMessageId: params.lastUiMessageId }
      : {}),
    preTokens: tier1.preTokens,
    postTokens,
  }).catch((err) => {
    console.warn(
      `[chat-workflow] Failed to save compaction checkpoint for chat ${params.chatId}:`,
      err,
    );
  });

  await recordCompactionEvent(
    {
      preCompactTokens: tier1.preTokens,
      postCompactTokens: postTokens,
      contextWindowTokens: tier1.contextWindow,
      threshold: params.compactionThresholdOverride ?? 0.95,
      compactedToolCalls: olderMessages.length,
      compactedAnonymousToolResults: 0,
      modelId: params.modelId,
    },
    {
      userId: params.userId,
      chatId: params.chatId,
      sessionId: params.sessionId,
    },
  ).catch(() => {});

  return withoutUndefined({
    messages: nextMessages,
    changed: true,
    didCheckpoint: true,
  });
};
