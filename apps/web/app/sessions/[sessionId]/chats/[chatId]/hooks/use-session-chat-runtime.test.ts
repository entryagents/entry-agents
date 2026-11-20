import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { shouldAutoSubmit } from "./use-session-chat-runtime";

describe("shouldAutoSubmit (durable server workflow independence)", () => {
  test("returns false when last message is from user", () => {
    const messages: WebAgentUIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Run tests" }],
      },
    ];
    expect(shouldAutoSubmit({ messages })).toBe(false);
  });

  test("returns false when assistant message only has server-executed output-available tool calls", () => {
    const messages: WebAgentUIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Check git status" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-bash",
            toolCallId: "call_1",
            state: "output-available",
            input: { command: "git status" },
            output: { stdout: "On branch main", exitCode: 0 },
          } as unknown as WebAgentUIMessage["parts"][number],
        ],
      },
    ];
    expect(shouldAutoSubmit({ messages })).toBe(false);
  });

  test("returns false when assistant message only has server-executed output-error tool calls", () => {
    const messages: WebAgentUIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-read",
            toolCallId: "call_2",
            state: "output-error",
            input: { filePath: "missing.ts" },
            errorText: "File not found",
          } as unknown as WebAgentUIMessage["parts"][number],
        ],
      },
    ];
    expect(shouldAutoSubmit({ messages })).toBe(false);
  });

  test("returns true when a tool approval was responded to by the user in the browser", () => {
    const messages: WebAgentUIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-bash",
            toolCallId: "call_3",
            state: "approval-responded",
            input: { command: "rm -rf dist" },
            approval: { id: "app_1", approved: true },
          } as unknown as WebAgentUIMessage["parts"][number],
        ],
      },
    ];
    expect(shouldAutoSubmit({ messages })).toBe(true);
  });

  test("returns false when one tool is approval-responded but another tool is still approval-requested", () => {
    const messages: WebAgentUIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-bash",
            toolCallId: "call_3",
            state: "approval-responded",
            input: { command: "rm -rf dist" },
            approval: { id: "app_1", approved: true },
          } as unknown as WebAgentUIMessage["parts"][number],
          {
            type: "tool-web_fetch",
            toolCallId: "call_4",
            state: "approval-requested",
            input: { url: "https://example.com" },
            approval: { id: "app_2" },
          } as unknown as WebAgentUIMessage["parts"][number],
        ],
      },
    ];
    expect(shouldAutoSubmit({ messages })).toBe(false);
  });

  test("returns false when ask_user_question is still waiting for user input (input-available)", () => {
    const messages: WebAgentUIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-ask_user_question",
            toolCallId: "call_q1",
            state: "input-available",
            input: {
              questions: [
                {
                  header: "Auth",
                  question: "Which auth provider?",
                  options: [
                    { label: "Better Auth", description: "Default" },
                    { label: "NextAuth", description: "Legacy" },
                  ],
                  multiSelect: false,
                },
              ],
            },
          } as unknown as WebAgentUIMessage["parts"][number],
        ],
      },
    ];
    expect(shouldAutoSubmit({ messages })).toBe(false);
  });

  test("returns true when ask_user_question has been answered by the user (output-available)", () => {
    const messages: WebAgentUIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          {
            type: "tool-ask_user_question",
            toolCallId: "call_q1",
            state: "output-available",
            input: {
              questions: [],
            },
            output: {
              answers: { "Which auth provider?": "Better Auth" },
            },
          } as unknown as WebAgentUIMessage["parts"][number],
        ],
      },
    ];
    expect(shouldAutoSubmit({ messages })).toBe(true);
  });
});
