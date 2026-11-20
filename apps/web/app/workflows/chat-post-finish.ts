import { isToolUIPart, type LanguageModelUsage, type UIMessageChunk } from "ai";
import type { SandboxState, Sandbox } from "@entry-agents/sandbox";
import { withoutUndefined } from "@/app/workflows/serialization";
import type { WebAgentUIMessage } from "@/app/types";
import type { AutoCommitResult } from "@/lib/chat/auto-commit-direct";
import type { AutoCreatePrResult } from "@/lib/chat/auto-pr-direct";
import {
  buildActiveLifecycleUpdate,
  buildLifecycleActivityUpdate,
} from "@/lib/sandbox/lifecycle";
import { dedupeMessageParts } from "@/lib/chat/dedupe-message-reasoning";
import { sanitizeMessageForDatabase } from "@/lib/chat/sanitize-db-message";
import type {
  WorkflowRunStatus,
  WorkflowRunStepTiming,
} from "@/lib/db/workflow-runs";
import type { Session as AuthSession } from "@/lib/session/types";

const cachedInputTokensFor = (usage: LanguageModelUsage) =>
  usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;

type UsageByModel = {
  usage: LanguageModelUsage;
  toolCallCount: number;
};

function filterNewTaskUsageEvents<T extends { toolCallId?: string }>(
  currentEvents: T[],
  baselineEvents: T[],
): T[] {
  if (baselineEvents.length === 0) {
    return currentEvents;
  }

  const existingToolCallIds = new Set<string>();
  let existingEventsWithoutIds = 0;

  for (const event of baselineEvents) {
    const toolCallId =
      typeof event.toolCallId === "string" ? event.toolCallId : undefined;

    if (toolCallId) {
      existingToolCallIds.add(toolCallId);
    } else {
      existingEventsWithoutIds += 1;
    }
  }

  let skippedWithoutIds = 0;
  const deltaEvents: T[] = [];

  for (const event of currentEvents) {
    const toolCallId =
      typeof event.toolCallId === "string" ? event.toolCallId : undefined;

    if (toolCallId) {
      if (existingToolCallIds.has(toolCallId)) {
        continue;
      }

      deltaEvents.push(event);
      continue;
    }

    if (skippedWithoutIds < existingEventsWithoutIds) {
      skippedWithoutIds += 1;
      continue;
    }

    deltaEvents.push(event);
  }

  return deltaEvents;
}

/**
 * Shared Node-side implementation called directly inside `"use step"` functions
 * (`persistUserMessage`, `persistInputMessages`, `dequeueNextQueuedUserMessageStep`)
 * so a step never invokes another `"use step"` function (avoiding nested step
 * overhead in the Workflow DevKit runtime).
 */
export async function persistUserMessageInternal(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  if (message.role !== "user") {
    return;
  }

  try {
    const {
      createChatMessageIfNotExists,
      isFirstChatMessage,
      touchChat,
      updateChat,
    } = await import("@/lib/db/sessions");
    const sanitized = sanitizeMessageForDatabase(message);
    const created = await createChatMessageIfNotExists({
      id: message.id,
      chatId,
      role: "user",
      parts: sanitized,
    });

    if (!created) {
      return;
    }

    await touchChat(chatId);

    const shouldSetTitle = await isFirstChatMessage(chatId, created.id);
    if (!shouldSetTitle) {
      return;
    }

    const textContent = message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join(" ")
      .trim();

    if (textContent.length === 0) {
      return;
    }

    const title =
      textContent.length > 80 ? `${textContent.slice(0, 80)}...` : textContent;
    await updateChat(chatId, { title });
  } catch (error) {
    console.error("[workflow] Failed to persist user message:", error);
  }
}

export async function persistUserMessage(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  "use step";

  await persistUserMessageInternal(chatId, message);
}

export async function persistAssistantMessageWithToolResultsInternal(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  if (message.role !== "assistant") {
    return;
  }

  const hasToolResults = message.parts.some(
    (part) =>
      isToolUIPart(part) &&
      (part.state === "output-available" ||
        part.state === "output-error" ||
        part.state === "approval-responded"),
  );

  if (!hasToolResults) {
    return;
  }

  try {
    const { upsertChatMessageScoped } = await import("@/lib/db/sessions");
    const dedupedMessage = dedupeMessageParts(message);
    const sanitized = sanitizeMessageForDatabase(dedupedMessage);
    const result = await upsertChatMessageScoped({
      id: dedupedMessage.id,
      chatId,
      role: "assistant",
      parts: sanitized,
      metadata: dedupedMessage.metadata
        ? withoutUndefined(dedupedMessage.metadata)
        : undefined,
    });

    if (result.status === "conflict") {
      console.warn(
        `[workflow] Skipped assistant tool-result upsert due to ID scope conflict: ${message.id}`,
      );
    }
  } catch (error) {
    console.error(
      "[workflow] Failed to persist assistant message with tool results:",
      error,
    );
  }
}

