import { describe, expect, test } from "bun:test";
import { deriveSubagentTabData } from "./subagent-tab-data";

const testMessages = [
  {
    id: "msg_user_1",
    role: "user",
    parts: [{ type: "text", text: "Audit the auth routes" }],
  },
  {
    id: "msg_assistant_1",
    role: "assistant",
    parts: [
      { type: "text", text: "Launching subagent to audit auth." },
      {
        type: "tool-task",
        toolCallId: "call_subagent_001",
        state: "output-available",
        preliminary: true,
        input: {
          subagentType: "explorer",
          task: "Audit auth API routes",
          instructions:
            "Goal: Review all route.ts files in apps/web/app/api/auth for vulnerabilities.\nProcedure: Read files, check sessions.",
        },
        output: {
          startedAt: 1700000000000,
          modelId: "anthropic/claude-3-5-sonnet",
          pending: {
            name: "grep",
            input: { pattern: "getSession" },
          },
          toolCallCount: 2,
          usage: { inputTokens: 4200, outputTokens: 350 },
          sessionId: "subagent-sesh-123",
          depth: 1,
        },
      },
      {
        type: "tool-task",
        toolCallId: "call_subagent_002",
        state: "output-available",
        preliminary: false,
        input: {
          subagentType: "executor",
          task: "Fix auth CSRF gap",
          instructions: "Apply CSRF token validation to auth POST endpoints.",
        },
        output: {
          startedAt: 1700000010000,
          modelId: "anthropic/claude-3-5-sonnet",
          toolCallCount: 1,
          usage: { inputTokens: 2500, outputTokens: 400 },
          final: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "sub_tool_1",
                  toolName: "write",
                  input: {
                    filePath: "apps/web/lib/auth/csrf.ts",
                    content: "// csrf",
                  },
                },
              ],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolCallId: "sub_tool_1",
                  output: { success: true },
                },
              ],
            },
            {
              role: "assistant",
              content: "CSRF token validation added successfully.",
            },
          ],
        },
      },
    ],
  },
];

describe("deriveSubagentTabData", () => {
  test("extracts parent model message and streaming pending state", () => {
    const data = deriveSubagentTabData(testMessages, "call_subagent_001");
    expect(data).not.toBeNull();
    expect(data?.subagentType).toBe("explorer");
    expect(data?.title).toBe("Audit auth API routes");
    expect(data?.instructions).toContain("Goal: Review all route.ts files");
    expect(data?.status).toBe("running");
    expect(data?.pending?.name).toBe("grep");
    expect(data?.inputTokens).toBe(4200);
    expect(data?.sessionId).toBe("subagent-sesh-123");
  });

  test("extracts completed tool calls and final text for finished subagent", () => {
    const data = deriveSubagentTabData(testMessages, "call_subagent_002");
    expect(data).not.toBeNull();
    expect(data?.status).toBe("completed");
    expect(data?.completedParts).toHaveLength(1);
    expect(data?.completedParts[0]?.type).toBe("tool-write");
    expect(data?.finalText).toBe("CSRF token validation added successfully.");
  });

  test("extracts live streaming executed tools and streamed text from in-flight subagents", () => {
    const liveStreamingMessages = [
      {
        id: "msg_live",
        role: "assistant",
        parts: [
          {
            type: "tool-task",
            toolCallId: "call_subagent_live",
            state: "output-available",
            preliminary: true,
            input: {
              subagentType: "executor",
              task: "Refactor database migrations",
              instructions: "Migrate schema and verify types",
            },
            output: {
              startedAt: 1700000020000,
              modelId: "anthropic/claude-3-5-sonnet",
              streamedText:
                "I am updating the Drizzle schema to add indexes...",
              executedTools: [
                {
                  toolCallId: "call_read_1",
                  name: "read",
                  input: { filePath: "apps/web/lib/db/schema.ts" },
                  output: { content: "export const users = pgTable..." },
                  state: "completed",
                },
              ],
              pending: {
                name: "write",
                input: { filePath: "apps/web/lib/db/schema.ts" },
              },
              toolCallCount: 2,
              sessionId: "sesh_live_456",
            },
          },
        ],
      },
    ];

    const data = deriveSubagentTabData(
      liveStreamingMessages,
      "call_subagent_live",
    );
    expect(data).not.toBeNull();
    expect(data?.status).toBe("running");
    expect(data?.completedParts).toHaveLength(1);
    expect(data?.completedParts[0]?.type).toBe("tool-read");
    expect(data?.finalText).toBe(
      "I am updating the Drizzle schema to add indexes...",
    );
    expect(data?.pending?.name).toBe("write");
  });

  test("returns null for unknown subagent ID", () => {
    expect(deriveSubagentTabData(testMessages, "nonexistent")).toBeNull();
  });
});
