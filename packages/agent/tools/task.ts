import {
  type LanguageModelUsage,
  type ModelMessage,
  tool,
  type UIToolInvocation,
} from "ai";
import { z } from "zod";
import {
  buildSubagentSummaryLines,
  SUBAGENT_REGISTRY,
  SUBAGENT_TYPES,
} from "../subagents/registry";
import {
  MAX_INLINE_SUMMARY_CHARS,
  MAX_SUBAGENT_DEPTH,
} from "../subagents/constants";
import {
  registerActiveSubagent,
  stopAllSubagentsForTeam,
  subagentSessionStore,
  unregisterActiveSubagent,
} from "../subagents/session-store";
import {
  formatTeamContextSummary,
  getOrCreateTeamBoard,
  isWorktreeEligibleRole,
  prepareSubagentWorktree,
  type SubagentWorktree,
  type TeamBoardSnapshot,
} from "../team";
import { sanitizeDanglingSubagentToolCalls } from "../subagents/prepare-step";
import {
  buildFallbackSubagentSummary,
  compactMessagesForOverflowRecovery,
  extractAssistantText,
  hasStructuredSubagentSummary,
  isContextOverflowSubagentError,
  isTransientSubagentError,
  synthesizeSubagentFinalSummary,
} from "../subagents/summary-synthesis";
import { enrichUsageWithProviderCache, sumLanguageModelUsage } from "../usage";
import { getSandbox, getSandboxContext, getSubagentModel } from "./utils";
import type { AgentContext, SubagentBudgetGuard } from "../types";