export async function persistAssistantMessageWithToolResults(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  "use step";

  await persistAssistantMessageWithToolResultsInternal(chatId, message);
}

export async function persistAssistantMessageInternal(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  try {
    const { updateChatAssistantActivity, upsertChatMessageScoped } =
      await import("@/lib/db/sessions");
    const dedupedMessage = dedupeMessageParts(message);
    const sanitized = sanitizeMessageForDatabase(dedupedMessage);
    const result = await upsertChatMessageScoped({
      id: dedupedMessage.id,
      chatId,
      role: "assistant",
      parts: sanitized,
      metadata: dedupedMessage.metadata
        ? withoutUndefined(dedupedMessage.metadata)
        : undefined,
    });

    if (result.status === "conflict") {
      console.warn(
        `[workflow] Skipped assistant upsert due to ID scope conflict: ${message.id}`,
      );
    } else if (result.status === "inserted") {
      await updateChatAssistantActivity(chatId, new Date());
    }
  } catch (error) {
    console.error("[workflow] Failed to persist assistant message:", error);
  }
}

export async function persistAssistantMessage(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  "use step";

  await persistAssistantMessageInternal(chatId, message);
}

/**
 * Atomic final persist (upstream open-agents #845): the assistant
 * message, the activeStreamId clear and the terminal "completed"
 * status commit together in one transaction, closing the
 * refresh-replay window between them. The status write is guarded by
 * stream-pointer ownership, so a stale finishing run can never
 * overwrite a newer run's "queued"/"running" (or the stop route's
 * "cancelled").
 */
export async function persistFinalAssistantMessage(
  chatId: string,
  message: WebAgentUIMessage,
  workflowRunId: string,
): Promise<void> {
  "use step";

  try {
    const {
      updateChatAssistantActivity,
      upsertChatMessageAndClearActiveStream,
    } = await import("@/lib/db/sessions");
    const dedupedMessage = dedupeMessageParts(message);
    const sanitized = sanitizeMessageForDatabase(dedupedMessage);
    const result = await upsertChatMessageAndClearActiveStream(
      {
        id: dedupedMessage.id,
        chatId,
        role: "assistant",
        parts: sanitized,
        metadata: dedupedMessage.metadata
          ? withoutUndefined(dedupedMessage.metadata)
          : undefined,
      },
      workflowRunId,
      { finalizeStatus: "completed" },
    );

    if (result.status === "conflict") {
      console.warn(
        `[workflow] Skipped assistant upsert due to ID scope conflict: ${message.id}`,
      );
    } else if (result.status === "inserted" || result.status === "updated") {
      await updateChatAssistantActivity(chatId, new Date());
    }

    // chatFinalized is false when the stream pointer moved to a newer run
    // between this run's steps: the guarded terminal write inside the
    // transaction was skipped, leaving the newer run's status untouched.
    // Nothing else to do here -- the newer run owns the chat from now on.
    if (result.status !== "conflict" && !result.chatFinalized) {
      console.warn(
        `[workflow] Final persist skipped terminal status for chat ${chatId}: stream pointer moved to a newer run`,
      );
    }
  } catch (error) {
    console.error(
      "[workflow] Failed to persist final assistant message; re-throwing for step retry:",
      error,
    );
    throw error;
  }
}

export async function refreshLifecycleActivity(
  sessionId: string,
): Promise<void> {
  "use step";

  try {
    const { updateSession } = await import("@/lib/db/sessions");
    await updateSession(sessionId, buildLifecycleActivityUpdate(new Date()));
  } catch (error) {
    console.error("[workflow] Failed to refresh lifecycle activity:", error);
  }
}

export async function kickSandboxLifecycleStep(
  sessionId: string,
): Promise<void> {
  "use step";

  try {
    const { runKickSandboxLifecycleWorkflow } =
      await import("@/lib/sandbox/lifecycle-kick");
    await runKickSandboxLifecycleWorkflow({
      sessionId,
      reason: "turn-finished",
    });
  } catch (error) {
    console.error(
      "[workflow] Failed to kick sandbox lifecycle workflow:",
      error,
    );
  }
}

export async function persistSandboxState(
  sessionId: string,
  sandboxState: SandboxState,
): Promise<void> {
  "use step";
  try {
    const { connectSandbox } = await import("@entry-agents/sandbox");
    const { updateSession } = await import("@/lib/db/sessions");
    const sandbox = await connectSandbox(sandboxState);
    const currentState = sandbox.getState?.() as SandboxState | undefined;
    if (currentState) {
      await updateSession(sessionId, {
        sandboxState: currentState,
        ...buildActiveLifecycleUpdate(currentState, {
          activityAt: new Date(),
        }),
      });
    }
  } catch (error) {
    console.error("[workflow] Failed to persist sandbox state:", error);
  }
}

