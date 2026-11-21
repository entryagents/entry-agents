import { estimateMessagesTokens, sharedProvider } from "@entry-agents/agent";
import { formatTokens } from "@entry-agents/shared";
import {
  convertToModelMessages,
  generateText,
  pruneMessages,
  type ModelMessage,
} from "ai";
import { nanoid } from "nanoid";
import { resolveChatModelSelection } from "@/app/api/chat/_lib/model-selection";
import { webAgent } from "@/app/config";
import type { WebAgentUIMessage } from "@/app/types";
import { stripDanglingToolCalls } from "@/app/workflows/chat-compaction";
import { canonicalizeMessageParts } from "@/lib/chat/canonicalize-key-order";
import { dedupeMessageReasoning } from "@/lib/chat/dedupe-message-reasoning";
import { isFriendlyChatErrorText } from "@/lib/chat/friendly-error";
import { sanitizeMessageToolInputs } from "@/lib/chat/sanitize-tool-inputs";
import {
  buildCompactionPrompt,
  buildFallbackCompactionSummary,
  buildOlderMessagesDigest,
  decodeCheckpointSummary,
  encodeExactCheckpointSummary,
} from "@/lib/compact/helpers";
import { recordCompactionEvent } from "@/lib/db/compaction";
import {
  getLatestCompactionCheckpoint,
  saveCompactionCheckpoint,
} from "@/lib/db/compaction-checkpoints";
import {
  updateChatAssistantActivity,
  upsertChatMessageScoped,
} from "@/lib/db/sessions";
import { DEFAULT_CONTEXT_LIMIT } from "@/lib/models";
import { fetchAvailableLanguageModels } from "@/lib/models-with-context";

const SYSTEM_AND_TOOLS_OVERHEAD_TOKENS = 15_000;

export type ManualCompactionResult =
  | {
      compacted: true;
      preTokens: number;
      postTokens: number;
      summaryText: string;
      noticeMessage: WebAgentUIMessage;
    }
  | {
      compacted: false;
      reason: string;
    };

async function uiToModelMessages(
  messages: WebAgentUIMessage[],
): Promise<ModelMessage[]> {
  if (messages.length === 0) return [];
  const deduped = messages
    .map(dedupeMessageReasoning)
    .map(canonicalizeMessageParts)
    .map(sanitizeMessageToolInputs)
    .map((msg) => {
      if (msg.role !== "assistant" || !Array.isArray(msg.parts)) {
        return msg;
      }
      const cleanedParts = msg.parts.filter(
        (part) =>
          !(
            part.type === "text" &&
            typeof part.text === "string" &&
            isFriendlyChatErrorText(part.text)
          ),
      );
      return cleanedParts.length === msg.parts.length
        ? msg
        : { ...msg, parts: cleanedParts };
    });

  const modelMessages = await convertToModelMessages<WebAgentUIMessage>(
    deduped,
    {
      ignoreIncompleteToolCalls: true,
      tools: webAgent.tools,
      convertDataPart: (part) => {
        if (part.type === "data-snippet") {
          const { filename, content } = part.data;
          return {
            type: "text",
            text: JSON.stringify({ type: "snippet", filename, content }),
          };
        }
        return undefined;
      },
    },
  );

  return pruneMessages({
    messages: modelMessages,
    reasoning: "before-last-message",
    emptyMessages: "remove",
  });
}

function getLastKnownContextTokens(messages: WebAgentUIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "assistant") continue;
    const usage =
      m.metadata?.lastStepUsage ??
      m.metadata?.stepBreakdown?.at(-1)?.usage ??
      m.metadata?.totalMessageUsage;
    const inp = usage?.inputTokens ?? 0;
    const out = usage?.outputTokens ?? 0;
    if (inp + out > 0) {
      return inp + out;
    }
  }
  return 0;
}

