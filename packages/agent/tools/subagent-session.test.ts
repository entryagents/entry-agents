import { describe, expect, test, beforeEach } from "bun:test";
import type { LanguageModelUsage, ModelMessage } from "ai";
import {
  subagentSessionStore,
  MAX_SUBAGENT_DEPTH,
  MAX_INLINE_SUMMARY_CHARS,
} from "../subagents";
import { taskTool, type TaskToolOutput } from "./task";

describe("Subagent Session Store & Multi-Turn Resumption", () => {
  beforeEach(() => {
    subagentSessionStore.clear();
  });

  test("creates a new subagent session with unique id and default depth", () => {
    const session = subagentSessionStore.create({
      subagentType: "explorer",
      depth: 1,
    });
    expect(session.id).toBeDefined();
    expect(session.subagentType).toBe("explorer");
    expect(session.depth).toBe(1);
    expect(session.messages).toEqual([]);
    expect(session.taskHistory).toEqual([]);
    expect(subagentSessionStore.size()).toBe(1);
  });

  test("retrieves an existing subagent session and updates lastUsedAt", async () => {
    const session = subagentSessionStore.create({
      id: "test-sess-123",
      subagentType: "executor",
    });
    const initialLastUsed = session.lastUsedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));

    const retrieved = subagentSessionStore.get("test-sess-123");
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("test-sess-123");
    expect(retrieved?.subagentType).toBe("executor");
    expect(retrieved!.lastUsedAt).toBeGreaterThanOrEqual(initialLastUsed);
  });

  test("records task completion into session history", () => {
    subagentSessionStore.create({
      id: "test-sess-456",
      subagentType: "reviewer",
    });

    const newMsgs: ModelMessage[] = [
      { role: "user", content: "Review PR #42" } as never,
      {
        role: "assistant",
        content: "**Summary**: Looked at diff.\n\n**Answer**: LGTM.",
      } as never,
    ];

    const updated = subagentSessionStore.recordTaskCompletion({
      id: "test-sess-456",
      task: "Review PR",
      newMessages: newMsgs,
      toolCallCount: 3,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      } as unknown as LanguageModelUsage,
      outcome: "completed",
    });

    expect(updated).toBeDefined();
    expect(updated?.messages.length).toBe(2);
    expect(updated?.toolCallCount).toBe(3);
    expect(updated?.totalUsage?.totalTokens).toBe(150);
    expect(updated?.taskHistory.length).toBe(1);
    expect(updated?.taskHistory[0]?.task).toBe("Review PR");
    expect(updated?.taskHistory[0]?.toolCallCount).toBe(3);
  });

  test("prunes expired sessions beyond idle TTL", () => {
    const session = subagentSessionStore.create({
      id: "old-session",
      subagentType: "explorer",
    });
    // Artificially age the session
    session.lastUsedAt = Date.now() - 20 * 60 * 1000;

    const pruned = subagentSessionStore.prune(15 * 60 * 1000);
    expect(pruned).toBe(1);
    expect(subagentSessionStore.get("old-session")).toBeUndefined();
    expect(subagentSessionStore.size()).toBe(0);
  });
});

describe("Hierarchical Depth Gating", () => {
  test("refuses execution when depth reaches MAX_SUBAGENT_DEPTH", async () => {
    const generator = (
      taskTool as unknown as {
        execute: (
          input: { subagentType: string; task: string; instructions: string },
          options: {
            experimental_context: unknown;
            abortSignal?: AbortSignal;
            toolCallId: string;
          },
        ) => AsyncGenerator<TaskToolOutput>;
      }
    ).execute(
      {
        subagentType: "explorer",
        task: "Nested search",
        instructions: "Search inside subagent",
      },
      {
        experimental_context: {
          depth: MAX_SUBAGENT_DEPTH, // Already at maximum depth!
          model: "test-model",
        },
        toolCallId: "call-1",
      },
    );

    const first = await generator.next();
    expect(first.done).toBe(false);
    expect(first.value.depth).toBe(MAX_SUBAGENT_DEPTH);
    expect(first.value.final).toBeDefined();

    const finalMsg = first.value.final?.[0];
    expect(typeof finalMsg?.content).toBe("string");
    expect(finalMsg?.content).toContain(
      "maximum subagent delegation depth reached",
    );

    const second = await generator.next();
    expect(second.done).toBe(true);
  });
});

describe("Output Spill Protection & Session Formatting in toModelOutput", () => {
  test("appends session notice when sessionId is present", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: "**Summary**: Explored db.\n\n**Answer**: Found schema.",
      } as never,
    ];

    const out = (
      taskTool as unknown as {
        toModelOutput: (arg: { output: TaskToolOutput }) => {
          type: string;
          value: string;
        };
      }
    ).toModelOutput({
      output: {
        final: messages,
        sessionId: "subagent-session-abc",
      },
    });

    expect(out.value).toContain("**Summary**: Explored db.");
    expect(out.value).toContain("**Answer**: Found schema.");
    expect(out.value).toContain(
      "Subagent session `subagent-session-abc` is active",
    );
    expect(out.value).toContain(
      "Pass this sessionId in a subsequent task call",
    );
  });

  test("truncates middle when output exceeds MAX_INLINE_SUMMARY_CHARS", () => {
    // Generate massive 20,000 char output
    const longString =
      "A".repeat(10_000) +
      "\n**Summary**: Done.\n**Answer**: Result.\n" +
      "Z".repeat(10_000);
    expect(longString.length).toBeGreaterThan(MAX_INLINE_SUMMARY_CHARS);

    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: longString,
      } as never,
    ];

    const out = (
      taskTool as unknown as {
        toModelOutput: (arg: { output: TaskToolOutput }) => {
          type: string;
          value: string;
        };
      }
    ).toModelOutput({
      output: {
        final: messages,
        sessionId: "spill-test-sess",
      },
    });

    expect(out.value).toContain(
      "[... Subagent output middle omitted for context window optimization",
    );
    expect(out.value).toContain("total characters");
    expect(out.value).toContain("Subagent session `spill-test-sess` is active");
  });

  test("includes session notice in executed actions fallback when no text was emitted", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "read",
            input: { path: "package.json" },
          },
        ],
      } as never,
    ];

    const out = (
      taskTool as unknown as {
        toModelOutput: (arg: { output: TaskToolOutput }) => {
          type: string;
          value: string;
        };
      }
    ).toModelOutput({
      output: {
        final: messages,
        sessionId: "tool-only-sess",
      },
    });

    expect(out.value).toContain(
      "Subagent completed without emitting a final text summary",
    );
    expect(out.value).toContain("Subagent session `tool-only-sess` is active");
  });
});