const ACTIVE_STREAM_CLEAR_MAX_ATTEMPTS = 3;
const ACTIVE_STREAM_CLEAR_RETRY_DELAY_MS = 50;

export async function clearActiveStream(
  chatId: string,
  workflowRunId: string,
): Promise<void> {
  "use step";

  for (
    let attempt = 1;
    attempt <= ACTIVE_STREAM_CLEAR_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const { compareAndSetChatActiveStreamId, failActiveChatRun } =
        await import("@/lib/db/sessions");
      // Only clear if this workflow's run ID is still the active one.
      // Prevents a late-finishing workflow from clearing a newer workflow's ID.
      const owned = await compareAndSetChatActiveStreamId(
        chatId,
        workflowRunId,
        null,
      );

      // Terminal fallback, gated on ownership: compareAndSetChatActiveStreamId
      // returns false instead of throwing when a newer run already owns the
      // slot, so a stale finishing run must not flip that newer run's status
      // to "failed". "completed" is written by persistFinalAssistantMessage
      // and "cancelled" by the stop route; anything still marked active here
      // means the turn ended abnormally (crash, thrown step, exhausted
      // retries). failActiveChatRun also guards on status so it cannot stomp
      // a success that already landed.
      if (owned) {
        await failActiveChatRun(chatId).catch(() => {});
      }
      return;
    } catch (error) {
      if (attempt === ACTIVE_STREAM_CLEAR_MAX_ATTEMPTS) {
        console.error("[workflow] Failed to clear activeStreamId:", error);
        return;
      }

      await delay(ACTIVE_STREAM_CLEAR_RETRY_DELAY_MS);
    }
  }
}

export async function finalizeAbortedChatStep(
  chatId: string,
  workflowRunId: string,
): Promise<void> {
  "use step";

  try {
    const { compareAndSetChatActiveStreamId, setChatRunStatus } =
      await import("@/lib/db/sessions");
    await setChatRunStatus(chatId, "cancelled", {
      onlyIfActiveStreamId: workflowRunId,
    });
    await compareAndSetChatActiveStreamId(chatId, workflowRunId, null);
  } catch (error) {
    console.error("[workflow] Failed to finalize aborted chat:", error);
  }
}

export async function cancelWorkflowRunStep(
  workflowRunId: string,
): Promise<void> {
  "use step";

  try {
    const { getRun } = await import("workflow/api");
    await getRun(workflowRunId).cancel();
  } catch (error) {
    const { isDefinitelyGoneRunError } =
      await import("@/lib/workflow-run-recovery");
    if (!isDefinitelyGoneRunError(error)) {
      console.warn(
        `[workflow] Best-effort cancelWorkflowRunStep failed for ${workflowRunId}:`,
        error,
      );
    }
  }
}

const BILLING_TURN_RELEASE_MAX_ATTEMPTS = 3;
const BILLING_TURN_RELEASE_RETRY_DELAY_MS = 50;

/**
 * Releases the per-user billing-turn lock (see claimUserBillingTurn in
 * credit-ledger.ts) so a later turn for the same user isn't blocked.
 * Mirrors clearActiveStream's retry-then-log-and-move-on pattern: never
 * throws, since a stuck lock self-heals via the staleness fallback
 * anyway -- this is just the fast path.
 */
export async function reconcileSessionStatusStep(
  sessionId: string,
  status: "completed" | "failed",
): Promise<void> {
  "use step";
  try {
    const { reconcileSessionStatus } = await import("@/lib/db/sessions");
    await reconcileSessionStatus(sessionId, status);
  } catch (error) {
    console.error("[workflow] Failed to reconcile session status:", error);
  }
}

export async function releaseUserBillingTurnStep(
  userId: string,
  workflowRunId: string,
): Promise<void> {
  "use step";

  for (
    let attempt = 1;
    attempt <= BILLING_TURN_RELEASE_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const { releaseUserBillingTurn } =
        await import("@/lib/billing/credit-ledger");
      await releaseUserBillingTurn(userId, workflowRunId);
      return;
    } catch (error) {
      if (attempt === BILLING_TURN_RELEASE_MAX_ATTEMPTS) {
        console.error("[workflow] Failed to release billing turn lock:", error);
        return;
      }

      await delay(BILLING_TURN_RELEASE_RETRY_DELAY_MS);
    }
  }
}

const ACTIVE_STREAM_CLAIM_MAX_ATTEMPTS = 3;
const ACTIVE_STREAM_CLAIM_RETRY_DELAY_MS = 50;

export type ClaimActiveStreamResult = "claimed" | "conflict" | "error";

