import { describe, expect, test } from "bun:test";
import type { ToolRenderState } from "@entry-agents/shared/lib/tool-state";
import { renderToStaticMarkup } from "react-dom/server";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { SubagentChatView } from "@/components/subagent-chat/subagent-chat-view";
import { TaskRenderer } from "./task-renderer";

const idleState: ToolRenderState = {
  running: false,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

const runningState: ToolRenderState = {
  running: true,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

describe("TaskRenderer", () => {
  test("renders live execution rail with role token, step telemetry, and pending ticker", () => {
    const part = {
      type: "tool-task",
      toolCallId: "call_live_1",
      state: "output-available",
      preliminary: true,
      input: {
        subagentType: "explorer",
        task: "Audit auth session handlers",
        instructions: "Inspect route handlers and check token validation.",
      },
      output: {
        startedAt: Date.now() - 12_000,
        modelId: "anthropic/claude-3-5-sonnet",
        toolCallCount: 3,
        pending: {
          name: "grep",
          input: { pattern: "getSession" },
        },
        usage: {
          inputTokens: 4200,
          cachedInputTokens: 2100,
          outputTokens: 180,
        },
      },
    } as unknown as ToolRendererProps<"tool-task">["part"];

    const html = renderToStaticMarkup(
      <TaskRenderer part={part} state={runningState} />,
    );

    expect(html).toContain("@explorer");
    expect(html).toContain("Audit auth session handlers");
    expect(html).toContain("3 steps");
    expect(html).toContain("50% cached");
    expect(html).toContain("grep");
    expect(html).toContain("getSession");
    expect(html).not.toContain("rounded-xl border");
  });

  test("renders completed rail with exact duration, cached pct, and concise summary", () => {
    const part = {
      type: "tool-task",
      toolCallId: "call_done_1",
      state: "output-available",
      preliminary: false,
      input: {
        subagentType: "executor",
        task: "Fix CSRF token check",
        instructions: "Add CSRF middleware to POST handlers.",
      },
      output: {
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_014_000,
        modelId: "anthropic/claude-sonnet-4",
        toolCallCount: 2,
        status: "completed",
        usage: {
          inputTokens: 5000,
          inputTokenDetails: { cacheReadTokens: 4000 },
          outputTokens: 320,
        },
        final: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "tc_write_1",
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
                toolCallId: "tc_write_1",
                output: { success: true },
              },
            ],
          },
          {
            role: "assistant",
            content:
              "**Summary**: Added CSRF helper.\n\n**Answer**: Auth endpoints updated.",
          },
        ],
      },
    } as unknown as ToolRendererProps<"tool-task">["part"];

    const html = renderToStaticMarkup(
      <TaskRenderer part={part} state={idleState} />,
    );

    expect(html).toContain("@executor");
    expect(html).toContain("Fix CSRF token check");
    expect(html).toContain("14s");
    expect(html).toContain("2 steps");
    expect(html).toContain("80% cached");
    expect(html).toContain("Added CSRF helper.");
  });

  test("renders failed state cleanly when execution errors", () => {
    const part = {
      type: "tool-task",
      toolCallId: "call_fail_1",
      state: "output-error",
      input: {
        subagentType: "reviewer",
        task: "Verify release bundle",
      },
      errorText: "Sandbox command timed out",
    } as unknown as ToolRendererProps<"tool-task">["part"];

    const html = renderToStaticMarkup(
      <TaskRenderer
        part={part}
        state={{ ...idleState, error: "Sandbox command timed out" }}
      />,
    );

    expect(html).toContain("@reviewer");
    expect(html).toContain("border-l-destructive/75");
  });
});

describe("SubagentChatView", () => {
  test("renders sticky trace inspector header, direct steps, and final output without collapsing steps", () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-task",
            toolCallId: "sub_trace_1",
            state: "output-available",
            preliminary: false,
            input: {
              subagentType: "explorer",
              task: "Inspect sidebar layout duplication",
              instructions:
                "Check settings sidebar links and report duplicates.",
            },
            output: {
              startedAt: 1_700_000_000_000,
              completedAt: 1_700_000_009_000,
              modelId: "anthropic/claude-sonnet-4",
              toolCallCount: 1,
              sessionId: "abcdef12-3456-7890",
              usage: {
                inputTokens: 2000,
                cachedInputTokens: 1000,
                outputTokens: 250,
              },
              final: [
                {
                  role: "assistant",
                  content: [
                    {
                      type: "tool-call",
                      toolCallId: "step_read_1",
                      toolName: "read",
                      input: { filePath: "apps/web/app/settings/layout.tsx" },
                    },
                  ],
                },
                {
                  role: "tool",
                  content: [
                    {
                      type: "tool-result",
                      toolCallId: "step_read_1",
                      output: { content: "layout" },
                    },
                  ],
                },
                {
                  role: "assistant",
                  content:
                    "Sidebar items consolidated under Integrations and Extensions.",
                },
              ],
            },
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      <SubagentChatView
        subagentId="sub_trace_1"
        messages={messages}
        onClose={() => {}}
      />,
    );

    expect(html).toContain("@explorer");
    expect(html).toContain("Inspect sidebar layout duplication");
    expect(html).toContain("9s");
    expect(html).toContain("50% cached");
    expect(html).toContain("Brief");
    expect(html).toContain("Trace");
    expect(html).toContain(">Read</span>");
    expect(html).toContain("layout.tsx");
    expect(html).toContain("Output");
    expect(html).toContain(
      "Sidebar items consolidated under Integrations and Extensions.",
    );
    expect(html).toContain("session abcdef12");
    expect(html).not.toContain("tool calls");
  });

  test("renders unavailable state cleanly when subagent ID is missing", () => {
    const html = renderToStaticMarkup(
      <SubagentChatView
        subagentId="missing-id"
        messages={[]}
        onClose={() => {}}
      />,
    );

    expect(html).toContain("Subagent trace unavailable");
    expect(html).toContain("Return to chat");
  });
});
