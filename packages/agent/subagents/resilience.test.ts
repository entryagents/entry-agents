import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { taskTool, type TaskToolOutput } from "../tools/task";
import { SUBAGENT_STEP_LIMIT, SUBAGENT_WRAP_UP_PROMPT } from "./constants";
import { explorerSubagent } from "./explorer";
import {
  compactSubagentHistoryFallback,
  prepareSubagentStep,
  sanitizeDanglingSubagentToolCalls,
} from "./prepare-step";
import { subagentSessionStore } from "./session-store";
import {
  buildFallbackSubagentSummary,
  compactMessagesForOverflowRecovery,
  hasStructuredSubagentSummary,
  isContextOverflowSubagentError,
  isTransientSubagentError,
} from "./summary-synthesis";

const originalExplorerStream = explorerSubagent.stream.bind(explorerSubagent);

async function collectTaskOutputs(
  gen: AsyncGenerator<TaskToolOutput>,
): Promise<TaskToolOutput[]> {
  const outputs: TaskToolOutput[] = [];
  for await (const item of gen) {
    outputs.push(item);
  }
  return outputs;
}

describe("Subagent Long-Running Resilience", () => {
  beforeEach(() => {
    subagentSessionStore.clear();
  });

  afterEach(() => {
    explorerSubagent.stream = originalExplorerStream;
  });

  test("sanitizeDanglingSubagentToolCalls removes unmatched tool-calls and empty messages", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Inspect the codebase" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Reading package.json..." },
          {
            type: "tool-call",
            toolCallId: "done-call",
            toolName: "read",
            input: { filePath: "package.json" },
          },
        ],
      } as unknown as ModelMessage,
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "done-call",
            toolName: "read",
            output: { type: "text", value: "{}" },
          },
        ],
      } as unknown as ModelMessage,
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "dangling-call",
            toolName: "grep",
            input: { pattern: "foo" },
          },
        ],
      } as unknown as ModelMessage,
    ];

    const sanitized = sanitizeDanglingSubagentToolCalls(messages);
    expect(sanitized).toHaveLength(3);
    expect(
      sanitized.some((m) => JSON.stringify(m).includes("dangling-call")),
    ).toBe(false);
    expect(sanitized.some((m) => JSON.stringify(m).includes("done-call"))).toBe(
      true,
    );
  });

  test("prepareSubagentStep injects wrap-up prompt near stepLimit and disables tools on final step", () => {
    const baseMessages: ModelMessage[] = [
      { role: "user", content: "Analyze routes" },
      { role: "assistant", content: "Scanning files..." },
    ];

    const wrapStep = prepareSubagentStep({
      stepNumber: SUBAGENT_STEP_LIMIT - 3,
      messages: baseMessages,
      model: "test-model",
      experimental_context: { contextWindow: 100_000 },
    });
    const lastWrapMsg = wrapStep.messages.at(-1);
    expect(lastWrapMsg?.role).toBe("user");
    expect(String(lastWrapMsg?.content)).toContain(SUBAGENT_WRAP_UP_PROMPT);
    expect("activeTools" in wrapStep).toBe(false);

    const finalStep = prepareSubagentStep({
      stepNumber: SUBAGENT_STEP_LIMIT - 1,
      messages: baseMessages,
      model: "test-model",
      experimental_context: { contextWindow: 100_000 },
    });
    expect(finalStep.activeTools).toEqual([]);
  });

  test("prepareSubagentStep triggers Tier-2 fallback compaction when messages stay near budget", () => {
    const noisyMessages: ModelMessage[] = [
      { role: "user", content: "Audit entire repository" },
    ];
    for (let i = 0; i < 20; i++) {
      noisyMessages.push({
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: `Reasoning chain step ${i}: ` + "R".repeat(800),
          },
          {
            type: "text",
            text: `Finding ${i}: ` + "F".repeat(800),
          },
        ],
      } as unknown as ModelMessage);
      noisyMessages.push({
        role: "user",
        content: `Continue step ${i}: ` + "U".repeat(200),
      });
    }

    const fallback = compactSubagentHistoryFallback(noisyMessages);
    expect(fallback.length).toBeLessThan(noisyMessages.length);
    expect(
      fallback.some((m) =>
        String(m.content).includes("Subagent Context Digest"),
      ),
    ).toBe(true);

    const prepared = prepareSubagentStep({
      stepNumber: 1,
      messages: noisyMessages,
      model: "test-model",
      experimental_context: {
        contextWindow: 10_000,
        compactionThreshold: 0.4,
      },
    });
    expect(prepared.messages.length).toBeLessThan(noisyMessages.length);
  });

  test("classifies transient and context-overflow errors accurately", () => {
    expect(isTransientSubagentError("429 Too Many Requests")).toBe(true);
    expect(isTransientSubagentError(new Error("socket hang up"))).toBe(true);
    expect(isTransientSubagentError("Repetitive tool call loop detected")).toBe(
      false,
    );
    expect(
      isContextOverflowSubagentError("context_length_exceeded: max 128000"),
    ).toBe(true);
    expect(isContextOverflowSubagentError("Prompt is too long")).toBe(true);
    expect(isContextOverflowSubagentError("SyntaxError in file")).toBe(false);
  });

  test("taskTool retries after transient mid-stream failure and completes with structured summary", async () => {
    let callCount = 0;
    explorerSubagent.stream = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          fullStream: (async function* () {
            yield {
              type: "tool-call",
              toolCallId: "tc-1",
              toolName: "read",
              input: { filePath: "apps/web/package.json" },
            };
            yield {
              type: "tool-result",
              toolCallId: "tc-1",
              toolName: "read",
              result: { content: "{}" },
            };
            yield {
              type: "error",
              error: new Error("503 Service Unavailable"),
            };
          })(),
          response: Promise.resolve({
            messages: [
              {
                role: "assistant",
                content: [
                  {
                    type: "tool-call",
                    toolCallId: "tc-1",
                    toolName: "read",
                    input: { filePath: "apps/web/package.json" },
                  },
                ],
              },
              {
                role: "tool",
                content: [
                  {
                    type: "tool-result",
                    toolCallId: "tc-1",
                    toolName: "read",
                    output: { type: "text", value: "{}" },
                  },
                ],
              },
            ],
          }),
          usage: Promise.resolve(undefined),
        } as never;
      }

      return {
        fullStream: (async function* () {
          yield {
            type: "text-delta",
            text: "**Summary**: Recovered and inspected `apps/web/package.json`.\n\n**Answer**: Verified package scripts cleanly.",
          };
        })(),
        response: Promise.resolve({
          messages: [
            {
              role: "assistant",
              content:
                "**Summary**: Recovered and inspected `apps/web/package.json`.\n\n**Answer**: Verified package scripts cleanly.",
            },
          ],
        }),
        usage: Promise.resolve({
          inputTokens: 120,
          outputTokens: 40,
          totalTokens: 160,
        }),
      } as never;
    }) as typeof explorerSubagent.stream;

    const outputs = await collectTaskOutputs(
      (
        taskTool as unknown as {
          execute: (
            input: { subagentType: string; task: string; instructions: string },
            options: { experimental_context: unknown; toolCallId: string },
          ) => AsyncGenerator<TaskToolOutput>;
        }
      ).execute(
        {
          subagentType: "explorer",
          task: "Inspect package scripts",
          instructions: "Check apps/web/package.json scripts",
        },
        {
          experimental_context: {
            model: "test-model",
            sandbox: {
              id: "sb-test",
              type: "local",
              workingDirectory: "/workspace",
            },
          },
          toolCallId: "resilience-transient-1",
        },
      ),
    );

    expect(callCount).toBe(2);
    const terminal = outputs.at(-1);
    expect(terminal?.status).toBe("completed");
    expect(hasStructuredSubagentSummary(terminal?.final ?? [])).toBe(true);
    expect(terminal?.streamedText).toContain("**Summary**");
    expect(terminal?.streamedText).toContain("**Answer**");
  });

  test("taskTool compacts history and resumes on context_length_exceeded", async () => {
    let seenSecondCallMessages: ModelMessage[] | undefined;
    let callCount = 0;

    explorerSubagent.stream = (async (params: {
      messages?: ModelMessage[];
    }) => {
      callCount += 1;
      if (callCount === 1) {
        const bloatedMessages: ModelMessage[] = Array.from(
          { length: 10 },
          (_, i) =>
            ({
              role: i % 2 === 0 ? "assistant" : "user",
              content: `Turn ${i}: ` + "X".repeat(1_200),
            }) as ModelMessage,
        );
        return {
          fullStream: (async function* () {
            yield {
              type: "error",
              error: new Error("context_length_exceeded: prompt is too long"),
            };
          })(),
          response: Promise.resolve({ messages: bloatedMessages }),
          usage: Promise.resolve(undefined),
        } as never;
      }

      seenSecondCallMessages = params.messages;
      return {
        fullStream: (async function* () {
          yield {
            type: "text-delta",
            text: "**Summary**: Resumed after compaction.\n\n**Answer**: Completed task.",
          };
        })(),
        response: Promise.resolve({
          messages: [
            {
              role: "assistant",
              content:
                "**Summary**: Resumed after compaction.\n\n**Answer**: Completed task.",
            },
          ],
        }),
        usage: Promise.resolve(undefined),
      } as never;
    }) as typeof explorerSubagent.stream;

    const outputs = await collectTaskOutputs(
      (
        taskTool as unknown as {
          execute: (
            input: { subagentType: string; task: string; instructions: string },
            options: { experimental_context: unknown; toolCallId: string },
          ) => AsyncGenerator<TaskToolOutput>;
        }
      ).execute(
        {
          subagentType: "explorer",
          task: "Long overflow recovery test",
          instructions: "Inspect modules",
        },
        {
          experimental_context: {
            model: "test-model",
            sandbox: {
              id: "sb-test",
              type: "local",
              workingDirectory: "/workspace",
            },
          },
          toolCallId: "resilience-overflow-1",
        },
      ),
    );

    expect(callCount).toBe(2);
    expect(seenSecondCallMessages).toBeDefined();
    expect(seenSecondCallMessages!.length).toBeLessThanOrEqual(8);
    expect(outputs.at(-1)?.status).toBe("completed");
    expect(hasStructuredSubagentSummary(outputs.at(-1)?.final ?? [])).toBe(
      true,
    );
  });

  test("taskTool always emits structured Summary + Answer on fatal error, budget stop, and tool-only completion", async () => {
    // 1. Fatal non-transient error after tool calls
    explorerSubagent.stream = (async () => {
      return {
        fullStream: (async function* () {
          yield {
            type: "tool-call",
            toolCallId: "tc-fatal",
            toolName: "read",
            input: { filePath: "packages/agent/open-agent.ts" },
          };
          yield {
            type: "tool-result",
            toolCallId: "tc-fatal",
            toolName: "read",
            result: { ok: true },
          };
          yield {
            type: "error",
            error: new Error("401 Unauthorized invalid API key"),
          };
        })(),
        response: Promise.resolve({ messages: [] }),
        usage: Promise.resolve(undefined),
      } as never;
    }) as typeof explorerSubagent.stream;

    const failedOutputs = await collectTaskOutputs(
      (
        taskTool as unknown as {
          execute: (
            input: { subagentType: string; task: string; instructions: string },
            options: { experimental_context: unknown; toolCallId: string },
          ) => AsyncGenerator<TaskToolOutput>;
        }
      ).execute(
        {
          subagentType: "explorer",
          task: "Fatal error check",
          instructions: "Inspect open-agent",
        },
        {
          experimental_context: {
            model: "test-model",
            sandbox: {
              id: "sb-test",
              type: "local",
              workingDirectory: "/workspace",
            },
          },
          toolCallId: "resilience-fatal-1",
        },
      ),
    );

    const failedFinal = failedOutputs.at(-1);
    expect(failedFinal?.status).toBe("failed");
    const failedText = String(failedFinal?.final?.at(-1)?.content ?? "");
    expect(failedText).toContain("**Subagent execution halted**:");
    expect(failedText).toContain("**Summary**:");
    expect(failedText).toContain("**Answer**:");
    expect(failedText).toContain("packages/agent/open-agent.ts");

    // 2. Budget guard stop
    explorerSubagent.stream = (async () => {
      return {
        fullStream: (async function* () {
          yield {
            type: "tool-call",
            toolCallId: "tc-budget",
            toolName: "bash",
            input: { command: "pnpm typecheck" },
          };
          yield {
            type: "tool-result",
            toolCallId: "tc-budget",
            toolName: "bash",
            result: { stdout: "ok" },
          };
          yield {
            type: "finish-step",
            usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
          };
        })(),
        response: Promise.resolve({ messages: [] }),
        usage: Promise.resolve(undefined),
      } as never;
    }) as typeof explorerSubagent.stream;

    const budgetOutputs = await collectTaskOutputs(
      (
        taskTool as unknown as {
          execute: (
            input: { subagentType: string; task: string; instructions: string },
            options: { experimental_context: unknown; toolCallId: string },
          ) => AsyncGenerator<TaskToolOutput>;
        }
      ).execute(
        {
          subagentType: "explorer",
          task: "Budget stop check",
          instructions: "Run typecheck",
        },
        {
          experimental_context: {
            model: "test-model",
            sandbox: { id: "sb-test", type: "local" },
            billingGuard: {
              planSubagent: () => ({ stop: false }),
              noteSubagentStepUsage: () => ({ stop: true, reason: "window" }),
            },
          },
          toolCallId: "resilience-budget-1",
        },
      ),
    );

    const budgetFinal = budgetOutputs.at(-1);
    expect(budgetFinal?.status).toBe("denied");
    const budgetText = String(budgetFinal?.final?.at(-1)?.content ?? "");
    expect(budgetText).toContain("**Subagent limit reached**:");
    expect(budgetText).toContain("**Summary**:");
    expect(budgetText).toContain("**Answer**:");
    expect(budgetText).toContain("pnpm typecheck");

    // 3. Tool-call-only completion with 0 assistant text
    explorerSubagent.stream = (async () => {
      return {
        fullStream: (async function* () {
          yield {
            type: "tool-call",
            toolCallId: "tc-only",
            toolName: "read",
            input: { filePath: "README.md" },
          };
          yield {
            type: "tool-result",
            toolCallId: "tc-only",
            toolName: "read",
            result: { content: "Entry Agents" },
          };
        })(),
        response: Promise.resolve({ messages: [] }),
        usage: Promise.resolve(undefined),
      } as never;
    }) as typeof explorerSubagent.stream;

    const toolOnlyOutputs = await collectTaskOutputs(
      (
        taskTool as unknown as {
          execute: (
            input: { subagentType: string; task: string; instructions: string },
            options: { experimental_context: unknown; toolCallId: string },
          ) => AsyncGenerator<TaskToolOutput>;
        }
      ).execute(
        {
          subagentType: "explorer",
          task: "Tool-only completion",
          instructions: "Read README",
        },
        {
          experimental_context: {
            model: "test-model",
            sandbox: { id: "sb-test", type: "local" },
          },
          toolCallId: "resilience-toolonly-1",
        },
      ),
    );

    const toolOnlyFinal = toolOnlyOutputs.at(-1);
    expect(toolOnlyFinal?.status).toBe("completed");
    expect(hasStructuredSubagentSummary(toolOnlyFinal?.final ?? [])).toBe(true);
    expect(String(toolOnlyFinal?.final?.at(-1)?.content ?? "")).toContain(
      "README.md",
    );

    // Sanity check direct helpers too
    const built = buildFallbackSubagentSummary({
      task: "Sample",
      subagentType: "executor",
      outcome: "completed",
      toolCallCount: 1,
      executedTools: [
        {
          name: "write",
          input: { filePath: "src/app.ts" },
          state: "completed",
        },
      ],
    });
    expect(built).toContain("src/app.ts");
    expect(
      compactMessagesForOverflowRecovery(budgetFinal?.final ?? []).length,
    ).toBeGreaterThan(0);
  });
});