/**
 * First-step self-registration of the workflow's runId onto the chat.
 *
 * The HTTP handler that called `start()` also tries to write activeStreamId
 * via `compareAndSetChatActiveStreamId`, but that write is best-effort: if
 * the handler is killed (client disconnect → runtime teardown, unhandled
 * exception, etc.) between `start()` and its CAS, the workflow runs to
 * completion with activeStreamId never set, and the chat page can't resume.
 *
 * Running this as the workflow's first step ties activeStreamId existence to
 * workflow existence: as long as the workflow is running, the slot is
 * claimed. Idempotent with the handler's CAS — whichever writes first wins,
 * the other is a no-op.
 *
 * Returns:
 * - `"claimed"` when the slot is now owned by this workflow run.
 * - `"conflict"` when a different run already owns the slot.
 * - `"error"` when the claim could not be persisted after retries.
 */
export async function claimActiveStream(
  chatId: string,
  workflowRunId: string,
  writable?: WritableStream<UIMessageChunk>,
  messageId?: string,
): Promise<ClaimActiveStreamResult> {
  "use step";

  for (
    let attempt = 1;
    attempt <= ACTIVE_STREAM_CLAIM_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const { claimChatActiveStreamId, getChatById, setChatRunStatus } =
        await import("@/lib/db/sessions");
      const currentChat = await getChatById(chatId).catch(() => null);
      if (currentChat?.status === "cancelled") {
        console.warn(
          "[workflow] Chat was cancelled before workflow claimed activeStreamId; aborting startup:",
          { chatId, workflowRunId },
        );
        return "conflict";
      }
      const ok = await claimChatActiveStreamId(chatId, workflowRunId);
      if (ok) {
        // The run owns this chat from here on. Committing "running"
        // alongside activeStreamId means a viewer never sees a claimed
        // stream with no lifecycle state.
        await setChatRunStatus(chatId, "running", {
          onlyIfActiveStreamId: workflowRunId,
        }).catch(() => {});
      }
      if (!ok) {
        console.warn(
          "[workflow] activeStreamId slot owned by a different run:",
          { chatId, workflowRunId },
        );
        return "conflict";
      }
      if (writable && messageId) {
        const writer = writable.getWriter();
        try {
          await writer.write({ type: "start", messageId });
        } finally {
          writer.releaseLock();
        }
      }
      return "claimed";
    } catch (error) {
      if (attempt === ACTIVE_STREAM_CLAIM_MAX_ATTEMPTS) {
        console.error("[workflow] Failed to claim activeStreamId:", error);
        if (writable && messageId) {
          const writer = writable.getWriter();
          try {
            await writer.write({ type: "start", messageId });
          } finally {
            writer.releaseLock();
          }
        }
        // Non-fatal: workflow can still run, just won't be resumable.
        return "error";
      }

      await delay(ACTIVE_STREAM_CLAIM_RETRY_DELAY_MS);
    }
  }

  return "error";
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function recordWorkflowUsage(
  userId: string,
  modelId: string | undefined,
  totalUsage: LanguageModelUsage | undefined,
  responseMessage: WebAgentUIMessage,
  previousResponseMessage?: WebAgentUIMessage,
  workflowRun?: {
    workflowRunId: string;
    chatId: string;
    sessionId: string;
    status: WorkflowRunStatus;
    startedAt: string;
    finishedAt: string;
    totalDurationMs: number;
    stepTimings: WorkflowRunStepTiming[];
    errorMessage?: string;
  },
): Promise<void> {
  "use step";

  try {
    const { collectTaskToolUsageEvents, sumLanguageModelUsage } =
      await import("@entry-agents/agent");
    const { recordUsage } = await import("@/lib/db/usage");

    if (workflowRun) {
      try {
        const { recordWorkflowRun } = await import("@/lib/db/workflow-runs");
        await recordWorkflowRun({
          id: workflowRun.workflowRunId,
          chatId: workflowRun.chatId,
          sessionId: workflowRun.sessionId,
          userId,
          modelId,
          status: workflowRun.status,
          startedAt: workflowRun.startedAt,
          finishedAt: workflowRun.finishedAt,
          totalDurationMs: workflowRun.totalDurationMs,
          stepTimings: workflowRun.stepTimings,
          errorMessage: workflowRun.errorMessage,
        });
      } catch (error) {
        console.error("[workflow] Failed to record workflow run:", error);
      }
    }

    // Load the live model/pricing catalog once -- still needed below to
    // price SUBAGENT usage (debitForModelUsage). Main-turn usage is now
    // billed in real time, per model step, inside runAgentStep (see that
    // function's messageMetadata "finish-step" handler in chat.ts) --
    // debiting it again here would double-charge, so that call was
    // removed on 2026-08-17. recordUsage below is unrelated to the
    // credit ledger (it's the separate usage_events analytics table) and
    // still runs for both main and subagent usage as before.
    // PRICING FIX 2026-09-15: was fetchAvailableLanguageModels() (the
    // admin-filtered picker catalog). Per the 2026-08-17 pricing lesson,
    // billing/cost lookup must use the UNFILTERED catalog -- an admin
    // disabling a model must never stop that model's already-happening
    // usage from being priced and debited. Also saves the per-turn
    // kill-switch DB query.
    const { fetchModelCostCatalog } = await import("@/lib/models-with-context");
    const { estimateModelUsageCost } = await import("@/lib/models");
    const billingCatalog = await fetchModelCostCatalog();

    // Record main agent usage (analytics only -- billing already
    // happened in real time during the stream, see comment above).
    if (totalUsage && modelId) {
      const mainUsage = {
        inputTokens: totalUsage.inputTokens ?? 0,
        cachedInputTokens: cachedInputTokensFor(totalUsage),
        outputTokens: totalUsage.outputTokens ?? 0,
      };
      await recordUsage(userId, {
        source: "web",
        agentType: "main",
        model: modelId,
        messages: [responseMessage],
        usage: {
          ...mainUsage,
          costUsd:
            estimateModelUsageCost(
              mainUsage,
              billingCatalog.find((m) => m.id === modelId)?.cost,
            ) ?? null,
        },
      });
    }

    // Record subagent usage (aggregated by model for analytics; billing
    // already happened in real time per subagent step in runAgentStep).
    const baselineSubagentUsageEvents = previousResponseMessage
      ? collectTaskToolUsageEvents(previousResponseMessage)
      : [];
    const subagentUsageEvents = filterNewTaskUsageEvents(
      collectTaskToolUsageEvents(responseMessage),
      baselineSubagentUsageEvents,
    );

    if (subagentUsageEvents.length > 0) {
      const subagentUsageByModel = new Map<string, UsageByModel>();

      for (const event of subagentUsageEvents) {
        const eventModelId = event.modelId ?? modelId;
        if (!eventModelId) {
          continue;
        }

        const existing = subagentUsageByModel.get(eventModelId);
        if (!existing) {
          subagentUsageByModel.set(eventModelId, {
            usage: event.usage,
            toolCallCount: 1,
          });
          continue;
        }

        const combinedUsage = sumLanguageModelUsage(
          existing.usage,
          event.usage,
        );
        if (!combinedUsage) {
          continue;
        }

        subagentUsageByModel.set(eventModelId, {
          usage: combinedUsage,
          toolCallCount: existing.toolCallCount + 1,
        });
      }

      for (const [eventModelId, modelUsage] of subagentUsageByModel) {
        const subagentUsage = {
          inputTokens: modelUsage.usage.inputTokens ?? 0,
          cachedInputTokens: cachedInputTokensFor(modelUsage.usage),
          outputTokens: modelUsage.usage.outputTokens ?? 0,
        };
        await recordUsage(userId, {
          source: "web",
          agentType: "subagent",
          model: eventModelId,
          messages: [],
          usage: {
            ...subagentUsage,
            costUsd:
              estimateModelUsageCost(
                subagentUsage,
                billingCatalog.find((m) => m.id === eventModelId)?.cost,
              ) ?? null,
          },
          toolCallCount: modelUsage.toolCallCount,
        });
      }
    }
  } catch (error) {
    console.error("[workflow] Failed to record usage:", error);
  }
}

