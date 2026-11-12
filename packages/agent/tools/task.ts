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
  SUBAGENT_STEP_LIMIT,
} from "../subagents/constants";
import { subagentSessionStore } from "../subagents/session-store";
import { sumLanguageModelUsage } from "../usage";
import { getSandboxContext, getSubagentModel } from "./utils";
import type { AgentContext, SubagentBudgetGuard } from "../types";

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
    `Detailed instructions for the subagent. Include:
- Goal and deliverables
- Step-by-step procedure
- Constraints and patterns to follow
- How to verify the work`,
  ),
  sessionId: z
    .string()
    .optional()
    .describe(
      "Optional session ID of an active subagent to continue or follow up with. When provided, the subagent retains its conversational memory and tool context from previous turns.",
    ),
});

const taskPendingToolCallSchema = z.object({
  name: z.string(),
  input: z.unknown(),
});

export type TaskPendingToolCall = z.infer<typeof taskPendingToolCallSchema>;

export const taskOutputSchema = z.object({
  pending: taskPendingToolCallSchema.optional(),
  toolCallCount: z.number().int().nonnegative().optional(),
  startedAt: z.number().int().nonnegative().optional(),
  modelId: z.string().optional(),
  final: z.custom<ModelMessage[]>().optional(),
  usage: z.custom<LanguageModelUsage>().optional(),
  sessionId: z.string().optional(),
  depth: z.number().int().nonnegative().optional(),
});

export type TaskToolOutput = z.infer<typeof taskOutputSchema>;