const MAX_CONTINUATION_RECOVERIES = 4;

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
      new Promise<void>((resolve) => {
        onAbort = () => resolve();
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

const subagentTypeSchema = z.enum(SUBAGENT_TYPES);

const subagentSummaryLines = buildSubagentSummaryLines();

const taskInputSchema = z.object({
  subagentType: subagentTypeSchema.describe(
    `Subagent to launch. Available options:\n${subagentSummaryLines}`,
  ),
  task: z
    .string()
    .describe("Short description of the task (displayed to user)"),
  instructions: z.string().describe(
    `Detailed 4-part delegation brief for the subagent (subagents have zero prior conversation context):
1. Objective: concrete goal or question to answer
2. Scope & Boundaries: exact files/modules to own and what NOT to touch (prevent overlap with sibling teammates)
3. Output Contract: exact format, file:line references, or artifacts to return
4. Verification: concrete test/typecheck/lint command or check that proves "done"`,
  ),
  sessionId: z
    .string()
    .optional()
    .describe(
      "Optional session ID of an active subagent to continue or follow up with. When provided, the subagent retains its conversational memory and tool context from previous turns.",
    ),
  worktree: z
    .boolean()
    .optional()
    .describe(
      "Run write-capable teammates ('executor' or 'design') in an isolated git worktree branch (team/<role>-<id>). Defaults to true when inside a git repo; pass false to edit the main checkout directly.",
    ),
});

const taskPendingToolCallSchema = z.object({
  name: z.string(),
  input: z.unknown(),
});

export type TaskPendingToolCall = z.infer<typeof taskPendingToolCallSchema>;

const taskExecutedToolSchema = z.object({
  toolCallId: z.string().optional(),
  name: z.string(),
  input: z.unknown(),
  output: z.unknown().optional(),
  state: z.enum(["running", "completed", "failed"]).optional(),
});

export type TaskExecutedTool = z.infer<typeof taskExecutedToolSchema>;

export const taskOutputSchema = z.object({
  pending: taskPendingToolCallSchema.optional(),
  toolCallCount: z.number().int().nonnegative().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  completedAt: z.number().int().nonnegative().optional(),
  modelId: z.string().optional(),
  final: z.custom<ModelMessage[]>().optional(),
  streamedText: z.string().optional(),
  executedTools: z.array(taskExecutedToolSchema).optional(),
  teamSnapshot: z.custom<TeamBoardSnapshot>().optional(),
  status: z
    .enum(["starting", "running", "completed", "failed", "denied"])
    .optional(),
  usage: z.custom<LanguageModelUsage>().optional(),
  sessionId: z.string().optional(),
  depth: z.number().int().nonnegative().optional(),
  worktreeBranch: z.string().optional(),
  worktreeSummary: z.string().optional(),
});

export type TaskToolOutput = z.infer<typeof taskOutputSchema>;

export const taskTool = tool({
  needsApproval: false,
  description: `Launch a specialized subagent to handle complex, self-contained tasks autonomously.

AVAILABLE SUBAGENTS:
${subagentSummaryLines}

WHEN TO USE:
- Parallel read-only exploration across independent modules (\`explorer\`) to protect main context window
- Independent implementation waves (\`executor\` / \`design\`) with non-overlapping file ownership
- Fresh skeptical verification (\`reviewer\`) so the author is never the sole grader

WHEN NOT TO USE (do it yourself):
- Simple, single-file or single-change edits
- Tightly coupled sequential work where context cannot be cleanly isolated
- Ambiguous work that requires user clarification

DELEGATION RULES:
- Subagents cannot see your conversation — always brief Objective, Scope & non-overlapping file boundaries, Output format, and Verification check
- Keep write paths non-overlapping across parallel teammates (use \`team_board\` \`plan_tasks\` first for multi-agent work)
- Subagents run autonomously with role-calibrated step budgets and return only a concise **Summary** + **Answer**

HOW TO USE:
- Choose the appropriate subagentType based on the subagent descriptions above
- Provide a short task string (for display) summarizing the goal
- Provide detailed instructions including goals, steps, constraints, and verification criteria

IMPORTANT:
- Be explicit and concrete - subagents cannot ask clarifying questions
- Include critical context (APIs, function names, file paths) in the instructions
- The parent agent will not see the subagent's internal tool calls, only its final summary`,
  inputSchema: taskInputSchema,
  outputSchema: taskOutputSchema,
  execute: async function* (
    { subagentType, task, instructions, sessionId, worktree },
    { experimental_context, abortSignal, toolCallId },
  ) {
    const currentDepth =
      (experimental_context as AgentContext | undefined)?.depth ?? 0;
    if (currentDepth >= MAX_SUBAGENT_DEPTH) {
      const refused: ModelMessage[] = [
        {
          role: "assistant",
          content: `Task not started: maximum subagent delegation depth reached (${MAX_SUBAGENT_DEPTH}). Subagents cannot spawn child subagents. Please execute this work directly.`,
        },
      ];
      yield {
        final: refused,
        toolCallCount: 0,
        startedAt: Date.now(),
        depth: currentDepth,
      };
      return;
    }

    const sandboxContext = getSandboxContext(experimental_context, "task");
    const model = getSubagentModel(experimental_context, "task", subagentType);
    const subagentModelId = typeof model === "string" ? model : model.modelId;

    const subagent = SUBAGENT_REGISTRY[subagentType].agent;

    // Resumable subagent session handling: look up existing session, hydrate from
    // durable persisted history if the worker restarted, or create fresh so
    // recordTaskCompletion persists initial turns for follow-up calls too.
    const activeSessionId = sessionId?.trim() || crypto.randomUUID();
    let existingSession = subagentSessionStore.get(activeSessionId);
    const durableHistory = sessionId
      ? (experimental_context as AgentContext | undefined)
          ?.subagentMessageHistory?.[activeSessionId]
      : undefined;
    if (!existingSession) {
      existingSession = subagentSessionStore.create({
        id: activeSessionId,
        subagentType,
        depth: currentDepth + 1,
      });
    }
    if (
      existingSession.messages.length === 0 &&
      Array.isArray(durableHistory) &&
      durableHistory.length > 0
    ) {
      existingSession.messages.push(
        ...(durableHistory as typeof existingSession.messages),
      );
    }
    const isFollowUp = existingSession.messages.length > 0;

    // Real-time subagent budget enforcement (host-injected billing
    // guard, 2026-09-15): subagent usage previously landed in the
    // ledger only at the END of the whole turn, so a subagent could
    // spend past an Entry window mid-turn. The guard shares the parent
    // turn's in-memory window/balance counters.
    const billingGuard: SubagentBudgetGuard | undefined = (
      experimental_context as AgentContext | undefined
    )?.billingGuard;

    const startedAt = Date.now();
    let toolCallCount = 0;
    // Nth model step of THIS subagent (billingGuard attribution below).
    let subagentStepIndex = 0;

    if (billingGuard) {
      const plan = billingGuard.planSubagent(subagentModelId);
      if (plan.stop) {
        // Even a first subagent step doesn't fit the remaining budget --
        // refuse the launch with zero spend. Wording mirrors the main
        // model's window/credit exhaustion notices.
        const reasonText =
          plan.reason === "window" ? "usage window" : "credit balance";
        const refused: ModelMessage[] = [
          {
            role: "assistant",
            content: `**Task launch deferred**: The user's ${reasonText} is currently exhausted. Please allow the window to reset or replenish credits before launching subagent tasks.`,
          },
        ];
        yield {
          final: refused,
          toolCallCount,
          startedAt,
          modelId: subagentModelId,
          sessionId: activeSessionId,
          depth: currentDepth + 1,
        };
        return;
      }
    }

    let activeWorktree: SubagentWorktree | null = null;
    if (worktree !== false && isWorktreeEligibleRole(subagentType)) {
      const liveSandbox = await getSandbox(experimental_context, "task").catch(
        () => null,
      );
      activeWorktree = await prepareSubagentWorktree(liveSandbox, {
        role: subagentType,
        taskCallId: toolCallId || activeSessionId,
        enabled: worktree,
        sandboxState: sandboxContext.sandbox?.state,
      }).catch(() => null);
    }

    const effectiveSandbox =
      activeWorktree?.scopedSandbox ?? sandboxContext.sandbox;
    const worktreeBranch = activeWorktree?.branchName;

    const finalizeWorktree = async (): Promise<string | undefined> => {
      if (!activeWorktree) return undefined;
      try {
        const diffSummary = await activeWorktree.collectDiffSummary();
        const cleanupResult = await activeWorktree.cleanup();
        if (cleanupResult.preservedBranch) {
          return `\n\n**Worktree Isolation**: ${diffSummary.summaryLine}${cleanupResult.commitSha ? ` (checkpoint \`${cleanupResult.commitSha}\`)` : ""}`;
        }
        return `\n\n**Worktree Isolation**: Ran in isolated worktree (${activeWorktree.branchName}); no file changes recorded so the empty branch was pruned.`;
      } catch {
        return `\n\n**Worktree Isolation**: Isolated worktree branch \`${activeWorktree.branchName}\` used.`;
      }
    };

    const parentContext = experimental_context as AgentContext | undefined;
    const teamId = parentContext?.teamId ?? "default-team";
    const subagentRegId = toolCallId || activeSessionId || crypto.randomUUID();

    // The subagent gets its own abort controller so the BUDGET guard
    // or stop_subagent tool can stop just the subagent without killing
    // the parent turn -- the parent's signal is forwarded so user-initiated
    // stops abort all active subagents in the team.
    const localAbort = new AbortController();
    registerActiveSubagent({
      subagentId: subagentRegId,
      sessionId: activeSessionId,
      teamId,
      subagentType,
      controller: localAbort,
      startedAt,
    });
    const forwardParentAbort = () => {
      localAbort.abort();
      stopAllSubagentsForTeam(teamId);
    };
    if (abortSignal?.aborted) {
      forwardParentAbort();
    } else {
      abortSignal?.addEventListener("abort", forwardParentAbort);
    }

    try {
      let budgetStopped = false;
      let budgetStopReason: "window" | "credit" | undefined;

      const worktreeNotice = worktreeBranch
        ? `\n- You are isolated in git worktree branch \`${worktreeBranch}\`. Work exclusively within your claimed \`files\`; uncommitted edits are checkpointed onto \`${worktreeBranch}\` automatically on completion.`
        : "";

      const verificationDirective =
        subagentType === "executor" || subagentType === "design"
          ? `\n\nVerification & Team Discipline:\n- If working on a shared team task, read \`team_board\` first and update your task (\`update_task\`) with your claimed \`files\`,${worktreeBranch ? ` \`worktreeBranch: "${worktreeBranch}"\`,` : ""} and concrete \`verification\` command evidence.${worktreeNotice}\n- Before finishing, run relevant typecheck/lint/test/build checks for your changes and report the exact verification command + result (or explain why unavailable) in **Summary**.`
          : subagentType === "reviewer"
            ? `\n\nAdversarial Verification Discipline:\n- Read \`team_board\` to inspect teammate task claims, locked \`contract\` entries, and isolated \`team/*\` branches.\n- Challenge missing or unverified claims using \`team_board\` (\`post\`, \`kind: "challenge"\`, \`targetRole\`, tagging \`@role\`) and publish audited command/diff verification using \`kind: "verification"\`.`
            : "";

      const userPrompt = isFollowUp
        ? `Follow-up Task: ${task}\n\nInstructions:\n${instructions}${verificationDirective}\n\nPlease proceed with this follow-up using your previous findings and context. When finished, your final turn MUST be a text message containing both **Summary** and **Answer** detailing what you found or changed. Do not end your execution on a tool call without a final summary.`
        : `Task: ${task}\n\nInstructions:\n${instructions}${verificationDirective}\n\nPlease complete this task thoroughly. When finished, your final turn MUST be a text message containing both **Summary** and **Answer** detailing what you found or changed. Do not end your execution on a tool call without a final summary.`;

      const teamBoard = getOrCreateTeamBoard(teamId);
      const teamContext = formatTeamContextSummary(teamBoard);
      const contextWindow = parentContext?.contextWindow;
      const compactionThreshold = parentContext?.compactionThreshold;

      let pending: TaskPendingToolCall | undefined;
      let usage: LanguageModelUsage | undefined;
      const streamedTextChunks: string[] = [];
      const executedTools: TaskExecutedTool[] = [];
      let lastTextYieldTime = 0;

      let accumulatedMessages: ModelMessage[] = isFollowUp
        ? [
            ...existingSession.messages,
            { role: "user", content: userPrompt } as ModelMessage,
          ]
        : [{ role: "user", content: userPrompt } as ModelMessage];
      let turnGeneratedMessages: ModelMessage[] = [];
      let didCompactInRun = false;
      let repetitiveLoopDetected = false;
      let streamError: string | undefined;
      let recoveryAttempts = 0;

      // Emit an initial state so UIs can show elapsed time from a stable timestamp.
      yield {
        toolCallCount,
        startedAt,
        modelId: subagentModelId,
        sessionId: activeSessionId,
        teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
        status: "starting",
        depth: currentDepth + 1,
        ...(worktreeBranch ? { worktreeBranch } : {}),
      };

      for (let attempt = 0; attempt <= MAX_CONTINUATION_RECOVERIES; attempt++) {
        if (localAbort.signal.aborted || abortSignal?.aborted) {
          if (!streamError && !budgetStopped) {
            streamError = "Subagent execution stopped";
          }
          break;
        }

        let attemptError: string | undefined;
        let attemptRawError: unknown;
        let result: Awaited<ReturnType<typeof subagent.stream>> | undefined;
        let consecutiveRepeatedCalls = 0;
        let lastCallSignature = "";
        let attemptHadStepUsage = false;
        const attemptTextChunks: string[] = [];
        const attemptCompletedTools: string[] = [];

        const liveTeamContext = formatTeamContextSummary(
          getOrCreateTeamBoard(teamId),
        );

        const sharedCallOptions = {
          task,
          instructions,
          sandbox: effectiveSandbox,
          model,
          teamId,
          ...(liveTeamContext || teamContext
            ? { teamContext: liveTeamContext || teamContext }
            : {}),
          ...(contextWindow ? { contextWindow } : {}),
          ...(compactionThreshold ? { compactionThreshold } : {}),
          ...(parentContext?.permissionMode
            ? { permissionMode: parentContext.permissionMode }
            : {}),
          ...(parentContext?.secrets ? { secrets: parentContext.secrets } : {}),
          ...(parentContext?.secretCatalog
            ? { secretCatalog: parentContext.secretCatalog }
            : {}),
          ...(parentContext?.secretRedactor
            ? { secretRedactor: parentContext.secretRedactor }
            : {}),
          ...(parentContext?.onSecretUsed
            ? { onSecretUsed: parentContext.onSecretUsed }
            : {}),
          ...(parentContext?.sandboxLifecycleHooks
            ? { sandboxLifecycleHooks: parentContext.sandboxLifecycleHooks }
            : {}),
          ...(billingGuard
            ? (() => {
                const plan = billingGuard.planSubagent(subagentModelId);
                return plan.maxOutputTokens
                  ? { maxOutputTokens: plan.maxOutputTokens }
                  : {};
              })()
            : {}),
        };

        const streamCallParams =
          attempt === 0 && !isFollowUp
            ? {
                prompt: userPrompt,
                options: sharedCallOptions,
                abortSignal: localAbort.signal,
              }
            : {
                messages: accumulatedMessages,
                options: sharedCallOptions,
                abortSignal: localAbort.signal,
              };

        try {
          result = await subagent.stream(streamCallParams as never);
        } catch (err) {
          attemptRawError = err;
          attemptError = err instanceof Error ? err.message : String(err);
        }

        if (result) {
          try {
            for await (const part of result.fullStream) {
              if (localAbort.signal.aborted || abortSignal?.aborted) {
                if (!attemptError && !budgetStopped) {
                  attemptError = "Subagent execution stopped";
                }
                break;
              }

              if (part.type === "error") {
                attemptRawError = part.error;
                attemptError =
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error);
              }

              if (part.type === "text-delta") {
                if (typeof part.text === "string" && part.text.length > 0) {
                  attemptTextChunks.push(part.text);
                  streamedTextChunks.push(part.text);
                  const now = Date.now();
                  if (
                    now - lastTextYieldTime > 120 ||
                    part.text.includes("\n")
                  ) {
                    lastTextYieldTime = now;
                    yield {
                      pending,
                      toolCallCount,
                      streamedText: streamedTextChunks.join(""),
                      executedTools: [...executedTools],
                      teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
                      status: "running",
                      usage,
                      startedAt,
                      modelId: subagentModelId,
                      sessionId: activeSessionId,
                      depth: currentDepth + 1,
                      ...(worktreeBranch ? { worktreeBranch } : {}),
                    };
                  }
                }
              }

              if (part.type === "tool-call") {
                toolCallCount += 1;
                const callId =
                  (part as { toolCallId?: string }).toolCallId ||
                  crypto.randomUUID();
                pending = { name: part.toolName, input: part.input };
                executedTools.push({
                  toolCallId: callId,
                  name: part.toolName,
                  input: part.input,
                  state: "running",
                });

                try {
                  const signature = `${part.toolName}:${JSON.stringify(part.input)}`;
                  if (signature === lastCallSignature) {
                    consecutiveRepeatedCalls += 1;
                    if (consecutiveRepeatedCalls >= 3) {
                      repetitiveLoopDetected = true;
                      attemptError = `Repetitive tool call loop detected: \`${part.toolName}\` was invoked 3 consecutive times with identical input without progress.`;
                      localAbort.abort();
                    }
                  } else {
                    consecutiveRepeatedCalls = 1;
                    lastCallSignature = signature;
                  }
                } catch {
                  // Ignore serialization errors
                }

                yield {
                  pending,
                  toolCallCount,
                  streamedText: streamedTextChunks.join(""),
                  executedTools: [...executedTools],
                  teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
                  status: "running",
                  usage,
                  startedAt,
                  modelId: subagentModelId,
                  sessionId: activeSessionId,
                  depth: currentDepth + 1,
                  ...(worktreeBranch ? { worktreeBranch } : {}),
                };
              }

              if (part.type === "tool-result") {
                const res = part as {
                  toolCallId?: string;
                  toolName?: string;
                  result?: unknown;
                };
                const match =
                  executedTools.find((t) => t.toolCallId === res.toolCallId) ??
                  executedTools
                    .slice()
                    .toReversed()
                    .find(
                      (t) => t.name === res.toolName && t.state === "running",
                    );
                if (match) {
                  match.output = res.result;
                  match.state = "completed";
                  attemptCompletedTools.push(match.name);
                }
                pending = undefined;

                yield {
                  pending,
                  toolCallCount,
                  streamedText: streamedTextChunks.join(""),
                  executedTools: [...executedTools],
                  teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
                  status: "running",
                  usage,
                  startedAt,
                  modelId: subagentModelId,
                  sessionId: activeSessionId,
                  depth: currentDepth + 1,
                  ...(worktreeBranch ? { worktreeBranch } : {}),
                };
              }

              if (part.type === "finish-step") {
                attemptHadStepUsage = true;
                const stepUsage =
                  enrichUsageWithProviderCache(
                    part.usage,
                    (part as { providerMetadata?: unknown }).providerMetadata,
                  ) ?? part.usage;
                usage = sumLanguageModelUsage(usage, stepUsage);
                if (billingGuard) {
                  subagentStepIndex += 1;
                  const plan = billingGuard.noteSubagentStepUsage(
                    subagentModelId,
                    stepUsage,
                    `${toolCallId}:${subagentStepIndex}`,
                  );
                  if (plan.stop) {
                    budgetStopped = true;
                    budgetStopReason = plan.reason;
                    localAbort.abort();
                  }
                }
                yield {
                  pending,
                  toolCallCount,
                  streamedText: streamedTextChunks.join(""),
                  executedTools: [...executedTools],
                  teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
                  status: "running",
                  usage,
                  startedAt,
                  modelId: subagentModelId,
                  sessionId: activeSessionId,
                  depth: currentDepth + 1,
                  ...(worktreeBranch ? { worktreeBranch } : {}),
                };
              }
            }
          } catch (err) {
            attemptRawError = err;
            attemptError = err instanceof Error ? err.message : String(err);
          }

          let response: Awaited<typeof result.response> | undefined;
          try {
            response = await result.response;
          } catch (err) {
            if (!attemptError) {
              attemptRawError = err;
              attemptError = err instanceof Error ? err.message : String(err);
            }
          }

          if (!attemptHadStepUsage) {
            try {
              const resolvedUsage = await result.usage;
              const resolvedMetadata = await Promise.resolve(
                (result as { providerMetadata?: unknown }).providerMetadata,
              ).catch(() => undefined);
              const attemptUsage =
                enrichUsageWithProviderCache(resolvedUsage, resolvedMetadata) ??
                resolvedUsage;
              usage = sumLanguageModelUsage(usage, attemptUsage);
            } catch {
              // Usage unavailable on failed/aborted attempt
            }
          }

          let attemptGenerated: ModelMessage[] = response?.messages ?? [];
          if (attemptGenerated.length === 0) {
            const attemptText = attemptTextChunks.join("").trim();
            if (attemptText.length > 0) {
              attemptGenerated = [
                {
                  role: "assistant",
                  content: attemptText,
                } as ModelMessage,
              ];
            } else if (attemptCompletedTools.length > 0) {
              attemptGenerated = [
                {
                  role: "assistant",
                  content: `Executed tools: ${attemptCompletedTools.join(", ")}.`,
                } as ModelMessage,
              ];
            }
          }

          if (attemptGenerated.length > 0) {
            accumulatedMessages = sanitizeDanglingSubagentToolCalls([
              ...accumulatedMessages,
              ...attemptGenerated,
            ]);
            turnGeneratedMessages = sanitizeDanglingSubagentToolCalls([
              ...turnGeneratedMessages,
              ...attemptGenerated,
            ]);
          }
        }

        if (!attemptError) {
          streamError = undefined;
          break;
        }

        streamError = attemptError;
        const canRecover =
          !localAbort.signal.aborted &&
          !abortSignal?.aborted &&
          !budgetStopped &&
          !repetitiveLoopDetected &&
          recoveryAttempts < MAX_CONTINUATION_RECOVERIES;

        if (
          canRecover &&
          isContextOverflowSubagentError(attemptRawError ?? attemptError)
        ) {
          recoveryAttempts += 1;
          didCompactInRun = true;
          accumulatedMessages =
            compactMessagesForOverflowRecovery(accumulatedMessages);
          accumulatedMessages.push({
            role: "user",
            content:
              "Context limit encountered; earlier history has been compacted. Continue from your partial progress above without repeating completed steps, and emit **Summary** and **Answer** when finished.",
          } as ModelMessage);
          pending = undefined;
          yield {
            pending,
            toolCallCount,
            streamedText: streamedTextChunks.join(""),
            executedTools: [...executedTools],
            teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
            status: "running",
            usage,
            startedAt,
            modelId: subagentModelId,
            sessionId: activeSessionId,
            depth: currentDepth + 1,
            ...(worktreeBranch ? { worktreeBranch } : {}),
          };
          continue;
        }

        if (
          canRecover &&
          isTransientSubagentError(attemptRawError ?? attemptError)
        ) {
          recoveryAttempts += 1;
          const backoffTiers = [400, 1000, 1800, 3000];
          const baseMs =
            backoffTiers[
              Math.min(recoveryAttempts - 1, backoffTiers.length - 1)
            ] ?? 1500;
          const jitterMs = Math.floor(Math.random() * 250);
          await sleepWithAbort(baseMs + jitterMs, localAbort.signal);
          if (localAbort.signal.aborted || abortSignal?.aborted) {
            break;
          }
          accumulatedMessages =
            sanitizeDanglingSubagentToolCalls(accumulatedMessages);
          accumulatedMessages.push({
            role: "user",
            content: `Temporary interruption occurred (${attemptError.replace(/^Error:\s*/, "")}). Continue from your partial progress above without restarting completed work, and emit **Summary** and **Answer** when done.`,
          } as ModelMessage);
          pending = undefined;
          yield {
            pending,
            toolCallCount,
            streamedText: streamedTextChunks.join(""),
            executedTools: [...executedTools],
            teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
            status: "running",
            usage,
            startedAt,
            modelId: subagentModelId,
            sessionId: activeSessionId,
            depth: currentDepth + 1,
            ...(worktreeBranch ? { worktreeBranch } : {}),
          };
          continue;
        }

        break;
      }

      let finalUsage = usage;
      const combinedStreamed = streamedTextChunks.join("").trim();
      const latestAssistantText =
        extractAssistantText(turnGeneratedMessages) || combinedStreamed;

      if (streamError) {
        const cleanError = streamError.replace(/^Error:\s*/, "");
        const fallbackSummary = buildFallbackSubagentSummary({
          task,
          subagentType,
          outcome: "failed",
          error: cleanError,
          toolCallCount,
          executedTools,
          streamedText: latestAssistantText,
        });
        const messagesWithError: ModelMessage[] = [
          ...turnGeneratedMessages,
          {
            role: "assistant",
            content: fallbackSummary,
          } as ModelMessage,
        ];
        if (activeSessionId) {
          subagentSessionStore.recordTaskCompletion({
            id: activeSessionId,
            task,
            newMessages: didCompactInRun
              ? [
                  ...accumulatedMessages,
                  {
                    role: "assistant",
                    content: fallbackSummary,
                  } as ModelMessage,
                ]
              : [
                  { role: "user", content: userPrompt } as ModelMessage,
                  ...messagesWithError,
                ],
            toolCallCount,
            usage: finalUsage,
            outcome: `error: ${cleanError}`,
            replaceHistory: didCompactInRun,
          });
        }
        const worktreeSummary = await finalizeWorktree();
        const completedAt = Date.now();
        yield {
          final: messagesWithError,
          streamedText: combinedStreamed || fallbackSummary,
          executedTools: [...executedTools],
          teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
          status: "failed",
          toolCallCount,
          usage: finalUsage,
          startedAt,
          completedAt,
          modelId: subagentModelId,
          sessionId: activeSessionId,
          depth: currentDepth + 1,
          ...(worktreeBranch ? { worktreeBranch } : {}),
          ...(worktreeSummary ? { worktreeSummary } : {}),
        };
        return;
      }

      if (budgetStopped) {
        const budgetSummary = buildFallbackSubagentSummary({
          task,
          subagentType,
          outcome: "budget_stopped",
          budgetReason: budgetStopReason,
          toolCallCount,
          executedTools,
          streamedText: latestAssistantText,
        });
        const truncated: ModelMessage[] = [
          ...turnGeneratedMessages,
          {
            role: "assistant",
            content: budgetSummary,
          } as ModelMessage,
        ];
        if (activeSessionId) {
          subagentSessionStore.recordTaskCompletion({
            id: activeSessionId,
            task,
            newMessages: didCompactInRun
              ? [
                  ...accumulatedMessages,
                  { role: "assistant", content: budgetSummary } as ModelMessage,
                ]
              : [
                  { role: "user", content: userPrompt } as ModelMessage,
                  ...truncated,
                ],
            toolCallCount,
            usage: finalUsage,
            outcome: "budget_stopped",
            replaceHistory: didCompactInRun,
          });
        }
        const worktreeSummary = await finalizeWorktree();
        const completedAt = Date.now();
        yield {
          final: truncated,
          streamedText: combinedStreamed || budgetSummary,
          executedTools: [...executedTools],
          teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
          status: "denied",
          toolCallCount,
          usage: finalUsage,
          startedAt,
          completedAt,
          modelId: subagentModelId,
          sessionId: activeSessionId,
          depth: currentDepth + 1,
          ...(worktreeBranch ? { worktreeBranch } : {}),
          ...(worktreeSummary ? { worktreeSummary } : {}),
        };
        return;
      }

      if (!hasStructuredSubagentSummary(turnGeneratedMessages)) {
        if (!abortSignal?.aborted && !localAbort.signal.aborted) {
          const synthesized = await synthesizeSubagentFinalSummary({
            model,
            task,
            subagentType,
            messages: accumulatedMessages,
            executedTools,
            streamedText: latestAssistantText,
            abortSignal: localAbort.signal,
          });
          if (synthesized) {
            if (synthesized.usage) {
              finalUsage = sumLanguageModelUsage(finalUsage, synthesized.usage);
              if (billingGuard) {
                billingGuard.noteSubagentStepUsage(
                  subagentModelId,
                  synthesized.usage,
                  `${toolCallId}:summary-synthesis`,
                );
              }
            }
            const synthMessage: ModelMessage = {
              role: "assistant",
              content: synthesized.text,
            };
            turnGeneratedMessages = [...turnGeneratedMessages, synthMessage];
            accumulatedMessages = [...accumulatedMessages, synthMessage];
          }
        }

        if (!hasStructuredSubagentSummary(turnGeneratedMessages)) {
          const fallbackSummary = buildFallbackSubagentSummary({
            task,
            subagentType,
            outcome: "completed",
            toolCallCount,
            executedTools,
            streamedText: latestAssistantText,
          });
          const fallbackMessage: ModelMessage = {
            role: "assistant",
            content: fallbackSummary,
          };
          turnGeneratedMessages = [...turnGeneratedMessages, fallbackMessage];
          accumulatedMessages = [...accumulatedMessages, fallbackMessage];
        }
      }

      if (activeSessionId) {
        subagentSessionStore.recordTaskCompletion({
          id: activeSessionId,
          task,
          newMessages: didCompactInRun
            ? accumulatedMessages
            : [
                { role: "user", content: userPrompt } as ModelMessage,
                ...turnGeneratedMessages,
              ],
          toolCallCount,
          usage: finalUsage,
          outcome: "completed",
          replaceHistory: didCompactInRun,
        });
      }

      const worktreeSummary = await finalizeWorktree();
      const completedAt = Date.now();
      const finalStreamedText =
        extractAssistantText(turnGeneratedMessages) ||
        combinedStreamed ||
        `Completed "${task}" (${toolCallCount} step(s)).`;

      yield {
        final: turnGeneratedMessages,
        streamedText: finalStreamedText,
        executedTools: [...executedTools],
        teamSnapshot: getOrCreateTeamBoard(teamId).snapshot(),
        status: "completed",
        toolCallCount,
        usage: finalUsage,
        startedAt,
        completedAt,
        modelId: subagentModelId,
        sessionId: activeSessionId,
        depth: currentDepth + 1,
        ...(worktreeBranch ? { worktreeBranch } : {}),
        ...(worktreeSummary ? { worktreeSummary } : {}),
      };
    } finally {
      unregisterActiveSubagent(subagentRegId, activeSessionId);
      abortSignal?.removeEventListener("abort", forwardParentAbort);
      if (activeWorktree) {
        await activeWorktree.cleanup().catch(() => {});
      }
    }
  },
  toModelOutput: ({
    output,
  }: {
    output: {
      final?: ModelMessage[];
      sessionId?: string;
      toolCallCount?: number;
      startedAt?: number;
      worktreeBranch?: string;
      worktreeSummary?: string;
    };
  }) => {
    const messages = output?.final;
    const sessionId = output?.sessionId;
    const worktreeNote = output?.worktreeSummary ?? "";
    if (!messages || messages.length === 0) {
      return {
        type: "text",
        value: `Subagent completed without producing messages.${worktreeNote}`,
      };
    }

    // Extract all executed tool calls for diagnostics
    const executedActions: string[] = [];
    for (const m of messages) {
      const content = (m as { content?: unknown }).content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const p = part as {
            type?: string;
            toolName?: string;
            args?: unknown;
            input?: unknown;
          };
          if (p.type === "tool-call") {
            const input = (p.input ?? p.args) as
              | Record<string, unknown>
              | undefined;
            const target =
              input?.path ??
              input?.command ??
              input?.pattern ??
              input?.query ??
              "";
            const targetStr = target
              ? `: \`${String(target).slice(0, 80)}\``
              : "";
            executedActions.push(`- \`${p.toolName}\`${targetStr}`);
          }
        }
      }
    }

    // 1. Check for explicit error messages or budget abort notices
    const errorNotice = messages.findLast((m) => {
      const c = (m as { content?: unknown }).content;
      return (
        typeof c === "string" &&
        (c.startsWith("[Budget limit reached:") ||
          c.startsWith("[Subagent error:") ||
          c.startsWith("**Subagent execution halted**:") ||
          c.startsWith("**Subagent limit reached**:"))
      );
    });
    if (errorNotice && typeof errorNotice.content === "string") {
      const executed =
        executedActions.length > 0
          ? `\n\nPartial actions completed before failure (${executedActions.length}):\n${executedActions.slice(-10).join("\n")}`
          : "";
      return {
        type: "text",
        value: `${errorNotice.content}${executed}${worktreeNote}`,
      };
    }

    // 2. Search assistant messages backwards for substantive text content
    const assistantMessages = messages.filter((p) => p.role === "assistant");

    // First pass: search backwards for an assistant message with structured **Summary** or **Answer**
    let substantiveText: string | undefined;
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const msg = assistantMessages[i];
      const content = msg?.content;
      if (typeof content === "string") {
        if (content.includes("**Summary**") || content.includes("**Answer**")) {
          substantiveText = content;
          break;
        }
      } else if (Array.isArray(content)) {
        const textParts = content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .filter((t) => t.trim().length > 0);
        const combined = textParts.join("\n\n");
        if (
          combined.includes("**Summary**") ||
          combined.includes("**Answer**")
        ) {
          substantiveText = combined;
          break;
        }
      }
    }

    // Second pass: fallback to the last non-empty assistant text
    if (!substantiveText) {
      for (let i = assistantMessages.length - 1; i >= 0; i--) {
        const msg = assistantMessages[i];
        const content = msg?.content;
        if (typeof content === "string" && content.trim().length > 0) {
          substantiveText = content;
          break;
        }
        if (Array.isArray(content)) {
          const textParts = content
            .filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .filter((t) => t.trim().length > 0);
          if (textParts.length > 0) {
            substantiveText = textParts.join("\n\n");
            break;
          }
        }
      }
    }

    if (substantiveText) {
      let formattedText = substantiveText;
      if (formattedText.length > MAX_INLINE_SUMMARY_CHARS) {
        const headChars = Math.floor(MAX_INLINE_SUMMARY_CHARS * 0.75);
        const tailChars = Math.floor(MAX_INLINE_SUMMARY_CHARS * 0.25);
        formattedText = `${formattedText.slice(0, headChars)}\n\n[... Subagent output middle omitted for context window optimization (${formattedText.length} total characters) ...]\n\n${formattedText.slice(-tailChars)}`;
      }

      const sessionNotice = sessionId
        ? `\n\n*(Subagent session \`${sessionId}\` is active. Pass this sessionId in a subsequent task call to follow up or refine.)*`
        : "";

      return {
        type: "text",
        value: `${formattedText}${worktreeNote}${sessionNotice}`,
      };
    }

    // 3. If no text was produced, return reconstructed actions and clear diagnostics
    const actionDetails =
      executedActions.length > 0
        ? `\n\nExecuted actions:\n${executedActions.slice(-15).join("\n")}`
        : "";
    const sessionNotice = sessionId
      ? `\n\n*(Subagent session \`${sessionId}\` is active.)*`
      : "";

    return {
      type: "text",
      value: `Subagent completed without emitting a final text summary (${executedActions.length} tool call${executedActions.length === 1 ? "" : "s"} executed).${actionDetails}${worktreeNote}${sessionNotice}\n\nCheck the affected files directly to verify the outcome.`,
    };
  },
});

export type TaskToolUIPart = UIToolInvocation<typeof taskTool>;