export async function refreshDiffCache(
  sessionId: string,
  sandboxState: SandboxState,
): Promise<void> {
  "use step";
  try {
    const { connectSandbox } = await import("@entry-agents/sandbox");
    const { computeAndCacheDiff } = await import("@/lib/diff/compute-diff");
    const sandbox: Sandbox = await connectSandbox(sandboxState);
    await computeAndCacheDiff({ sandbox, sessionId });
  } catch (error) {
    console.error("[workflow] Failed to refresh diff cache:", error);
  }
}

export async function closeStream(
  writable: WritableStream<UIMessageChunk>,
): Promise<void> {
  "use step";
  await writable.close();
}

export async function sendFinish(
  writable: WritableStream<UIMessageChunk>,
): Promise<void> {
  "use step";
  const writer = writable.getWriter();
  try {
    await writer.write({ type: "finish", finishReason: "stop" });
  } finally {
    writer.releaseLock();
  }
}

export async function hasAutoCommitChangesStep(params: {
  sandboxState: SandboxState;
}): Promise<boolean> {
  "use step";
  try {
    const { connectSandbox } = await import("@entry-agents/sandbox");
    const sandbox: Sandbox = await connectSandbox(params.sandboxState);
    const statusResult = await sandbox.exec(
      "git status --porcelain",
      sandbox.workingDirectory,
      10000,
    );

    if (!statusResult.success) {
      return true;
    }

    return statusResult.stdout.trim().length > 0;
  } catch (error) {
    console.error("[workflow] Failed to preflight auto-commit changes:", error);
    return true;
  }
}

