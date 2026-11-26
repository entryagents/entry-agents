import type { ModelMessage } from "ai";
import { withoutUndefined } from "@/app/workflows/serialization";
import {
  buildCompactionPrompt,
  buildFallbackCompactionSummary,
  buildOlderMessagesDigest,
  decodeCheckpointSummary,
} from "@/lib/compact/helpers";

export {
  buildFallbackCompactionSummary,
  buildOlderMessagesDigest,
  summarizeMessagePartForDigest,
} from "@/lib/compact/helpers";

export type SerializableCompactionCheckpoint = {
  summaryText: string;
  compactedUpToMessageCount: number;
  compactedUpToMessageId?: string;
  exactBoundary?: boolean;
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
  const respondedApprovalIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "tool" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "tool-result") {
          resultedToolCallIds.add(part.toolCallId);
        } else if (part.type === "tool-approval-response") {
          respondedApprovalIds.add(part.approvalId);
        }
      }
    }
  }
  if (respondedApprovalIds.size > 0) {
    for (const message of messages) {
      if (message.role === "assistant" && Array.isArray(message.content)) {
        for (const part of message.content) {
          if (
            part.type === "tool-approval-request" &&
            respondedApprovalIds.has(part.approvalId)
          ) {
            resultedToolCallIds.add(part.toolCallId);
          }
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
    const decoded = decodeCheckpointSummary(row.summaryText);
    return withoutUndefined({
      summaryText: decoded.summaryText,
      compactedUpToMessageCount: row.compactedUpToMessageCount,
      ...(row.compactedUpToMessageId
        ? { compactedUpToMessageId: row.compactedUpToMessageId }
        : {}),
      ...(decoded.exactBoundary ? { exactBoundary: true } : {}),
    });
  } catch (err) {
    console.warn(
      `[chat-workflow] Failed to load compaction checkpoint for chat ${chatId}:`,
      err,
    );
    return null;
  }
};

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
  focusInstructions?: string;
}): Promise<{
  messages: ModelMessage[];
  changed: boolean;
  didCheckpoint: boolean;
  postTokens?: number;
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

  const persistAutoCompactionNotice = async (
    preTokens: number,
    postTokens: number,
  ) => {
    try {
      const { nanoid } = await import("nanoid");
      const { formatTokens } =
        await import("@entry-agents/shared/lib/tool-state");
      const { updateChatAssistantActivity, upsertChatMessageScoped } =
        await import("@/lib/db/sessions");
      const noticeMessage = {
        id: `compact_${nanoid()}`,
        role: "assistant" as const,
        parts: [
          {
            type: "text" as const,
            text: `Conversation compacted (${formatTokens(preTokens)} → ${formatTokens(postTokens)} tokens · automatic)`,
          },
        ],
        metadata: {
          isCompactionNotice: true,
          compactionMeta: { preTokens, postTokens },
          lastStepUsage: {
            inputTokens: postTokens,
            outputTokens: 0,
            totalTokens: postTokens,
            inputTokenDetails: {
              noCacheTokens: postTokens,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            outputTokenDetails: {
              textTokens: 0,
              reasoningTokens: 0,
            },
          },
        },
      };
      await upsertChatMessageScoped({
        id: noticeMessage.id,
        chatId: params.chatId,
        role: "assistant",
        parts: noticeMessage,
      });
      await updateChatAssistantActivity(params.chatId, new Date()).catch(
        () => undefined,
      );
    } catch (err) {
      console.warn(
        `[chat-workflow] Failed to persist auto-compaction notice for chat ${params.chatId}:`,
        err,
      );
    }
  };

  if (!tier1.needsCheckpointSummary && !params.forceTier2) {
    const nextTier1Messages = tier1.didCompact
      ? [...tier1.messages]
      : params.messages;
    if (tier1.didCompact) {
      stripDanglingToolCalls(nextTier1Messages);
      await persistAutoCompactionNotice(tier1.preTokens, tier1.postTokens);
    }
    return withoutUndefined({
      messages: nextTier1Messages,
      changed: tier1.didCompact,
      didCheckpoint: false,
      ...(tier1.didCompact ? { postTokens: tier1.postTokens } : {}),
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
  // Summarize from the pre-masked `params.messages` (when aligned with
  // `tier1.messages`) so the Tier 2 summarizer sees real tool inputs, outputs,
  // commands, and errors instead of Tier 1's "[Older tool output removed...]"
  // placeholders.
  const sourceMessages =
    params.messages.length === tier1.messages.length
      ? params.messages
      : tier1.messages;
  const olderMessages = sourceMessages.slice(0, tailStart);
  if (olderMessages.length < 2) {
    const fallbackMessages = tier1.didCompact
      ? [...tier1.messages]
      : params.messages;
    if (tier1.didCompact) {
      stripDanglingToolCalls(fallbackMessages);
    }
    return withoutUndefined({
      messages: fallbackMessages,
      changed: tier1.didCompact,
      didCheckpoint: false,
      ...(tier1.didCompact ? { postTokens: tier1.postTokens } : {}),
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
      prompt: buildCompactionPrompt(digestText, params.focusInstructions),
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
        text: `<compaction-checkpoint>\n${summaryText}\n\n[Automatic compaction completed mid-task. Continue executing the active request immediately from where you left off without stopping or asking for confirmation.]\n</compaction-checkpoint>`,
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

  await persistAutoCompactionNotice(tier1.preTokens, postTokens);

  return withoutUndefined({
    messages: nextMessages,
    changed: true,
    didCheckpoint: true,
    postTokens,
  });
};