export async function runManualCompaction(params: {
  chatId: string;
  sessionId: string;
  userId: string;
  chatModelId: string | null;
  chatReasoningEffort: string | null;
  uiMessages: WebAgentUIMessage[];
  focusInstructions?: string;
}): Promise<ManualCompactionResult> {
  const nonNoticeMessages = params.uiMessages.filter(
    (m) => !m.metadata?.isCompactionNotice,
  );
  if (nonNoticeMessages.length < 2) {
    return {
      compacted: false,
      reason: "Nothing to compact yet — send a message first.",
    };
  }

  // Keep the latest exchange intact when the conversation has >= 6 messages;
  // for compacting short chats (2-5 messages), summarize the whole history so
  // manual /compact always produces an immediate reduction.
  const keepTailCount = nonNoticeMessages.length >= 6 ? 2 : 0;
  const olderUiMessages = nonNoticeMessages.slice(
    0,
    nonNoticeMessages.length - keepTailCount,
  );
  const tailUiMessages =
    keepTailCount > 0 ? nonNoticeMessages.slice(-keepTailCount) : [];
  const boundaryUiMsg = olderUiMessages[olderUiMessages.length - 1];
  if (!boundaryUiMsg) {
    return {
      compacted: false,
      reason: "Nothing to compact yet.",
    };
  }

  const latestCheckpoint = await getLatestCompactionCheckpoint(params.chatId);
  if (latestCheckpoint?.summaryText) {
    const decoded = decodeCheckpointSummary(latestCheckpoint.summaryText);
    if (
      decoded.exactBoundary &&
      latestCheckpoint.compactedUpToMessageId === boundaryUiMsg.id &&
      !params.focusInstructions?.trim()
    ) {
      return {
        compacted: false,
        reason: "Conversation is already compacted up to date.",
      };
    }
  }

  const [allModelMessages, olderModelMessages, tailModelMessages] =
    await Promise.all([
      uiToModelMessages(nonNoticeMessages),
      uiToModelMessages(olderUiMessages),
      uiToModelMessages(tailUiMessages),
    ]);

  if (olderModelMessages.length === 0) {
    return {
      compacted: false,
      reason: "Nothing to compact yet.",
    };
  }

  const modelSelection = await resolveChatModelSelection({
    selectedModelId: params.chatModelId,
    reasoningEffort: params.chatReasoningEffort,
    missingModelLabel: "Compact conversation",
  });
  const liveModels = await fetchAvailableLanguageModels().catch(() => []);
  const liveModel = liveModels.find((m) => m.id === modelSelection.id);
  const contextWindow = liveModel?.context_window ?? DEFAULT_CONTEXT_LIMIT;
  const thresholdRatio = liveModel?.compaction_threshold ?? 0.95;

  const digestText = buildOlderMessagesDigest(olderModelMessages);
  let summaryText = "";
  try {
    const modelInstance = sharedProvider(modelSelection.id);
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
      `[manual-compact] Summarizer failed for chat ${params.chatId}; using deterministic fallback:`,
      err,
    );
  }

  if (!summaryText) {
    summaryText = buildFallbackCompactionSummary(olderModelMessages);
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

  const nextMessages: ModelMessage[] = [
    checkpointMessage,
    ...tailModelMessages,
  ];
  stripDanglingToolCalls(nextMessages);

  const preTokens = Math.max(
    estimateMessagesTokens(allModelMessages) + SYSTEM_AND_TOOLS_OVERHEAD_TOKENS,
    getLastKnownContextTokens(params.uiMessages),
  );
  const postTokens =
    estimateMessagesTokens(nextMessages) + SYSTEM_AND_TOOLS_OVERHEAD_TOKENS;

  await saveCompactionCheckpoint({
    chatId: params.chatId,
    sessionId: params.sessionId,
    summaryText: encodeExactCheckpointSummary(summaryText),
    compactedUpToMessageCount: olderUiMessages.length,
    compactedUpToMessageId: boundaryUiMsg.id,
    preTokens,
    postTokens,
  });

  await recordCompactionEvent(
    {
      preCompactTokens: preTokens,
      postCompactTokens: postTokens,
      contextWindowTokens: contextWindow,
      threshold: thresholdRatio,
      compactedToolCalls: olderModelMessages.length,
      compactedAnonymousToolResults: 0,
      modelId: modelSelection.id,
    },
    {
      userId: params.userId,
      chatId: params.chatId,
      sessionId: params.sessionId,
    },
  ).catch(() => {});

  const focusTrimmed = params.focusInstructions?.trim();
  const noticeText = focusTrimmed
    ? `Conversation compacted (${formatTokens(preTokens)} → ${formatTokens(postTokens)} tokens · focus: ${focusTrimmed})`
    : `Conversation compacted (${formatTokens(preTokens)} → ${formatTokens(postTokens)} tokens)`;

  const noticeMessage: WebAgentUIMessage = {
    id: `compact_${nanoid()}`,
    role: "assistant",
    parts: [{ type: "text", text: noticeText }],
    metadata: {
      isCompactionNotice: true,
      compactionMeta: {
        preTokens,
        postTokens,
        ...(focusTrimmed ? { focus: focusTrimmed } : {}),
      },
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

  return {
    compacted: true,
    preTokens,
    postTokens,
    summaryText,
    noticeMessage,
  };
}