export async function runAutoCommitStep(params: {
  userId: string;
  sessionId: string;
  sessionTitle: string;
  repoOwner: string;
  repoName: string;
  sandboxState: SandboxState;
}): Promise<AutoCommitResult> {
  "use step";
  try {
    const { connectSandbox } = await import("@entry-agents/sandbox");
    const { performAutoCommit } = await import("@/lib/chat/auto-commit-direct");
    const sandbox = await connectSandbox(params.sandboxState);
    const result = await performAutoCommit({
      sandbox,
      userId: params.userId,
      sessionId: params.sessionId,
      sessionTitle: params.sessionTitle,
      repoOwner: params.repoOwner,
      repoName: params.repoName,
    });
    return withoutUndefined(result);
  } catch (error) {
    console.error("[workflow] Auto-commit failed:", error);
    return {
      committed: false,
      pushed: false,
      error: error instanceof Error ? error.message : "Auto-commit failed",
    };
  }
}

export async function runAutoCreatePrStep(params: {
  userId: string;
  sessionId: string;
  sessionTitle: string;
  repoOwner: string;
  repoName: string;
  sandboxState: SandboxState;
}): Promise<AutoCreatePrResult> {
  "use step";
  try {
    const { connectSandbox } = await import("@entry-agents/sandbox");
    const { performAutoCreatePr } = await import("@/lib/chat/auto-pr-direct");
    const sandbox = await connectSandbox(params.sandboxState);
    const result = await performAutoCreatePr({
      sandbox,
      userId: params.userId,
      sessionId: params.sessionId,
      sessionTitle: params.sessionTitle,
      repoOwner: params.repoOwner,
      repoName: params.repoName,
    });

    if (result.error) {
      console.warn("[workflow] Auto-PR failed:", result.error);
    }

    return withoutUndefined(result);
  } catch (error) {
    console.error("[workflow] Auto-PR failed:", error);
    return {
      created: false,
      pushed: false,
      syncedExisting: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Auto-PR failed",
    } as AutoCreatePrResult;
  }
}

export interface DequeuedUserPrompt {
  message: WebAgentUIMessage;
  modelId?: string | null;
  reasoningEffort?: string | null;
  rawItem?: unknown;
}

export interface StartNextQueuedWorkflowParams {
  chatId: string;
  sessionId: string;
  userId: string;
  requestUrl: string;
  authSession: Pick<AuthSession, "authProvider" | "user"> | null;
  maxSteps?: number;
  teamRoleModels?: Record<string, string>;
  autoCommitEnabled?: boolean;
  autoCreatePrEnabled?: boolean;
  /**
   * Allow starting a queued turn even when the previous turn ended as
   * `"cancelled"` (used when the user explicitly posts a new prompt via
   * `POST /api/chat/[chatId]/queue`). Automated end-of-turn chaining leaves
   * this `false` so pressing Stop halts the remaining queue.
   */
  allowFromCancelled?: boolean;
  /**
   * When true, rethrow transient start/DB errors after restoring the popped
   * prompt so the Workflow SDK retries `startNextQueuedWorkflowStep` instead
   * of stranding the remaining queue.
   */
  rethrowOnStartError?: boolean;
}

function normalizeStoredChatMessage(row: {
  id: string;
  role: string;
  parts: unknown;
  metadata?: unknown;
}): WebAgentUIMessage {
  const raw = row.parts as unknown;
  const fallbackMetadata =
    (row.metadata as WebAgentUIMessage["metadata"]) ?? undefined;
  if (Array.isArray(raw)) {
    return {
      id: row.id,
      role: row.role as WebAgentUIMessage["role"],
      parts: raw,
      ...(fallbackMetadata !== undefined ? { metadata: fallbackMetadata } : {}),
    } as WebAgentUIMessage;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return {
      ...obj,
      id: typeof obj.id === "string" ? obj.id : row.id,
      role: (typeof obj.role === "string"
        ? obj.role
        : row.role) as WebAgentUIMessage["role"],
      parts: Array.isArray(obj.parts) ? obj.parts : [],
      metadata:
        (obj.metadata as WebAgentUIMessage["metadata"]) ?? fallbackMetadata,
    } as WebAgentUIMessage;
  }
  return {
    id: row.id,
    role: row.role as WebAgentUIMessage["role"],
    parts: [],
    ...(fallbackMetadata !== undefined ? { metadata: fallbackMetadata } : {}),
  } as WebAgentUIMessage;
}