export const taskTool = tool({
  needsApproval: false,
  description: `Launch a specialized subagent to handle complex tasks autonomously.

AVAILABLE SUBAGENTS:
${subagentSummaryLines}

WHEN TO USE:
- Clearly-scoped work that can be delegated with explicit instructions
- Work where focused execution would clutter the main conversation
- Tasks that match one of the available subagent descriptions above

WHEN NOT TO USE (do it yourself):
- Simple, single-file or single-change edits
- Tasks where you already have all the context you need
- Ambiguous work that requires back-and-forth clarification

BEHAVIOR:
- Subagents work AUTONOMOUSLY without asking follow-up questions
- They run up to ${SUBAGENT_STEP_LIMIT} tool steps and then return
- They return ONLY a concise summary - their internal steps are isolated from the parent

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
    { subagentType, task, instructions, sessionId },
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
    const model = getSubagentModel(experimental_context, "task");
    const subagentModelId = typeof model === "string" ? model : model.modelId;

    const subagent = SUBAGENT_REGISTRY[subagentType].agent;

    // Resumable subagent session handling: look up existing session or create fresh.
    const activeSessionId = sessionId?.trim() || crypto.randomUUID();
    let existingSession = sessionId
      ? subagentSessionStore.get(sessionId.trim())
      : undefined;
    if (sessionId && !existingSession) {
      existingSession = subagentSessionStore.create({
        id: activeSessionId,
        subagentType,
        depth: currentDepth + 1,
      });
    }
    const isFollowUp = Boolean(
      existingSession && existingSession.messages.length > 0,
    );

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

    // The subagent gets its own abort controller so the BUDGET guard
    // can stop just the subagent without killing the parent turn --
    // the parent's signal is forwarded so user-initiated stops still
    // abort everything.
    const localAbort = new AbortController();
    const forwardParentAbort = () => localAbort.abort();
    if (abortSignal?.aborted) {
      localAbort.abort();
    } else {
      abortSignal?.addEventListener("abort", forwardParentAbort);
    }

    let budgetStopped = false;
    let budgetStopReason: "window" | "credit" | undefined;

    const userPrompt = isFollowUp
      ? `Follow-up Task: ${task}\n\nInstructions:\n${instructions}\n\nPlease proceed with this follow-up using your previous findings and context. When finished, your final turn MUST be a text message containing both **Summary** and **Answer** detailing what you found or changed. Do not end your execution on a tool call without a final summary.`
      : `Task: ${task}\n\nInstructions:\n${instructions}\n\nPlease complete this task thoroughly. When finished, your final turn MUST be a text message containing both **Summary** and **Answer** detailing what you found or changed. Do not end your execution on a tool call without a final summary.`;

    let streamError: string | undefined;
    let result: Awaited<ReturnType<typeof subagent.stream>> | undefined;

    try {
      const streamCallParams =
        isFollowUp && existingSession
          ? {
              messages: [
                ...existingSession.messages,
                { role: "user", content: userPrompt } as ModelMessage,
              ],
              options: {
                task,
                instructions,
                sandbox: sandboxContext.sandbox,
                model,
                ...(billingGuard
                  ? (() => {
                      const plan = billingGuard.planSubagent(subagentModelId);
                      return plan.maxOutputTokens
                        ? { maxOutputTokens: plan.maxOutputTokens }
                        : {};
                    })()
                  : {}),
              },
              abortSignal: localAbort.signal,
            }
          : {
              prompt: userPrompt,
              options: {
                task,
                instructions,
                sandbox: sandboxContext.sandbox,
                model,
                ...(billingGuard
                  ? (() => {
                      const plan = billingGuard.planSubagent(subagentModelId);
                      return plan.maxOutputTokens
                        ? { maxOutputTokens: plan.maxOutputTokens }
                        : {};
                    })()
                  : {}),
              },
              abortSignal: localAbort.signal,
            };

      result = await subagent.stream(streamCallParams as never);
    } catch (err) {
      streamError = err instanceof Error ? err.message : String(err);
    }

    let pending: TaskPendingToolCall | undefined;
    let usage: LanguageModelUsage | undefined;
    let consecutiveRepeatedCalls = 0;
    let lastCallSignature = "";
    // Streamed assistant text, accumulated as a fallback for the final
    // output. `result.response.messages` is the primary source, but it can
    // resolve empty when the subagent is cut off (step-limit exhaustion,
    // abort, or a provider that returns no assembled messages). Before this
    // fallback existed, that path returned the useless
    // "Subagent completed without producing messages." string and silently
    // discarded everything the subagent had actually produced in-stream --
    // observed in practice as every delegated task returning no content.
    // Text parts from the fullStream are captured here so the final
    // assembly can reconstruct at least the last text the subagent emitted.
    const streamedTextChunks: string[] = [];
    // Ordered record of executed tool calls (name + target), captured from
    // the stream so the fallback can still report what the subagent did.
    const streamedToolCalls: { name: string; input: unknown }[] = [];

    // Emit an initial state so UIs can show elapsed time from a stable timestamp.
    yield {
      toolCallCount,
      startedAt,
      modelId: subagentModelId,
      sessionId: activeSessionId,
      depth: currentDepth + 1,
    };

    if (streamError || !result) {
      const cleanError = (
        streamError ?? "Failed to initialize subagent stream"
      ).replace(/^Error:\s*/, "");
      const errorMsg: ModelMessage[] = [
        {
          role: "assistant",
          content: `**Subagent execution halted**: ${cleanError}`,
        },
      ];
      yield {
        final: errorMsg,
        toolCallCount,
        startedAt,
        modelId: subagentModelId,
        sessionId: activeSessionId,
        depth: currentDepth + 1,
      };
      return;
    }

    try {
      for await (const part of result.fullStream) {
        if (part.type === "error") {
          streamError =
            part.error instanceof Error
              ? part.error.message
              : String(part.error);
        }

        if (part.type === "text-delta") {
          // Capture streamed assistant text for the empty-`response.messages`
          // fallback (see streamedTextChunks above). Only real deltas are
          // appended; empty deltas are ignored so a provider that emits
          // placeholder chunks does not inflate the buffer.
          if (typeof part.text === "string" && part.text.length > 0) {
            streamedTextChunks.push(part.text);
          }
        }

        if (part.type === "tool-call") {
          toolCallCount += 1;
          pending = { name: part.toolName, input: part.input };
          streamedToolCalls.push({ name: part.toolName, input: part.input });

          try {
            const signature = `${part.toolName}:${JSON.stringify(part.input)}`;
            if (signature === lastCallSignature) {
              consecutiveRepeatedCalls += 1;
              if (consecutiveRepeatedCalls >= 3) {
                streamError = `Repetitive tool call loop detected: \`${part.toolName}\` was invoked 3 consecutive times with identical input without progress.`;
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
            usage,
            startedAt,
            modelId: subagentModelId,
            sessionId: activeSessionId,
            depth: currentDepth + 1,
          };
        }

        if (part.type === "finish-step") {
          usage = sumLanguageModelUsage(usage, part.usage);
          if (billingGuard) {
            // Billing identity for THIS subagent model step: this task
            // call's own toolCallId (unique per subagent launch, stable
            // no matter how concurrent subagents interleave) plus the
            // subagent's Nth model step. Hosts key idempotent ledger
            // references on it -- a shared execution-wide counter would
            // remap rows to the wrong subagent across replays.
            subagentStepIndex += 1;
            const plan = billingGuard.noteSubagentStepUsage(
              subagentModelId,
              part.usage,
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
            usage,
            startedAt,
            modelId: subagentModelId,
            sessionId: activeSessionId,
            depth: currentDepth + 1,
          };
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err.message : String(err);
    }

    abortSignal?.removeEventListener("abort", forwardParentAbort);

    let response: Awaited<typeof result.response> | undefined;
    try {
      response = await result.response;
    } catch (err) {
      if (!streamError) {
        streamError = err instanceof Error ? err.message : String(err);
      }
    }

    let finalUsage = usage;
    if (!finalUsage && result) {
      try {
        finalUsage = await result.usage;
      } catch {
        finalUsage = undefined;
      }
    }
    // Primary source: the assembled response messages. Fallback: when the
    // response resolved with no messages (step-limit cut-off, abort, or a
    // provider that returned no assembled messages), rebuild a final
    // assistant message from the text this subagent streamed. Without this,
    // every such run degraded to "Subagent completed without producing
    // messages." and discarded the subagent's actual output.
    let baseMessages: ModelMessage[] = response?.messages ?? [];
    if (baseMessages.length === 0) {
      const streamedText = streamedTextChunks.join("").trim();
      if (streamedText.length > 0) {
        baseMessages = [
          {
            role: "assistant",
            content: streamedText,
          } as ModelMessage,
        ];
      } else if (streamedToolCalls.length > 0) {
        // No assembled messages and no streamed text, but the subagent did
        // run tools. Emit a synthetic assistant message carrying the tool
        // calls so toModelOutput's action-reconstruction path (which reads
        // `final`) can still report what happened, instead of the generic
        // "completed without producing messages" string.
        baseMessages = [
          {
            role: "assistant",
            content: streamedToolCalls.map((call) => ({
              type: "tool-call" as const,
              toolCallId: "",
              toolName: call.name,
              input: call.input,
            })),
          } as unknown as ModelMessage,
        ];
      }
    }

    // Save subagent session history for future follow-up turns
    if (activeSessionId) {
      subagentSessionStore.recordTaskCompletion({
        id: activeSessionId,
        task,
        newMessages: [
          { role: "user", content: userPrompt } as ModelMessage,
          ...baseMessages,
        ],
        toolCallCount,
        usage: finalUsage,
        outcome: streamError
          ? `error: ${streamError}`
          : budgetStopped
            ? "budget_stopped"
            : "completed",
      });
    }

    if (streamError) {
      const cleanError = streamError.replace(/^Error:\s*/, "");
      const messagesWithError: ModelMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `**Subagent execution halted**: ${cleanError}`,
        },
      ];
      yield {
        final: messagesWithError,
        toolCallCount,
        usage: finalUsage,
        startedAt,
        modelId: subagentModelId,
        sessionId: activeSessionId,
        depth: currentDepth + 1,
      };
      return;
    }

    if (budgetStopped) {
      const reasonText =
        budgetStopReason === "window"
          ? "usage window"
          : budgetStopReason === "credit"
            ? "credit balance"
            : "usage limit";
      const truncated: ModelMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `**Subagent limit reached**: Stopped by ${reasonText}. Partial progress preserved across ${toolCallCount} steps.`,
        },
      ];
      yield {
        final: truncated,
        toolCallCount,
        usage: finalUsage,
        startedAt,
        modelId: subagentModelId,
        sessionId: activeSessionId,
        depth: currentDepth + 1,
      };
      return;
    }

    yield {
      final: baseMessages,
      toolCallCount,
      usage: finalUsage,
      startedAt,
      modelId: subagentModelId,
      sessionId: activeSessionId,
      depth: currentDepth + 1,
    };
  },
  toModelOutput: ({
    output,
  }: {
    output: {
      final?: ModelMessage[];
      sessionId?: string;
      toolCallCount?: number;
      startedAt?: number;
    };
  }) => {
    const messages = output?.final;
    const sessionId = output?.sessionId;
    if (!messages || messages.length === 0) {
      return {
        type: "text",
        value: "Subagent completed without producing messages.",
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
      return { type: "text", value: `${errorNotice.content}${executed}` };
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

      return { type: "text", value: `${formattedText}${sessionNotice}` };
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
      value: `Subagent completed without emitting a final text summary (${executedActions.length} tool call${executedActions.length === 1 ? "" : "s"} executed).${actionDetails}${sessionNotice}\n\nCheck the affected files directly to verify the outcome.`,
    };
  },
});

export type TaskToolUIPart = UIToolInvocation<typeof taskTool>;