export async function dequeueNextQueuedUserMessageInternal(
  chatId: string,
): Promise<DequeuedUserPrompt | null> {
  try {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/lib/db/client");
    const { chats } = await import("@/lib/db/schema");

    const popped = await db.transaction(async (tx) => {
      // Row lock across read+pop+write: concurrent queue POSTs/DELETEs (and
      // other dequeue steps) take the same lock, so a prompt enqueued while
      // this step runs cannot be lost or double-executed.
      const rows = await tx
        .select({ queuedPrompts: chats.queuedPrompts })
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1)
        .for("update");

      const rawQueue = rows[0]?.queuedPrompts;
      if (!Array.isArray(rawQueue) || rawQueue.length === 0) {
        return null;
      }

      const [first, ...rest] = rawQueue as Array<{
        id?: unknown;
        text?: unknown;
        payload?: unknown;
        modelId?: unknown;
        reasoningEffort?: unknown;
      }>;

      if (
        !first ||
        typeof first !== "object" ||
        typeof first.id !== "string" ||
        typeof first.text !== "string"
      ) {
        return null;
      }

      await tx
        .update(chats)
        .set({ queuedPrompts: rest.length > 0 ? rest : null })
        .where(eq(chats.id, chatId));

      const payload =
        first.payload && typeof first.payload === "object"
          ? (first.payload as {
              text?: unknown;
              files?: unknown;
              parts?: unknown;
            })
          : null;

      let parts: WebAgentUIMessage["parts"] = [];
      if (payload && Array.isArray(payload.parts)) {
        parts = payload.parts as WebAgentUIMessage["parts"];
      } else {
        const text =
          payload && typeof payload.text === "string"
            ? payload.text
            : first.text;
        if (text.trim()) {
          parts.push({ type: "text", text });
        }
        if (payload && Array.isArray(payload.files)) {
          for (const filePart of payload.files) {
            if (filePart && typeof filePart === "object") {
              parts.push(filePart as WebAgentUIMessage["parts"][number]);
            }
          }
        }
      }

      if (parts.length === 0 && first.text.trim()) {
        parts = [{ type: "text", text: first.text }];
      }

      if (parts.length === 0) {
        return null;
      }

      const userMessage: WebAgentUIMessage = {
        id: first.id,
        role: "user",
        parts,
      };

      const queuedModelId =
        typeof first.modelId === "string" && first.modelId
          ? first.modelId
          : null;
      const queuedReasoningEffort =
        typeof first.reasoningEffort === "string" && first.reasoningEffort
          ? first.reasoningEffort
          : null;

      return {
        message: userMessage,
        rawItem: first,
        ...(queuedModelId ? { modelId: queuedModelId } : {}),
        ...(queuedReasoningEffort
          ? { reasoningEffort: queuedReasoningEffort }
          : {}),
      };
    });

    if (!popped) {
      return null;
    }

    await persistUserMessageInternal(chatId, popped.message);
    return withoutUndefined(popped);
  } catch (error) {
    console.error("[workflow] Failed to dequeue next queued prompt:", error);
    return null;
  }
}

export async function dequeueNextQueuedUserMessageStep(
  chatId: string,
): Promise<DequeuedUserPrompt | null> {
  "use step";

  return dequeueNextQueuedUserMessageInternal(chatId);
}

/**
 * Starts the next queued prompt as its own independent durable `runAgentWorkflow`
 * run so each queued prompt receives a fresh step budget, fresh 1-hour turn
 * timeout, isolated workflow event history, and full per-turn finalization
 * (auto-commit / auto-PR / final assistant persist).
 */
async function restoreQueuedPromptToFront(
  chatId: string,
  rawItem: unknown,
): Promise<void> {
  if (rawItem === undefined) return;
  const rawId =
    rawItem &&
    typeof rawItem === "object" &&
    "id" in rawItem &&
    typeof (rawItem as { id?: unknown }).id === "string"
      ? (rawItem as { id: string }).id
      : null;

  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const { chats } = await import("@/lib/db/schema");
  await db
    .transaction(async (tx) => {
      const rows = await tx
        .select({ queuedPrompts: chats.queuedPrompts })
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1)
        .for("update");
      const current = Array.isArray(rows[0]?.queuedPrompts)
        ? (rows[0].queuedPrompts as unknown[])
        : [];
      const alreadyPresent =
        rawId !== null &&
        current.some(
          (item) =>
            item &&
            typeof item === "object" &&
            "id" in item &&
            (item as { id?: unknown }).id === rawId,
        );
      if (alreadyPresent) return;
      await tx
        .update(chats)
        .set({ queuedPrompts: [rawItem, ...current] })
        .where(eq(chats.id, chatId));
    })
    .catch(() => {});
}

export async function startNextQueuedWorkflowInternal(
  params: StartNextQueuedWorkflowParams,
): Promise<{ started: boolean; runId?: string }> {
  try {
    const {
      claimChatActiveStreamId,
      getChatById,
      getChatMessages,
      setChatRunStatus,
    } = await import("@/lib/db/sessions");
    const chat = await getChatById(params.chatId);
    if (
      !chat ||
      (!params.allowFromCancelled && chat.status === "cancelled") ||
      chat.activeStreamId !== null
    ) {
      return { started: false };
    }

    const dequeued = await dequeueNextQueuedUserMessageInternal(params.chatId);
    if (!dequeued) {
      return { started: false };
    }

    await setChatRunStatus(params.chatId, "queued", {
      onlyIfActiveStreamId: null,
    }).catch(() => {});

    try {
      const storedRows = await getChatMessages(params.chatId);
      const messages = storedRows.map((row) => normalizeStoredChatMessage(row));
      if (!messages.some((m) => m.id === dequeued.message.id)) {
        messages.push(dequeued.message);
      }

      const { generateId } = await import("ai");
      const { start, getRun } = await import("workflow/api");
      const { runAgentWorkflow } = await import("./chat");
      const { isHobbyResourceProfile } =
        await import("@/lib/deployment/resource-profile");

      const nextRun = await start(
        runAgentWorkflow,
        [
          {
            messages,
            chatId: params.chatId,
            sessionId: params.sessionId,
            userId: params.userId,
            requestUrl: params.requestUrl,
            authSession: params.authSession,
            assistantId: generateId(),
            inputMessagesPersisted: true,
            maxSteps: params.maxSteps ?? (isHobbyResourceProfile() ? 50 : 500),
            ...(params.teamRoleModels &&
            Object.keys(params.teamRoleModels).length > 0
              ? { teamRoleModels: params.teamRoleModels }
              : {}),
            ...(params.autoCommitEnabled !== undefined
              ? { autoCommitEnabled: params.autoCommitEnabled }
              : {}),
            ...(params.autoCreatePrEnabled !== undefined
              ? { autoCreatePrEnabled: params.autoCreatePrEnabled }
              : {}),
            ...(dequeued.modelId !== undefined
              ? { overrideModelId: dequeued.modelId }
              : {}),
            ...(dequeued.reasoningEffort !== undefined
              ? { overrideReasoningEffort: dequeued.reasoningEffort }
              : {}),
          },
        ],
        {
          attributes: {
            chatId: params.chatId,
            sessionId: params.sessionId,
            userId: params.userId,
          },
        },
      );

      const claimed = await claimChatActiveStreamId(
        params.chatId,
        nextRun.runId,
      );
      if (!claimed) {
        await restoreQueuedPromptToFront(params.chatId, dequeued.rawItem);
        try {
          await getRun(nextRun.runId).cancel();
        } catch {
          // Best-effort cleanup.
        }
        return { started: false };
      }

      return { started: true, runId: nextRun.runId };
    } catch (error) {
      // Restore the popped item to the front of queuedPrompts on workflow start failure.
      await restoreQueuedPromptToFront(params.chatId, dequeued.rawItem);
      await setChatRunStatus(
        params.chatId,
        params.rethrowOnStartError ? "completed" : "failed",
        {
          onlyIfActiveStreamId: null,
        },
      ).catch(() => {});
      console.error(
        `[workflow] Failed to start next queued workflow for chat ${params.chatId}:`,
        error,
      );
      if (params.rethrowOnStartError) {
        throw error;
      }
      return { started: false };
    }
  } catch (error) {
    console.error("[workflow] startNextQueuedWorkflowInternal error:", error);
    if (params.rethrowOnStartError) {
      throw error;
    }
    return { started: false };
  }
}

export async function startNextQueuedWorkflowStep(
  params: StartNextQueuedWorkflowParams,
): Promise<{ started: boolean; runId?: string }> {
  "use step";

  return startNextQueuedWorkflowInternal({
    ...params,
    rethrowOnStartError: true,
  });
}

export async function getUnreadInboxCountStep(
  chatId: string,
): Promise<{ unreadCount: number }> {
  "use step";
  try {
    const { getUnreadInboxMessages } = await import("@/lib/db/inbox");
    const unread = await getUnreadInboxMessages(chatId);
    return { unreadCount: unread.length };
  } catch (error) {
    console.error("[workflow] Failed to check steering inbox:", error);
    return { unreadCount: 0 };
  }
}

export async function runPostTurnPluginsStep(params: {
  userId: string;
  sessionId: string;
  chatId: string;
  workflowRunId: string;
  status: WorkflowRunStatus;
}): Promise<void> {
  "use step";
  try {
    const { getEnabledPluginsForExecution, recordUserPluginsTriggered } =
      await import("@/lib/db/plugins");
    const enabledPlugins = await getEnabledPluginsForExecution(params.userId);
    const idleSlugs = enabledPlugins
      .filter((plugin) => plugin.manifest.hooks.includes("session.idle"))
      .map((plugin) => plugin.slug);

    if (idleSlugs.length > 0) {
      await recordUserPluginsTriggered(params.userId, idleSlugs);
    }
  } catch (error) {
    console.error("[workflow] Failed to run post-turn plugins step:", error);
  }
}
